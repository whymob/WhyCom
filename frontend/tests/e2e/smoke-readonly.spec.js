const { test, expect } = require("@playwright/test");

const EMAIL = process.env.PLAYWRIGHT_SMOKE_EMAIL || "admin@whymob.pt";
const PASSWORD = process.env.PLAYWRIGHT_SMOKE_PASSWORD || "admin123";

test("login, navega e termina sessao sem escrita", async ({ page }) => {
  await page.goto("/login");

  await page.getByTestId("login-email-input").fill(EMAIL);
  await page.getByTestId("login-password-input").fill(PASSWORD);
  await page.getByTestId("login-submit-button").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
  await expect(page.getByTestId("current-user-name")).toBeVisible();

  const navTargets = [
    { testId: "nav-leads", path: "/leads" },
    { testId: "nav-opportunities", path: "/oportunidades" },
    { testId: "nav-proposals", path: "/propostas" },
    { testId: "nav-orders", path: "/encomendas" },
    { testId: "nav-reporting", path: "/reporting" },
    { testId: "nav-projects", path: "/projetos" },
    { testId: "nav-timesheet", path: "/timesheet" },
  ];

  for (const item of navTargets) {
    await page.getByTestId(item.testId).click();
    await expect(page).toHaveURL(new RegExp(`${item.path.replace("/", "\\/")}$`));
  }

  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId("login-submit-button")).toBeVisible();
});
