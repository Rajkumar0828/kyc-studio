// Offline tests: with AI_CALL_LOG=mongo the daily AI cap survives a restart,
// restored from today's (UTC) ai_calls. The collection is faked.
// Usage: npx tsx scripts/ai-budget-restore-test.ts
import assert from "node:assert/strict";
import { restoreAiBudget, restoreAiBudgetWithRetry, utcDayFilter, type CountCalls, type DayFilter } from "../src/lib/ai/budgetRestore";
import { AiBudgetExceeded, aiUsedToday, consumeAiCall, restoreAiUsage } from "../src/lib/security/aiBudget";

let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e instanceof Error ? e.message.split("\n").join("\n      ") : e}`);
  }
}

// A server restart: the in-memory counter starts from zero.
const restart = () => Object.assign((globalThis as unknown as { _aiBudget: { day: string; used: number } })._aiBudget, { day: "", used: 0 });

// A fake ai_calls collection that applies the filter the way MongoDB would (string range on ISO "at").
function fakeCalls(rows: Array<{ at: string; source: "app" | "eval" }>) {
  const seen: DayFilter[] = [];
  const count: CountCalls = async (f) => {
    seen.push(f);
    return rows.filter((r) => r.source === f.source && r.at >= f.at.$gte && r.at < f.at.$lt).length;
  };
  return { count, seen };
}
const todayAt = (hh: string) => `${new Date().toISOString().slice(0, 10)}T${hh}:00:00.000Z`;

async function main() {
  process.env.AI_CALL_LOG = "mongo";
  process.env.AI_DAILY_CALL_CAP = "8";

  await test("after a restart the count is restored from today's ai_calls", async () => {
    restart();
    const { count } = fakeCalls(Array.from({ length: 7 }, () => ({ at: todayAt("00"), source: "app" as const })));
    assert.equal(await restoreAiBudget(count), 7);
    assert.equal(aiUsedToday(), 7);
  });

  await test("the restored count is enforced: one call left of 8, then the cap", () => {
    consumeAiCall();
    assert.throws(() => consumeAiCall(), AiBudgetExceeded);
  });

  await test("only today's UTC app calls count: yesterday and eval runs are excluded", async () => {
    restart();
    const now = new Date();
    const yesterday = new Date(Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`) - 1).toISOString();
    const { count } = fakeCalls([
      { at: yesterday, source: "app" }, { at: todayAt("00"), source: "app" }, { at: todayAt("01"), source: "eval" }, { at: todayAt("02"), source: "app" },
    ]);
    assert.equal(await restoreAiBudget(count, now), 2);
  });

  await test("the UTC day window is [00:00Z, next 00:00Z)", () => {
    const { day, filter } = utcDayFilter(new Date("2026-11-03T23:59:59.999Z"));
    assert.equal(day, "2026-11-03");
    assert.deepEqual(filter, { source: "app", at: { $gte: "2026-11-03T00:00:00.000Z", $lt: "2026-11-04T00:00:00.000Z" } });
    assert.equal(utcDayFilter(new Date("2026-11-04T00:00:00.000Z")).day, "2026-11-04");
  });

  await test("restoring never lowers the in-memory count, and ignores another day", () => {
    restart();
    for (let i = 0; i < 5; i++) consumeAiCall();
    restoreAiUsage(new Date().toISOString().slice(0, 10), 3);
    assert.equal(aiUsedToday(), 5);
    restoreAiUsage("2000-01-01", 99);
    assert.equal(aiUsedToday(), 5);
  });

  await test("AI_CALL_LOG=file: nothing is restored and the collection is not queried", async () => {
    process.env.AI_CALL_LOG = "file";
    restart();
    const { count, seen } = fakeCalls([{ at: todayAt("00"), source: "app" }]);
    assert.equal(await restoreAiBudget(count), null);
    assert.equal(seen.length, 0);
    assert.equal(aiUsedToday(), 0);
    process.env.AI_CALL_LOG = "mongo";
  });

  await test("Mongo down at startup: the first attempt fails, a background retry restores the count", async () => {
    restart();
    let calls = 0;
    const count: CountCalls = async () => {
      if (++calls === 1) throw Object.assign(new Error("connect ECONNREFUSED mongodb://u:p@db"), { name: "MongoServerSelectionError" });
      return 4;
    };
    const orig = console.error;
    const logged: string[] = [];
    console.error = (...a: unknown[]) => void logged.push(a.join(" "));
    try {
      assert.equal(await restoreAiBudgetWithRetry(count, 20), false);
      await new Promise((r) => setTimeout(r, 120));
    } finally {
      console.error = orig;
    }
    assert.equal(aiUsedToday(), 4);
    assert.deepEqual(logged, ["[ai-budget] could not restore today's AI call count: MongoServerSelectionError"]);
  });

  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
}
void main();
