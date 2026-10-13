(() => {
  "use strict";
  let context = null,
    generation = 0,
    bound = false;
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
    for (const warning of answer.warnings)
      node.append(element("p", warning, "assistant-warning"));
    const choices = element("div", "", "assistant-suggestions");
    addSuggestions(choices, answer.followups);
    node.append(choices);
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  }
  async function submit() {
    const input = get("assistantQuestion"),
      question = input.value.trim();
    if (!question || get("assistantSend").disabled) return;
    const token = ++generation;
    message("user", "").append(element("p", question));
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
      message("error", "Unable to verify figures").append(
        element("p", error.message),
      );
      get("assistantStatus").textContent =
        "Could not complete this question. Review the message and try again.";
    } finally {
      if (token === generation) {
        get("assistantSend").disabled = false;
        get("assistantMessages").setAttribute("aria-busy", "false");
        input.focus();
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
      addSuggestions(get("assistantSuggestions"), suggestions);
      clear();
      bound = true;
    }
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
        answer.warnings.join(" ") ||
        "Revenue and expenses exclude VAT. Balances include VAT and dated partial payments. Overdue counts require a due date.";
    } catch (error) {
      get("assistantInsightsPeriod").textContent = "Figures unavailable";
      get("assistantInsightsNote").textContent = error.message;
    }
  }
  window.EvergreenAssistantUI = Object.freeze({ render });
})();
