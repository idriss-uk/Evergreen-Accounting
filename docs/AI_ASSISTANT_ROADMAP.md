# Evergreen Accounting — AI Assistant Roadmap

V5.7 provides a **local, rule-based, read-only Business Assistant**. It is available in AI Assistant and makes no generative AI requests. See [supported questions, calculation sources and limitations](business-assistant-v5.7.md). Local receipt OCR remains a separate workflow.

## Future secure generative provider

Keep financial access, deterministic calculations, interpretation, response formatting and UI separate. Preserve the local engine as the default/offline provider. A later provider should consume a versioned request/response contract (`question`, a minimal validated financial summary, source IDs, period, formatted answer and follow-ups). Do not give it `appState`, receipt images or write functions. `EvergreenAssistant.answer` is the current local adapter boundary; there is intentionally no remote transport or configurable browser endpoint today.

Before enabling a provider:

1. Deploy an authenticated HTTPS backend that keeps provider credentials in a server-side secret store. Use scoped authorization, rate limits and request-size limits. Never put keys in HTML, PWA JavaScript, an Android APK or the public repository.
2. Obtain explicit opt-in consent for each data-sharing scope. Show the destination, fields and retention policy before sending. Minimise/redact customer identities, omit receipt contents by default and allow immediate withdrawal. Local queries remain available without consent.
3. Keep deterministic accounting calculations authoritative. A model may interpret questions and explain precomputed figures; it must not invent totals or recompute tax liabilities. Validate response schema, figures, currency, periods and source references against the local result. Reject inconsistent output and fall back to the local engine.
4. Treat question text, document descriptions, receipts and names as untrusted content. Separate them from system policy. Expose an allowlisted read-only query tool contract, with no mutation, email, payment, HMRC, arbitrary URL or shell capabilities. Enforce read-only permissions on the server as well as the browser.
5. Return plain structured text; render it with safe DOM APIs. Do not execute provider instructions or arbitrary markup. Handle timeouts, quota failures, revoked consent and offline fallback. Do not permanently store conversations by default; define deletion and retention controls for any later server history.
6. Add numerical reconciliation, adversarial prompt/content, authorization, consent-revocation, redaction, no-write, no-unapproved-egress, retention and fallback tests before release. Review privacy terms and UK data handling with the intended provider.

Forecasts, tax advice and actions are outside Phase 1. Any later action workflow needs a separate permission model, explicit review, audit, rollback and new tests; a generative integration must not silently gain transaction-posting rights.
