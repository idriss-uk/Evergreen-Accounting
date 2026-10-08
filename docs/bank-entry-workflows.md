# Bank entries and recorded-item matching

Bank Recon now supports three distinct operations:

* **Choose Match** settles an outstanding invoice or supplier bill by recording a payment.
* **Record Sale / Record Expense** creates a new accounting document from a bank row, then reconciles that row.
* **Match Existing** links an already-recorded payment or expense. It creates no additional document, payment or journal entry.

Incoming bank rows can create a paid sales invoice. Its one line uses the entered customer, description, invoice reference and gross-inclusive VAT calculation. The invoice and payment journals are posted once. Outgoing rows can create a paid bank-transfer expense with an optional receipt. The existing local photo resizing, receipt storage and backup paths are reused. VAT defaults to zero until the user selects the applicable receipt/invoice rate. The bank amount remains the gross total.

Existing-item links require the same complete amount and direction. The list shows payment/expense references, parties, dates and methods for review. A recorded item can be linked to only one bank row. Legacy bank-generated payments are also checked against older reconciled rows before being offered again. Partial payments are linked individually at their recorded payment amounts, not at the invoice's remaining balance.

Smart Match sends plausible already-recorded payments/expenses to review rather than posting another payment against an outstanding balance. Creating a separate new entry requires acknowledgement when a plausible recorded item exists.

An **Unlink** action removes only an existing-item link and preserves the underlying accounting amounts and receipt. Newly created bank documents cannot be removed through this link-only action. Linked documents are protected against deletion, and linked expenses must keep their gross amount unchanged. Corrections that retain the gross amount, notes and receipt replacement remain available. Deleting an unlinked invoice/bill also removes its associated payment journals.

Creation uses a working copy, and persistence failures restore the previous state. Links and their audit metadata survive local saves, refresh and complete backups. No existing browser records are automatically migrated into new bank entries.

This version supports one bank row to one whole recorded item. Splitting/aggregating payments, processor payout fees, transfers, refunds and bank account selection require their own workflows. Categories alone remain labels until a document is recorded. OCR and cloud syncing remain deferred.

Validation included Node regression checks for bank creation, VAT and balanced journals; existing full/partial payment and expense links; duplicate/direction/amount rejection; legacy protection; unlinking; linked-document safeguards; and atomic failure. A fresh headless Chrome session with network disabled exercised both creation forms, receipt upload, existing-payment and expense links, unlink/relink, simulated failed-save rollback, refresh persistence and balanced reports. The original accounting/storage regression suites continued to pass.

Run `npm test` and `npm run test:browser` to repeat the checks.
