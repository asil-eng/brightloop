import { runDailyJobs } from "./jobs";

// The daily jobs are idempotent, so running them hourly simply picks up anything due.
export function startScheduler() {
  if (process.env.DISABLE_SCHEDULER === "1") return;
  const run = async () => {
    try {
      const results = await runDailyJobs();
      console.log(`[scheduler] ${new Date().toISOString()} ${results.map((r) => `${r.name}=${r.count}`).join(", ")}`);
    } catch (e) {
      console.error("[scheduler] failed", e);
    }
  };
  setTimeout(run, 15_000);
  setInterval(run, 60 * 60 * 1000);
}
