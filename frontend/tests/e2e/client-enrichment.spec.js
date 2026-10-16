const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("whymob_token", "offline-test"));
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/auth/me") ? { id: "test", name: "Teste", role: "admin" } : path.endsWith("/users/me/preferences") ? {} : [];
    await route.fulfill({ json: body });
  });
});

test("automatically fills empty fields and preserves entered values before saving", async ({ page }) => {
  let saved = null;
  await page.route("**/api/clients", async (route) => {
    if (route.request().method() === "POST") saved = route.request().postDataJSON();
    await route.fulfill({ json: route.request().method() === "POST" ? { id: "new", ...saved } : [] });
  });
  await page.route("**/api/clients/enrich", (route) => route.fulfill({ json: {
    suggestions: {
      name: { value: "Nome publicado", source: "https://example.pt/contactos", method: "website" },
      nif: { value: "509442013", source: "https://www.nif.pt/?q=509442013", method: "nif_pt" },
      address: { value: "Rua Um, Lisboa", source: "https://example.pt/contactos", method: "website" },
      contact_phone: { value: "210000000", source: "https://example.pt/contactos", method: "website" },
    }, warnings: [], ai_used: false,
  } }));
  await page.goto("/clientes");
  await page.getByTestId("new-client-btn").click();
  await expect(page.getByText("Preencha e-mail corporativo ou NIF da empresa")).toBeVisible();
  await expect(page.getByTestId("client-enrich-btn")).toHaveText("Enriquecimento de dados");
  await expect(page.getByTestId("client-enrich-btn")).toBeDisabled();
  await expect(page.getByLabel("Website da empresa (opcional)")).toHaveCount(0);
  await page.getByTestId("client-name-input").fill("Nome introduzido");
  await page.getByTestId("client-email-input").fill("ana@example.pt");
  await page.getByTestId("client-enrich-btn").click();
  await expect(page.getByTestId("client-name-input")).toHaveValue("Nome introduzido");
  await expect(page.getByTestId("client-nif-input")).toHaveValue("509442013");
  await expect(page.getByTestId("client-email-input")).toHaveValue("ana@example.pt");
  await expect(page.getByTestId("client-enrich-apply-btn")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver fonte", exact: true }).first()).not.toBeVisible();
  await page.getByText("Fontes e avisos", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Ver fonte", exact: true }).first()).toBeVisible();
  expect(saved).toBeNull();
  await page.getByTestId("client-save-btn").click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(saved.name).toBe("Nome introduzido");
  expect(saved.address).toBe("Rua Um, Lisboa");
  expect(saved.contact_phone).toBe("210000000");
});

test("does not apply results after search inputs change", async ({ page }) => {
  let finish;
  let started;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const requested = new Promise((resolve) => { started = resolve; });
  await page.route("**/api/clients/enrich", async (route) => {
    started();
    await waiting;
    await route.fulfill({ json: { suggestions: { name: { value: "Empresa A", source: "https://example.pt", method: "website" } }, warnings: [], ai_used: false } });
  });
  await page.goto("/clientes");
  await page.getByTestId("new-client-btn").click();
  const email = page.getByTestId("client-email-input");
  await email.fill("ana@example.pt");
  await page.getByTestId("client-enrich-btn").click();
  await requested;
  await email.fill("ana@outra.pt");
  finish();
  await expect(page.getByRole("alert")).toHaveText("O email ou NIF mudou durante a pesquisa. Faça uma nova consulta.");
  await expect(page.getByTestId("client-name-input")).toHaveValue("");
});
