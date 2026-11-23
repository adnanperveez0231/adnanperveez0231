/* IndexedDB persistence with an in-memory fallback (e.g. private windows that block storage). */
BS.db = (function () {
  const NAME = 'book-studio';
  const STORES = ['books', 'versions', 'snapshots', 'backups', 'meta'];
  let dbp = null;
  let memory = null; // Map per store when IndexedDB is unavailable

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('books', { keyPath: 'id' });
        const v = d.createObjectStore('versions', { keyPath: 'id' });
        v.createIndex('section', 'sectionId');
        v.createIndex('book', 'bookId');
        const s = d.createObjectStore('snapshots', { keyPath: 'id' });
        s.createIndex('book', 'bookId');
        d.createObjectStore('backups', { keyPath: 'id' });
        d.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database blocked by another tab'));
    }).catch((e) => {
      console.warn('IndexedDB unavailable, using memory only', e);
      memory = {};
      STORES.forEach((s) => (memory[s] = new Map()));
      return null;
    });
    return dbp;
  }

  async function run(store, mode, fn) {
    const d = await open();
    if (!d) return fn(null);
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const s = tx.objectStore(store);
      let out;
      const r = fn(s);
      if (r && typeof r === 'object' && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  const keyOf = (store, val, key) => key !== undefined ? key : val.id;

  return {
    isMemory: () => !!memory,
    ready: open,
    get: (store, key) => run(store, 'readonly', (s) => s ? s.get(key) : memory[store].get(key)),
    put: (store, val, key) => run(store, 'readwrite', (s) => {
      if (!s) { memory[store].set(keyOf(store, val, key), val); return; }
      return key === undefined ? s.put(val) : s.put(val, key);
    }),
    putMany: (store, vals) => run(store, 'readwrite', (s) => {
      vals.forEach((v) => (s ? s.put(v) : memory[store].set(v.id, v)));
    }),
    del: (store, key) => run(store, 'readwrite', (s) => s ? s.delete(key) : memory[store].delete(key)),
    all: (store) => run(store, 'readonly', (s) => s ? s.getAll() : [...memory[store].values()]).then((r) => r || []),
    byIndex: (store, index, value) => run(store, 'readonly', (s) => s ? s.index(index).getAll(value) : null)
      .then((r) => r || (memory ? [...memory[store].values()].filter((v) => v[index === 'section' ? 'sectionId' : 'bookId'] === value) : [])),
    delByIndex: (store, index, value) => run(store, 'readwrite', (s) => {
      if (!s) {
        const f = index === 'section' ? 'sectionId' : 'bookId';
        for (const [k, v] of memory[store]) if (v[f] === value) memory[store].delete(k);
        return;
      }
      const req = s.index(index).openKeyCursor(IDBKeyRange.only(value));
      req.onsuccess = () => {
        const c = req.result;
        if (c) { s.delete(c.primaryKey); c.continue(); }
      };
    })
  };
})();
