// IndexedDBの薄いラッパー。血圧・体重・血液検査画像の3ストアを扱う。
const DB_NAME = "health-log-db";
const DB_VERSION = 1;

const STORES = {
  bloodPressure: "bloodPressure",
  weight: "weight",
  labImages: "labImages",
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.bloodPressure)) {
        const s = db.createObjectStore(STORES.bloodPressure, {
          keyPath: "id",
          autoIncrement: true,
        });
        s.createIndex("byDatetime", "datetime");
      }
      if (!db.objectStoreNames.contains(STORES.weight)) {
        const s = db.createObjectStore(STORES.weight, {
          keyPath: "id",
          autoIncrement: true,
        });
        s.createIndex("byDatetime", "datetime");
      }
      if (!db.objectStoreNames.contains(STORES.labImages)) {
        const s = db.createObjectStore(STORES.labImages, {
          keyPath: "id",
          autoIncrement: true,
        });
        s.createIndex("byYearMonth", "yearMonth");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        resolve({ store, transaction });
        transaction.onerror = () => reject(transaction.error);
      })
  );
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function add(storeName, record) {
  const { store } = await tx(storeName, "readwrite");
  return requestToPromise(store.add(record));
}

async function put(storeName, record) {
  const { store } = await tx(storeName, "readwrite");
  return requestToPromise(store.put(record));
}

async function remove(storeName, id) {
  const { store } = await tx(storeName, "readwrite");
  return requestToPromise(store.delete(id));
}

async function getAll(storeName) {
  const { store } = await tx(storeName, "readonly");
  return requestToPromise(store.getAll());
}

async function exportAll() {
  const [bloodPressure, weight, labImages] = await Promise.all([
    getAll(STORES.bloodPressure),
    getAll(STORES.weight),
    getAll(STORES.labImages),
  ]);
  const labImagesSerialized = await Promise.all(
    labImages.map(async (rec) => ({
      ...rec,
      blob: undefined,
      blobDataUrl: await blobToDataUrl(rec.blob),
    }))
  );
  return {
    exportedAt: new Date().toISOString(),
    version: DB_VERSION,
    bloodPressure,
    weight,
    labImages: labImagesSerialized,
  };
}

async function importAll(data) {
  if (!data || typeof data !== "object") throw new Error("不正なデータです");
  const tasks = [];
  for (const rec of data.bloodPressure || []) {
    const { id, ...rest } = rec;
    tasks.push(add(STORES.bloodPressure, rest));
  }
  for (const rec of data.weight || []) {
    const { id, ...rest } = rec;
    tasks.push(add(STORES.weight, rest));
  }
  for (const rec of data.labImages || []) {
    const { id, blobDataUrl, ...rest } = rec;
    const blob = blobDataUrl ? await dataUrlToBlob(blobDataUrl) : null;
    tasks.push(add(STORES.labImages, { ...rest, blob }));
  }
  await Promise.all(tasks);
}

function blobToDataUrl(blob) {
  if (!blob) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

window.HealthDB = {
  STORES,
  add,
  put,
  remove,
  getAll,
  exportAll,
  importAll,
};
