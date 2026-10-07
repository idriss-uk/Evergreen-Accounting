(() => {
  'use strict';

  const DB_NAME = 'evergreen-accounting';
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = 'snapshots';
  const ENTITY_STORES = [
    'customers',
    'suppliers',
    'invoices',
    'bills',
    'expenses',
    'payments',
    'bankTransactions',
    'vatReturns',
    'ledgerEntries',
    'cisRecords'
  ];

  function indexedDbAvailable() {
    return typeof window !== 'undefined' && 'indexedDB' in window;
  }

  function openDatabase() {
    if (!indexedDbAvailable()) return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
        }

        ENTITY_STORES.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to open Evergreen IndexedDB'));
    });
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function loadSnapshot() {
    const db = await openDatabase();
    if (!db) return null;

    try {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const record = await requestAsPromise(tx.objectStore(SNAPSHOT_STORE).get('current'));
      return record?.state || null;
    } finally {
      db.close();
    }
  }

  async function persistEntityStores(db, state) {
    const tx = db.transaction(ENTITY_STORES, 'readwrite');

    ENTITY_STORES.forEach((storeName) => {
      const store = tx.objectStore(storeName);
      store.clear();

      const records = Array.isArray(state[storeName]) ? state[storeName] : [];
      records.forEach((record, index) => {
        const safeRecord = {
          ...record,
          id: record.id || `${storeName.toUpperCase()}-${Date.now()}-${index}`
        };
        store.put(safeRecord);
      });
    });

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Evergreen entity persistence aborted'));
    });
  }

  async function saveSnapshot(inputState) {
    const normalizer = window.EvergreenState?.normalize || ((value) => value);
    const state = normalizer(inputState);
    const db = await openDatabase();
    if (!db) return false;

    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
        tx.objectStore(SNAPSHOT_STORE).put({
          id: 'current',
          schemaVersion: window.EvergreenState?.SCHEMA_VERSION || 1,
          savedAt: new Date().toISOString(),
          state
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Evergreen snapshot persistence aborted'));
      });

      await persistEntityStores(db, state);
      return true;
    } finally {
      db.close();
    }
  }

  async function clearDatabase() {
    if (!indexedDbAvailable()) return false;
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Evergreen database deletion is blocked by another open tab'));
    });
    return true;
  }

  window.EvergreenStorage = Object.freeze({
    DB_NAME,
    DB_VERSION,
    ENTITY_STORES: [...ENTITY_STORES],
    indexedDbAvailable,
    loadSnapshot,
    saveSnapshot,
    clearDatabase
  });
})();