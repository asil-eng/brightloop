import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/jobs";

// For an external scheduler: GET /api/cron with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ results: await runDailyJobs() });
}
