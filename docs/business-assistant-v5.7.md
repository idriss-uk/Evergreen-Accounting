# V5.7 Business Assistant

Open **AI Assistant** in the desktop sidebar or mobile **More** menu. The local Business Assistant uses a rule-based query interpreter, not a generative language model. It works offline once Evergreen's app shell is installed. No provider is connected, no API key is required and no accounting data is transmitted by the assistant.

## Questions and periods

- Profit: “How much profit did my business make this month?”, “Show my revenue and expenses this year”, “Compare this month's profit with last month”.
- Customers: “Which customers owe me money?”, “Which customer owes the most?”, “Show my five largest unpaid invoices”, “How many invoices are overdue?”, “What is my total outstanding sales balance?”.
- Expenses: “How much have I spent this month?”, “What are my largest expense categories?”, “Which expenses increased compared with last month?”, “How much have I spent on software?” or “How much have I spent on marketing?”.
- Cash/banking: “What is my recorded cash balance?”, “How many bank transactions are unreconciled?”, “What transactions need my attention?”.
- VAT: “Show my estimated VAT position”, “How much output VAT appears in my recorded sales?”, “How much input VAT appears in my purchases?”.
- Insights: “Give me a summary of my business performance”, “What should I pay attention to this week?”, “Which financial areas need reviewing?”. Supplier balances: “Show unpaid supplier balances”.

Supported periods: **this month** (to date), **last month**, **this quarter** (calendar quarter to date), **last quarter**, **this year / year to date / YTD** (calendar year), **last year**, a named month with a year (e.g. **September 2026**), **all recorded dates / all time**, and an inclusive ISO range such as **2026-01-01 to 2026-03-31**. The browser's local calendar date determines “today”. Periods ending in the future are refused; a named current month ends today. Fiscal years, tax years, arbitrary weekly periods and forecasting are not supported. “Attention this week” gives current review priorities, not a weekly forecast.

Without a period, profit, costs and VAT default to the current month to date. Customer/supplier balances, overdue invoices and cash use all records through the stated as-of date. Banking defaults to all unreconciled records through that date; an explicit period filters bank rows. Every answer shows its period or as-of date.

The question box and Ask Assistant button stay anchored below one scrolling workspace. The input grows with your text (up to 160px, or less when needed to preserve conversation space); only longer messages scroll inside it. Submission and clearing reset its height and scroll position. Mobile shows a compact **AI Assistant · Private · Offline · Read-only** heading while desktop keeps the full header. The app brand remains visible when the keyboard opens. The workspace follows the visual viewport, with a window-height fallback.

New answers open at their heading and show key financial figures before supporting breakdowns. Long explanations remain available under **How this was calculated**; periods, the VAT disclaimer, comparison-period differences and data-quality notices stay visible. **Sources** retains original references. Long identifiers show an explicit abbreviation; expand the reference to read or select/copy its complete original text. Repeated warnings appear once in **Data Quality Alerts** below the conversation, with a review link from affected answers. Expanding sections does not move the composer or change records.

Simple follow-ups such as “And last month?” reuse the previous supported topic. Unsupported or ambiguous questions ask for clarification. Comparisons are explicitly **current month to date versus the full previous month**; these periods have different lengths. Suggestions let users ask another supported question. Unknown queries do not produce invented estimates.

## Calculation sources and limits

- **Profit / revenue / expenses:** `EvergreenReports.profitAndLoss` over the canonical ledger. Accrual accounting by journal/document date, excluding VAT. Payments, cash transfers and matched bank rows do not become revenue or costs a second time. Supplier bills, credit notes and debit notes follow the existing ledger accounting. “Spent” means recorded net expense, not a cash-flow total.
- **Categories:** net movement of expense accounts in `EvergreenReports.generalLedger`. Source expense categories take precedence; supplier purchases and otherwise uncategorised journals have separate labels. Existing journals remain authoritative; document values are not added again. Software/marketing matching uses category labels, not receipt text or a guess at transaction purpose.
- **Balances:** `EvergreenReports.agedReceivables` / `agedPayables` and `EvergreenPayments.outstandingAmount`. A detached projection excludes future invoices and settlements before running the reports. Partial payments reduce gross balances. Explicit future payments do not activate the legacy Paid-status fallback. Historical legacy Paid records have unknown settlement dates, so answers warn about that limitation. Unallocated credit/debit notes do not reduce individual invoice/bill balances; their presence produces a review warning. Customer rankings group stable customer IDs where available, falling back to recorded names.
- **Overdue:** positive outstanding sales invoices with an explicit due date earlier than the as-of date. Missing due dates are disclosed and excluded. A due date equal to today is not overdue.
- **Cash:** `EvergreenCash.ledger`, all cash-account movements through the as-of date. Not a physical cash count or live bank balance.
- **Banking:** recorded rows not marked Matched. Bank rows are review items, not a second ledger. No matching, posting or transfer occurs.
- **VAT:** period debit/credit movements of the existing VAT Input and VAT Output ledger accounts, including recorded notes. **Illustrative only, not an HMRC-verified return or confirmed tax liability.** Eligibility, adjustments, schemes and statutory filing periods are not verified.

