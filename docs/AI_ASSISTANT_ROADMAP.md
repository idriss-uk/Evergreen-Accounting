# Evergreen Accounting — AI Assistant Roadmap

Status: **planned, not enabled**. The receipt image OCR workflow uses local Tesseract.js and rule-based field extraction; it does not call an AI model or send receipt contents to an external provider.

## Proposed capabilities

1. **Receipt review assistant** — explain OCR ambiguities and suggest merchant/category/VAT handling, without silently editing records.
2. **Bookkeeping assistant** — answer questions about balances and reports using the current local ledger, with source-document references and visible calculations.
3. **Banking assistant** — explain potential reconciliations and suspicious duplicates; require explicit confirmation before matching or posting.
4. **Business insights** — cash-flow trends, aged debtors, expense anomalies, and forecasts, clearly distinguished from statutory tax calculations.
5. **UK compliance guidance** — plain-language explanations with links to authoritative HMRC guidance where available; never imply certified HMRC compliance or make filings automatically.

## Privacy, permissions, and architecture

- **Local-first default:** all accounting data stays on the user's device unless they explicitly enable a provider-backed assistant.
- **Secure proxy required:** never embed an AI provider secret/API key in HTML, PWA JavaScript, Android APK or the public repository. Use an authenticated backend with scoped credentials and rate limits.
- **User consent for cloud processing:** show which fields/document excerpts will be transmitted before any external AI request. Make the feature opt-in with controls to clear AI conversation history.
- **Minimum necessary data:** prefer redacted transaction summaries over uploading receipt images or full ledgers.
- **Review-before-posting:** AI responses are proposals, never automatic ledger edits, HMRC submissions, customer communications or bank transfers.
- **Provenance:** identify model-generated suggestions, retain user-approved changes, and keep a transaction audit trail.
- **Testing:** adversarial-input tests, numerical reconciliation checks, permissions tests, VAT edge cases, and usability tests with a non-technical user.

## Suggested sequence

1. Complete local receipt OCR and review flow, then browser/mobile acceptance testing.
2. Implement an assistant panel backed by a read-only local accounting context service.
3. Add an optional secure cloud AI provider behind explicit consent, with a real backend.
4. Add controlled actions with confirmation, audit and rollback safeguards.

Do not advertise the AI assistant as available until the backend and permission model are deployed and verified.
