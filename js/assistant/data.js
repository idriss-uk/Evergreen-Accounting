(() => {
  "use strict";
  const fields = {
    invoices: [
      "id",
      "type",
      "date",
      "dueDate",
      "invNo",
      "customer",
      "customerId",
      "totalNet",
      "totalVat",
      "totalGross",
      "status",
    ],
    bills: [
      "id",
      "type",
      "date",
      "dueDate",
      "billNo",
      "supplier",
      "supplierId",
      "totalNet",
      "totalVat",
      "totalGross",
      "status",
    ],
    expenses: [
      "id",
      "date",
      "merchant",
      "category",
      "netAmount",
      "vatAmount",
      "grossAmount",
      "payMethod",
    ],
    payments: [
      "id",
      "date",
      "documentType",
      "documentId",
      "amount",
      "direction",
      "method",
      "reference",
    ],
    bankTransactions: [
      "id",
      "date",
      "description",
      "amount",
      "status",
      "matchedId",
      "matchedType",
    ],
    ledgerEntries: [
      "id",
      "date",
      "sourceType",
      "sourceId",
      "description",
      "cashKind",
      "cashReference",
      "createdAt",
    ],
  };
  function validDate(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
    );
  }
  function freeze(value) {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function snapshot(source) {
    if (!source || typeof source !== "object")
      throw Error("Accounting records have not loaded yet.");
    const state = {},
      warnings = [];
    for (const [collection, keys] of Object.entries(fields)) {
      if (source[collection] != null && !Array.isArray(source[collection]))
        throw Error("Invalid accounting collection: " + collection);
      const seen = new Set();
      state[collection] = (source[collection] || []).map((row) => {
        if (!row || typeof row !== "object" || !row.id || seen.has(row.id))
          throw Error(
            "Missing or duplicate record reference in " +
              collection +
              ". Review Data Health.",
          );
        seen.add(row.id);
        if (!validDate(row.date))
          throw Error(
            "Missing or invalid date on " +
              row.id +
              ". The reporting period cannot be verified.",
          );
        const copy = {};
        for (const key of keys)
          if (row[key] !== undefined)
            copy[key] = JSON.parse(JSON.stringify(row[key]));
        if (collection === "ledgerEntries") {
          if (!Array.isArray(row.lines) || !row.lines.length)
            throw Error("Missing journal lines on " + row.id);
          copy.lines = row.lines.map((line) => ({
            account: line.account,
            debit: line.debit,
            credit: line.credit,
            memo: String(line.memo || ""),
          }));
          if (
            copy.lines.some(
              (line) =>
                typeof line.account !== "string" ||
                !Number.isFinite(line.debit) ||
                !Number.isFinite(line.credit) ||
                line.debit < 0 ||
                line.credit < 0 ||
                (line.debit > 0 && line.credit > 0),
            )
          )
            throw Error("Invalid journal amounts on " + row.id);
          const totals = window.EvergreenLedger.getTotals(copy);
          if (totals.debit !== totals.credit)
            throw Error(
              "Unbalanced journal " + row.id + ". Review Data Health.",
            );
        } else {
          const amounts =
            collection === "expenses"
              ? ["netAmount", "vatAmount", "grossAmount"]
              : ["invoices", "bills"].includes(collection)
                ? ["totalNet", "totalVat", "totalGross"]
                : ["amount"];
          if (
            amounts.some(
              (key) =>
                !Number.isFinite(copy[key]) ||
                (collection !== "bankTransactions" && copy[key] < 0),
            )
          )
            throw Error(
              "Missing or invalid amount on " +
                row.id +
                ". Figures cannot be verified.",
            );
          if (
            amounts.length === 3 &&
            window.EvergreenLedger.roundMoney(
              copy[amounts[0]] + copy[amounts[1]],
            ) !== window.EvergreenLedger.roundMoney(copy[amounts[2]])
          )
            throw Error(
              "Net plus VAT differs from gross on " +
                row.id +
                ". Review Data Health.",
            );
        }
        if (["invoices", "bills"].includes(collection)) {
          if (
            !(
              collection === "invoices"
                ? ["Invoice", "Credit Note"]
                : ["Bill", "Debit Note"]
            ).includes(copy.type)
          )
            throw Error("Unknown document type on " + row.id);
          if (copy.dueDate && !validDate(copy.dueDate))
            throw Error("Invalid due date on " + row.id);
          if (copy.type === "Invoice" && !copy.dueDate)
            warnings.push(
              "No due date on " +
                (copy.invNo || copy.id) +
                "; excluded from overdue counts.",
            );
          if (
            copy.status === "Paid" &&
            !(source.payments || []).some(
              (p) => p.documentType === copy.type && p.documentId === copy.id,
            )
          )
            warnings.push(
              "Legacy Paid status on " +
                copy.id +
                ": settlement date is unknown; balances use Evergreen’s recorded Paid status.",
            );
        }
        return copy;
      });
    }
    for (const p of state.payments) {
      if (p.amount <= 0)
        throw Error("Payment " + p.id + " must have a positive amount.");
      const docs =
        p.documentType === "Invoice"
          ? state.invoices
          : p.documentType === "Bill"
            ? state.bills
            : [];
      if (
        !docs.some(
          (doc) => doc.id === p.documentId && doc.type === p.documentType,
        )
      )
        throw Error(
          "Payment " +
            p.id +
            " has no supported source document. Review Data Health.",
        );
    }
    return freeze({ state, warnings });
  }
  // Projection only: excludes future settlements before calling existing payment reports.
  function asOf(state, to) {
    const result = {
      ...state,
      payments: state.payments.filter((p) => p.date <= to),
    };
    for (const collection of ["invoices", "bills"])
      result[collection] = state[collection]
        .filter((d) => d.date <= to)
        .map((d) => ({
          ...d,
          status: state.payments.some(
            (p) => p.documentId === d.id && p.documentType === d.type,
          )
            ? "Unpaid"
            : d.status,
        }));
    return result;
  }
  window.EvergreenAssistantData = Object.freeze({ snapshot, asOf, validDate });
})();
