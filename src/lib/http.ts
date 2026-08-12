import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(error: unknown) {
  if (error instanceof Response) {
    return NextResponse.json({ error: error.statusText || "Request failed" }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
}
