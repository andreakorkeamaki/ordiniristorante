import { z } from "zod";

export type TranslationEntity =
  | "category"
  | "item"
  | "extra"
  | "settings";

export type TranslationTable =
  | "menu_categories"
  | "menu_items"
  | "menu_extras"
  | "restaurant_settings";

export interface TranslationCandidate {
  key: string;
  entity: TranslationEntity;
  table: TranslationTable;
  id: string;
  sourceField: string;
  targetField: string;
  italian: string;
}

interface TranslationField {
  sourceField: string;
  targetField: string;
}

export interface TranslationSource {
  entity: TranslationEntity;
  table: TranslationTable;
  rows: Record<string, unknown>[];
  fields: TranslationField[];
}

const translationPayloadSchema = z.object({
  translations: z.array(
    z.object({
      key: z.string().min(1),
      translation: z.string().trim().min(1),
    }),
  ),
});

export type TranslationPayload = z.infer<typeof translationPayloadSchema>;

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isMissingTranslation(value: unknown) {
  return value === null || (typeof value === "string" && value.trim() === "");
}

export function collectMissingTranslationCandidates(
  sources: TranslationSource[],
  limit: number,
) {
  const candidates: TranslationCandidate[] = [];

  for (const source of sources) {
    const rows = [...source.rows].sort((left, right) =>
      String(left.id).localeCompare(String(right.id)),
    );

    for (const row of rows) {
      if (typeof row.id !== "string") continue;

      for (const field of source.fields) {
        const italian = row[field.sourceField];
        if (
          hasText(italian) &&
          isMissingTranslation(row[field.targetField])
        ) {
          candidates.push({
            key: [
              source.table,
              row.id,
              field.targetField,
            ].join(":"),
            entity: source.entity,
            table: source.table,
            id: row.id,
            sourceField: field.sourceField,
            targetField: field.targetField,
            italian,
          });
          if (candidates.length >= limit) return candidates;
        }
      }
    }
  }

  return candidates;
}

export function parseTranslationPayload(
  text: string,
  expectedCandidates: TranslationCandidate[],
) {
  const payload = translationPayloadSchema.parse(JSON.parse(text));
  const expectedKeys = new Set(expectedCandidates.map(({ key }) => key));
  const translations = new Map<string, string>();

  for (const entry of payload.translations) {
    if (!expectedKeys.has(entry.key) || translations.has(entry.key)) {
      throw new Error("OpenAI ha restituito chiavi di traduzione non valide.");
    }
    translations.set(entry.key, entry.translation.trim());
  }

  if (translations.size !== expectedKeys.size) {
    throw new Error("OpenAI non ha restituito tutte le traduzioni richieste.");
  }

  return translations;
}

export const MENU_TRANSLATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          translation: { type: "string" },
        },
        required: ["key", "translation"],
      },
    },
  },
  required: ["translations"],
} as const;
