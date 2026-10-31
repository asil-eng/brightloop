// Runs once when the Next.js server starts and schedules the billing jobs.
export async function register() {
  // The literal comparison lets the bundler drop the Node-only code from the edge build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
