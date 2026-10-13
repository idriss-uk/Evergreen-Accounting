"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const context = { window: {}, Intl, Date };
for (const name of [
  "core/ledger",
  "core/payments",
  "core/reports",
  "core/cash",
  "assistant/data",
  "assistant/query",
  "assistant/finance",
  "assistant/response",
  "assistant/engine",
])
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../js", name + ".js"), "utf8"),
    context,
  );
const {
  EvergreenAssistant: assistant,
  EvergreenLedger: ledger,
  EvergreenPayments: payments,
  EvergreenReports: reports,
} = context.window;
const blank = () => ({
  invoices: [],
  bills: [],
  expenses: [],
  payments: [],
  bankTransactions: [],
  ledgerEntries: [],
});
const invoice = (id, date, net, extra = {}) => ({
  id,
  invNo: id,
  type: "Invoice",
  customer: "Customer A",
  customerId: "A",
  date,
  dueDate: date,
  totalNet: net,
  totalVat: net * 0.2,
  totalGross: net * 1.2,
  status: "Unpaid",
  ...extra,
});
const expense = (id, date, net, category = "Software & IT") => ({
  id,
  date,
  netAmount: net,
  vatAmount: net * 0.2,
  grossAmount: net * 1.2,
  category,
  merchant: "Supplier",
  payMethod: "Bank",
  attachment: "data:image/png;base64,KEPT",
});
const ask = (state, q, ctx = null, today = "2026-10-13") =>
  assistant.answer(state, q, ctx, today);
