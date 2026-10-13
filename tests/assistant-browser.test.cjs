"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const { chromium, devices } = require("playwright");
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
      // Repeated quality warnings must not flood each answer or push the composer away.
      for (let i = 0; i < 16; i++) {
        appState.invoices.push({
          ...inv,
          id: "QUALITY-" + i,
          invNo: "QUALITY-" + i,
          dueDate: undefined,
          totalNet: 0,
          totalVat: 0,
          totalGross: 0,
        });
      }
      EvergreenPayments.recordPayment(appState, {
        id: "ASSISTANT-PAY",
        documentType: "Invoice",
        documentId: inv.id,
        date: today,
        amount: 40,
      });
      const exp = EvergreenReceipts.create({
        id: "EXP-2d117faf-39bc-4764-ad5a-91dade5e0053",
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
    const financialQueries = [
      "profit this month",
      "Compare this months profit with last month",
      "Which customers owe me money?",
      "largest expense categories",
      "Show my estimated VAT position",
      "cash balance",
      "unreconciled banking",
      "business summary",
    ];
    const reportingDate = await page.evaluate(() => EvergreenAssistant.today());
    const financialBefore = await page.evaluate(
      ({ queries, date }) =>
        queries.map((q) => EvergreenAssistant.answer(appState, q, null, date)),
      { queries: financialQueries, date: reportingDate },
    );
    await page.locator("#tabBtn-assistant").click();
    assert.equal(
      await page.locator("#workspaceSectionTitle").textContent(),
      "AI Assistant",
    );
    assert.match(
      await page.locator("#assistantInsights").textContent(),
      /£100.00.*£20.00.*£80.00.*£80.00/,
    );
    assert.equal(
      await page.locator("#assistantAlerts").getAttribute("open"),
      null,
    );
    assert.equal(await page.locator("#assistantAlertsList li").count(), 16);
    assert.match(
      await page.locator("#assistantAlertsSummary").textContent(),
      /Data Quality Alerts \(16\)/,
    );
    assert.equal(
      await page
        .locator("#assistantInsightsNote")
        .textContent()
        .then((text) => text.includes("No due date")),
      false,
    );
    async function composerVisible() {
      await page.waitForFunction(() => {
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop || 0,
          bottom = top + (viewport?.height || innerHeight);
        const input = document
          .getElementById("assistantQuestion")
          .getBoundingClientRect();
        const button = document
          .getElementById("assistantSend")
          .getBoundingClientRect();
        const pane = document
          .getElementById("assistantScroll")
          .getBoundingClientRect();
        const dock = document
          .querySelector(".assistant-input-dock")
          .getBoundingClientRect();
        const navHeight = document
          .querySelector(".mobile-bottom-nav")
          .getBoundingClientRect().height;
        return (
          input.top >= top &&
          button.top >= top &&
          input.bottom <= bottom &&
          button.bottom <= bottom &&
          pane.height > 60 &&
          pane.bottom <= input.top &&
          Math.abs(dock.bottom - (bottom - navHeight - 8)) < 2
        );
      });
      assert.equal(
        await page.evaluate(() => window.scrollY),
        0,
        "Only the assistant pane should scroll",
      );
    }
    async function answerStartVisible() {
      assert.equal(
        await page.evaluate(() => {
          const pane = document
            .getElementById("assistantScroll")
            .getBoundingClientRect();
          const heading = [...document.querySelectorAll(".assistant-reply h3")]
            .at(-1)
            .getBoundingClientRect();
          return heading.top >= pane.top && heading.bottom <= pane.bottom;
        }),
        true,
        "New answer should show its heading, not just its ending",
      );
    }
    await composerVisible();
    await page.locator("#assistantAlertsSummary").click();
    assert.equal(await page.locator("#assistantAlertsList").isVisible(), true);
    await composerVisible();
    await page.locator("#assistantAlertsSummary").click();
    const requestCount = requests.length;
    async function ask(question) {
      await page.locator("#assistantQuestion").fill(question);
      await page.locator("#assistantSend").click();
      await page.waitForFunction(
        () =>
          document.getElementById("assistantStatus").textContent ===
          "Answered on this device.",
      );
      await composerVisible();
      await answerStartVisible();
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
    const profitReply = page.locator(".assistant-reply").last();
    assert.equal(
      await profitReply.locator(".assistant-methodology").getAttribute("open"),
      null,
    );
    assert.equal(
      await profitReply.locator(".assistant-sources").getAttribute("open"),
      null,
    );
    assert.equal(
      await profitReply.evaluate(
        (node) =>
          node
            .querySelector(".assistant-key-figures")
            .compareDocumentPosition(
              node.querySelector(".assistant-methodology"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      4,
    );
    const dockBeforeExpansion = await page
      .locator(".assistant-input-dock")
      .boundingBox();
    await profitReply.locator(".assistant-methodology > summary").click();
    assert.match(
      await profitReply.locator(".assistant-methodology").textContent(),
      /Accrual basis/,
    );
    await profitReply.locator(".assistant-sources > summary").click();
    await profitReply.locator(".assistant-reference > summary").click();
    assert.match(
      await profitReply.locator(".assistant-reference code").textContent(),
      /EXP-2d117faf-39bc-4764-ad5a-91dade5e0053/,
    );
    assert.equal(
      await profitReply.locator(".assistant-reference code").isVisible(),
      true,
    );
    await composerVisible();
    assert.deepEqual(
      await page.locator(".assistant-input-dock").boundingBox(),
      dockBeforeExpansion,
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
      await page.locator("#assistantMessages .assistant-warning").count(),
      0,
    );
    assert.equal(
      await page.locator("#assistantAlertsList li").count(),
      16,
      "Repeated answers must not duplicate alerts",
    );
    await page.setViewportSize({ width: 1366, height: 620 });
    await composerVisible();
    await ask("profit this month");
    const composerBeforeScroll = await page
      .locator("#assistantForm")
      .boundingBox();
    await page.evaluate(() => {
      document.getElementById("assistantScroll").scrollTop = 0;
    });
    await composerVisible();
    assert.deepEqual(
      await page.locator("#assistantForm").boundingBox(),
      composerBeforeScroll,
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
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
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    // Every requested size in both themes: one scrolling pane and an anchored composer.
    for (const [width, height] of [
      [360, 640],
      [390, 844],
      [412, 915],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      for (const dark of [false, true]) {
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          dark,
        );
        await ask("profit this month");
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        if (width < 768) {
          assert.equal(
            await page.locator(".assistant-mobile-privacy").isVisible(),
            true,
          );
          const header = await page.locator(".assistant-heading").boundingBox();
          assert.ok(
            header.height <= 36,
            "Mobile heading must remain one compact row",
          );
          assert.equal(
            await page.evaluate(() => {
              const pane = document
                .getElementById("assistantScroll")
                .getBoundingClientRect();
              const values = [...document.querySelectorAll(".assistant-reply")]
                .at(-1)
                .querySelectorAll(".assistant-key-figures dd");
              return [...values].every(
                (value) => value.getBoundingClientRect().bottom <= pane.bottom,
              );
            }),
            true,
            "All three profit figures must be visible immediately on mobile",
          );
          assert.equal(await page.locator(".app-header").isVisible(), true);
        } else {
          assert.equal(
            await page.locator(".assistant-badge").isVisible(),
            true,
          );
        }
        const input = page.locator("#assistantQuestion");
        assert.equal(await input.evaluate((el) => el.scrollTop), 0);
        assert.equal(
          await input.evaluate((el) => getComputedStyle(el).overflowY),
          "hidden",
        );
        assert.ok(
          await input.evaluate(
            (el) =>
              parseFloat(getComputedStyle(el).paddingTop) >= 10 &&
              parseFloat(getComputedStyle(el).lineHeight) >= 24,
          ),
        );
        const placeholder = await input.evaluate((el) => ({
          color: getComputedStyle(el, "::placeholder").color,
          opacity: getComputedStyle(el, "::placeholder").opacity,
        }));
        assert.notEqual(placeholder.color, "rgba(0, 0, 0, 0)");
        assert.equal(placeholder.opacity, "1");
        const minimum = (await input.boundingBox()).height;
        await input.fill("First line\nSecond line\nThird line\nFourth line");
        assert.ok((await input.boundingBox()).height > minimum);
        assert.equal(await input.evaluate((el) => el.scrollTop), 0);
        await input.evaluate((el) => el.setSelectionRange(4, 4));
        await page.keyboard.insertText("X");
        assert.equal(
          await input.evaluate((el) => el.selectionStart),
          5,
          "Auto-sizing must preserve the caret",
        );
        await input.fill(
          "A long question about recorded accounts. ".repeat(20),
        );
        assert.ok((await input.boundingBox()).height <= 160);
        assert.equal(
          await input.evaluate((el) => getComputedStyle(el).overflowY),
          "auto",
        );
        await composerVisible();
        await input.evaluate((el) => {
          el.scrollTop = 999;
        });
        await page.locator("#assistantSend").click();
        await page.waitForFunction(
          () => !document.getElementById("assistantSend").disabled,
        );
        assert.equal(await input.inputValue(), "");
        assert.equal(await input.evaluate((el) => el.scrollTop), 0);
        assert.equal((await input.boundingBox()).height, minimum);
        await input.fill("More lines\n".repeat(30));
        await page.locator("#assistantClear").click();
        assert.equal(await input.evaluate((el) => el.scrollTop), 0);
        assert.equal(
          await input.evaluate((el) => getComputedStyle(el).overflowY),
          "hidden",
        );
        await ask("profit this month");
        const answer = page.locator(".assistant-reply").last();
        await answer.locator(".assistant-methodology > summary").click();
        await answer.locator(".assistant-sources > summary").click();
        await answer.locator(".assistant-reference > summary").click();
        assert.equal(
          await answer.locator(".assistant-reference code").isVisible(),
          true,
        );
        assert.equal(
          await page
            .locator("#assistantScroll")
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
        );
        const dock = await page.locator(".assistant-input-dock").boundingBox();
        await page.locator("#assistantScroll").hover();
        await page.mouse.wheel(0, 400);
        await composerVisible();
        assert.deepEqual(
          await page.locator(".assistant-input-dock").boundingBox(),
          dock,
        );
        await ask("profit this month");
        await page.screenshot({
          path: path.join(
            root,
            "test-results",
            `assistant-v572-${width}x${height}-${dark ? "dark" : "light"}.png`,
          ),
        });
      }
    }
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await ask("largest expense categories");
    const categoryReply = page.locator(".assistant-reply").last();
    assert.match(
      await categoryReply.locator(".assistant-reference summary").textContent(),
      /EXP-2d117faf…0053/,
    );
    await categoryReply.locator(".assistant-reference summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await categoryReply.locator(".assistant-reference code").textContent(),
      "EXP-2d117faf-39bc-4764-ad5a-91dade5e0053",
    );
    assert.equal(
      await categoryReply.locator(".assistant-reference code").isVisible(),
      true,
    );
    assert.equal(await page.locator("#assistantMessages img").count(), 0);
    const preserved = await page.evaluate(async () => ({
      state: JSON.stringify(appState),
      stored: JSON.stringify(await EvergreenStorage.loadSnapshot()),
    }));
    assert.equal(preserved.state, before.state);
    assert.equal(preserved.stored, before.stored);
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
    await composerVisible();
    await page.locator("#assistantQuestion").focus();
    // Emulate Android's visual viewport shrinking while the layout viewport stays tall.
    await page.evaluate(() => {
      window.testNativeViewport = window.visualViewport;
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: { height: 430, offsetTop: 0 },
      });
      window.dispatchEvent(new Event("resize"));
    });
    await composerVisible();
    assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), false);
    assert.equal(
      await page.locator(".app-header").isVisible(),
      true,
      "Keep app branding with the keyboard open",
    );
    await page
      .locator("#assistantQuestion")
      .fill(
        "First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line",
      );
    await composerVisible();
    await ask("profit this month");
    await page.screenshot({
      path: path.join(root, "test-results/assistant-mobile-keyboard.png"),
    });
    await page.evaluate(() => {
      window.visualViewport.offsetTop = 120;
      window.visualViewport.height = 330;
      window.dispatchEvent(new Event("resize"));
    });
    await composerVisible();
    await ask("Show my estimated VAT position");
    await page.evaluate(() => {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: window.testNativeViewport,
      });
      delete window.testNativeViewport;
      window.dispatchEvent(new Event("resize"));
    });
    await composerVisible();
    assert.equal(await page.locator(".mobile-bottom-nav").isVisible(), true);
    // Also cover browsers that resize the layout viewport or lack visualViewport.
    await page.evaluate(() => {
      window.testNativeViewport = window.visualViewport;
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: undefined,
      });
    });
    await page.setViewportSize({ width: 390, height: 430 });
    await composerVisible();
    await ask("profit this month");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: window.testNativeViewport,
      });
      delete window.testNativeViewport;
      window.dispatchEvent(new Event("resize"));
    });
    await composerVisible();
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
    await page.evaluate(() => switchTab("expenses"));
    assert.equal(
      await page.evaluate(() =>
        document.body.classList.contains("assistant-active"),
      ),
      false,
    );
    assert.notEqual(
      await page.evaluate(() => getComputedStyle(document.body).overflow),
      "hidden",
      "Other workspaces must keep normal scrolling",
    );
    const android = await browser.newContext({
      ...devices["Pixel 7"],
      storageState: await context.storageState({ indexedDB: true }),
    });
    const touchPage = await android.newPage();
    touchPage.on("pageerror", (error) => errors.push(error.message));
    touchPage.on("request", (request) => requests.push(request.url()));
    await touchPage.goto(url, { waitUntil: "networkidle" });
    await touchPage.waitForFunction(() =>
      document.getElementById("storageBusy").classList.contains("hidden"),
    );
    await touchPage
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: "More" })
      .tap();
    await touchPage
      .locator("#mobileSectionsModal")
      .getByRole("button", { name: "AI Assistant", exact: true })
      .tap();
    assert.equal(
      await touchPage.evaluate(() => matchMedia("(pointer: fine)").matches),
      false,
    );
    await touchPage.locator("#assistantQuestion").fill("profit this month");
    await touchPage.locator("#assistantSend").tap();
    await touchPage.waitForFunction(
      () =>
        document.getElementById("assistantStatus").textContent ===
        "Answered on this device.",
    );
    assert.match(
      await touchPage.locator(".assistant-reply").last().textContent(),
      /£80.00/,
    );
    assert.equal(
      await touchPage.evaluate(() => document.activeElement.id),
      "assistantQuestion",
      "Touch submit should preserve typing focus",
    );
    await touchPage.locator("#assistantSuggestions button").first().tap();
    await touchPage.waitForFunction(
      () => !document.getElementById("assistantSend").disabled,
    );
    assert.notEqual(
      await touchPage.evaluate(() => document.activeElement.id),
      "assistantQuestion",
      "Suggested questions should not automatically open the mobile keyboard",
    );
    await touchPage.locator("#assistantQuestion").focus();
    await touchPage.keyboard.press("Tab");
    assert.equal(
      await touchPage.evaluate(() => document.activeElement.id),
      "assistantSend",
    );
    await android.close();
    const financialAfter = await page.evaluate(
      ({ queries, date }) =>
        queries.map((q) => EvergreenAssistant.answer(appState, q, null, date)),
      { queries: financialQueries, date: reportingDate },
    );
    assert.deepEqual(
      financialAfter,
      financialBefore,
      "All complete financial responses must remain identical after UI use",
    );
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
      "PASS: V5.7.2 compact mobile header, auto-growing input and scroll reset, figures before expandable methodology, full/short safe references, all five requested sizes in both themes and numerically identical responses; anchored composer, deduplicated expandable quality alerts, new-answer scrolling, short desktop windows and emulated Android keyboard viewport resizing/panning; local assistant financial answers, insights, partial payments, context, unsupported/write requests, XSS protection, no requests or data writes, source errors, clearing, session-only history, offline reload, receipt preservation, mobile navigation/layout and dark mode.",
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
