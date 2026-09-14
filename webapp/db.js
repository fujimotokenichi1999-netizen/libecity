// IndexedDBの薄いラッパー。食事記録(画像+栄養価)を1ストアで扱う。
const DB_NAME = "meal-log-db";
const DB_VERSION = 1;

const STORES = {
  meals: "meals",
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.meals)) {
        const s = db.createObjectStore(STORES.meals, {
          keyPath: "id",
          autoIncrement: true,
        });
        s.createIndex("byMealDate", "mealDate");
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

async function remove(storeName, id) {
  const { store } = await tx(storeName, "readwrite");
  return requestToPromise(store.delete(id));
}

async function getAll(storeName) {
  const { store } = await tx(storeName, "readonly");
  return requestToPromise(store.getAll());
}

async function getByDate(storeName, mealDate) {
  const { store } = await tx(storeName, "readonly");
  const index = store.index("byMealDate");
  return requestToPromise(index.getAll(mealDate));
}

async function exportAll() {
  const meals = await getAll(STORES.meals);
  const mealsSerialized = await Promise.all(
    meals.map(async (rec) => ({
      ...rec,
      imageBlob: undefined,
      imageDataUrl: await blobToDataUrl(rec.imageBlob),
    }))
  );
  return {
    exportedAt: new Date().toISOString(),
    version: DB_VERSION,
    meals: mealsSerialized,
  };
}

async function importAll(data) {
  if (!data || typeof data !== "object") throw new Error("不正なデータです");
  const tasks = [];
  for (const rec of data.meals || []) {
    const { id, imageDataUrl, ...rest } = rec;
    const imageBlob = imageDataUrl ? await dataUrlToBlob(imageDataUrl) : null;
    tasks.push(add(STORES.meals, { ...rest, imageBlob }));
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

window.MealDB = {
  STORES,
  add,
  remove,
  getAll,
  getByDate,
  exportAll,
  importAll,
};
