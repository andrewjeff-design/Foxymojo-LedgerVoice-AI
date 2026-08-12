import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "ledgervoice-ai", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
