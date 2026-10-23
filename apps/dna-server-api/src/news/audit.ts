// What the agent has and has not done in a sweep: expected steps from what happened, compared with its tool calls.
import type { SweepAudit } from "@dna/sdk";
import type { Logger } from "@dna/sdk/node";
import type { Store } from "../db/store.ts";

export function auditSweep(store: Store, sweepId: number, log?: Logger): SweepAudit | undefined {
  const sweep = store.sweeps.get(sweepId);
  if (!sweep) return undefined;
  const calls = store.telemetry
    .toolCallsForSweep(sweepId)
    .filter((c) => !c.isError || c.toolName === "complete_sweep");
  const ok = (name: string) => calls.some((c) => c.toolName === name && !c.isError);
  const presented = store.db
    .prepare("SELECT item_id FROM cards WHERE sweep_id = ? AND kind = 'news'")
    .all(sweepId) as { item_id: number }[];
  const expected = ["run_news_sweep"];
  const done: string[] = [];
  if (ok("run_news_sweep")) done.push("run_news_sweep");
  if (sweep.candidates > 0 && sweep.status !== "no_news") {
    expected.push("research_items", "hfs for every presented item", "present_news");
    if (ok("research_items")) done.push("research_items");
    const unclassified = presented.filter(
      (p) =>
        !store.db
          .prepare(
            "SELECT 1 FROM classifications WHERE item_id = ? AND command = 'hfs' AND sweep_id = ?",
          )
          .get(p.item_id, sweepId),
    );
    if (presented.length && !unclassified.length) done.push("hfs for every presented item");
    if (ok("present_news")) done.push("present_news");
  }
  if (store.sources.offeredCount(sweepId) > 0) {
    expected.push("every source lead saved or skipped");
    if (!store.sources.openLeadsOffered(sweepId).length)
      done.push("every source lead saved or skipped");
  }
  expected.push("complete_sweep");
  // complete_sweep always writes the summary; an aborted sweep fails without one.
  if (
    ["completed", "no_news"].includes(sweep.status) ||
    (sweep.status === "failed" && sweep.summary)
  )
    done.push("complete_sweep");
  const audit: SweepAudit = { expected, done, missing: expected.filter((e) => !done.includes(e)) };
  store.sweeps.update(sweepId, { audit });
  for (const step of audit.missing) {
    log?.warn("sweep.audit.missing", { sweepId, step });
    store.telemetry.event({
      event: "sweep.audit.missing",
      level: "warn",
      conversationId: 0,
      taskId: 0,
      data: { sweepId, step },
    });
  }
  return audit;
}
