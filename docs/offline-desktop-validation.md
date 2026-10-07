# Desktop offline reliability

Evergreen now serves its interface styles, Inter fonts, Font Awesome icons and Chart.js from its own local application shell. No third-party CDN is needed to reopen the installed app offline. The initial visit and successful service-worker installation still require internet access. Uploaded receipts, company logos and records remain local to the browser. Historical receipt attachments that are external URLs still require their source website to be available.

Cache updates remove only Evergreen shell caches, preserving other applications on the same origin. Failed server responses no longer replace the cached application HTML.

Validation used a separate, fresh headless Chrome profile served under `/Evergreen-Accounting/`, then disabled network access in the browser context. It checked offline reopening, visible layout, fonts and charts; creating and reloading an expense with an uploaded receipt; receipt image decoding; creating an invoice; importing two bank payment rows; matching both; and reloading the paid invoice. Trial Balance difference remained zero and profit changed only by the test sale minus the test expense. No page errors or external requests were observed. The four existing accounting/storage regression suites also passed in Node.

All test records were isolated from the user's browser data. This does not certify every transaction's classification, tax treatment or every supported browser.

## Rebuilding and checking

Install the pinned development dependencies with `npm ci`, then run:

    npm run build:assets
    npm test
    npm run test:browser

The browser check uses an installed Chrome or Edge on Windows, or Playwright's installed Chromium. Set `CHROME_PATH` to another compatible Chromium executable if needed. Generated assets are committed so the deployed app needs no runtime build or package installation. Fonts are embedded as WOFF2 data in the local CSS. License notices are stored alongside the generated assets.

When changing generated assets, update their versioned URLs and the service-worker cache version together.
