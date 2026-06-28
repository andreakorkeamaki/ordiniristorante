import { expect, test } from "@playwright/test";

test("la home porta al menu pubblico", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.getByRole("heading", { name: "La Sagretta", exact: true })).toBeVisible();
  await expect(page.locator(".category-strip a")).toHaveCount(10);
  await expect(page.locator(".public-product")).toHaveCount(78);
  await expect(page.getByText("Triangoli di cheddar e nacho")).toHaveCount(0);

  await page.getByPlaceholder("Cerca nel menu").fill("focaccia");
  await expect(page.locator(".public-product")).toHaveCount(2);

  await page.getByRole("button", { name: "Cambia lingua" }).click();
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
  await expect(page.getByText("Link non valido o scaduto. Richiedi una nuova email.")).toBeVisible();
});
