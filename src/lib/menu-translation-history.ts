import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TranslationCandidate,
  TranslationEntity,
  TranslationTable,
} from "@/lib/menu-translation-core";

export type TranslationRunStatus = "running" | "succeeded" | "failed";

interface TranslationRunSummary {
  found: number;
  updatedFields: number;
  skippedFields: number;
  remainingFields: number;
  translated: {
    categories: number;
    items: number;
    extras: number;
    settings: number;
  };
  fields: Record<string, number>;
  model: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
}

export interface MenuTranslationChange {
  id: number;
  runId: string;
  entity: TranslationEntity;
  sourceTable: TranslationTable;
  recordId: string;
  sourceField: string;
  targetField: string;
  italianText: string;
  englishText: string;
  createdAt: string;
}

export interface MenuTranslationRun {
  id: string;
  status: TranslationRunStatus;
  startedAt: string;
  completedAt: string | null;
  foundFields: number;
  updatedFields: number;
  skippedFields: number;
  remainingFields: number;
  translatedCategories: number;
  translatedItems: number;
  translatedExtras: number;
  translatedSettings: number;
  fieldCounts: Record<string, number>;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  errorMessage: string | null;
  changes: MenuTranslationChange[];
}

interface RunRow {
  id: string;
  status: TranslationRunStatus;
  started_at: string;
  completed_at: string | null;
  found_fields: number;
  updated_fields: number;
  skipped_fields: number;
  remaining_fields: number;
  translated_categories: number;
  translated_items: number;
  translated_extras: number;
  translated_settings: number;
  field_counts: Record<string, number>;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  error_message: string | null;
}

interface ChangeRow {
  id: number;
  run_id: string;
  entity: TranslationEntity;
  source_table: TranslationTable;
  record_id: string;
  source_field: string;
  target_field: string;
  italian_text: string;
  english_text: string;
  created_at: string;
}

function summaryUpdate(
  summary: TranslationRunSummary,
  status: TranslationRunStatus,
  errorMessage: string | null,
) {
  return {
    status,
    completed_at: new Date().toISOString(),
    found_fields: summary.found,
    updated_fields: summary.updatedFields,
    skipped_fields: summary.skippedFields,
    remaining_fields: summary.remainingFields,
    translated_categories: summary.translated.categories,
    translated_items: summary.translated.items,
    translated_extras: summary.translated.extras,
    translated_settings: summary.translated.settings,
    field_counts: summary.fields,
    model: summary.model,
    input_tokens: summary.usage?.inputTokens ?? null,
    output_tokens: summary.usage?.outputTokens ?? null,
    total_tokens: summary.usage?.totalTokens ?? null,
    error_message: errorMessage,
  };
}

export async function startTranslationRun(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("menu_translation_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error("Impossibile avviare lo storico delle traduzioni.");
  }

  return data.id as string;
}

export async function recordTranslationChange(
  admin: SupabaseClient,
  runId: string,
  candidate: TranslationCandidate,
  translation: string,
) {
  const { error } = await admin
    .from("menu_translation_changes")
    .insert({
      run_id: runId,
      entity: candidate.entity,
      source_table: candidate.table,
      record_id: candidate.id,
      source_field: candidate.sourceField,
      target_field: candidate.targetField,
      italian_text: candidate.italian,
      english_text: translation,
    });

  if (error) {
    throw new Error(
      `Impossibile registrare la traduzione di ${candidate.table}:${candidate.id}.`,
    );
  }
}

export async function completeTranslationRun(
  admin: SupabaseClient,
  runId: string,
  summary: TranslationRunSummary,
) {
  const { data, error } = await admin
    .from("menu_translation_runs")
    .update(summaryUpdate(summary, "succeeded", null))
    .eq("id", runId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw new Error("Impossibile completare lo storico delle traduzioni.");
  }
}

export async function failTranslationRun(
  admin: SupabaseClient,
  runId: string,
  summary: TranslationRunSummary,
  message: string,
) {
  await admin
    .from("menu_translation_runs")
    .update(summaryUpdate(summary, "failed", message.slice(0, 1000)))
    .eq("id", runId)
    .eq("status", "running");
}

export async function loadMenuTranslationHistory(limit = 30) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: runData, error: runError } = await admin
    .from("menu_translation_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (runError) {
    return {
      runs: [] as MenuTranslationRun[],
      error: "Storico traduzioni non disponibile. Applica la migration.",
    };
  }

  const runRows = (runData ?? []) as unknown as RunRow[];
  if (runRows.length === 0) {
    return { runs: [] as MenuTranslationRun[], error: null };
  }

  const { data: changeData, error: changeError } = await admin
    .from("menu_translation_changes")
    .select("*")
    .in(
      "run_id",
      runRows.map(({ id }) => id),
    )
    .order("id", { ascending: true });

  if (changeError) {
    return {
      runs: [] as MenuTranslationRun[],
      error: "Dettaglio delle traduzioni non disponibile.",
    };
  }

  const changesByRun = new Map<string, MenuTranslationChange[]>();
  for (const row of (changeData ?? []) as unknown as ChangeRow[]) {
    const change: MenuTranslationChange = {
      id: row.id,
      runId: row.run_id,
      entity: row.entity,
      sourceTable: row.source_table,
      recordId: row.record_id,
      sourceField: row.source_field,
      targetField: row.target_field,
      italianText: row.italian_text,
      englishText: row.english_text,
      createdAt: row.created_at,
    };
    const changes = changesByRun.get(row.run_id) ?? [];
    changes.push(change);
    changesByRun.set(row.run_id, changes);
  }

  return {
    error: null,
    runs: runRows.map(
      (row): MenuTranslationRun => ({
        id: row.id,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        foundFields: row.found_fields,
        updatedFields: row.updated_fields,
        skippedFields: row.skipped_fields,
        remainingFields: row.remaining_fields,
        translatedCategories: row.translated_categories,
        translatedItems: row.translated_items,
        translatedExtras: row.translated_extras,
        translatedSettings: row.translated_settings,
        fieldCounts: row.field_counts,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalTokens: row.total_tokens,
        errorMessage: row.error_message,
        changes: changesByRun.get(row.id) ?? [],
      }),
    ),
  };
}
