# Receipt automation and operational improvements (V5.4)

Expense capture now records payment method (company card or bank transfer), reference, notes, GBP currency and creation time. Receipt uploads accept JPG, PNG, WEBP and PDF up to 2 MB; mobile camera capture is available where supported by the device. Larger photos must be resized before upload. Attachments and metadata remain in local state and JSON backups. Save failures leave the form open and roll back the in-memory expense.

Categories include bank fees, insurance, repairs and other expenses. Suggestions use merchant history first, then keywords, and require explicit application. Potential duplicates prompt before saving. No placeholder receipt is created when no attachment is supplied.

OCR / AI extraction is NOT live. EvergreenReceipts.extractionRequest exposes a versioned request description and requires human review; no provider, network upload or extraction is invoked. Receipt metadata records extraction as not_available. Future providers must use explicit user consent before uploading documents and keep unreviewed output out of the ledger.

Validation performed with JavaScript runtime: all inline scripts and changed scripts parsed; eight functional checks plus save-flow integration and storage-failure rollback checks passed covering rounded VAT and balanced journals, exempt VAT, invalid amounts/dates, suggestions, duplicates, upload limits, backup metadata preservation and unavailable extraction. Form IDs, camera placement, core script integration and PWA shell inclusion checked. Existing state and ledger APIs preserved.

Live browser/mobile camera testing was unavailable because the local command runtime could not start. Device capture behavior and local storage capacity remain device dependent. Receipts count toward existing localStorage limits; back up regularly. Expenses remain paid business expenses; personal reimbursements and unpaid expenses need separate accounting workflows.
