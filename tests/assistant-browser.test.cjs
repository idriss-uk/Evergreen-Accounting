"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
async function run() {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    ).replace(/^\/Evergreen-Accounting\//, "");
    const file = path.resolve(root, name || "index.html");
    if (
      !file.startsWith(root + path.sep) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/Evergreen-Accounting/`;
  let browser, page;
  try {
    const executable =
      process.env.CHROME_PATH ||
      [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ].find((file) => fs.existsSync(file));
    browser = await chromium.launch({
      headless: true,
      ...(executable ? { executablePath: executable } : {}),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.getElementById("storageBusy").classList.contains("hidden"),
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    // Fresh isolated profile: create a test fixture, never touch user browser records.
    await page.evaluate(async () => {
      const today = EvergreenAssistant.today(),
        start = today.slice(0, 8) + "01";
      appState = EvergreenState.normalize({
        invoices: [],
        bills: [],
        expenses: [],
        payments: [],
        bankTransactions: [],
        ledgerEntries: [],
      });
      const inv = {
        id: "ASSISTANT-INV",
        invNo: "ASSISTANT-INV",
        type: "Invoice",
        customer: '<img src=x onerror="window.assistantInjected=true">',
        customerId: "C1",
        date: start,
        dueDate: start,
        totalNet: 100,
        totalVat: 20,
        totalGross: 120,
        status: "Unpaid",
      };
      appState.invoices.push(inv);
      appState.ledgerEntries.push(EvergreenLedger.fromDocument("Invoice", inv));
      EvergreenPayments.recordPayment(appState, {
        id: "ASSISTANT-PAY",
        documentType: "Invoice",
        documentId: inv.id,
        date: today,
        amount: 40,
      });
      const exp = EvergreenReceipts.create({
        id: "ASSISTANT-EXP",
        merchant: "Existing receipt",
        date: start,
        netAmount: 20,
        vatTreatment: "20",
        category: "Software & IT",
        attachment: "data:image/png;base64,KEPT",
      });
      EvergreenReceipts.applyExpense(appState, exp, EvergreenLedger);
      await saveState();
    });
    const before = await page.evaluate(async () => ({
      state: JSON.stringify(appState),
      stored: JSON.stringify(await EvergreenStorage.loadSnapshot()),
      local: JSON.stringify({ ...localStorage }),
    }));
    await page.locator("#tabBtn-assistant").click();
    assert.equal(
      await page.locator("#workspaceSectionTitle").textContent(),
      "AI Assistant",
    );
    assert.match(
      await page.locator("#assistantInsights").textContent(),
      /£100.00.*£20.00.*£80.00.*£80.00/,
    );
    const requestCount = requests.length;
    async function ask(question) {
      await page.locator("#assistantQuestion").fill(question);
      await page.locator("#assistantSend").click();
      await page.waitForFunction(
        () =>
          document.getElementById("assistantStatus").textContent ===
          "Answered on this device.",
      );
      return page.locator(".assistant-reply").last().textContent();
    }
    await page
      .locator("#assistantQuestion")
      .fill("How much profit did my business make this month?");
    await page.locator("#assistantSend").click();
    await page.waitForFunction(
      () => !document.getElementById("assistantSend").disabled,
    );
    assert.match(
      await page.locator(".assistant-reply").last().textContent(),
      /Net profit \/ loss£80.00/,
    );
    assert.match(await ask("And last month?"), /£0.00/);
    assert.match(await ask("Which customers owe me money?"), /£80.00/);
    assert.match(
      await page.locator(".assistant-reply").last().textContent(),
      /<img src=x/,
    );
    assert.equal(await page.locator("#assistantMessages img").count(), 0);
    assert.equal(
      await page.evaluate(() => window.assistantInjected),
      undefined,
    );
    assert.match(
      await ask("Delete invoice ASSISTANT-INV"),
      /cannot change records/,
    );
    assert.match(await ask("Tell me a joke"), /cannot answer/);
    assert.match(
      await ask("Show my estimated VAT position"),
      /not an HMRC-verified/,
    );
    assert.equal(
      requests.length,
      requestCount,
      "Assistant must make no network requests",
    );
    const after = await page.evaluate(async () => ({
      state: JSON.stringify(appState),
      stored: JSON.stringify(await EvergreenStorage.loadSnapshot()),
      local: JSON.stringify({ ...localStorage }),
    }));
    assert.deepEqual(
      after,
      before,
      "Assistant must not save or mutate accounting data",
    );
    await page.locator("#assistantClear").click();
    assert.equal(await page.locator("#assistantMessages article").count(), 1);
    assert.equal(
      await page.locator("#assistantMessages").getAttribute("aria-busy"),
      "false",
    );
    // Local error feedback for unverifiable source amounts; restore only the test fixture.
    await page.evaluate(() => {
      window.assistantOriginalNet = appState.invoices[0].totalNet;
      delete appState.invoices[0].totalNet;
    });
    await page.locator("#assistantQuestion").fill("profit this month");
    await page.locator("#assistantSend").click();
    await page.waitForFunction(() =>
      document.querySelector(".assistant-error"),
    );
    assert.match(
      await page.locator(".assistant-error").textContent(),
      /Missing or invalid amount/,
    );
    await page.evaluate(() => {
      appState.invoices[0].totalNet = window.assistantOriginalNet;
      delete window.assistantOriginalNet;
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.getElementById("storageBusy").classList.contains("hidden"),
    );
    await page.locator("#tabBtn-assistant").click();
    assert.equal(await page.locator("#assistantMessages article").count(), 1);
    assert.match(await ask("profit this month"), /£80.00/);
    assert.equal(
      await page.evaluate(() => appState.expenses[0].attachment),
      "data:image/png;base64,KEPT",
    );
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.screenshot({
      path: path.join(root, "test-results/assistant-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: "More" })
      .click();
    await page
      .locator("#mobileSectionsModal")
      .getByRole("button", { name: "AI Assistant", exact: true })
      .click();
    assert.equal(await page.locator("#tab-assistant").isVisible(), true);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      "Mobile workspace must not overflow horizontally",
    );
    await page.locator("#assistantQuestion").fill("cash balance");
    await page.locator("#assistantSend").click();
    await page.waitForFunction(
      () => !document.getElementById("assistantSend").disabled,
    );
    assert.match(
      await page.locator(".assistant-reply").last().textContent(),
      /Recorded cash balance/,
    );
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.screenshot({
      path: path.join(root, "test-results/assistant-mobile.png"),
      fullPage: true,
    });
    await page.locator("#themeToggleBtn").click();
    assert.equal(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      ),
      true,
    );
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.screenshot({
      path: path.join(root, "test-results/assistant-mobile-dark.png"),
      fullPage: true,
    });
    const rect = await page.locator("#assistantSend").boundingBox();
    assert.ok(rect.height >= 44);
    await page.locator("#assistantClear").click();
    assert.equal(await page.locator("#assistantMessages article").count(), 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      requests.filter(
        (request) =>
          !request.startsWith(url) &&
          !request.startsWith("data:") &&
          !request.startsWith("blob:"),
      ),
      [],
    );
    console.log(
      "PASS: local assistant financial answers, insights, partial payments, context, unsupported/write requests, XSS protection, no requests or data writes, source errors, clearing, session-only history, offline reload, receipt preservation, mobile navigation/layout and dark mode.",
    );
  } catch (error) {
    if (page) {
      fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
      });
      await page
        .screenshot({
          path: path.join(root, "test-results/assistant-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
