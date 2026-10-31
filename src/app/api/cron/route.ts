import { NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily billing and reminders. Vercel Cron calls this (see vercel.json) and sends
// "Authorization: Bearer <CRON_SECRET>" automatically when CRON_SECRET is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ results: await runDailyJobs() });
}
