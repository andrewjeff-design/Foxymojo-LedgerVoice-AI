"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";

function credentials(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || password.length < 8) redirect("/login?error=Use+a+valid+email+and+a+password+of+at+least+8+characters");
  return { email, password };
}

export async function signIn(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword(credentials(formData));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const values = credentials(formData);
  const { error } = await supabase.auth.signUp({
    ...values,
    options: { emailRedirectTo: `${appUrl()}/auth/callback` }
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/login?message=Check+your+email+to+confirm+your+account");
}
