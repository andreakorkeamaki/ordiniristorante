import { NextResponse } from "next/server";
import {
  runMenuTranslationBatch,
  TranslationBatchError,
} from "@/lib/menu-translation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    const summary = await runMenuTranslationBatch();
    console.log(
      JSON.stringify({
        level: "info",
        message: "automatic_menu_translation_completed",
        route: "/api/cron/translate-menu",
        requestId,
        durationMs: Date.now() - startedAt,
        ...summary,
      }),
    );
    return NextResponse.json(
      { ok: true, ...summary },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const summary =
      error instanceof TranslationBatchError ? error.summary : undefined;
    console.error(
      JSON.stringify({
        level: "error",
        message: "automatic_menu_translation_failed",
        route: "/api/cron/translate-menu",
        requestId,
        durationMs: Date.now() - startedAt,
        error:
          error instanceof Error ? error.message : "unknown error",
        ...(summary ? { summary } : {}),
      }),
    );
    return NextResponse.json(
      {
        ok: false,
        error: "Traduzione automatica non completata",
        ...(summary ? { summary } : {}),
      },
      { status: 503 },
    );
  }
}
