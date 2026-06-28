import type { Metadata } from "next";
import { PublicMenu } from "@/components/public-menu";
import { SetupNotice } from "@/components/setup-notice";
import { hasSupabaseEnv } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Menu",
  description: "Il menu di La Sagretta: pinse, fritti, mare, dolci e bevande.",
};

export const dynamic = "force-dynamic";

export default function MenuPage() {
  return (
    <main className="public-menu-page">
      {hasSupabaseEnv() ? <PublicMenu /> : <SetupNotice />}
    </main>
  );
}
