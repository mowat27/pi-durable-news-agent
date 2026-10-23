import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { DnaError } from "@dna/sdk";
import { bootServer, settledSweep, type Booted } from "./server.ts";

let s: Booted;
before(async () => {
  s = await bootServer({ DNA_FIXTURE_JEV_DELAY_MS: "40" });
});
after(() => s.cleanup());

test("the client token starts a manual sweep now, and a second one is skipped while it runs", async () => {
  const first = await s.client.startSweep({ cards: 3 });
  assert.equal(first.status, "accepted");
  assert.equal(first.sweep!.trigger, "manual");
  assert.equal(first.sweep!.maxCards, 3);

  const second = await s.client.startSweep();
  assert.equal(second.status, "skipped");
  assert.match(second.sweep!.reason!, /still running/);

  const done = await settledSweep(s.client, first.sweep!.id, 60_000);
  assert.equal(done.status, "completed");
});

test("the cron token cannot start a manual sweep", async () => {
  await assert.rejects(s.cron.startSweep(), (e) => e instanceof DnaError && e.status === 403);
});

test("a manual sweep without a requestId is 400", async () => {
  const res = await fetch(`${s.base}/v1/sweeps`, {
    method: "POST",
    headers: { authorization: `Bearer ${s.tokens.client}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 400);
});
