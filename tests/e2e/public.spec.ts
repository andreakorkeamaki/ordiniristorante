import { expect, test } from "@playwright/test";

test("la home porta al menu pubblico", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/menu$/);
  if (await page.getByRole("heading", { name: "Collega Supabase" }).isVisible()) {
    await expect(page.locator("body")).toContainText("Configurazione richiesta");
    return;
  }

  await expect(
    page.getByRole("heading", { name: "Il gusto di casa.", exact: true }),
  ).toBeVisible();
  await expect.poll(() => page.locator(".category-strip a").count()).toBeGreaterThan(0);
  await expect.poll(() => page.locator(".public-product").count()).toBeGreaterThan(0);
  await expect(page.getByText("Triangoli di cheddar e nacho")).toHaveCount(0);

  await page.getByPlaceholder("Cerca nel menu").fill("focaccia");
  await expect.poll(() => page.locator(".public-product").count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByPlaceholder("Search the menu")).toBeVisible();
});

test("l'area staff mostra il login o la configurazione richiesta", async ({ page }) => {
  await page.goto("/staff");
  await expect(page.locator("body")).toContainText(/Accedi|Collega Supabase/);
});

test("il recupero password usa una pagina pubblica dedicata", async ({ page }) => {
  await page.goto("/staff/forgot-password");
  await expect(page.getByRole("heading", { name: "Reimposta la password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invia link di recupero" })).toBeVisible();
});

test("un recovery link viene instradato alla nuova password", async ({ page }) => {
  await page.goto("/menu#type=recovery");
  await expect(page).toHaveURL(/\/staff\/reset-password/);
  await expect(page.locator("body")).toContainText(
    /Link non valido o scaduto|Servizio non configurato/,
  );
});