Business Insights shows current-month revenue, expenses and net profit alongside as-of customer balances, overdue count and supplier balances. Empty data shows zero recorded activity with a warning. Missing/invalid amounts, dates, duplicate identifiers, orphan payments or unbalanced journals stop financial answers rather than silently producing unverifiable totals. These checks cannot prove real-world completeness or accounting classification. Use Data Health and Reports to review records.

Financial answers show underlying amounts, calculation explanations and source references where applicable. Long invoice/bank lists show the first 20 rows (five for the requested largest five) and disclose truncation; totals still include all rows. The expandable source list renders at most 100 lines and points to Reports for the full ledger.

## Privacy and architecture

`js/assistant/data.js` reads only selected accounting fields into a detached, deeply frozen projection; attachments, receipt text, company identity details and stored conversations are excluded. `query.js` interprets questions and periods. `finance.js` calls existing accounting reports. `response.js` formats values, explanations, warnings and references. `engine.js` exposes a synchronous local read-only `answer` contract. `js/ui/assistant.js` renders results and holds conversation/topic state only in memory.

There is no networking client, storage write, action dispatcher, provider key or automatic email/HMRC/ledger operation. Source names and descriptions are untrusted display data; UI output uses DOM `textContent` and never inserts record text as HTML. Questions cannot invoke ledger actions. Conversations disappear on reload or **Clear Conversation**; clearing does not remove accounting data. Service-worker v31 caches every assistant module and the updated stylesheet. Existing receipt, recurring-invoice, banking and reporting paths are preserved.

## Validation

Run `npm ci`, then `npm test` and `npm run test:browser`. Browser tests use Playwright Chromium; set `CHROME_PATH` to a compatible installed Chromium when needed. The browser runner executes both the new assistant suite and the existing complete offline workflow suite, preserving failure exit status. GitHub Actions executes these same commands with pinned dependencies and installs Playwright Chromium.

Unit coverage includes ledger-based profit, date boundaries, comparisons, partial/future payments, missing due dates, overdue counts, customer ranking, supplier balances, credits, categories, VAT, cash, banking, empty data, invalid data, unsupported queries and read-only projections. Browser coverage uses an isolated profile to verify GBP answers and insights, follow-ups, safe untrusted text rendering, no assistant requests or record/storage changes, error feedback, clear/reload history, offline reopening, receipt preservation, mobile navigation/layout and dark mode. Screenshots are saved under ignored `test-results/`.

## V5.7.2 mobile validation and remaining limits

Browser coverage checks 360 × 640, 390 × 844, 412 × 915, 768 × 1024 and 1440 × 900 in light and dark modes. It exercises textarea expansion, maximum height, caret preservation, empty-placeholder visibility, scroll reset, composer geometry, long conversations, keyboard viewport shrinking/panning, the viewport fallback, touch and keyboard controls, safe complete references, expandable methodology/alerts, offline use and record/storage preservation. Complete financial response objects for the same records and reporting date are compared before and after UI use. Accounting, payment, storage and assistant calculation modules are unchanged.

Screenshots are generated as `test-results/assistant-v572-<width>x<height>-<theme>.png` and `assistant-mobile-keyboard.png`; GitHub Actions uploads the browser diagnostics artifact. Android scenarios use Playwright device and keyboard-viewport emulation. **Real-device verification remains recommended**, particularly for Android Chrome keyboard/toolbar transitions, font scaling and device safe-area behavior. Screens too short to fit the app header, one input line and a reading area necessarily limit simultaneous conversation visibility.
