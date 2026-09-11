import { prisma } from "../db/prisma";
import { runIngest } from "./ingest";
import { env } from "../env";

// How often the scheduler wakes up to ask "is a sync due?". This is not
// the sync interval -- it's just the resolution at which the answer is
// checked, kept short so a run that becomes due shortly after a deploy
// doesn't wait a whole interval for the next tick.
const TICK_MS = 10 * 60 * 1000;

// A run whose row never got a finishedAt is either still going or died
// with the container. Past this age it's treated as dead, so a crash
// mid-sync can't wedge the scheduler permanently.
const STALE_RUN_MS = 2 * 60 * 60 * 1000;

// Whether a sync is due is answered from the SyncRun table rather than
// from a timer held in memory: the container restarts on every deploy,
// and an in-process interval would silently reset the clock each time,
// so a frequently-deployed week could go without a single sync while
// looking perfectly healthy.
async function dueForSync(now: Date): Promise<boolean> {
  const running = await prisma.syncRun.findFirst({
    where: { finishedAt: null, startedAt: { gt: new Date(now.getTime() - STALE_RUN_MS) } },
    orderBy: { startedAt: "desc" },
  });
  if (running) return false;

  const last = await prisma.syncRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { finishedAt: "desc" },
  });
  if (!last?.finishedAt) return true; // never synced

  const elapsedHours = (now.getTime() - last.finishedAt.getTime()) / 3_600_000;
  return elapsedHours >= env.syncIntervalHours;
}

// Runs an ingest and records what it did. Exported so the manual admin
// endpoint books its runs the same way the scheduler does -- otherwise a
// manual sync wouldn't count toward "when did we last sync", and the
// scheduler would re-run right on top of one someone just triggered.
export async function runSync(trigger: "schedule" | "manual"): Promise<void> {
  const run = await prisma.syncRun.create({ data: { trigger } });
  try {
    const summaries = await runIngest();

    const totals = { newProducts: 0, priceDrops: 0, priceRises: 0, backInStock: 0, outOfStock: 0, delisted: 0, relisted: 0 };
    for (const s of summaries) {
      totals.newProducts += s.changes.listed ?? 0;
      totals.priceDrops += s.changes["price-drop"] ?? 0;
      totals.priceRises += s.changes["price-rise"] ?? 0;
      totals.backInStock += s.changes["back-in-stock"] ?? 0;
      totals.outOfStock += s.changes["out-of-stock"] ?? 0;
      totals.delisted += s.changes.delisted ?? 0;
      totals.relisted += s.changes.relisted ?? 0;
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: { ...totals, finishedAt: new Date(), storesJson: JSON.stringify(summaries) },
    });
    console.log(`[sync] ${trigger} run finished:`, JSON.stringify(totals));
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), error: (err as Error).message.slice(0, 500) },
    });
    throw err;
  }
}

export function startScheduler(): void {
  if (env.syncIntervalHours <= 0) {
    console.log("[sync] scheduler disabled (SYNC_INTERVAL_HOURS <= 0)");
    return;
  }
  console.log(`[sync] scheduler on: a catalog sync every ${env.syncIntervalHours}h`);

  const tick = async () => {
    try {
      if (!(await dueForSync(new Date()))) return;
      console.log("[sync] due -- starting scheduled catalog sync");
      await runSync("schedule");
    } catch (err) {
      console.error("[sync] scheduled run failed:", (err as Error).message);
    }
  };

  // Not on boot directly: a deploy restarts the container, and syncing
  // immediately every time would turn a busy afternoon of deploys into a
  // string of back-to-back crawls. The first tick is a few minutes in,
  // and dueForSync decides from the last run's timestamp either way.
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), TICK_MS);
  }, 60_000).unref?.();
}
