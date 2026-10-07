(() => {
  'use strict';

  const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseAmount(value) {
    if (typeof value === 'number') return roundMoney(value);
    const text = String(value || '').trim();
    if (!text) return 0;
    const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
    const cleaned = text.replace(/[£$€,()\s]/g, '').replace(/,/g, '');
    const number = Number.parseFloat(cleaned);
    if (!Number.isFinite(number)) return 0;
    return roundMoney(negative ? -Math.abs(number) : number);
  }

  function detectDelimiter(text) {
    const firstLine = String(text || '').split(/\r?\n/).find((line) => line.trim()) || '';
    const counts = {
      ',': (firstLine.match(/,/g) || []).length,
      ';': (firstLine.match(/;/g) || []).length,
      '\t': (firstLine.match(/\t/g) || []).length
    };
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
  }

  function parseDelimitedLine(line, delimiter) {
    const values = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  function headerIndex(headers, candidates) {
    const normalized = headers.map(normalizeText);
    for (const candidate of candidates) {
      const index = normalized.findIndex((header) => header === candidate || header.includes(candidate));
      if (index >= 0) return index;
    }
    return -1;
  }

  function normalizeDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const uk = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (uk) {
      let day = uk[1], month = uk[2], year = uk[3];
      if (year.length === 2) year = Number(year) >= 70 ? '19' + year : '20' + year;
      return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
  }

  function parseCsv(text) {
    const delimiter = detectDelimiter(text);
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return [];

    const headers = parseDelimitedLine(lines[0], delimiter);
    const dateIdx = headerIndex(headers, ['date', 'transaction date', 'posting date', 'booked date']);
    const descIdx = headerIndex(headers, ['description', 'details', 'narrative', 'transaction', 'reference', 'merchant']);
    const amountIdx = headerIndex(headers, ['amount', 'transaction amount', 'value']);
    const debitIdx = headerIndex(headers, ['debit', 'money out', 'withdrawal', 'paid out']);
    const creditIdx = headerIndex(headers, ['credit', 'money in', 'deposit', 'paid in']);

    if (dateIdx < 0 || descIdx < 0 || (amountIdx < 0 && debitIdx < 0 && creditIdx < 0)) {
      throw new Error('CSV columns not recognised. Include Date, Description and Amount, or separate Debit/Credit columns.');
    }

    return lines.slice(1).map((line, index) => {
      const row = parseDelimitedLine(line, delimiter);
      let amount = amountIdx >= 0 ? parseAmount(row[amountIdx]) : 0;
      if (amountIdx < 0) {
        const credit = creditIdx >= 0 ? Math.abs(parseAmount(row[creditIdx])) : 0;
        const debit = debitIdx >= 0 ? Math.abs(parseAmount(row[debitIdx])) : 0;
        amount = roundMoney(credit - debit);
      }

      return {
        sourceRow: index + 2,
        date: normalizeDate(row[dateIdx]),
        description: String(row[descIdx] || '').trim(),
        amount
      };
    }).filter((row) => row.date && row.description && row.amount !== 0);
  }

  function fingerprint(tx) {
    return [normalizeDate(tx.date), normalizeText(tx.description), roundMoney(tx.amount).toFixed(2)].join('|');
  }

  function categorize(description, amount = 0) {
    const text = normalizeText(description);
    const rules = [
      { category: 'Bank Fees', terms: ['bank charge', 'bank fee', 'service charge', 'monthly fee'] },
      { category: 'Software & IT', terms: ['microsoft', 'google cloud', 'aws', 'amazon web services', 'adobe', 'openai', 'github', 'hosting', 'software'] },
      { category: 'Travel & Meals', terms: ['uber', 'trainline', 'rail', 'hotel', 'restaurant', 'cafe', 'taxi', 'fuel', 'petrol'] },
      { category: 'Rent & Utilities', terms: ['rent', 'electric', 'gas', 'water', 'utility', 'broadband', 'internet', 'telecom'] },
      { category: 'Advertising & Marketing', terms: ['facebook', 'meta', 'google ads', 'tiktok', 'advertising', 'marketing'] },
      { category: 'Office Supplies', terms: ['staples', 'office', 'stationery'] },
      { category: 'Tax & HMRC', terms: ['hmrc', 'vat payment', 'corporation tax', 'paye'] },
      { category: 'Payroll & Wages', terms: ['salary', 'payroll', 'wages'] },
      { category: 'Internal Transfer', terms: ['transfer', 'savings', 'reserve account'] }
    ];

    for (const rule of rules) {
      if (rule.terms.some((term) => text.includes(term))) return rule.category;
    }
    return amount >= 0 ? 'Sales / Other Income' : 'Uncategorised Expense';
  }

  function daysApart(a, b) {
    const da = new Date(normalizeDate(a) + 'T00:00:00');
    const db = new Date(normalizeDate(b) + 'T00:00:00');
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 9999;
    return Math.abs(Math.round((da - db) / 86400000));
  }

  function tokenOverlap(a, b) {
    const left = new Set(normalizeText(a).split(' ').filter((x) => x.length > 2));
    const right = new Set(normalizeText(b).split(' ').filter((x) => x.length > 2));
    if (!left.size || !right.size) return 0;
    let common = 0;
    left.forEach((token) => { if (right.has(token)) common++; });
    return common / Math.min(left.size, right.size);
  }

  function documentOutstanding(state, type, doc) {
    if (window.EvergreenPayments && (type === 'Invoice' || type === 'Bill')) {
      return window.EvergreenPayments.outstandingAmount(state, type, doc.id);
    }
    return doc.status === 'Paid' ? 0 : roundMoney(doc.totalGross);
  }

  function candidateScore(state, tx, type, doc) {
    const expectedDirection = type === 'Invoice' ? 1 : -1;
    if (Math.sign(tx.amount) !== expectedDirection) return null;

    const outstanding = documentOutstanding(state, type, doc);
    if (outstanding <= 0) return null;

    const absAmount = Math.abs(roundMoney(tx.amount));
    const amountDiff = Math.abs(absAmount - outstanding);
    const amountTolerance = Math.max(0.01, outstanding * 0.005);
    let score = 0;

    if (amountDiff <= 0.01) score += 60;
    else if (amountDiff <= amountTolerance) score += 50;
    else if (absAmount < outstanding && amountDiff <= outstanding * 0.75) score += 35;
    else return null;

    const reference = doc.invNo || doc.billNo || doc.id;
    const party = doc.customer || doc.supplier || '';
    const normalizedDescription = normalizeText(tx.description);
    if (reference && normalizedDescription.includes(normalizeText(reference))) score += 25;

    score += Math.round(tokenOverlap(tx.description, party) * 15);

    const age = daysApart(tx.date, doc.date);
    if (age <= 3) score += 10;
    else if (age <= 14) score += 7;
    else if (age <= 30) score += 4;

    return { type, id: doc.id, reference, party, outstanding, score: Math.min(100, score) };
  }

  function findBestMatch(state, tx) {
    const candidates = [];

    (state.invoices || []).filter((doc) => doc.type === 'Invoice').forEach((doc) => {
      const candidate = candidateScore(state, tx, 'Invoice', doc);
      if (candidate) candidates.push(candidate);
    });
    (state.bills || []).filter((doc) => doc.type === 'Bill').forEach((doc) => {
      const candidate = candidateScore(state, tx, 'Bill', doc);
      if (candidate) candidates.push(candidate);
    });

    return candidates.sort((a, b) => b.score - a.score)[0] || null;
  }

  function analyseTransaction(state, tx) {
    tx.category = tx.category || categorize(tx.description, tx.amount);
    if (tx.status === 'Matched' || tx.status === 'Duplicate') return tx;

    const match = findBestMatch(state, tx);
    if (match) {
      tx.suggestedType = match.type;
      tx.suggestedId = match.id;
      tx.suggestedReference = match.reference;
      tx.suggestedParty = match.party;
      tx.matchScore = match.score;
      tx.status = match.score >= 65 ? 'Suggested' : 'Unmatched';
    } else {
      tx.suggestedType = null;
      tx.suggestedId = null;
      tx.suggestedReference = null;
      tx.suggestedParty = null;
      tx.matchScore = 0;
      tx.status = 'Unmatched';
    }
    return tx;
  }

  function importRows(state, rows) {
    state.bankTransactions = Array.isArray(state.bankTransactions) ? state.bankTransactions : [];
    const existing = new Set(state.bankTransactions.map(fingerprint));
    const batch = new Set();
    let imported = 0;
    let duplicates = 0;

    rows.forEach((row) => {
      const fp = fingerprint(row);
      const duplicate = existing.has(fp) || batch.has(fp);

      if (duplicate) {
        duplicates++;
        return;
      }

      batch.add(fp);
      const tx = {
        id: 'BNK-' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '-' + imported,
        date: row.date,
        description: row.description,
        amount: roundMoney(row.amount),
        status: 'Unmatched',
        category: categorize(row.description, row.amount),
        matchedType: null,
        matchedId: null,
        matchScore: 0,
        fingerprint: fp,
        importedAt: new Date().toISOString()
      };
      analyseTransaction(state, tx);
      state.bankTransactions.unshift(tx);
      imported++;
    });

    return { imported, duplicates };
  }

  function applyMatch(state, tx, type, id) {
    const doc = type === 'Invoice'
      ? (state.invoices || []).find((item) => item.id === id)
      : (state.bills || []).find((item) => item.id === id);
    if (!doc) throw new Error('Suggested accounting document no longer exists');

    const outstanding = documentOutstanding(state, type, doc);
    const amount = Math.min(Math.abs(roundMoney(tx.amount)), outstanding);
    if (amount <= 0) throw new Error('Document has no outstanding balance');

    if (window.EvergreenPayments) {
      window.EvergreenPayments.recordPayment(state, {
        documentType: type,
        documentId: id,
        amount,
        date: tx.date,
        method: 'Bank Reconciliation',
        reference: tx.description
      });
    } else {
      doc.status = amount >= outstanding ? 'Paid' : 'Part Paid';
    }

    tx.status = 'Matched';
    tx.matchedType = type;
    tx.matchedId = id;
    tx.matchedAmount = amount;
    tx.matchedAt = new Date().toISOString();
    tx.suggestedType = null;
    tx.suggestedId = null;
    tx.suggestedReference = null;
    tx.suggestedParty = null;
    return tx;
  }

  function runAutoMatch(state) {
    let matched = 0;
    let suggested = 0;

    (state.bankTransactions || []).forEach((tx) => {
      if (tx.status === 'Matched' || tx.status === 'Duplicate') return;
      analyseTransaction(state, tx);

      if (tx.matchScore >= 85 && tx.suggestedType && tx.suggestedId) {
        applyMatch(state, tx, tx.suggestedType, tx.suggestedId);
        matched++;
      } else if (tx.status === 'Suggested') {
        suggested++;
      }
    });

    return { matched, suggested };
  }

  function acceptSuggestion(state, txId) {
    const tx = (state.bankTransactions || []).find((item) => item.id === txId);
    if (!tx || !tx.suggestedType || !tx.suggestedId) throw new Error('No suggested match is available');
    return applyMatch(state, tx, tx.suggestedType, tx.suggestedId);
  }

  function reconciliationSummary(state, openingBalance = 0) {
    const transactions = (state.bankTransactions || []).filter((tx) => tx.status !== 'Duplicate');
    const movement = roundMoney(transactions.reduce((sum, tx) => sum + roundMoney(tx.amount), 0));
    const matchedMovement = roundMoney(transactions.filter((tx) => tx.status === 'Matched').reduce((sum, tx) => sum + roundMoney(tx.amount), 0));
    const unmatchedMovement = roundMoney(movement - matchedMovement);

    return {
      openingBalance: roundMoney(openingBalance),
      movement,
      closingBalance: roundMoney(Number(openingBalance || 0) + movement),
      reconciledBalance: roundMoney(Number(openingBalance || 0) + matchedMovement),
      unmatchedMovement,
      matchedCount: transactions.filter((tx) => tx.status === 'Matched').length,
      unmatchedCount: transactions.filter((tx) => tx.status === 'Unmatched' || tx.status === 'Suggested').length,
      duplicateCount: (state.bankTransactions || []).filter((tx) => tx.status === 'Duplicate').length
    };
  }

  window.EvergreenBanking = Object.freeze({
    parseAmount,
    parseCsv,
    fingerprint,
    categorize,
    findBestMatch,
    analyseTransaction,
    importRows,
    runAutoMatch,
    acceptSuggestion,
    reconciliationSummary
  });
})();