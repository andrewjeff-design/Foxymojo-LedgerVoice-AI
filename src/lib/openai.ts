import "server-only";
import OpenAI from "openai";
import { requireEnv } from "@/lib/env";

let openAIClient: OpenAI | undefined;

export function openai() {
  openAIClient ??= new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return openAIClient;
}
