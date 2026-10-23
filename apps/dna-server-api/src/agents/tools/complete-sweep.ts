import { Type } from "@earendil-works/pi-ai";
import { defineAppTool, toolError, toolText } from "@dna/durable-agent";
import type { Deps } from "../../deps.ts";
import { auditSweep } from "../../news/audit.ts";

const STATUSES = ["presented", "no_news"] as const;

export function completeSweep(deps: Deps) {
  return defineAppTool({
    name: "complete_sweep",
    returns:
      "Text: the sweep id, completed or closed with no news, and how many cards it presented. Runs the sweep audit.",
    description:
      "The last call of every sweep. status presented when you presented at least one card, no_news when nothing was worth attention. summary is one sentence.",
    parameters: Type.Object({
      sweep_id: Type.Integer(),
      status: Type.Union(STATUSES.map((s) => Type.Literal(s))),
      summary: Type.String({ minLength: 5, maxLength: 400 }),
    }),
    enums: { status: STATUSES },
    example: {
      sweep_id: 7,
      status: "presented",
      summary: "Three releases worth attention, one hype watch.",
    },
    replay: "safe",
    execute: async (args) => {
      const sweep = deps.store.sweeps.get(args.sweep_id);
      if (!sweep) return toolError(`No sweep #${args.sweep_id}.`);
      const cards = (
        deps.store.db.prepare("SELECT count(*) n FROM cards WHERE sweep_id = ?").get(sweep.id) as {
          n: number;
        }
      ).n;
      if (args.status === "presented" && cards === 0)
        return toolError("complete_sweep failed: status presented but this sweep has no cards.", [
          "Present at least one card, or use status no_news.",
        ]);
      // Nothing presented and jev failed along the way: that is a failed sweep, not a quiet one.
      const status = args.status === "presented" ? "completed" : sweep.error ? "failed" : "no_news";
      const endedAt = new Date().toISOString();
      deps.store.sweeps.update(sweep.id, {
        status,
        summary: args.summary,
        endedAt,
        presented: cards,
        firecrawlCreditsUsed: deps.store.telemetry.creditsForSweep(sweep.id),
      });
      const audit = auditSweep(deps.store, sweep.id, deps.log);
      // The projector may still be writing this run's last rows; audit again once it settles.
      setTimeout(() => {
        try {
          auditSweep(deps.store, sweep.id, deps.log);
          const final = deps.store.sweeps.get(sweep.id);
          if (final)
            deps.bus.publish({
              type: "sweep",
              sweep: { ...final, cost: deps.store.telemetry.sweepCost(sweep.id) },
            });
        } catch {}
      }, 1500).unref();
      deps.bus.publish({ type: "sweep", sweep: deps.store.sweeps.get(sweep.id)! });
      deps.log.info("sweep.completed", {
        sweepId: sweep.id,
        status,
        cards,
        summary: args.summary,
        missing: audit?.missing,
      });
      const outcome =
        status === "completed"
          ? "completed"
          : status === "failed"
            ? `closed as failed (${sweep.error})`
            : "closed with no news";
      return toolText(`Sweep #${sweep.id} ${outcome}. ${cards} card${cards === 1 ? "" : "s"}.`);
    },
  });
}
