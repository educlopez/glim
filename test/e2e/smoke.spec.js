import { expect, test } from "@playwright/test";

test("la barra lateral enseña el cerebro y abre Encargos", async ({ page }) => {
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));

  // Sin la hoja de novedades del primer arranque, que tapa la interfaz.
  await page.addInitScript(() => localStorage.setItem("panel:novedadesVista", "999.0.0"));
  await page.goto("/");
  await expect(page.locator(".side .cerebronombre")).toContainText("Cerebro de prueba");

  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: /Encargos/ }).click();
  await expect(page).toHaveURL(/#\/encargos/);
  await expect(page.locator(".pagehead")).toContainText("Encargos");

  expect(errores).toEqual([]);
});
