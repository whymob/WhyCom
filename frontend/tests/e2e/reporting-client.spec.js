const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("whymob_token", "reporting-test"));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.split("/api")[1];
    const year = new Date().getFullYear();
    const clients = [{ client_id: "c1", name: "Alfa", segment: "PME", props: 60, won: 2, orders: 2, orders_value: 10000, orders_vab: 1000 }, { client_id: "c2", name: "Beta", segment: "Educação", props: 2, won: 1, orders: 1, orders_value: 900, orders_vab: 100 }];
    let data = [];
    if (path === "/auth/me") data = { id: "u1", name: "Teste", role: "admin" };
    if (path === "/analytics/executive") data = { forecast_invoicing: [], forecast_receiving: null, vab: null, kpis: {} };
    if (path.startsWith("/analytics/by-")) data = { rows: path.endsWith("client") ? clients : [] };
    if (path === "/proposals") data = Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, client_id: "c1", number: `PROP-${i}`, status: "ganha", total_net: i === 0 ? 10000 : 900, created_at: `${year}-${i === 0 ? "01-31" : "02-01"}` }));
    if (path === "/invoices") {
      expect(["c1", "c2"]).toContain(url.searchParams.get("client_id"));
      data = [
        { id: "i1", number: "FT-1", external_invoice_number: "EXT-1", order_id: "old-order", order_number: "ENC-ANTIGA", issued_at: `${year}-01-31`, total_net: 1000, total_gross: 1230, received_amount: 1230, status: "recebida", lines: [{ description: "Licenças" }, { description: "Suporte" }] },
        { id: "i2", number: "FT-2", issued_at: `${year}-02-01`, total_net: 2000, total_gross: 2460, received_amount: 460, status: "parcialmente_recebida", lines: [] },
        { id: "i3", number: "FT-3", issued_at: `${year}-02-28`, total_net: 500, total_gross: 615, received_amount: 0, status: "emitida", collection_status: "em_atraso", lines: [] },
        { id: "i4", number: "FT-CANCEL", issued_at: `${year}-01-01`, total_net: 9999, total_gross: 9999, received_amount: 0, status: "anulada", lines: [] },
        { id: "i5", number: "FT-OLD", issued_at: `${year - 1}-01-01`, total_net: 100, total_gross: 100, received_amount: 0, status: "emitida", lines: [] },
      ].map((invoice) => ({ ...invoice, client_id: "c1", order_client_id: "c1" }));
      // Deliberately return a mixed response to exercise the UI isolation too.
      data.push({ id: "other-client", client_id: "c2", order_client_id: "c2", number: "OTHER-CLIENT", issued_at: "2020-01-01", total_net: 99999, total_gross: 99999, received_amount: 0, lines: [] });
      data.push({ id: "wrong-invoice-client", client_id: "c1", order_client_id: "c2", number: "WRONG-CLIENT", issued_at: `${year}-01-01`, total_net: 88888, total_gross: 88888, lines: [] });
      data.push({ id: "cancelled-old-year", client_id: "c1", order_client_id: "c1", status: "anulada", number: "OLD-CANCELLED", issued_at: "2019-01-01", total_net: 77777, lines: [] });
    }
    if (path === "/exports/billing-annual/clients") data = { rows: url.searchParams.get("start_month").endsWith("-03") ? [{ id: "c3", name: "Gama" }] : [{ id: "c1", name: "Alfa" }, { id: "c2", name: "Beta" }] };
    if (path === "/exports/billing-annual.csv" || path === "/exports/billing-annual.pdf") {
      await route.fulfill({ contentType: path.endsWith("pdf") ? "application/pdf" : "text/csv", body: "test-export" });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/reporting");
  await page.getByRole("tab", { name: "Por Cliente", exact: true }).click();
});

test("one billing export button supports multiple clients in both document formats", async ({ page }) => {
  await expect(page.getByTestId("export-annual-billing")).toHaveCount(1);
  await expect(page.getByTestId("export-annual-billing-pdf")).toHaveCount(0);
  await expect(page.getByTestId("export-annual-billing-csv")).toHaveCount(0);
  for (const [format, extension] of [["PDF", "pdf"], ["Excel/CSV", "csv"]]) {
    await page.getByTestId("export-annual-billing").click();
    const dialog = page.getByTestId("annual-billing-dialog");
    await page.getByTestId("annual-billing-clients").click();
    await page.getByRole("checkbox", { name: "Alfa", exact: true }).check();
    await page.getByRole("checkbox", { name: "Beta", exact: true }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("annual-billing-clients")).toHaveText(/2 clientes selecionados/);
    await dialog.getByRole("button", { name: format, exact: true }).click();
    const request = page.waitForRequest((request) => request.url().includes(`/exports/billing-annual.${extension}`));
    const download = page.waitForEvent("download");
    await page.getByTestId("annual-billing-submit").click();
    const url = new URL((await request).url());
    expect(url.searchParams.getAll("client_ids")).toEqual(["c1", "c2"]);
    expect((await download).suggestedFilename()).toMatch(new RegExp(`\\.${extension}$`));
    await expect(dialog).not.toBeVisible();
  }
});

