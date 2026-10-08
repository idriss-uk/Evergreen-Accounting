# Cash on Hand and Cash Ledger
Cash on Hand sits between Expenses & Receipts and Bank Recon in desktop navigation and is available through More on mobile.

## Record the source
- Opening cash balance: cash already held before the first cash transaction. One active opening balance is permitted; the journal credits 3000 Owner Capital / Opening Equity.
- Bank withdrawal to cash: debit 1010 Cash / Petty Cash, credit 1000 Bank.
- Cash deposit to bank: debit Bank, credit Cash.
- Owner capital introduced: debit Cash, credit 3000 Owner Capital / Opening Equity.
- Owner / director loan introduced: debit Cash, credit 2200 Owner / Director Loan.

These movements create balanced journals, with no sales or expense posting and no VAT. Select the actual source of the money. Opening cash is not a replacement for a withdrawal or a receipt.

## Spending and receiving
Existing cash expenses and cash invoice/bill payments appear automatically from account 1010. Log Cash Expense preselects Cash. Create Cash Sale opens the existing invoice form with Cash selected; enter Payment received to record the receipt. For an existing invoice, record its payment in Sales with method Cash. Saving a cash expense or bank deposit below available cash warns and requires explicit confirmation.

Cash on hand today is the balance up to today; the ledger includes all dates unless filtered. From/To filters carry forward earlier movements into the opening balance. CSV includes opening, movements and closing balances. Funding and transfers show as money in/out in the Cash Ledger. Cash Flow excludes opening balances and internal transfers; matched bank rows for those transfers are also excluded. Trial Balance and Balance Sheet use the same ledger account.

## Bank reconciliation
After recording a withdrawal or deposit, use Match Existing on the corresponding bank row. The exact amount and direction must agree. Linking or unlinking does not add journals. Cash-paid purchases and customer receipts remain excluded from bank matching.

## Corrections and storage
Reverse a mistaken funding/transfer using the ledger's Reverse action; the original remains and an opposite journal is recorded today. Unlink any matched bank transfer first. Reversal of a reversal and repeated reversal are blocked. Correct expense entries using Expenses & Receipts.
Movements use the existing ledgerEntries store and are included in JSON backups/restores. No data store migration or cloud service is required. Persisted historical journals are preserved; this release does not silently rewrite old entries. OCR and cloud syncing remain deferred.

## Validation
Core regression coverage includes the £200 withdrawal / £174 expense / £26 closing example, balanced reports, opening balances, capital, loans, deposits, date filtering, cash sales, transfer linking without reposting, reversals, validation and restored-state normalization. Offline Chromium checks cover cash funding and spending through the UI, refresh persistence, transfer linking, cash-sale shortcut, declined overspending and failed-save rollback.
