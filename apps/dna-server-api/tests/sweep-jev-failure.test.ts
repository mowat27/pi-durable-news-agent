import assert from "node:assert/strict";
import { test } from "node:test";
import { startNewsSweep } from "../src/news/sweep.ts";
import { fauxApp, waitForSweep } from "./helpers.ts";

const FAILURE = "typesafe HTTP 400: Unknown model: test";

test("when jev fails on every call the sweep fails and says why, instead of reporting no news", async () => {
  const { app, cleanup } = await fauxApp({
    DNA_FIXTURE_SET: "news",
    DNA_FIXTURE_JEV_FAIL: FAILURE,
  });
  try {
    const started = await startNewsSweep(app, app.main, app.ctx, {
      trigger: "test",
      requestId: "t:jev-fail",
    });
    const sweep = await waitForSweep(app, started.sweep!.id);

    assert.equal(sweep.status, "failed");
    assert.match(sweep.error!, /jev failed on \d+ of \d+ calls: .*Unknown model: test/);
    assert.equal(sweep.kept, 0);
    assert.equal(sweep.audit?.missing.includes("complete_sweep"), false);

    const gate = sweep.phases.find((p) => p.phase === "gate")!;
    assert.equal(gate.status, "failed");
    assert.match(gate.note!, /jev failed/);
    assert.equal(
      sweep.phases.filter((p) => p.phase === "gather").length,
      1,
      "no second bag of searches while jev is down",
    );

    const cost = app.store.telemetry.sweepCost(sweep.id);
    assert.ok(cost.jevFailed > 0);
    assert.equal(cost.jevFailed, cost.jevCalls, "every call failed");

    const run = app.store.telemetry
      .toolCallsForSweep(sweep.id)
      .find((t) => t.toolName === "run_news_sweep")!;
    assert.equal(run.isError, true);
    assert.match(run.resultText!, /Unknown model: test/);

    const detail = app.store.telemetry.toolCall(run.id)!;
    assert.ok(detail.jevCalls.length > 0, "the sweep's jev calls are in its tool call's log");
    assert.ok(detail.jevCalls.every((j) => j.error?.includes("Unknown model: test")));
  } finally {
    await cleanup();
  }
});
