# Receipt sizing and local storage

Photos in JPG, PNG or WEBP format up to 20 MB are processed locally. Photos over 2 MB or over 2000 pixels on their longest side are resized to JPEG. Smaller images retain their original data. Output is limited to 2 MB. PDFs are unchanged and limited to 2 MB. The form shows Resized and ready when a photo has been optimized. Review readability in View Receipt before discarding the original. Metadata retains original filename, size and dimensions.

The IndexedDB database is upgraded to version 2 with a dedicated receipts store. Snapshot, receipts and accounting entities commit in one transaction. Browser fallback records contain references only after the full save succeeds. Existing inline receipt data is migrated on opening the app. Receipt replacement and deletion clean up the current receipt record. Data remains local to the browser/device.

All save flows now wait for persistence. If IndexedDB is unavailable, the app attempts a complete localStorage save, including receipt files. If both fail, it restores the last saved state and reports failure. Startup selects the newest durable snapshot or fallback using a monotonic save revision. Missing receipt records stop loading with an error instead of replacing data with demo records. Other Evergreen tabs should be closed during the first upgrade.

JSON backups contain complete inline receipt files and can be restored on another device. Export uses a temporary downloadable Blob rather than a large data URL. Restore validates the backup, waits for completion and then reloads. Restore still replaces the destination database, rather than merging it. Invalid or incomplete backups preserve the current records.

Validation: changed JavaScript and inline handlers parsed; storage tests cover migration, compact snapshots, receipt hydration, transaction failure, replacement, deletion, missing files and portable backup/restore. Additional simulated image checks cover resizing, PDF preservation, file limits and decode cleanup. Save integration checks cover primary/fallback selection, cache quota failures and rollback. Tests were executed using JavaScript adapters because the local command/browser runtime could not start. Native browser image encoding and IndexedDB still need desktop verification.

Run the stored regression checks with:

    node tests/expense-edit.test.cjs
    node tests/receipt-storage.test.cjs

OCR and cloud sync remain unavailable. Charts are skipped when the external chart library is unavailable, allowing the accounting lists to render offline.