test("billing clients update with period, clear earlier selection and block invalid periods", async ({ page }) => {
  await page.getByTestId("export-annual-billing").click();
  await page.getByTestId("annual-billing-clients").click();
  await page.getByRole("checkbox", { name: "Alfa", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByLabel("Periodo especifico").check();
  const year = new Date().getFullYear();
  await page.getByTestId("annual-billing-start").fill(`${year}-03`);
  await page.getByTestId("annual-billing-end").fill(`${year}-03`);
  await expect(page.getByTestId("annual-billing-clients")).toHaveText(/Todos os clientes/);
  await page.getByTestId("annual-billing-clients").click();
  await expect(page.getByRole("checkbox", { name: "Gama", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Alfa", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByTestId("annual-billing-end").fill(`${year}-02`);
  await expect(page.getByTestId("annual-billing-submit")).toBeDisabled();
  await expect(page.getByTestId("annual-billing-dialog").getByRole("alert")).toContainText("válido");
});

test("sorts clients and details by numeric values and dates, and scrolls long lists", async ({ page }) => {
  const table = page.getByTestId("table-client");
  await table.getByRole("button", { name: "Valor Enc.", exact: true }).click();
  await expect(table.locator(".wc-table-row").first()).toContainText("Beta");
  await table.getByRole("button", { name: "Valor Enc.", exact: true }).click();
  await expect(table.locator(".wc-table-row").first()).toContainText("Alfa");
  await table.getByRole("button", { name: "Alfa", exact: true }).click();
  const detail = page.getByTestId("reporting-detail-table");
  await detail.getByRole("button", { name: "Valor", exact: true }).click();
  await expect(detail.locator(".wc-table-row").first()).toContainText("PROP-1");
  await detail.getByRole("button", { name: "Data", exact: true }).click();
  await expect(detail.locator(".wc-table-row").first()).toContainText("PROP-0");
  expect(await detail.evaluate((el) => { el.scrollTop = el.scrollHeight; return el.scrollTop; })).toBeGreaterThan(0);
  const dialog = page.getByTestId("reporting-detail-dialog");
  expect(await dialog.evaluate((el) => el.getBoundingClientRect().bottom <= window.innerHeight)).toBeTruthy();
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test("client details combine linked documents and preserve different values, dates and standalone records", async ({ page }) => {
  const year = new Date().getFullYear();
  const proposal = (id, amount = 100, date = `${year}-01-31`, client = "c1") => ({ id, number: `PROP-${id}`, client_id: client, status: "ganha", total_net: amount, created_at: date });
  const order = (id, proposalId, amount = 100, date = `${year}-01-31`) => ({ id, number: `ENC-${id}`, proposal_id: proposalId, client_id: "c1", status: "faturada", total_net: amount, order_date: date });
  await page.route("**/api/proposals", (route) => route.fulfill({ json: [proposal("same"), proposal("different"), proposal("alone"), { ...proposal("old", 100, `${year - 1}-01-31`), converted_order_id: "old-order" }, proposal("foreign", 100, `${year}-01-31`, "c2")] }));
  await page.route("**/api/orders", (route) => route.fulfill({ json: [order("same", "same"), order("different", "different", 125, `${year}-02-01`), order("manual", null), order("old-order", null), order("wrong-client-link", "foreign"), { ...order("cancelled", "same"), status: "cancelada" }] }));
  await page.reload();
  await page.getByRole("tab", { name: "Por Cliente", exact: true }).click();
  await page.getByRole("button", { name: "Alfa", exact: true }).click();
  const table = page.getByTestId("reporting-detail-table");
  await expect(table.locator(".wc-table-row")).toHaveCount(6);
  await expect(table.getByRole("columnheader")).toHaveText(["Proposta↕", "Estado proposta↕", "Encomenda↕", "Estado encomenda↕", "Valor↕", "Data↕"]);
  const same = table.locator(".wc-table-row").filter({ has: page.getByRole("link", { name: "ENC-same", exact: true }) });
  await expect(same.getByRole("link", { name: "PROP-same", exact: true })).toHaveAttribute("href", "/propostas/same");
  await expect(same.getByRole("link", { name: "ENC-same", exact: true })).toHaveAttribute("href", "/encomendas/same");
  await expect(same).toContainText("Ganha");
  await expect(same).toContainText("Faturada");
  expect(await same.locator(":scope > div").nth(4).textContent()).toMatch(/^100[,.]00\s*€/);
  await expect(same.locator(":scope > div").nth(5)).toHaveText(`31/01/${year}`);
  const different = table.locator(".wc-table-row").filter({ has: page.getByRole("link", { name: "ENC-different", exact: true }) });
  await expect(different.locator(":scope > div").nth(4)).toContainText("Proposta:");
  await expect(different.locator(":scope > div").nth(4)).toContainText("Encomenda:");
  await expect(different.locator(":scope > div").nth(5)).toContainText(`31/01/${year}`);
  await expect(different.locator(":scope > div").nth(5)).toContainText(`01/02/${year}`);
  const standalone = table.locator(".wc-table-row").filter({ has: page.getByRole("link", { name: "PROP-alone", exact: true }) });
  await expect(standalone.getByRole("link")).toHaveCount(1);
  const old = table.locator(".wc-table-row").filter({ has: page.getByRole("link", { name: "ENC-old-order", exact: true }) });
  await expect(old).toContainText("PROP-old");
  await expect(table.getByRole("link", { name: "ENC-manual", exact: true })).toBeVisible();
  await expect(table).not.toContainText("PROP-foreign");
  await expect(table).not.toContainText("ENC-cancelled");
});

test("filters invoice periods and payments with totals excluding cancelled invoices", async ({ page }) => {
  await page.getByRole("button", { name: "Alfa", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar resultado", exact: true }).click();
  const table = page.getByTestId("client-billing-table");
  await expect(table.locator(".wc-table-row")).toHaveCount(3);
  await expect(table).not.toContainText("FT-CANCEL");
  await expect(table).not.toContainText("WRONG-CLIENT");
  const yearOptions = page.getByLabel("Ano da faturação").locator("option");
  await expect(yearOptions).toHaveText([String(new Date().getFullYear()), String(new Date().getFullYear() - 1)]);
  await expect(page.getByLabel("Pagamento", { exact: true }).locator("option")).toHaveText(["Todos", "Paga", "Por pagar"]);
  await expect(table).toContainText("ENC-ANTIGA");
  await expect(table).toContainText("Licenças; Suporte");
  await table.getByRole("button", { name: "Sem IVA", exact: true }).click();
  await expect(table.locator(".wc-table-row").first()).toContainText("FT-3");
  await table.getByRole("button", { name: "Sem IVA", exact: true }).click();
  await expect(table.locator(".wc-table-row").first()).toContainText("FT-2");
  const totalValues = () => page.getByTestId("client-billing-totals").getByTestId("amount-gross").evaluateAll((els) => els.map((el) => el.textContent.replace(/[^0-9,]/g, "")));
  expect(await totalValues()).toEqual(["4305,00", "1690,00", "2615,00"]);
  const netValues = () => page.getByTestId("client-billing-totals").getByTestId("amount-net").evaluateAll((els) => els.map((el) => el.textContent.replace(/[^0-9,]/g, "")));
  expect(await netValues()).toEqual(["3500,00", "1373,98", "2126,02"]);
  await page.getByLabel("Pagamento", { exact: true }).selectOption("paid");
  await expect(table.locator(".wc-table-row")).toHaveCount(1);
  expect(await totalValues()).toEqual(["1230,00", "1230,00", "0,00"]);
  expect(await netValues()).toEqual(["1000,00", "1000,00", "0,00"]);
  await page.getByLabel("Pagamento", { exact: true }).selectOption("unpaid");
  await expect(table.locator(".wc-table-row")).toHaveCount(2);
  await expect(table).toContainText("FT-2");
  await expect(table).toContainText("FT-3");
  expect(await totalValues()).toEqual(["3075,00", "460,00", "2615,00"]);
  expect(await netValues()).toEqual(["2500,00", "373,98", "2126,02"]);
  await page.getByLabel("Pagamento", { exact: true }).selectOption("");
  await page.getByLabel("Pesquisar faturação").fill("Suporte");
  await expect(table.locator(".wc-table-row")).toHaveCount(1);
  expect(await totalValues()).toEqual(["1230,00", "1230,00", "0,00"]);
  await page.getByLabel("Pesquisar faturação").fill("sem correspondencia");
  await expect(table).toContainText("Sem dados.");
  expect(await totalValues()).toEqual(["0,00", "0,00", "0,00"]);
  await page.getByLabel("Pesquisar faturação").fill("");
  await page.getByLabel("Período", { exact: true }).selectOption("range");
  const year = new Date().getFullYear();
  await page.getByLabel("Data inicial").fill(`${year}-02-01`);
  await page.getByLabel("Data final").fill(`${year}-02-28`);
  await expect(table.locator(".wc-table-row")).toHaveCount(2);
  await page.getByLabel("Data final").fill(`${year}-01-01`);
  await expect(page.getByRole("alert")).toContainText("válido");
  await expect(table).not.toBeVisible();
  await page.getByLabel("Período", { exact: true }).selectOption("year");
  await page.getByLabel("Ano da faturação").selectOption(String(year - 1));
  await expect(table.locator(".wc-table-row")).toHaveCount(1);
  await expect(table).toContainText("FT-OLD");
});

test("client reports isolate totals and available years when switching clients", async ({ page }) => {
  await page.getByRole("button", { name: "Alfa", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar resultado", exact: true }).click();
  await expect(page.getByTestId("client-billing-table").locator(".wc-table-row")).toHaveCount(3);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Beta", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar resultado", exact: true }).click();
  await expect(page.getByLabel("Ano da faturação").locator("option")).toHaveText([String(new Date().getFullYear()), "2020"]);
  await page.getByLabel("Ano da faturação").selectOption("2020");
  await expect(page.getByTestId("client-billing-table").locator(".wc-table-row")).toHaveCount(1);
  await expect(page.getByTestId("client-billing-table")).toContainText("OTHER-CLIENT");
  const amounts = await page.getByTestId("client-billing-totals").getByTestId("amount-gross").evaluateAll((els) => els.map((el) => el.textContent.replace(/[^0-9,]/g, "")));
  expect(amounts).toEqual(["99999,00", "0,00", "99999,00"]);
});

test("billing cards and rows show net and gross amounts using each invoice's tax ratio", async ({ page }) => {
  const year = new Date().getFullYear();
  await page.route("**/api/invoices?*", (route) => route.fulfill({ json: [
    { id: "vat23", number: "VAT23", client_id: "c1", issued_at: `${year}-01-01`, total_net: 100, total_gross: 123, received_amount: 61.5 },
    { id: "vat6", number: "VAT6", client_id: "c1", issued_at: `${year}-01-01`, total_net: 100, total_gross: 106, received_amount: 53 },
    { id: "vat0", number: "VAT0", client_id: "c1", issued_at: `${year}-01-01`, total_net: 100, total_gross: 100, received_amount: 25 },
  ] }));
  await page.getByRole("button", { name: "Alfa", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar resultado", exact: true }).click();
  const totals = page.getByTestId("client-billing-totals");
  await expect(totals).toBeVisible();
  const values = (root, id) => root.getByTestId(id).evaluateAll((els) => els.map((el) => el.textContent.replace(/[^0-9,]/g, "")));
  expect(await values(totals, "amount-net")).toEqual(["300,00", "125,00", "175,00"]);
  expect(await values(totals, "amount-gross")).toEqual(["329,00", "139,50", "189,50"]);
  const row = page.getByTestId("client-billing-table").locator(".wc-table-row").filter({ hasText: "VAT6" });
  await expect(page.getByTestId("client-billing-table").getByRole("columnheader")).toHaveText(["Fatura↕", "Encomenda↕", "Descrição↕", "Emissão↕", "Mês da fatura↕", "Pagamento↕", "Sem IVA↕", "Com IVA↕", "Recebido sem IVA↕", "Recebido com IVA↕", "Em aberto sem IVA↕", "Em aberto com IVA↕"]);
  await expect(row).not.toContainText("IVA");
  expect(await values(row, "amount-net")).toEqual(["100,00", "50,00", "50,00"]);
  expect(await values(row, "amount-gross")).toEqual(["106,00", "53,00", "53,00"]);
});

test("keeps the dialog within a small screen and allows retry after a failed invoice request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.getByRole("button", { name: "Alfa", exact: true }).click();
  await page.route("**/api/invoices?*", (route) => route.fulfill({ status: 500, json: { detail: "Test failure" } }));
  await page.getByRole("button", { name: "Personalizar resultado", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível carregar");
  await expect(page.getByTestId("client-billing-totals")).not.toBeVisible();
  await page.unroute("**/api/invoices?*");
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByTestId("client-billing-table").locator(".wc-table-row")).toHaveCount(3);
  const bounds = await page.getByTestId("reporting-detail-dialog").evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(390);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(700);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(page.getByTestId("reporting-detail-dialog")).not.toBeVisible();
});
