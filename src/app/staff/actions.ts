"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  const supabase = await createClient();

  if (!supabase) redirect("/staff?error=config");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/staff?error=credentials");

  if (next.startsWith("/")) redirect(next);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user!.id)
    .single();

  if (!profile?.active) {
    await supabase.auth.signOut();
    redirect("/staff?error=inactive");
  }

  redirect(profile.role === "waiter" ? "/staff/tables" : "/cassa");
}

export async function logout() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/staff");
}
