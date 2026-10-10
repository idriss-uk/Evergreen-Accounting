# Evergreen Accounting — Data Protection and Recovery (V5.5)

## Important: where your records live

Evergreen is currently a **local-first** application. Records are saved inside the browser on the device where they were entered. A GitHub Pages website is **not a cloud backup of your invoices or receipts**. Using a different browser, replacing your phone, clearing site data, or uninstalling the browser may remove access to those locally saved records.

## How to make a backup

1. Open **Settings & Audit**.
2. Choose **Download Verified Backup with Receipts (.json)**.
3. Keep the downloaded JSON file in at least two secure places, such as an encrypted external drive and a secure cloud folder you control.
4. Repeat after significant changes or at the end of each business day.

Backups are plain **unencrypted JSON** and may include business contact details, invoices, accounting records, and receipt images. Do not share them publicly, attach them to GitHub issues, or commit them to a public repository.

The V5.5 backup includes a **SHA-256 file-content checksum** that detects accidental alteration or damage to the accounting-data section of the backup. It does **not** encrypt, authenticate, or sign the backup.

## How to restore

1. Before restoring, export a backup of your **current** records if possible.
2. Open **Settings & Audit → Restore Backup**.
3. Select a previously downloaded backup JSON.
4. Evergreen validates the JSON structure and, for V5.5 backups, checks the checksum.
5. Confirm the replacement. The previous records on that device will be overwritten with the contents of the selected backup.

Older Evergreen JSON exports are still accepted after a warning, but they do not have a checksum. Incomplete exports referencing receipt files without the receipt contents are rejected.

## Accounting health checks

Choose **Run Accounting Data Health Check** in Settings. This performs **non-destructive** checks of record IDs, gross amount consistency, payment references, journal balance, trial balance, and balance sheet totals when available. Problems are displayed for review; the checker does not silently alter your books.

These tests are basic software integrity checks. They do not constitute an external audit, accounting assurance, validated financial statements, Making Tax Digital compliance, or tax advice.

## HMRC status

Evergreen currently provides a **VAT calculation preview**, not an HMRC-connected filing service. VAT schemes, period boundaries and complex adjustments have not been verified. No live HMRC VAT submission is performed and no official acknowledgement is available.

## Before commercial release

- Browser crash, quota exhaustion, and backup/restore tests on Android and desktop
- Simultaneous-tab editing protections and backup/restore conflict handling
- Financial period locking, immutable audit history, reconciliations and proper reversal entries
- Third-party accounting review of VAT and tax calculations
- Secure opt-in cloud sync and end-to-end data-restoration tests
- Confirmation of GitHub Actions test success and production browser checks
