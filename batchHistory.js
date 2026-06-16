// IndexedDB persistence for completed batch downloads (ZIP and single merged .md).
const BATCH_HISTORY_DB_NAME = 'deepwiki-batch-history';
const BATCH_HISTORY_DB_VERSION = 1;
const BATCH_HISTORY_STORE = 'archives';
const BATCH_HISTORY_MAX_ENTRIES = 5;
const BATCH_HISTORY_MAX_BYTES = 80 * 1024 * 1024;

const batchHistory = {
  _dbPromise: null,

  _openDb() {
    if (!this._dbPromise) {
      this._dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(BATCH_HISTORY_DB_NAME, BATCH_HISTORY_DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(BATCH_HISTORY_STORE)) {
            const store = db.createObjectStore(BATCH_HISTORY_STORE, { keyPath: 'id' });
            store.createIndex('completedAt', 'completedAt', { unique: false });
          }
        };
      });
    }
    return this._dbPromise;
  },

  _runTransaction(mode, fn) {
    return this._openDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(BATCH_HISTORY_STORE, mode);
      const store = tx.objectStore(BATCH_HISTORY_STORE);
      let opResult;
      try {
        opResult = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      Promise.resolve(opResult).then(
        result => {
          tx.oncomplete = () => resolve(result);
        },
        reject
      );
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  },

  _requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  _payloadToArrayBuffer(payload) {
    if (payload instanceof ArrayBuffer) {
      return payload;
    }
    if (payload instanceof Blob) {
      return payload.arrayBuffer();
    }
    throw new Error('Unsupported payload type for batch history.');
  },

  async save(entry) {
    const payloadBuffer = await this._payloadToArrayBuffer(entry.payload);
    const sizeBytes = payloadBuffer.byteLength;

    if (sizeBytes > BATCH_HISTORY_MAX_BYTES) {
      const err = new Error('Archive too large to keep in history.');
      err.code = 'TOO_LARGE';
      throw err;
    }

    const record = {
      id: crypto.randomUUID(),
      type: entry.type,
      filename: entry.filename,
      label: entry.label || entry.filename,
      completedAt: new Date().toISOString(),
      pageCount: entry.pageCount ?? 0,
      processed: entry.processed ?? 0,
      failed: entry.failed ?? 0,
      sizeBytes,
      payload: payloadBuffer
    };

    await this._runTransaction('readwrite', store => store.put(record));
    await this._evictOldestIfNeeded();
    return record.id;
  },

  async _evictOldestIfNeeded() {
    const entries = await this.list();
    if (entries.length <= BATCH_HISTORY_MAX_ENTRIES) {
      return;
    }
    const sorted = [...entries].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
    const toRemove = sorted.slice(0, entries.length - BATCH_HISTORY_MAX_ENTRIES);
    for (const entry of toRemove) {
      await this.remove(entry.id);
    }
  },

  async list() {
    const records = await this._runTransaction('readonly', store =>
      this._requestToPromise(store.getAll())
    );
    return records
      .map(({ payload, ...meta }) => meta)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  },

  async get(id) {
    return this._runTransaction('readonly', store =>
      this._requestToPromise(store.get(id))
    );
  },

  async remove(id) {
    await this._runTransaction('readwrite', store => store.delete(id));
  },

  async clear() {
    await this._runTransaction('readwrite', store => store.clear());
  }
};
