(() => {
  "use strict";
  function today() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }
  // Only a read-only local provider is registered. There is no remote transport or action dispatcher.
  function answer(source, question, context = null, asOf = today()) {
    if (!window.EvergreenAssistantData.validDate(asOf))
      throw Error("Invalid reporting date.");
    const query = window.EvergreenAssistantQuery.interpret(
      question,
      asOf,
      context,
    );
    if (query.error)
      return {
        title: "Let’s clarify",
        paragraphs: [query.error],
        rows: [],
        sources: [],
        warnings: [],
        followups: [
          "How much profit did my business make this month?",
          "Which customers owe me money?",
        ],
        context: null,
      };
    const snapshot = window.EvergreenAssistantData.snapshot(source);
    let previous = null;
    if (query.comparison) {
      query.range = window.EvergreenAssistantQuery.period("this month", asOf);
      const range = window.EvergreenAssistantQuery.period("last month", asOf);
      previous = {
        range,
        data: window.EvergreenAssistantFinance.calculate(
          snapshot,
          { ...query, range },
          asOf,
        ),
      };
    }
    const data = window.EvergreenAssistantFinance.calculate(
      snapshot,
      query,
      asOf,
    );
    return {
      ...window.EvergreenAssistantResponse.format(data, query, previous),
      context: { intent: query.intent },
      insights: {
        ...data.pnl,
        outstanding: data.outstanding,
        overdue: data.overdue.length,
        suppliers: data.suppliers,
      },
      range: query.range,
    };
  }
  window.EvergreenAssistant = Object.freeze({
    answer,
    today,
    provider: "local-rules",
    readOnly: true,
  });
})();
