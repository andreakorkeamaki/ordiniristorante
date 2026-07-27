import { describe, expect, it } from "vitest";
import {
  collectMissingTranslationCandidates,
  parseTranslationPayload,
  type TranslationSource,
} from "@/lib/menu-translation-core";

const sources: TranslationSource[] = [
  {
    entity: "category",
    table: "menu_categories",
    rows: [
      {
        id: "b",
        name: "Dolci",
        name_en: "Desserts",
        description: "Fatti in casa",
        description_en: " ",
      },
      {
        id: "a",
        name: "Antipasti",
        name_en: null,
        description: null,
        description_en: null,
      },
    ],
    fields: [
      { sourceField: "name", targetField: "name_en" },
      { sourceField: "description", targetField: "description_en" },
    ],
  },
];

describe("menu translation core", () => {
  it("seleziona solo testi italiani con traduzione nulla o vuota", () => {
    expect(collectMissingTranslationCandidates(sources, 20)).toEqual([
      expect.objectContaining({
        key: "menu_categories:a:name_en",
        italian: "Antipasti",
      }),
      expect.objectContaining({
        key: "menu_categories:b:description_en",
        italian: "Fatti in casa",
      }),
    ]);
  });

  it("rispetta il limite del piccolo batch", () => {
    expect(collectMissingTranslationCandidates(sources, 1)).toHaveLength(1);
  });

  it("accetta soltanto una traduzione per ogni chiave richiesta", () => {
    const candidates = collectMissingTranslationCandidates(sources, 20);
    const translations = parseTranslationPayload(
      JSON.stringify({
        translations: [
          {
            key: "menu_categories:a:name_en",
            translation: "Starters",
          },
          {
            key: "menu_categories:b:description_en",
            translation: "Homemade",
          },
        ],
      }),
      candidates,
    );

    expect(translations.get("menu_categories:a:name_en")).toBe("Starters");
    expect(translations.get("menu_categories:b:description_en")).toBe(
      "Homemade",
    );
  });

  it("rifiuta risultati incompleti o con chiavi inattese", () => {
    const candidates = collectMissingTranslationCandidates(sources, 20);

    expect(() =>
      parseTranslationPayload(
        JSON.stringify({
          translations: [
            {
              key: "menu_categories:a:name_en",
              translation: "Starters",
            },
          ],
        }),
        candidates,
      ),
    ).toThrow("tutte le traduzioni");

    expect(() =>
      parseTranslationPayload(
        JSON.stringify({
          translations: [
            {
              key: "menu_categories:a:name_en",
              translation: "Starters",
            },
            {
              key: "unexpected",
              translation: "Unexpected",
            },
          ],
        }),
        candidates,
      ),
    ).toThrow("chiavi di traduzione non valide");
  });
});
