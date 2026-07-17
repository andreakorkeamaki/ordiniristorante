"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const costSchema = z.object({
  kind: z.enum(["item", "extra"]),
  productId: z.uuid(),
  unitCost: z.union([z.literal(""), z.coerce.number().min(0).max(999999.99)]),
});

export async function saveProductCost(formData: FormData) {
  await requireProfile(["admin"]);
  const parsed = costSchema.safeParse({
    kind: formData.get("kind"),
    productId: formData.get("product_id"),
    unitCost: formData.get("unit_cost"),
  });
  if (!parsed.success) redirect("/admin/statistiche/costi?error=invalid");

  try {
    const { error } = await createAdminClient().rpc("set_admin_product_cost", {
      p_kind: parsed.data.kind,
      p_product_id: parsed.data.productId,
      p_unit_cost: parsed.data.unitCost === "" ? null : parsed.data.unitCost,
    });
    if (error) redirect("/admin/statistiche/costi?error=save");
  } catch {
    redirect("/admin/statistiche/costi?error=save");
  }

  revalidatePath("/admin/statistiche");
  revalidatePath("/admin/statistiche/costi");
  redirect("/admin/statistiche/costi?saved=1");
}
