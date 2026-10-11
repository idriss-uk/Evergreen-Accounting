# Desktop offline reliability

Evergreen now serves its interface styles, Inter fonts, Font Awesome icons and Chart.js from its own local application shell. No third-party CDN is needed to reopen the installed app offline. The initial visit and successful service-worker installation still require internet access. Uploaded receipts, company logos and records remain local to the browser. Historical receipt attachments that are external URLs still require their source website to be available.

Cache updates remove only Evergreen shell caches, preserving other applications on the same origin. Failed server responses no longer replace the cached application HTML.

Validation used a separate, fresh headless Chrome profile served under `/Evergreen-Accounting/`, then disabled network access in the browser context. It checked offline reopening, visible layout, fonts and charts; creating and reloading an expense with an uploaded receipt; receipt image decoding; creating an invoice; importing two bank payment rows; matching both; and reloading the paid invoice. Trial Balance difference remained zero and profit changed only by the test sale minus the test expense. No page errors or external requests were observed. All nine Node.js regression files passed, including accounting integrity, backup/receipt preservation, invoice payments, expense edits, document deletion, banking and cash.

All test records were isolated from the user's browser data. This does not certify every transaction's classification, tax treatment or every supported browser.

## Rebuilding and checking

Install the pinned development dependencies with `npm ci`, then run:

    npm run build:assets
    npm test
    npm run test:browser

The browser check uses an installed Chrome or Edge on Windows, or Playwright's installed Chromium. Set `CHROME_PATH` to another compatible Chromium executable if needed. Generated assets are committed so the deployed app needs no runtime build or package installation. Fonts are embedded as WOFF2 data in the local CSS. License notices are stored alongside the generated assets.

When changing generated assets, update their versioned URLs and the service-worker cache version together.

## Browser test repair (11 October 2026)

The browser suite uses the current Add Expense / Receipt and View controls. Upload checks wait for completed receipt data and metadata rather than presentation text, and receipt previews wait for image decoding. The intentional reuse of a receipt explicitly accepts and checks the duplicate-file confirmation. Reload checks compare receipt bytes, preserving the original attachment content. The unrelated cache marker is seeded once so reloads cannot conceal cache deletion.

The full suite passed using installed Chromium on Linux (`CHROME_PATH=/usr/bin/chromium npm run test:browser`), with no page errors or external requests. All Node regressions passed with `npm test`. No application changes or accounting calculation changes were necessary. Tests run in a fresh, isolated browser context; production records and receipts are untouched.

CI now installs the pinned dependencies and Playwright Chromium, runs both complete suites, and uploads browser screenshots and failure HTML. A failing browser run writes `test-results/browser-failure.png` and `test-results/browser-failure.html`. Screenshot and HTML artifacts use only isolated test records.

## Reconciliation persistence race

GitHub Actions on Node 22 and Playwright Chromium 151 exposed a premature reload after Smart Match: payment posting sets the in-memory invoice to Paid before the queued save commits. `triggerAutoMatch` correctly awaits `saveState`; the save queue serializes snapshots and `saveSnapshot` resolves on IndexedDB transaction completion, then the browser fallback is updated. The browser test was waiting only for the in-memory balance.

Holding the reconciliation save reproduced the same Unpaid-after-reload failure on Node 22 with installed Chromium: one save was pending, memory was Paid, and the stored snapshot was Unpaid. The repaired test deliberately holds and releases that save, verifies both payments and Paid status in the committed snapshot, and still requires Paid after reload. Every test reload now waits for the save queue to drain and verifies the latest revision in IndexedDB. No extra save is issued by the test helper, so an absent or stale application save fails verification. No production code or accounting calculations changed.

All Node regressions and the full browser suite passed locally on Node 22. The cloud environment blocks the Playwright CDN and cannot install OS dependencies as root; verification using the workflow's bundled Chromium runs in GitHub Actions.
