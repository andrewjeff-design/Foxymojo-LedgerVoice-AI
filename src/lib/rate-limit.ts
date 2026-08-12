import { createHash } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";

export async function enforceRateLimit(scope: string, userId: string, limit: number, windowSeconds = 60) {
  const key = createHash("sha256")
    .update(`${requireEnv("RATE_LIMIT_SECRET")}:${scope}:${userId}`)
    .digest("hex");
  const admin = createAdminSupabaseClient();
  const now = new Date();
  const { data } = await admin
    .from("api_rate_limits")
    .select("window_start, request_count")
    .eq("rate_key", key)
    .maybeSingle();

  const expired = !data || now.getTime() - new Date(data.window_start).getTime() >= windowSeconds * 1000;
  if (expired) {
    await admin.from("api_rate_limits").upsert({ rate_key: key, window_start: now.toISOString(), request_count: 1 });
    return;
  }
  if (data.request_count >= limit) throw new Response("Too many requests", { status: 429, statusText: "Too many requests" });

  await admin
    .from("api_rate_limits")
    .update({ request_count: data.request_count + 1 })
    .eq("rate_key", key);
}
