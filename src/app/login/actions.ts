"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";

const back = (mode: string, message: string) => redirect(`/login?mode=${mode}&error=${encodeURIComponent(message)}`);

function credentials(formData: FormData, mode: string) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(mode, "Enter a valid email address.");
  if (password.length < 8) back(mode, "Use a password of at least 8 characters.");
  return { email, password };
}

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData, "signin"));
  if (error) back("signin", error.message);
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const company = String(formData.get("company") || "").trim().slice(0, 160);
  if (!name || !company) back("signup", "Your name and company name are both needed.");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    ...credentials(formData, "signup"),
    options: { emailRedirectTo: `${appUrl()}/auth/callback?next=/onboarding`, data: { full_name: name, company } }
  });
  if (error) back("signup", error.message);
  /* with email confirmation off, Supabase signs the person straight in */
  if (data.session) redirect("/onboarding");
  redirect("/login?mode=signin&message=" + encodeURIComponent("Check your email to confirm your account, then sign in."));
}
