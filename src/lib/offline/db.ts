// A very small promise wrapper around IndexedDB. We avoid a dependency
// because we only need two stores: a read cache and a durable write outbox.
//
// Everything degrades gracefully: if IndexedDB is unavailable (private mode,
// old browser, SSR) the helpers resolve to null / no-op rather than throwing,
// so a feature that uses the cache still works, just without persistence.

const DB_NAME = "cj-offline";
const DB_VERSION = 2;

export const STORE_CACHE = "cache";
export const STORE_OUTBOX = "outbox";
export const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        db.createObjectStore(STORE_CACHE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const store = db.createObjectStore(STORE_OUTBOX, { keyPath: "id" });
        store.createIndex("byCreated", "created_at");
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // A newer tab upgraded the schema; close so it is not blocked.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export function db(): Promise<IDBDatabase | null> {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return db().then(
    (database) =>
      new Promise<T | null>((resolve) => {
        if (!database) {
          resolve(null);
          return;
        }
        let request: IDBRequest;
        try {
          const tx = database.transaction(store, mode);
          request = work(tx.objectStore(store));
        } catch {
          resolve(null);
          return;
        }
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => resolve(null);
      }),
  );
}

export function idbGet<T>(store: string, key: string): Promise<T | null> {
  return run<T>(store, "readonly", (s) => s.get(key));
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll()).then((rows) => rows ?? []);
}

export function idbPut(store: string, value: unknown): Promise<unknown> {
  return run(store, "readwrite", (s) => s.put(value));
}

export function idbDelete(store: string, key: string): Promise<unknown> {
  return run(store, "readwrite", (s) => s.delete(key));
}

export function idbClear(store: string): Promise<unknown> {
  return run(store, "readwrite", (s) => s.clear());
}

/** Wipe every offline trace. Used when a device signs out. */
export async function idbWipe(): Promise<void> {
  await Promise.all([idbClear(STORE_CACHE), idbClear(STORE_OUTBOX), idbClear(STORE_META)]);
}
