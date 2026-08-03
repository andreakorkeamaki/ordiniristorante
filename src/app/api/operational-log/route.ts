import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { OPERATIONAL_EVENTS } from "@/lib/operational-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  event: z.enum(OPERATIONAL_EVENTS),
  code: z.string().min(1).max(32).regex(/^[A-Za-z0-9_.-]+$/).optional(),
  message: z.string().min(1).max(300),
  orderId: z.uuid().optional(),
  printJobId: z.uuid().optional(),
}).strict();

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile?.active) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Log operativo non valido" }, { status: 400 });
  }

  console.error(
    JSON.stringify({
      level: "error",
      scope: "operational_client",
      event: parsed.data.event,
      timestamp: new Date().toISOString(),
      actor_id: profile.id,
      ...(parsed.data.code ? { code: parsed.data.code } : {}),
      message: parsed.data.message,
      ...(parsed.data.orderId ? { order_id: parsed.data.orderId } : {}),
      ...(parsed.data.printJobId ? { print_job_id: parsed.data.printJobId } : {}),
    }),
  );

  return new NextResponse(null, { status: 204 });
}
