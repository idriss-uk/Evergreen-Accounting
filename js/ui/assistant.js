(() => {
  "use strict";
  let context = null,
    generation = 0,
    bound = false,
    layoutFrame = 0,
    fullViewportHeight = 0,
    layoutWidth = 0;
  const welcome =
    "Welcome to Evergreen Business Assistant. I can help you understand your invoices, expenses, customers, payments and financial reports. What would you like to know about your business?";
  const suggestions = [
    "How much profit did my business make this month?",
    "Which customers owe me money?",
    "What are my largest expense categories?",
    "How many bank transactions are unreconciled?",
    "Show my estimated VAT position.",
  ];
  const get = (id) => document.getElementById(id);
  function element(tag, text, className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
  }
  function addSuggestions(target, questions) {
    for (const question of questions) {
      const button = element("button", question, "assistant-suggestion");
      button.type = "button";
      button.addEventListener("click", () => {
        get("assistantQuestion").value = question;
        submit();
      });
      target.append(button);
    }
  }
  function message(kind, title) {
    const article = element(
      "article",
      "",
      "assistant-message assistant-" + kind,
    );
    article.append(element("h3", kind === "user" ? "You" : title));
    get("assistantMessages").append(article);
    return article;
  }
  function updateAlerts(warnings) {
    const alerts = [...new Set(warnings)];
    get("assistantAlertsSummary").textContent =
      "Data Quality Alerts (" + alerts.length + ")";
    get("assistantAlertsList").replaceChildren(
      ...alerts.map((warning) => element("li", warning, "assistant-warning")),
    );
    get("assistantAlerts").hidden = alerts.length === 0;
  }
  function showMessage(node) {
    // Scroll only the workspace, to the beginning of an answer rather than its end.
    const scroll = get("assistantScroll");
    scroll.scrollTo({
      top:
        scroll.scrollTop +
        node.getBoundingClientRect().top -
        scroll.getBoundingClientRect().top -
        12,
      behavior: "instant",
    });
  }
  function updateLayout() {
    layoutFrame = 0;
    if (!document.body.classList.contains("assistant-active")) return;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const offset = viewport?.offsetTop || 0;
    const narrow = window.matchMedia("(max-width: 767px)").matches;
    const focused = document.activeElement === get("assistantQuestion");
    if (layoutWidth !== window.innerWidth) {
      fullViewportHeight = height;
      layoutWidth = window.innerWidth;
    }
    if (
      !fullViewportHeight ||
      (!focused && !document.body.classList.contains("assistant-keyboard-open"))
    )
      fullViewportHeight = height;
    const keyboard =
      narrow &&
      (height < window.innerHeight * 0.75 ||
        height < fullViewportHeight * 0.75);
    document.body.classList.toggle("assistant-keyboard-open", keyboard);
    const nav = document.querySelector(".mobile-bottom-nav");
    const navHeight = nav?.getBoundingClientRect().height || 0;
    const main = document.querySelector(".app-main");
    const bounds = main.getBoundingClientRect();
    const padding = getComputedStyle(main);
    const availableWidth =
      bounds.width -
      parseFloat(padding.paddingLeft) -
      parseFloat(padding.paddingRight);
    const width = Math.min(1200, availableWidth);
    const top = Math.max(
      offset + 8,
      document.querySelector(".app-header").getBoundingClientRect().bottom +
        (keyboard || height < 550 ? 8 : parseFloat(padding.paddingTop)),
    );
    const workspace = get("tab-assistant");
    workspace.style.setProperty("--assistant-top", top + "px");
    workspace.style.setProperty(
      "--assistant-left",
      bounds.left +
        parseFloat(padding.paddingLeft) +
        (availableWidth - width) / 2 +
        "px",
    );
    workspace.style.setProperty("--assistant-width", width + "px");
    workspace.style.setProperty(
      "--assistant-height",
      Math.max(0, offset + height - top - navHeight - 8) + "px",
    );
    workspace.classList.toggle("assistant-compact", height < 550 || keyboard);
  }
  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(updateLayout);
  }
  function renderAnswer(answer) {
    const node = message("reply", answer.title);
    if (answer.period)
      node.append(element("p", answer.period, "assistant-period"));
    answer.paragraphs.forEach((text) => node.append(element("p", text)));
    if (answer.rows.length) {
      const list = element("dl", "", "assistant-figures");
      for (const row of answer.rows) {
        const group = element("div", "");
        group.append(element("dt", row.label), element("dd", row.value));
        if (row.reference) group.append(element("small", row.reference));
        list.append(group);
      }
      node.append(list);
    }
    if (answer.sources.length) {
      const details = element("details", "");
      details.append(
        element("summary", "Sources (" + answer.sources.length + ")"),
      );
      const list = element("ul", "");
      answer.sources
        .slice(0, 100)
        .forEach((source) => list.append(element("li", source)));
      details.append(list);
      if (answer.sources.length > 100)
        details.append(
          element(
            "p",
            "Showing the first 100 source lines. Open Reports for the full ledger.",
          ),
        );
      node.append(details);
    }
    if (answer.context) updateAlerts(answer.warnings);
    const choices = element("div", "", "assistant-suggestions");
    addSuggestions(choices, answer.followups);
    node.append(choices);
    showMessage(node);
  }
  function clear() {
    generation++;
    context = null;
    get("assistantMessages").replaceChildren();
    message("reply", "Evergreen Business Assistant").append(
      element("p", welcome),
    );
    get("assistantQuestion").value = "";
    get("assistantStatus").textContent = "";
    get("assistantSend").disabled = false;
    get("assistantMessages").setAttribute("aria-busy", "false");
    get("assistantScroll").scrollTop = 0;
  }
  async function submit() {
    const input = get("assistantQuestion"),
      question = input.value.trim();
    if (!question || get("assistantSend").disabled) return;
    const token = ++generation;
    const userMessage = message("user", "");
    userMessage.append(element("p", question));
    showMessage(userMessage);
    input.value = "";
    get("assistantSend").disabled = true;
    get("assistantStatus").textContent = "Checking your local records…";
    get("assistantMessages").setAttribute("aria-busy", "true");
    // Let loading feedback paint before synchronous local report generation.
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (token !== generation) return;
    try {
      if (!get("storageBusy").classList.contains("hidden"))
        throw Error(
          "Your records are still loading. Please try again shortly.",
        );
      const answer = window.EvergreenAssistant.answer(
        appState,
        question,
        context,
      );
      context = answer.context;
      renderAnswer(answer);
      get("assistantStatus").textContent = "Answered on this device.";
    } catch (error) {
      const errorMessage = message("error", "Unable to verify figures");
      errorMessage.append(element("p", error.message));
      showMessage(errorMessage);
      get("assistantStatus").textContent =
        "Could not complete this question. Review the message and try again.";
    } finally {
      if (token === generation) {
        get("assistantSend").disabled = false;
        get("assistantMessages").setAttribute("aria-busy", "false");
        // Keep desktop typing convenient without reopening the Android keyboard.
        if (window.matchMedia("(pointer: fine)").matches)
          input.focus({ preventScroll: true });
      }
    }
  }
  function render() {
    if (!bound) {
      get("assistantForm").addEventListener("submit", (event) => {
        event.preventDefault();
        submit();
      });
      get("assistantClear").addEventListener("click", clear);
      get("assistantSend").addEventListener("pointerdown", (event) => {
        if (document.activeElement === get("assistantQuestion"))
          event.preventDefault();
      });
      window.addEventListener("resize", scheduleLayout);
      window.visualViewport?.addEventListener("resize", scheduleLayout);
      window.visualViewport?.addEventListener("scroll", scheduleLayout);
      get("assistantQuestion").addEventListener("focus", scheduleLayout);
      get("assistantQuestion").addEventListener("blur", scheduleLayout);
      addSuggestions(get("assistantSuggestions"), suggestions);
      clear();
      bound = true;
    }
    updateLayout();
    const cards = get("assistantInsights");
    cards.replaceChildren();
    try {
      const answer = window.EvergreenAssistant.answer(
        appState,
        "Give me a summary of my business performance.",
      );
      get("assistantInsightsPeriod").textContent =
        answer.period + " · invoice balances as of " + answer.range.to;
      const insight = answer.insights;
      for (const [label, value] of [
        ["Revenue", insight.totalRevenue],
        ["Expenses", insight.totalExpenses],
        ["Net profit / loss", insight.netProfit],
        ["Outstanding customer invoices", insight.outstanding],
        ["Overdue invoices", insight.overdue],
        ["Unpaid supplier balances", insight.suppliers],
      ]) {
        const card = element("div", "", "assistant-card");
        card.append(
          element("span", label),
          element(
            "strong",
            label === "Overdue invoices"
              ? String(value)
              : window.EvergreenAssistantResponse.gbp(value),
          ),
        );
        cards.append(card);
      }
      get("assistantInsightsNote").textContent =
        "Revenue and expenses exclude VAT. Balances include VAT and dated partial payments. Overdue counts require a due date.";
      updateAlerts(answer.warnings);
    } catch (error) {
      get("assistantInsightsPeriod").textContent = "Figures unavailable";
      get("assistantInsightsNote").textContent = error.message;
    }
  }
  window.EvergreenAssistantUI = Object.freeze({ render });
})();
