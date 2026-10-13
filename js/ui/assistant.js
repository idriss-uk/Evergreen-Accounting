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
        (narrow || height < 550 ? 8 : parseFloat(padding.paddingTop)),
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
    get("assistantQuestion").placeholder = narrow
      ? "Ask a question…"
      : "How much profit did my business make this month?";
    resizeQuestion();
  }
  function scheduleLayout() {
    if (!layoutFrame) layoutFrame = requestAnimationFrame(updateLayout);
  }
  function reference(text) {
    const full = String(text);
    const shortened = full.replace(
      /(?:[a-z][a-z0-9]*-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
      (id) =>
        id.slice(0, id.indexOf("-") === 8 ? 8 : id.indexOf("-") + 9) +
        "…" +
        id.slice(-4),
    );
    const compact =
      shortened.length > 160
        ? shortened.slice(0, 100) + "…" + shortened.slice(-32)
        : shortened;
    if (compact === full) return element("small", full);
    const details = element("details", "", "assistant-reference");
    details.append(element("summary", compact), element("code", full));
    return details;
  }
  function figures(rows, className) {
    const list = element("dl", "", "assistant-figures " + className);
    for (const row of rows) {
      const group = element("div", "");
      group.append(element("dt", row.label), element("dd", row.value));
      if (row.reference) group.append(reference(row.reference));
      list.append(group);
    }
    return list;
  }
  function renderAnswer(answer) {
    const node = message("reply", answer.title);
    if (answer.period)
      node.append(element("p", answer.period, "assistant-period"));
    const intent = answer.context?.intent;
    if (!intent) {
      answer.paragraphs.forEach((text) => node.append(element("p", text)));
    } else {
      if (["pnl", "expenses", "categories"].includes(intent))
        node.append(
          element(
            "p",
            "Recorded net amounts · Excluding VAT",
            "assistant-basis",
          ),
        );
      if (
        ["receivables", "payables", "overdue", "bank", "summary"].includes(
          intent,
        ) &&
        answer.paragraphs[0]
      )
        node.append(
          element(
            "p",
            answer.paragraphs[0].split(". ")[0] + ".",
            "assistant-short-answer",
          ),
        );
      if (intent === "vat")
        node.append(
          element(
            "p",
            "Illustrative only — not an HMRC-verified return or a confirmed tax liability.",
            "assistant-caveat",
          ),
        );
      if (intent === "cash")
        node.append(
          element(
            "p",
            "Recorded cash, not a physical cash count or live bank balance.",
            "assistant-caveat",
          ),
        );
      if (answer.paragraphs.some((text) => text.includes("previous month (")))
        node.append(
          element(
            "p",
            "Month to date vs the full previous month; periods have different lengths.",
            "assistant-caveat",
          ),
        );
      answer.paragraphs
        .filter((text) => text.startsWith("No matching"))
        .forEach((text) => node.append(element("p", text)));
      const primary = answer.rows.filter((row) => !row.reference).slice(0, 3);
      if (primary.length)
        node.append(figures(primary, "assistant-key-figures"));
      const breakdown = answer.rows.filter((row) => !primary.includes(row));
      if (breakdown.length) {
        node.append(
          element("h4", "Financial breakdown", "assistant-breakdown-title"),
        );
        node.append(figures(breakdown, "assistant-breakdown"));
      }
      if (answer.paragraphs.length) {
        const details = element("details", "", "assistant-methodology");
        details.append(element("summary", "How this was calculated"));
        answer.paragraphs.forEach((text) => details.append(element("p", text)));
        node.append(details);
      }
    }
    if (answer.sources.length) {
      const details = element("details", "", "assistant-sources");
      details.append(
        element("summary", "Sources (" + answer.sources.length + ")"),
      );
      const list = element("ul", "");
      answer.sources.slice(0, 100).forEach((source) => {
        const item = element("li", "");
        item.append(reference(source));
        list.append(item);
      });
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
    if (answer.warnings.length) {
      const review = element(
        "button",
        "Review Data Quality Alerts (" + new Set(answer.warnings).size + ")",
        "assistant-alert-link",
      );
      review.type = "button";
      review.addEventListener("click", () => {
        // One shared section holds the latest report's alerts; retain this answer's full caveats.
        updateAlerts(answer.warnings);
        get("assistantAlerts").open = true;
        showMessage(get("assistantAlerts"));
        get("assistantAlertsSummary").focus({ preventScroll: true });
      });
      node.append(
        element(
          "p",
          "Data quality alerts apply — review before relying on these figures.",
          "assistant-caveat",
        ),
        review,
      );
    }
    const choices = element("div", "", "assistant-suggestions");
    addSuggestions(choices, answer.followups);
    node.append(choices);
    showMessage(node);
  }
  function resizeQuestion(reset = false) {
    const input = get("assistantQuestion");
    const style = getComputedStyle(input);
    const minimum = parseFloat(style.minHeight) || 52;
    const border =
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const dock = document.querySelector(".assistant-input-dock");
    const chrome =
      dock.getBoundingClientRect().height -
      input.getBoundingClientRect().height;
    const workspace = get("tab-assistant");
    const budget =
      workspace.clientHeight -
      workspace.querySelector(".assistant-heading").getBoundingClientRect()
        .height -
      24 -
      chrome -
      80;
    const maximum = Math.max(minimum, Math.min(160, budget));
    // Changing height never rewrites the value or selection. Start at the minimum to permit shrinkage.
    input.style.maxHeight = maximum + "px";
    input.style.height = minimum + "px";
    input.style.overflowY = "hidden";
    if (input.value)
      input.style.height =
        Math.min(maximum, Math.max(minimum, input.scrollHeight + border)) +
        "px";
    const overflow = input.value && input.scrollHeight > input.clientHeight + 1;
    input.style.overflowY = overflow ? "auto" : "hidden";
    if (reset || !overflow) input.scrollTop = 0;
  }
  function clear() {
    generation++;
    context = null;
    get("assistantMessages").replaceChildren();
    message("reply", "Evergreen Business Assistant").append(
      element("p", welcome),
    );
    get("assistantQuestion").value = "";
    resizeQuestion(true);
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
    resizeQuestion(true);
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
      get("assistantQuestion").addEventListener("input", () =>
        resizeQuestion(),
      );
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
