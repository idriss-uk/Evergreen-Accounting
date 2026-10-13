(() => {
  "use strict";
  const gbp = (value) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(value);
  const date = (value) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(value + "T00:00:00Z"));
  const period = (range) =>
    (range.from ? date(range.from) : "All recorded dates") +
    " – " +
    date(range.to);
  function format(data, query, previous = null) {
    const balance = ["receivables", "payables", "overdue", "cash"].includes(
      query.intent,
    );
    const result = {
      title: "Recorded business insights",
      period: balance ? "As of " + date(query.range.to) : period(query.range),
      paragraphs: [],
      rows: [],
      sources: [],
      warnings: data.warnings,
      followups: [],
      metrics: {},
    };
    const metric = (label, value) => {
      result.rows.push({ label, value: gbp(value) });
      result.metrics[label] = value;
    };
    const documents = (rows) =>
      rows
        .slice(0, query.limit)
        .forEach((row) =>
          result.rows.push({
            label: row.party || "Unnamed party",
            value: gbp(row.outstanding),
            reference:
              row.reference +
              (row.grouped ? "" : " · due " + (row.dueDate || "unknown")),
          }),
        );
    switch (query.intent) {
      case "pnl":
      case "expenses":
        result.title =
          query.intent === "pnl" ? "Profit and loss" : "Recorded expenses";
        metric("Revenue", data.pnl.totalRevenue);
        metric("Expenses", data.pnl.totalExpenses);
        metric("Net profit / loss", data.pnl.netProfit);
        result.paragraphs.push(
          "Accrual basis, excluding VAT: revenue and costs come from the canonical ledger by document or journal date. Settlements and matched bank rows are not counted again. Expenses include supplier purchases and operating expenses; this is not a cash-spending total.",
        );
        result.sources = [
          ...new Set(
            data.gl
              .filter((row) => /^[456]\d{3}\b/.test(row.account))
              .map(
                (row) =>
                  row.date +
                  " · " +
                  row.sourceType +
                  " " +
                  (row.sourceId || row.journalId) +
                  " · " +
                  row.account,
              ),
          ),
        ];
        result.followups = [
          "What are my largest expense categories?",
          "Which customers owe me money?",
        ];
        if (previous) {
          result.paragraphs.push(
            "Comparison: current month to date versus the full previous month (" +
              period(previous.range) +
              "). These periods have different lengths.",
          );
          metric("Previous revenue", previous.data.pnl.totalRevenue);
          metric("Previous expenses", previous.data.pnl.totalExpenses);
          metric("Previous net profit / loss", previous.data.pnl.netProfit);
          metric(
            "Profit change",
            window.EvergreenLedger.roundMoney(
              data.pnl.netProfit - previous.data.pnl.netProfit,
            ),
          );
          metric(
            "Expense change",
            window.EvergreenLedger.roundMoney(
              data.pnl.totalExpenses - previous.data.pnl.totalExpenses,
            ),
          );
          result.sources.push(
            ...previous.data.gl
              .filter((row) => /^[456]\d{3}\b/.test(row.account))
              .map(
                (row) =>
                  row.date +
                  " · " +
                  row.sourceType +
                  " " +
                  (row.sourceId || row.journalId),
              ),
          );
        }
        break;
      case "categories": {
        result.title = previous
          ? "Expense category changes"
          : "Expense categories";
        result.paragraphs.push(
          "Net costs excluding VAT, grouped from expense journal lines. Supplier purchases and unclassified journals are shown separately.",
        );
        let categories = data.categories;
        if (previous) {
          const names = new Set(
            [...categories, ...previous.data.categories].map(
              (row) => row.label,
            ),
          );
          categories = [...names]
            .map((label) => {
              const current = categories.find((row) => row.label === label),
                prior = previous.data.categories.find(
                  (row) => row.label === label,
                );
              return {
                label,
                amount: current?.amount || 0,
                change: window.EvergreenLedger.roundMoney(
                  (current?.amount || 0) - (prior?.amount || 0),
                ),
                references: [
                  ...(current?.references || []),
                  ...(prior?.references || []),
                ],
              };
            })
            .sort((a, b) => b.change - a.change);
          result.paragraphs.push(
            "Current month to date against full previous month (" +
              period(previous.range) +
              "); only increases shown.",
          );
          categories = categories.filter((row) => row.change > 0);
        }
        if (query.category)
          categories = categories.filter((row) =>
            row.label.toLowerCase().includes(query.category.toLowerCase()),
          );
        for (const row of categories) {
          result.rows.push({
            label: row.label,
            value:
              gbp(row.amount) +
              (previous ? " · increased " + gbp(row.change) : ""),
            reference: row.references.join(", "),
          });
          result.metrics[row.label] = row.amount;
        }
        if (!categories.length)
          result.paragraphs.push(
            "No matching recorded expense categories in this period.",
          );
        result.followups = ["Compare this months profit with last month."];
        break;
      }
      case "receivables":
      case "payables":
      case "overdue": {
        result.title =
          query.intent === "overdue"
            ? "Overdue customer invoices"
            : query.intent === "payables"
              ? "Unpaid supplier bills"
              : "Outstanding customer invoices";
        const report =
          query.intent === "payables" ? data.payables : data.receivables;
        let rows =
          query.intent === "overdue"
            ? data.overdue
            : [...report.rows].sort((a, b) => b.outstanding - a.outstanding);
        metric(
          "Outstanding balance",
          query.intent === "overdue"
            ? window.EvergreenLedger.roundMoney(
                rows.reduce((sum, row) => sum + row.outstanding, 0),
              )
            : report.total,
        );
        result.paragraphs.push(
          rows.length +
            " " +
            (query.intent === "overdue"
              ? "overdue invoices"
              : "unpaid documents") +
            ". Balances use Evergreen’s payment engine, include VAT and deduct partial payments dated on or before this date. Only invoices with an explicit due date are counted as overdue.",
        );
        if (query.customers && query.intent === "receivables") {
          const grouped = new Map();
          rows.forEach((row) => {
            const key = row.partyKey;
            const existing = grouped.get(key) || {
              party: row.party || "Unnamed customer",
              outstanding: 0,
              reference: [],
              dueDate: "",
            };
            existing.outstanding = window.EvergreenLedger.roundMoney(
              existing.outstanding + row.outstanding,
            );
            existing.reference.push(row.reference);
            grouped.set(key, existing);
          });
          rows = [...grouped.values()]
            .sort((a, b) => b.outstanding - a.outstanding)
            .map((row) => ({
              ...row,
              reference: row.reference.join(", "),
              grouped: true,
            }));
          if (query.largest) rows = rows.slice(0, 1);
        }
        documents(rows);
        if (rows.length > query.limit)
          result.paragraphs.push(
            "Showing " +
              query.limit +
              " of " +
              rows.length +
              " documents; the total includes all.",
          );
        result.sources = (
          query.intent === "overdue" ? data.overdue : report.rows
        ).map(
          (row) =>
            row.reference + " · " + row.party + " · " + gbp(row.outstanding),
        );
        result.followups = [
          "How many invoices are overdue?",
          "Show my five largest unpaid invoices.",
        ];
        break;
      }
      case "cash":
        result.title = "Recorded cash balance";
        metric("Cash on hand", data.cash.balance);
        result.paragraphs.push(
          "Derived from Evergreen’s cash ledger through this date. This is a recorded balance, not a physical cash count or live bank balance.",
        );
        result.sources = data.cash.rows.map(
          (row) => row.date + " · " + row.reference + " · " + row.description,
        );
        break;
      case "bank":
        result.title = "Unreconciled banking";
        result.paragraphs.push(
          data.bank.length +
            " bank transactions are not marked Matched. Review these in Bank Recon; the assistant makes no changes.",
        );
        if (!query.range.explicit)
          result.period =
            "All recorded bank rows through " + date(query.range.to);
        data.bank
          .slice(0, query.limit)
          .forEach((row) =>
            result.rows.push({
              label: row.description || "Bank transaction",
              value: gbp(row.amount),
              reference: row.id + " · " + row.date,
            }),
          );
        if (data.bank.length > query.limit)
          result.paragraphs.push(
            "Showing " + query.limit + " of " + data.bank.length + " rows.",
          );
        break;
      case "vat":
        result.title = "Illustrative recorded VAT";
        metric("Output VAT", data.vat.output);
        metric("Input VAT", data.vat.input);
        metric(
          "Output less input VAT",
          window.EvergreenLedger.roundMoney(data.vat.output - data.vat.input),
        );
        result.paragraphs.push(
          "Illustrative only — not an HMRC-verified return or a confirmed tax liability. Period movements in the ledger’s VAT Output and VAT Input accounts include recorded credit/debit notes. This does not verify eligibility, VAT schemes, adjustments or filing periods.",
        );
        result.sources = data.gl
          .filter(
            (row) =>
              row.account === window.EvergreenLedger.ACCOUNTS.VAT_INPUT ||
              row.account === window.EvergreenLedger.ACCOUNTS.VAT_OUTPUT,
          )
          .map(
            (row) =>
              row.date +
              " · " +
              row.sourceType +
              " " +
              row.sourceId +
              " · " +
              row.account,
          );
        break;
      default:
        metric("Revenue", data.pnl.totalRevenue);
        metric("Expenses", data.pnl.totalExpenses);
        metric("Net profit / loss", data.pnl.netProfit);
        metric("Outstanding customer invoices", data.outstanding);
        metric("Unpaid supplier balances", data.suppliers);
        result.paragraphs.push(
          data.overdue.length +
            " overdue invoices and " +
            data.bank.length +
            " unreconciled bank rows as of " +
            date(query.range.to) +
            ". Revenue and expenses use the ledger period above; balances include all recorded documents through this date.",
        );
        result.paragraphs.push(
          "Review overdue customer payments, unreconciled banking and any missing due dates. These are recorded-data review priorities, not a forecast or tax advice.",
        );
        result.sources = [
          ...new Set(
            data.gl
              .filter((row) => /^[456]\d{3}\b/.test(row.account))
              .map(
                (row) =>
                  row.date +
                  " · " +
                  row.sourceType +
                  " " +
                  (row.sourceId || row.journalId),
              ),
          ),
          ...data.receivables.rows.map(
            (row) => row.reference + " · outstanding " + gbp(row.outstanding),
          ),
          ...data.payables.rows.map(
            (row) => row.reference + " · unpaid " + gbp(row.outstanding),
          ),
        ];
        result.followups = [
          "Which customers owe me money?",
          "What are my largest expense categories?",
          "Show my estimated VAT position.",
        ];
        break;
    }
    if (!result.rows.length && !result.paragraphs.length)
      result.paragraphs.push("No matching records.");
    return result;
  }
  window.EvergreenAssistantResponse = Object.freeze({ format, gbp, period });
})();
