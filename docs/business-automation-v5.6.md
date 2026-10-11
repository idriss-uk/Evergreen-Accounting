# V5.6 Business Automation

Open **Automation** in the workspace (or **Business Automation** in the mobile section menu).

## Recurring invoices

Create a template from an existing sales invoice. The template stores its own copy of the customer and line items; changing or deleting the source invoice does not rewrite the template. Payments, receipts, bank links and invoice payment status are not copied. Creating a template does not create a financial transaction.

Choose weekly, monthly, quarterly or annual frequency, a first scheduled date and payment terms of 0–365 days. The list shows the next scheduled date and lets you pause or resume. Month and year schedules keep the original day where possible, using the last valid day in shorter months. For example, 31 January → 28/29 February → 31 March; an annual 29 February schedule returns to 29 February in a leap year.

When a date is due, select **Review & generate**. Check customer, line items, VAT, net/gross amounts, invoice date and due date. **Generate reviewed invoice** creates one unpaid invoice through the same calculation and journal-posting engine as the manual invoice form. No payment is assumed. When several periods were missed, review each period separately. Future periods cannot be generated early. Pausing keeps the next scheduled date; resuming does not silently skip missed periods.

The template records generated dates independently of invoice records. Stale reviews, existing document references and previously generated dates are rejected. Deleting an invoice does not authorize regeneration of the same cycle. A failed local save rolls back the new invoice, journal and schedule advancement. Automation changes use a browser lock where available and reject stale saved-state revisions from other tabs; reload when prompted. Use one active editing tab for the application as a whole; the existing manual transaction workflows do not implement cross-device synchronization.

## Overdue payments and reminders

The dashboard lists overdue invoices, customer names, outstanding balances after recorded payments, due dates and days overdue, plus totals. It excludes fully paid invoices, credit notes, invoices due today and invoices without an explicit due date. Set due dates on the manual invoice form or use **Save invoice due date** for existing invoices. Due dates affect follow-up only; invoice amounts, payments and journals are not recalculated. Older invoices are not assigned an assumed due date.

Select **Edit reminder** to prepare a message from the current outstanding balance. Edit it, save a local draft and copy it into your own email or messaging app. **Refresh from current balance** replaces the editor text with a fresh suggested message; save it if you want to keep it. Saved drafts are intentionally retained verbatim, so review them after payments. Evergreen never sends emails or messages. If the browser blocks clipboard access, the message is selected for manual copying.

## Local data and scheduling

Templates, generated-cycle history, due dates and reminder drafts are included in the existing complete local snapshot and checksum-protected JSON backup. Receipt attachment storage and hydration remain unchanged. Keep regular verified backups; restoring a backup restores the schedule history as of that backup. Older versions of Evergreen do not provide these controls.

All controls work offline after installation of the updated application shell. Scheduling follows this device's calendar date. Opening Evergreen does not generate invoices. **Automatic background processing requires a future server-side scheduler.** There is no background timer, email integration or cloud synchronization in this release.

## Validation

`npm test` runs the existing regressions plus schedule boundary, duplicate-generation, shared invoice rounding, overdue partial-payment, balanced-journal and complete-backup preservation checks. `npm run test:browser` runs the full offline Playwright workflow plus template creation/pause/resume, invoice review/generation, failed-save rollback, due dates, reminder editing/copy/persistence, stale-tab protection and receipt preservation. Browser reloads wait for the latest committed IndexedDB revision. CI runs both suites with Node 22 and Playwright Chromium.
