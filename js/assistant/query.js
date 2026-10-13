(() => {
  "use strict";
  const iso = (d) => d.toISOString().slice(0, 10);
  const day = (y, m, d) => iso(new Date(Date.UTC(y, m, d)));
  function period(text, today) {
    const [y, m] = today.split("-").map(Number),
      month = m - 1;
    const explicit = text.match(
      /(\d{4}-\d{2}-\d{2})\s+(?:to|through)\s+(\d{4}-\d{2}-\d{2})/,
    );
    if (explicit) {
      if (
        !window.EvergreenAssistantData.validDate(explicit[1]) ||
        !window.EvergreenAssistantData.validDate(explicit[2]) ||
        explicit[1] > explicit[2] ||
        explicit[2] > today
      )
        return {
          error:
            "Choose a valid date range ending on or before today, such as 2026-01-01 to 2026-03-31.",
        };
      return { from: explicit[1], to: explicit[2], explicit: true };
    }
    if (/\blast month\b/.test(text))
      return {
        from: day(y, month - 1, 1),
        to: day(y, month, 0),
        explicit: true,
      };
    if (/\blast year\b/.test(text))
      return { from: day(y - 1, 0, 1), to: day(y - 1, 11, 31), explicit: true };
    if (/\blast quarter\b/.test(text)) {
      const q = Math.floor(month / 3) * 3;
      return { from: day(y, q - 3, 1), to: day(y, q, 0), explicit: true };
    }
    if (/\bthis quarter\b/.test(text))
      return {
        from: day(y, Math.floor(month / 3) * 3, 1),
        to: today,
        explicit: true,
      };
    if (/\b(this year|year to date|ytd)\b/.test(text))
      return { from: day(y, 0, 1), to: today, explicit: true };
    if (/\bthis month\b/.test(text))
      return { from: day(y, month, 1), to: today, explicit: true };
    if (/\b(all time|all recorded)\b/.test(text))
      return { from: "", to: today, explicit: true };
    const months = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const named = text.match(
      new RegExp("\\b(" + months.join("|") + ") (\\d{4})\\b"),
    );
    if (named) {
      const ny = Number(named[2]),
        nm = months.indexOf(named[1]),
        from = day(ny, nm, 1),
        to = day(ny, nm + 1, 0);
      if (from > today)
        return {
          error:
            "Future financial periods cannot be verified from current records.",
        };
      return { from, to: to > today ? today : to, explicit: true };
    }
    if (
      /\b(today|yesterday|week|\d{4}|january|february|march|april|may|june|july|august|september|october|november|december|month|quarter|year)\b/.test(
        text,
      )
    )
      return {
        error:
          "Which reporting period? Try this month, last month, this quarter, year to date, September 2026, or an ISO date range.",
      };
    return { from: day(y, month, 1), to: today, explicit: false };
  }
  function interpret(question, today, context = null) {
    const text = String(question || "")
      .trim()
      .toLowerCase()
      .replace(/[’']/g, "");
    if (!text || text.length > 1000)
      return { error: "Enter a question of up to 1,000 characters." };
    if (
      /\b(tax|forecast|predict|prediction|investment|loan advice|will|projected|next)\b/.test(
        text,
      ) &&
      !/vat/.test(text)
    )
      return {
        error:
          "The local engine cannot verify tax liabilities, forecasts or investment advice. Ask about recorded reports or illustrative VAT.",
      };
    if (
      /\b(create|record|post|delete|remove|edit|modify|update|pay|send|email|submit|reconcile|transfer|change)\b/.test(
        text.replace(/pay attention/g, "attention"),
      )
    )
      return {
        error:
          "I can only explain recorded information. I cannot change records, make payments, send messages or submit returns.",
      };
    let intent;
    if (
      /summary|performance|insight|attention|reviewing|review|areas/.test(text)
    )
      intent = "summary";
    else if (/vat/.test(text)) intent = "vat";
    else if (/unreconciled|unmatched|bank transaction/.test(text))
      intent = "bank";
    else if (/cash balance|recorded cash/.test(text)) intent = "cash";
    else if (/overdue/.test(text)) intent = "overdue";
    else if (
      /owe|owes|outstanding|unpaid invoice|unpaid sales|customer balance|supplier balance/.test(
        text,
      )
    )
      intent = /supplier|payable/.test(text) ? "payables" : "receivables";
    else if (/categor|software|marketing|expenses increased/.test(text))
      intent = "categories";
    else if (/profit|revenue|sales|income/.test(text)) intent = "pnl";
    else if (/spent|spend|expenses|purchases/.test(text)) intent = "expenses";
    const followup =
      /^(and |what about |how about )?(last month|this month|last year|this year|year to date|this quarter|last quarter)[?.!]*$/.test(
        text,
      );
    if (!intent && followup && context) intent = context.intent;
    if (!intent)
      return {
        error:
          "The local engine cannot answer that yet. Ask about profit, invoice balances, expense categories, recorded cash, unreconciled banking or illustrative VAT.",
      };
    if (
      /\b(compare|versus|vs|increased)\b/.test(text) &&
      !["pnl", "expenses", "categories"].includes(intent)
    )
      return {
        error:
          "Comparisons currently support profit and expenses. Which would you like to compare?",
      };
    // "attention this week" describes current review priorities, not a weekly forecast.
    const dateText =
      intent === "summary" ? text.replace(/this week/g, "") : text;
    const range = period(dateText, today);
    if (range.error) return range;
    const comparison = /compare|versus|\bvs\b|increased/.test(text);
    if (!comparison && /this month/.test(text) && /last month/.test(text))
      return {
        error:
          "Would you like a comparison, or a report for one month? Try compare this months profit with last month.",
      };
    if (comparison && range.explicit && !/this month|last month/.test(text))
      return {
        error:
          "Comparisons currently use this month to date against the full previous month.",
      };
    const category = /software/.test(text)
      ? "Software"
      : /marketing/.test(text)
        ? "Marketing"
        : null;
    if (category && /software/.test(text) && /marketing/.test(text))
      return { error: "Please ask about software or marketing separately." };
    return {
      intent,
      range,
      comparison,
      category,
      customers: /customer|owe|owes/.test(text) && !/invoice/.test(text),
      largest: /largest|most/.test(text),
      limit: /five|\b5\b/.test(text) ? 5 : 20,
    };
  }
  window.EvergreenAssistantQuery = Object.freeze({ interpret, period });
})();
