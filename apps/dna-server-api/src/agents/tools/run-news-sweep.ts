import { Type } from "@earendil-works/pi-ai";
import type { Task } from "@earendil-works/pi-durable";
import { defineAppTool, onceInCommit, toolError, toolText } from "@dna/durable-agent";
import type { Deps } from "../../deps.ts";
import type { SweepInput, SweepResult } from "../../news/sweep-task.ts";

export function runNewsSweep(deps: Deps, sweepTask: Task<SweepInput, any, SweepResult, object>) {
  return defineAppTool({
    name: "run_news_sweep",
    returns:
      "Text: the phase counts (gathered, kept, duplicates) and one line per ranked candidate, or that nothing cleared the gate.",
    description:
      "Run the checkpointed sweep for a sweep id: gather every due source and topic search, gate each item with jev, dedupe, rank. Returns the ranked candidates. Call it once per scheduled sweep.",
    parameters: Type.Object({
      sweep_id: Type.Integer({ description: "The SWEEP_ID from the sweep prompt" }),
    }),
    replay: "safe",
    execute: async (args, api, ctx) => {
      const sweep = deps.store.sweeps.get(args.sweep_id);
      if (!sweep)
        return toolError(`No sweep #${args.sweep_id}.`, [
          "Use the SWEEP_ID from the sweep prompt.",
        ]);
      if (["completed", "no_news", "skipped"].includes(sweep.status))
        return toolError(`Sweep #${sweep.id} is already ${sweep.status}.`, [
          "Start no new work for it.",
        ]);
      const taskId = await onceInCommit<number>(
        api,
        ctx,
        async (tx) =>
          (await tx.createTask(
            sweepTask,
            { sweepId: sweep.id },
            { ownership: { kind: "task", taskId: api.taskId } },
          )) as number,
      );
      deps.store.sweeps.update(sweep.id, { taskId, status: "running" });
      await api.details({ sweepId: sweep.id, taskId }, ctx);
      const settled = await api.waitForTask(taskId as never, ctx);
      const outcome = settled.state.outcome as {
        status: string;
        result?: SweepResult;
        error?: { message: string };
      };
      if (outcome.status !== "completed" || !outcome.result) {
        return toolError(
          `Sweep #${sweep.id} could not finish: ${outcome.error?.message ?? outcome.status}.`,
          ["Call complete_sweep with status no_news and a summary that names the failure."],
        );
      }
      const r = outcome.result;
      const jev = deps.store.telemetry.jevFailures(sweep.id);
      const jevFailure = jev.failed
        ? `jev failed on ${jev.failed} of ${jev.total} calls: ${jev.error}`
        : undefined;
      if (jevFailure && !r.kept)
        return toolError(`Sweep #${sweep.id} failed: ${jevFailure}.`, [
          "Call complete_sweep with status no_news and a summary that names the jev failure.",
        ]);
      const lines = r.candidates.map(
        (c) =>
          `#${c.id} ${c.title} (${c.source ?? "web"}) attention ${c.attention}${c.discussion ? ", has discussion" : ""}${c.matchedTopic ? `, topic ${c.matchedTopic}` : ""}${c.relationshipReview ? ", relationshipReview: research possible overlap before presenting" : ""}`,
      );
      const head = `Sweep #${sweep.id}: ${r.gathered} gathered, jev kept ${r.kept}, ${r.duplicates} duplicates, ${r.candidates.length} candidates.${jevFailure ? ` Warning: ${jevFailure}, so items may be missing.` : ""}`;
      return toolText(
        r.candidates.length
          ? `${head}\n${lines.join("\n")}`
          : `${head}\nNo candidates. Call complete_sweep with status no_news.`,
        { sweepId: sweep.id, taskId, candidates: r.candidates.map((c) => c.id) },
      );
    },
  });
}
