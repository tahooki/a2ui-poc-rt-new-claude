import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const outputDir = path.join(process.cwd(), "output", "playwright");

await fs.mkdir(outputDir, { recursive: true });

async function seedData() {
  await fetch(`${baseURL}/api/admin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "reset" }),
  });

  for (const scenarioId of [
    "checkout-5xx",
    "billing-backfill",
    "healthy-rollout",
    "incident-handover",
  ]) {
    await fetch(`${baseURL}/api/admin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "load", scenarioId }),
    });
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

page.on("response", async (response) => {
  const url = response.url();
  if (!url.startsWith(baseURL)) return;
  if (response.status() >= 400) {
    requestFailures.push(`${response.status()} ${url}`);
  }
});

async function screenshot(name) {
  await page.screenshot({
    path: path.join(outputDir, `${name}.png`),
    fullPage: true,
  });
}

async function step(name, fn) {
  try {
    console.log(`STEP ${name}`);
    await fn();
  } catch (error) {
    await screenshot(`failure-${name}`);
    throw error;
  }
}

async function gotoPage(route, heading) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`${baseURL}${route}`, { waitUntil: "domcontentloaded" });
    try {
      await page
        .locator("main")
        .getByRole("heading", { name: heading })
        .last()
        .waitFor({ timeout: 10000 });
      return;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(1000);
    }
  }
}

async function switchOperator(name) {
  const operatorIdMap = {
    김정수: "op_jungsoo_kim",
    박승호: "op_seungho_park",
    이민지: "op_minji_lee",
    최유나: "op_yuna_choi",
  };

  await page.evaluate((operatorId) => {
    localStorage.setItem("devops_console_operator_id", operatorId);
  }, operatorIdMap[name]);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("header").getByText(name).waitFor();
}

async function clickIfVisible(locator) {
  try {
    await locator.waitFor({ state: "visible", timeout: 3000 });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

try {
  await seedData();

  await step("dashboard-load", async () => {
    await gotoPage("/dashboard", "Dashboard");
    await page.getByText("Active Incidents").waitFor();
  });

  await step("chat-fallback", async () => {
    const chatToggle = page.getByRole("button", { name: "Toggle AI chat" });
    await chatToggle.click();
    await page.getByRole("button", { name: "현재 시스템 상태를 요약해줘" }).click();
    await page.getByText("로컬 운영 데이터 기반으로 요약합니다.").waitFor({ timeout: 15000 });
  });

  await step("incident-transition", async () => {
    await gotoPage("/incidents", "Incidents");
    await page.getByRole("button", { name: /checkout-service 5xx 에러율 급증/ }).click();
    await page.getByPlaceholder("Provide a reason for the status change...").fill("Playwright smoke test transition");
    await page.getByRole("button", { name: "Mark Mitigated" }).click();
    await page.getByRole("button", { name: "Mark Resolved" }).waitFor();
  });

  await step("job-transitions", async () => {
    await gotoPage("/jobs", "Jobs");
    await page.getByText("jt_billing_quota_backfill").first().click();
    await clickIfVisible(page.getByRole("button", { name: "Run Dry-Run" }));
    await clickIfVisible(page.getByRole("button", { name: "Approve" }));
    await clickIfVisible(page.getByRole("button", { name: "Execute" }));
    await page.getByRole("button", { name: "Abort" }).waitFor();
    await page.getByRole("button", { name: "Abort" }).click();
    await page.getByText("Aborted").first().waitFor();
  });

  await step("report-actions", async () => {
    await gotoPage("/reports", "Reports");
    await page.getByText("[Postmortem] auth-service v4.2.0 JWT 알고리즘 마이그레이션 장애").click();
    const actionItemInput = page.getByPlaceholder("Add action item...");
    await actionItemInput.fill("Playwright action item");
    await actionItemInput.locator("xpath=following-sibling::button").click();
    await page.getByText("Playwright action item").waitFor();

    const firstSection = page.getByPlaceholder("Section content...").first();
    await firstSection.fill("Updated by Playwright smoke test");
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("textarea")).some((element) =>
          element.value.includes("Updated by Playwright smoke test")
        )
    );

    await page.getByRole("button", { name: "Mark Reviewed" }).click();
    await page.getByRole("button", { name: "Finalize" }).waitFor();
    await page.getByRole("button", { name: "Finalize" }).click();
    await page.getByRole("button", { name: "MD" }).waitFor();
    await page.getByRole("button", { name: "MD" }).click();
    await page.getByText("Export History").waitFor();
  });

  await step("deployment-rollback", async () => {
    await gotoPage("/deployments", "Deployments");
    await switchOperator("이민지");
    await page.getByRole("button", { name: /v2.4.1/ }).click();
    await page.getByRole("tab", { name: /Rollback/ }).click();
    await page.getByRole("button", { name: "Run Dry-Run" }).click();
    await page.getByRole("button", { name: "Approve" }).waitFor();
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByRole("button", { name: "Execute Rollback" }).waitFor();
    await page.getByRole("button", { name: "Execute Rollback" }).click();
    await page.getByText("executed").first().waitFor();
  });

  await step("audit-log", async () => {
    await gotoPage("/audit", "Audit Log");
    await page.getByText("rollback_execute").waitFor();
    await page.getByText("report_export").waitFor();
  });

  await screenshot("smoke-success");

  const issues = [
    ...pageErrors.map((issue) => `pageerror: ${issue}`),
    ...consoleErrors.map((issue) => `console: ${issue}`),
    ...requestFailures.map((issue) => `request: ${issue}`),
  ];

  assert(issues.length === 0, `Browser issues detected:\n${issues.join("\n")}`);

  console.log("Smoke test completed successfully.");
} finally {
  await browser.close();
}
