import "server-only";
import Stripe from "stripe";
import { requireEnv } from "@/lib/env";

let stripeClient: Stripe | undefined;

export function stripe() {
  stripeClient ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    appInfo: { name: "LedgerVoice AI", version: "1.0.0" }
  });
  return stripeClient;
}