function fixture() {
  const s = blank();
  s.invoices.push(
    invoice("OCT", "2026-10-01", 100),
    invoice("SEP", "2026-09-20", 200),
    invoice("FUTURE", "2026-11-01", 999),
  );
  s.expenses.push(
    expense("EO", "2026-10-02", 30),
    expense("ES", "2026-09-02", 10),
  );
  payments.recordPayment(s, {
    id: "P1",
    documentType: "Invoice",
    documentId: "OCT",
    date: "2026-10-05",
    amount: 40,
  });
  payments.recordPayment(s, {
    id: "P2",
    documentType: "Invoice",
    documentId: "OCT",
    date: "2026-10-20",
    amount: 80,
  });
  s.bankTransactions.push(
    {
      id: "MATCH",
      date: "2026-10-05",
      description: "Matched sale",
      amount: 40,
      status: "Matched",
      matchedId: "OCT",
    },
    {
      id: "UNMATCH",
      date: "2026-10-06",
      description: "Unmatched deposit",
      amount: 200,
      status: "Unmatched",
    },
  );
  return s;
}
test("canonical profit uses accrual date, excludes VAT and avoids payment/bank double counting", () => {
  const s = fixture();
  const a = ask(s, "How much profit did my business make this month?");
  assert.equal(a.metrics.Revenue, 100);
  assert.equal(a.metrics.Expenses, 30);
  assert.equal(a.metrics["Net profit / loss"], 70);
  assert.match(a.period, /1 Oct 2026.*13 Oct 2026/);
  assert.ok(a.sources.some((row) => row.includes("OCT")));
  assert.equal(a.insights.outstanding, 320);
});
test("monthly, quarterly, annual, leap-year, explicit range and follow-up interpretation", () => {
  const s = fixture();
  const a = ask(s, "What was my profit last month?");
  assert.equal(a.metrics["Net profit / loss"], 190);
  assert.equal(a.range.to, "2026-09-30");
  assert.equal(ask(s, "And this month?", a.context).metrics.Revenue, 100);
  assert.equal(
    ask(s, "Show revenue and expenses this year").metrics.Revenue,
    300,
  );
  assert.equal(ask(s, "Profit 2026-09-01 to 2026-09-30").metrics.Revenue, 200);
  assert.equal(ask(s, "profit September 2026").metrics.Revenue, 200);
  assert.equal(ask(s, "profit last quarter").metrics.Revenue, 200);
  assert.equal(
    ask(blank(), "profit last month", null, "2024-03-01").range.to,
    "2024-02-29",
  );
  assert.equal(
    ask(blank(), "profit last month", null, "2026-01-01").range.from,
    "2025-12-01",
  );
});
test("comparison labels unequal periods and grounds current and prior figures", () => {
  const a = ask(fixture(), "Compare this months profit with last month");
  assert.equal(a.metrics["Profit change"], -120);
  assert.equal(a.metrics["Expense change"], 20);
  assert.match(a.paragraphs.join(" "), /different lengths/);
  const c = ask(
    fixture(),
    "Which expenses increased compared with last month?",
  );
  assert.equal(c.metrics["Software & IT"], 30);
  assert.match(c.rows[0].value, /increased £20.00/);
});
test("partial payments and future settlements respected in outstanding and overdue answers", () => {
  const s = fixture();
  assert.equal(
    ask(s, "What is my total outstanding sales balance?").metrics[
      "Outstanding balance"
    ],
    320,
  );
  assert.equal(ask(s, "How many invoices are overdue?").insights.overdue, 2);
  assert.equal(
    ask(s, "outstanding invoices", null, "2026-10-25").metrics[
      "Outstanding balance"
    ],
    240,
  );
  assert.equal(
    ask(s, "outstanding invoices 2026-09-01 to 2026-09-30").metrics[
      "Outstanding balance"
    ],
    240,
  );
  s.invoices[0].dueDate = "2026-10-13";
  assert.equal(ask(s, "overdue invoices").insights.overdue, 1);
  delete s.invoices[1].dueDate;
  const a = ask(s, "overdue invoices");
  assert.equal(a.insights.overdue, 0);
  assert.match(
    ask(s, "outstanding invoices").rows.find((row) =>
      row.reference?.startsWith("SEP"),
    ).reference,
    /due unknown/,
  );
  assert.match(a.warnings.join(" "), /excluded from overdue/);
});
test("customer ranking aggregates invoices, keeps customer IDs distinct, and ranks largest documents", () => {
  const s = blank();
  s.invoices.push(
    invoice("A1", "2026-10-01", 40),
    invoice("A2", "2026-10-01", 40),
    invoice("B1", "2026-10-01", 70, {
      customer: "Customer B",
      customerId: "B",
    }),
  );
  const a = ask(s, "Which customer owes the most?");
  assert.equal(a.rows[1].label, "Customer A");
  assert.equal(a.rows[1].value, "£96.00");
  const b = ask(s, "Show my five largest unpaid invoices.");
  assert.equal(b.rows[1].reference.split(" · ")[0], "B1");
  assert.equal(ask(s, "Which customers owe me money?").rows.length, 3);
  s.invoices[2].customer = "Customer A";
  assert.equal(ask(s, "Which customers owe me money?").rows.length, 3);
});
test("supplier balance and credit notes reuse reports without reallocating credits", () => {
  const s = blank();
  s.bills.push({
    ...invoice("BILL", "2026-10-01", 50),
    type: "Bill",
    billNo: "BILL",
    supplier: "Supplier",
  });
  payments.recordPayment(s, {
    id: "BP",
    documentType: "Bill",
    documentId: "BILL",
    date: "2026-10-02",
    amount: 20,
  });
  s.invoices.push(
    invoice("SALE", "2026-10-01", 100),
    invoice("CREDIT", "2026-10-02", 20, { type: "Credit Note" }),
  );
  assert.equal(
    ask(s, "unpaid supplier balances").metrics["Outstanding balance"],
    40,
  );
  assert.equal(ask(s, "profit this month").metrics.Revenue, 80);
  assert.match(ask(s, "unpaid invoices").warnings.join(" "), /Unallocated/);
});
test("categories use journal amounts, respect existing overrides and include supplier costs once", () => {
  const s = fixture();
  s.expenses.push(expense("MARKETING", "2026-10-03", 20, "Marketing"));
  s.ledgerEntries.push(ledger.fromDocument("Expense", s.expenses[0]));
  assert.equal(
    ask(s, "How much have I spent on software this month?").metrics[
      "Software & IT"
    ],
    30,
  );
  assert.equal(
    ask(s, "How much have I spent on marketing?").metrics.Marketing,
    20,
  );
  assert.equal(ask(s, "largest expense categories").rows.length, 2);
  s.ledgerEntries.find((e) => e.sourceId === "EO").lines[0].debit = 25;
  s.ledgerEntries.find((e) => e.sourceId === "EO").lines[2].credit = 31;
  assert.equal(ask(s, "software spending").metrics["Software & IT"], 25);
});
test("VAT shows ledger movements and illustrative disclaimer, cash and banking stay separate", () => {
  const s = fixture();
  const v = ask(s, "Show my estimated VAT position");
  assert.equal(v.metrics["Output VAT"], 20);
  assert.equal(v.metrics["Input VAT"], 6);
  assert.equal(v.metrics["Output less input VAT"], 14);
  assert.match(v.paragraphs.join(" "), /not an HMRC-verified/);
  assert.match(
    ask(s, "How many bank transactions are unreconciled?").paragraphs[0],
    /^1 bank/,
  );
  s.ledgerEntries.push(
    ledger.createEntry({
      id: "CASH",
      date: "2026-10-01",
      sourceType: "CashMovement",
      sourceId: "CASH",
      lines: [
        { account: ledger.ACCOUNTS.CASH, debit: 50, credit: 0 },
        { account: "3000 Capital", debit: 0, credit: 50 },
      ],
    }),
  );
  assert.equal(
    ask(s, "What is my recorded cash balance?").metrics["Cash on hand"],
    50,
  );
});
test("empty records, unsupported and ambiguous questions never fabricate figures", () => {
  const a = ask(blank(), "profit this month");
  assert.equal(a.metrics.Revenue, 0);
  assert.match(a.warnings[0], /No accounting records/);
  for (const q of [
    "Tell me a joke",
    "Will profit increase?",
    "profit this month and last month",
    "How much tax do I owe?",
    "profit in 2025",
    "profit September",
    "profit next month",
    "software and marketing expenses",
    "compare revenue this year",
    "profit 2026-02-30 to 2026-03-01",
    "profit 2026-10-01 to 2026-11-01",
  ]) {
    const result = ask(blank(), q);
    assert.equal(result.title, "Let’s clarify", q);
  }
  assert.equal(ask(blank(), "last month?").title, "Let’s clarify");
});
test("read-only enforcement, attachment exclusion and deeply immutable detached projection", () => {
  const s = fixture(),
    before = JSON.stringify(s);
  for (const q of [
    "Delete invoice OCT",
    "Send overdue reminders",
    "Record an expense",
    "Post VAT",
    "Transfer cash",
    "Update customer",
  ]) {
    assert.match(ask(s, q).paragraphs[0], /cannot change records/);
  }
  for (const q of [
    "profit this month",
    "Which customers owe me money?",
    "largest expense categories",
    "VAT",
    "business summary",
    "cash balance",
  ])
    ask(s, q);
  assert.equal(JSON.stringify(s), before);
  assert.equal(Object.isFrozen(s.invoices[0]), false);
  const snap = context.window.EvergreenAssistantData.snapshot(s);
  assert.equal(snap.state.expenses[0].attachment, undefined);
  assert.equal(Object.isFrozen(snap.state.invoices[0]), true);
  s.expenses[0].merchant = { untrusted: "text" };
  context.window.EvergreenAssistantData.snapshot(s);
  assert.equal(Object.isFrozen(s.expenses[0].merchant), false);
});
test("missing, invalid and corrupt data produces errors rather than unverifiable amounts", () => {
  for (const mutate of [
    (s) => delete s.invoices[0].date,
    (s) => delete s.invoices[0].totalNet,
    (s) => s.invoices.push({ ...s.invoices[0] }),
    (s) => (s.payments[0].documentId = "MISSING"),
    (s) => (s.payments[0].amount = 0),
    (s) => (s.ledgerEntries[0].lines[0].debit = 999),
    (s) => (s.invoices[0].totalGross = NaN),
  ]) {
    const s = fixture();
    mutate(s);
    assert.throws(() => ask(s, "profit this month"));
  }
  const s = blank();
  s.invoices.push(invoice("LEGACY", "2026-10-01", 100, { status: "Paid" }));
  assert.equal(
    ask(s, "outstanding invoices").metrics["Outstanding balance"],
    0,
  );
  assert.match(
    ask(s, "outstanding invoices").warnings.join(" "),
    /settlement date is unknown/,
  );
});
test("every requested question has a supported local route and source amounts reconcile", () => {
  const s = fixture();
  for (const q of [
    "How much have I spent this month?",
    "Show my revenue and expenses this year.",
    "Are there any overdue customer payments?",
    "What should I pay attention to this week?",
    "What transactions need my attention?",
    "Which financial areas need reviewing?",
    "How much output VAT appears in my recorded sales?",
    "How much input VAT appears in my purchases?",
  ])
    assert.notEqual(ask(s, q).title, "Let’s clarify", q);
  const a = ask(s, "profit this month");
  assert.equal(
    a.metrics["Net profit / loss"],
    reports.profitAndLoss(s, { from: "2026-10-01", to: "2026-10-13" })
      .netProfit,
  );
});
