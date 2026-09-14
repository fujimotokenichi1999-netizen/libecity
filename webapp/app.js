(() => {
  const DB = window.MealDB;

  const DEFAULT_MODEL = "claude-sonnet-5";
  const API_KEY_STORAGE_KEY = "mealApp.anthropicApiKey";
  const MODEL_STORAGE_KEY = "mealApp.anthropicModel";

  const NUTRITION_PROMPT = `これは食事の写真です。写っている料理を分析し、1食分の栄養価を推定してください。
必ず次のキーだけを持つJSONオブジェクトのみを出力してください。説明文やマークダウンは不要です。

{
  "dish_name": "料理名(日本語、不明な場合は「不明」)",
  "calories_kcal": 推定カロリー(数値、kcal),
  "protein_g": 推定タンパク質量(数値、g),
  "fat_g": 推定脂質量(数値、g),
  "carbs_g": 推定炭水化物量(数値、g),
  "sodium_mg": 推定塩分(ナトリウム)量(数値、mg),
  "notes": "推定の前提や補足(任意、簡潔に)"
}

数値は全て概算でよいので、必ず数値(null不可)を入れてください。`;

  // ---------- 共通ユーティリティ ----------

  function toDateInputValue(date) {
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function formatNumber(value) {
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
  }

  // ---------- 設定(APIキー・モデル) ----------

  function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || "";
  }

  function getModel() {
    return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL;
  }

  function initSettings() {
    const modal = document.getElementById("settingsModal");
    const form = document.getElementById("settingsForm");
    const apiKeyInput = document.getElementById("apiKeyInput");
    const modelInput = document.getElementById("modelInput");

    function open() {
      apiKeyInput.value = getApiKey();
      modelInput.value = getModel();
      modal.classList.remove("hidden");
    }
    function close() {
      modal.classList.add("hidden");
    }

    document.getElementById("settingsBtn").addEventListener("click", () => {
      document.getElementById("menuSheet").classList.add("hidden");
      open();
    });
    document.getElementById("settingsClose").addEventListener("click", close);
    modal.querySelector(".modal-backdrop").addEventListener("click", close);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.value.trim());
      localStorage.setItem(MODEL_STORAGE_KEY, modelInput.value.trim() || DEFAULT_MODEL);
      close();
      showToast("設定を保存しました");
    });
  }

  // ---------- メニュー(設定/エクスポート/インポート) ----------

  function initMenu() {
    const menuBtn = document.getElementById("menuBtn");
    const sheet = document.getElementById("menuSheet");
    const closeBtn = document.getElementById("closeMenuBtn");
    const exportBtn = document.getElementById("exportBtn");
    const importFile = document.getElementById("importFile");

    menuBtn.addEventListener("click", () => sheet.classList.toggle("hidden"));
    closeBtn.addEventListener("click", () => sheet.classList.add("hidden"));

    exportBtn.addEventListener("click", async () => {
      sheet.classList.add("hidden");
      try {
        const data = await DB.exportAll();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = toDateInputValue(new Date());
        a.href = url;
        a.download = `meal-log-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("エクスポートしました");
      } catch (e) {
        console.error(e);
        showToast("エクスポートに失敗しました");
      }
    });

    importFile.addEventListener("change", async () => {
      sheet.classList.add("hidden");
      const file = importFile.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importAll(data);
        await refreshAll();
        showToast("インポートしました");
      } catch (e) {
        console.error(e);
        showToast("インポートに失敗しました");
      } finally {
        importFile.value = "";
      }
    });
  }

  // ---------- AI解析(ブラウザからAnthropicへ直接送信) ----------

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function parseNutritionJson(text) {
    let stripped = text.trim();
    stripped = stripped.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

    const match = stripped.match(/\{[\s\S]*\}/);
    const candidate = match ? match[0] : stripped;

    let data;
    try {
      data = JSON.parse(candidate);
    } catch (e) {
      throw new Error("AIの応答をJSONとして解析できませんでした");
    }

    const required = ["dish_name", "calories_kcal", "protein_g", "fat_g", "carbs_g", "sodium_mg"];
    const missing = required.filter((k) => !(k in data));
    if (missing.length > 0) {
      throw new Error(`AIの応答に必要な項目がありません: ${missing.join(", ")}`);
    }
    return data;
  }

  async function analyzeMealImage(file) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error("設定画面でAnthropicのAPIキーを入力してください");
    }

    const base64 = await fileToBase64(file);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: file.type, data: base64 },
              },
              { type: "text", text: NUTRITION_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = body?.error?.message || `HTTP ${res.status}`;
      throw new Error(`AI解析に失敗しました: ${detail}`);
    }

    const body = await res.json();
    const text = (body.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return parseNutritionJson(text);
  }

  // ---------- 食事記録 ----------

  function initDatePicker() {
    const picker = document.getElementById("datePicker");
    picker.value = toDateInputValue(new Date());
    picker.addEventListener("change", refreshAll);
  }

  function initUpload() {
    const fileInput = document.getElementById("fileInput");
    const uploadLabel = document.getElementById("uploadLabel");
    const status = document.getElementById("uploadStatus");

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file) return;

      uploadLabel.textContent = "解析中... しばらくお待ちください";
      status.textContent = "";
      status.classList.remove("error");
      fileInput.disabled = true;

      try {
        const nutrition = await analyzeMealImage(file);
        const mealDate = document.getElementById("datePicker").value;

        await DB.add(DB.STORES.meals, {
          mealDate,
          recordedAt: new Date().toISOString(),
          dishName: nutrition.dish_name,
          caloriesKcal: Number(nutrition.calories_kcal) || 0,
          proteinG: Number(nutrition.protein_g) || 0,
          fatG: Number(nutrition.fat_g) || 0,
          carbsG: Number(nutrition.carbs_g) || 0,
          sodiumMg: Number(nutrition.sodium_mg) || 0,
          notes: nutrition.notes || "",
          imageBlob: file,
        });

        status.textContent = "記録しました";
        await refreshAll();
      } catch (e) {
        console.error(e);
        status.textContent = e.message || "アップロードに失敗しました";
        status.classList.add("error");
      } finally {
        uploadLabel.textContent = "📷 タップして食事の写真をアップロード";
        fileInput.disabled = false;
        fileInput.value = "";
      }
    });
  }

  const mealObjectUrls = new Map();

  async function renderMealList(mealDate) {
    const list = document.getElementById("mealList");
    mealObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    mealObjectUrls.clear();

    const meals = await DB.getByDate(DB.STORES.meals, mealDate);
    meals.sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));

    if (meals.length === 0) {
      list.innerHTML = '<div class="empty-state">この日の記録はまだありません</div>';
      return;
    }

    list.innerHTML = "";
    meals.forEach((meal) => {
      const url = meal.imageBlob ? URL.createObjectURL(meal.imageBlob) : "";
      if (url) mealObjectUrls.set(meal.id, url);

      const item = document.createElement("div");
      item.className = "record-item";
      item.innerHTML = `
        ${url ? `<img src="${url}" alt="${escapeHtml(meal.dishName || "")}" />` : ""}
        <div class="record-main">
          <div class="record-value">${escapeHtml(meal.dishName || "不明")}</div>
          <div class="record-nutrients">
            ${formatNumber(meal.caloriesKcal)} kcal ・
            P ${formatNumber(meal.proteinG)}g ・
            F ${formatNumber(meal.fatG)}g ・
            C ${formatNumber(meal.carbsG)}g ・
            塩分 ${formatNumber(meal.sodiumMg)}mg
          </div>
        </div>
        <button class="record-delete" aria-label="削除">🗑</button>
      `;
      item.querySelector(".record-delete").addEventListener("click", async () => {
        if (!confirm("この記録を削除しますか?")) return;
        await DB.remove(DB.STORES.meals, meal.id);
        await refreshAll();
      });
      list.appendChild(item);
    });
  }

  async function renderSummary(mealDate) {
    const grid = document.getElementById("summaryGrid");
    const meals = await DB.getByDate(DB.STORES.meals, mealDate);

    const total = (field) =>
      Math.round(meals.reduce((sum, m) => sum + (m[field] || 0), 0) * 10) / 10;

    const fields = [
      { key: "caloriesKcal", label: "カロリー(kcal)" },
      { key: "proteinG", label: "タンパク質(g)" },
      { key: "fatG", label: "脂質(g)" },
      { key: "carbsG", label: "炭水化物(g)" },
      { key: "sodiumMg", label: "塩分(mg)" },
    ];

    grid.innerHTML = fields
      .map(
        (f) => `
        <div class="summary-item">
          <div class="value">${formatNumber(total(f.key))}</div>
          <div class="label">${f.label}</div>
        </div>
      `
      )
      .join("");
  }

  async function refreshAll() {
    const mealDate = document.getElementById("datePicker").value;
    await Promise.all([renderSummary(mealDate), renderMealList(mealDate)]);
  }

  // ---------- Service Worker ----------

  function initServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch((err) => {
          console.warn("Service worker registration failed", err);
        });
      });
    }
  }

  // ---------- 初期化 ----------

  document.addEventListener("DOMContentLoaded", async () => {
    initDatePicker();
    initUpload();
    initMenu();
    initSettings();
    initServiceWorker();
    await refreshAll();
  });
})();
