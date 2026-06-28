import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/types/domain";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  return data as Profile | null;
}

export async function requireProfile(allowed: AppRole[]) {
  const profile = await getCurrentProfile();
  if (!profile?.active) redirect("/staff?error=inactive");
  if (!allowed.includes(profile.role)) {
    redirect(profile.role === "waiter" ? "/staff/tables" : "/cassa");
  }
  return profile;
}
