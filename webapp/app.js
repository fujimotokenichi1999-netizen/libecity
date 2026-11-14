(() => {
  const DB = window.HealthDB;

  // ---------- 共通ユーティリティ ----------

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDatetimeLocalValue(date) {
    return (
      date.getFullYear() +
      "-" +
      pad2(date.getMonth() + 1) +
      "-" +
      pad2(date.getDate()) +
      "T" +
      pad2(date.getHours()) +
      ":" +
      pad2(date.getMinutes())
    );
  }

  function toDateInputValue(date) {
    return (
      date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
    );
  }

  function formatDatetime(iso) {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden"), 2200);
  }

  // ---------- 読み上げ(音声合成) ----------

  function safeStorageGet(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // 無視(プライベートブラウズ等でlocalStorageが使えない場合)
    }
  }

  function isTtsEnabled() {
    return safeStorageGet("ttsEnabled", "true") === "true";
  }

  function setTtsEnabled(enabled) {
    safeStorageSet("ttsEnabled", enabled ? "true" : "false");
  }

  function speak(text) {
    if (!isTtsEnabled()) return;
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "ja-JP";
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn("読み上げに失敗しました", e);
    }
  }

  function initTtsToggle() {
    const btn = document.getElementById("ttsToggleBtn");
    const render = () => {
      btn.textContent = `読み上げ: ${isTtsEnabled() ? "ON" : "OFF"}`;
    };
    render();
    btn.addEventListener("click", () => {
      setTtsEnabled(!isTtsEnabled());
      render();
    });
  }

  // ---------- CSVエクスポート ----------

  function csvEscape(value) {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function rowsToCsv(headers, rows) {
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach((row) => {
      lines.push(row.map(csvEscape).join(","));
    });
    return "﻿" + lines.join("\r\n") + "\r\n";
  }

  function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function exportBloodPressureCsv() {
    const stamp = toDateInputValue(new Date());
    const bpRecords = await DB.getAll(DB.STORES.bloodPressure);
    bpRecords.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const bpCsv = rowsToCsv(
      ["日時", "上(収縮期)", "下(拡張期)", "脈拍", "メモ"],
      bpRecords.map((r) => [
        formatDatetime(r.datetime),
        r.systolic,
        r.diastolic,
        r.pulse ?? "",
        r.memo ?? "",
      ])
    );
    downloadTextFile(`blood-pressure-${stamp}.csv`, bpCsv, "text/csv");
  }

  async function exportWeightCsv() {
    const stamp = toDateInputValue(new Date());
    const weightRecords = await DB.getAll(DB.STORES.weight);
    weightRecords.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    const weightCsv = rowsToCsv(
      ["日時", "体重(kg)", "メモ"],
      weightRecords.map((r) => [formatDatetime(r.datetime), r.weight, r.memo ?? ""])
    );
    downloadTextFile(`weight-${stamp}.csv`, weightCsv, "text/csv");
  }

  async function exportLabImagesCsv() {
    const stamp = toDateInputValue(new Date());
    const labRecords = await DB.getAll(DB.STORES.labImages);
    labRecords.sort((a, b) => new Date(a.date) - new Date(b.date));
    const labCsv = rowsToCsv(
      ["検査日", "ファイル名", "メモ"],
      labRecords.map((r) => [formatDate(r.date), r.fileName ?? "", r.memo ?? ""])
    );
    downloadTextFile(`lab-images-${stamp}.csv`, labCsv, "text/csv");
  }

  // ---------- タブ切り替え ----------

  function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document
          .querySelectorAll(".tab-panel")
          .forEach((p) => p.classList.remove("active"));
        document.getElementById(btn.dataset.tab).classList.add("active");
        if (btn.dataset.tab === "tab-graph") {
          drawBpChart();
          drawWeightChart();
        }
      });
    });
  }

  // ---------- メニュー(エクスポート/インポート) ----------

  function initMenu() {
    const menuBtn = document.getElementById("menuBtn");
    const sheet = document.getElementById("menuSheet");
    const closeBtn = document.getElementById("closeMenuBtn");
    const exportBtn = document.getElementById("exportBtn");
    const importFile = document.getElementById("importFile");

    menuBtn.addEventListener("click", () => sheet.classList.toggle("hidden"));
    closeBtn.addEventListener("click", () => sheet.classList.add("hidden"));

    const csvButtons = [
      [document.getElementById("exportCsvBpBtn"), exportBloodPressureCsv],
      [document.getElementById("exportCsvWeightBtn"), exportWeightCsv],
      [document.getElementById("exportCsvLabBtn"), exportLabImagesCsv],
    ];
    csvButtons.forEach(([btn, exportFn]) => {
      btn.addEventListener("click", async () => {
        sheet.classList.add("hidden");
        try {
          await exportFn();
          showToast("CSVをエクスポートしました");
        } catch (e) {
          console.error(e);
          showToast("CSVエクスポートに失敗しました");
        }
      });
    });

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
        a.download = `health-log-${stamp}.json`;
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

  // ---------- 血圧 ----------

  function initBpForm() {
    const form = document.getElementById("bpForm");
    document.getElementById("bpDatetime").value = toDatetimeLocalValue(new Date());

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const datetime = document.getElementById("bpDatetime").value;
      const systolic = Number(document.getElementById("bpSystolic").value);
      const diastolic = Number(document.getElementById("bpDiastolic").value);
      const pulseRaw = document.getElementById("bpPulse").value;
      const pulse = pulseRaw ? Number(pulseRaw) : null;
      const memo = document.getElementById("bpMemo").value.trim();

      if (!datetime || !systolic || !diastolic) {
        showToast("日時・上・下は必須です");
        return;
      }

      await DB.add(DB.STORES.bloodPressure, {
        datetime: new Date(datetime).toISOString(),
        systolic,
        diastolic,
        pulse,
        memo,
      });

      form.reset();
      document.getElementById("bpDatetime").value = toDatetimeLocalValue(new Date());
      showToast("血圧を記録しました");
      speak(bpSpeakText({ systolic, diastolic, pulse }));
      await renderBpList();
    });
  }

  function bpSpeakText(rec) {
    const pulseText = rec.pulse ? `、脈拍${rec.pulse}` : "";
    return `血圧、上${rec.systolic}、下${rec.diastolic}${pulseText}です`;
  }

  async function renderBpList() {
    const list = document.getElementById("bpList");
    const records = await DB.getAll(DB.STORES.bloodPressure);
    records.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    if (records.length === 0) {
      list.innerHTML = '<div class="empty-state">まだ記録がありません</div>';
      return;
    }

    list.innerHTML = "";
    records.forEach((rec) => {
      const item = document.createElement("div");
      item.className = "record-item";
      const pulseText = rec.pulse ? ` / 脈拍 ${rec.pulse}` : "";
      item.innerHTML = `
        <div class="record-main">
          <div class="record-value">${rec.systolic} / ${rec.diastolic}${pulseText}</div>
          <div class="record-date">${formatDatetime(rec.datetime)}</div>
          ${rec.memo ? `<div class="record-memo">${escapeHtml(rec.memo)}</div>` : ""}
        </div>
        <div class="record-actions">
          <button class="record-speak" aria-label="読み上げ">🔊</button>
          <button class="record-delete" aria-label="削除">🗑</button>
        </div>
      `;
      item.querySelector(".record-speak").addEventListener("click", () => {
        speak(bpSpeakText(rec));
      });
      item.querySelector(".record-delete").addEventListener("click", async () => {
        if (!confirm("この記録を削除しますか?")) return;
        await DB.remove(DB.STORES.bloodPressure, rec.id);
        await renderBpList();
      });
      list.appendChild(item);
    });
  }

  // ---------- 体重 ----------

  function initWeightForm() {
    const form = document.getElementById("weightForm");
    document.getElementById("weightDatetime").value = toDatetimeLocalValue(new Date());

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const datetime = document.getElementById("weightDatetime").value;
      const weight = Number(document.getElementById("weightValue").value);
      const memo = document.getElementById("weightMemo").value.trim();

      if (!datetime || !weight) {
        showToast("日時・体重は必須です");
        return;
      }

      await DB.add(DB.STORES.weight, {
        datetime: new Date(datetime).toISOString(),
        weight,
        memo,
      });

      form.reset();
      document.getElementById("weightDatetime").value = toDatetimeLocalValue(new Date());
      showToast("体重を記録しました");
      speak(weightSpeakText({ weight }));
      await renderWeightList();
    });
  }

  function weightSpeakText(rec) {
    return `体重 ${rec.weight} キログラムです`;
  }

  async function renderWeightList() {
    const list = document.getElementById("weightList");
    const records = await DB.getAll(DB.STORES.weight);
    records.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    if (records.length === 0) {
      list.innerHTML = '<div class="empty-state">まだ記録がありません</div>';
      return;
    }

    list.innerHTML = "";
    records.forEach((rec) => {
      const item = document.createElement("div");
      item.className = "record-item";
      item.innerHTML = `
        <div class="record-main">
          <div class="record-value">${rec.weight} kg</div>
          <div class="record-date">${formatDatetime(rec.datetime)}</div>
          ${rec.memo ? `<div class="record-memo">${escapeHtml(rec.memo)}</div>` : ""}
        </div>
        <div class="record-actions">
          <button class="record-speak" aria-label="読み上げ">🔊</button>
          <button class="record-delete" aria-label="削除">🗑</button>
        </div>
      `;
      item.querySelector(".record-speak").addEventListener("click", () => {
        speak(weightSpeakText(rec));
      });
      item.querySelector(".record-delete").addEventListener("click", async () => {
        if (!confirm("この記録を削除しますか?")) return;
        await DB.remove(DB.STORES.weight, rec.id);
        await renderWeightList();
      });
      list.appendChild(item);
    });
  }

  // ---------- 血液検査画像 ----------

  const labObjectUrls = new Map();

  function initLabForm() {
    const form = document.getElementById("labForm");
    document.getElementById("labDate").value = toDateInputValue(new Date());

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const dateVal = document.getElementById("labDate").value;
      const fileInput = document.getElementById("labFile");
      const memo = document.getElementById("labMemo").value.trim();
      const file = fileInput.files[0];

      if (!dateVal || !file) {
        showToast("検査日と画像は必須です");
        return;
      }

      const yearMonth = dateVal.slice(0, 7);

      await DB.add(DB.STORES.labImages, {
        date: new Date(dateVal + "T00:00:00").toISOString(),
        yearMonth,
        blob: file,
        mimeType: file.type,
        fileName: file.name,
        memo,
      });

      form.reset();
      document.getElementById("labDate").value = toDateInputValue(new Date());
      showToast("検査結果を保存しました");
      await renderLabList();
    });
  }

  async function renderLabList() {
    const grid = document.getElementById("labList");
    labObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    labObjectUrls.clear();

    const records = await DB.getAll(DB.STORES.labImages);
    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (records.length === 0) {
      grid.innerHTML = '<div class="empty-state">まだ画像がありません</div>';
      return;
    }

    grid.innerHTML = "";
    records.forEach((rec) => {
      const url = URL.createObjectURL(rec.blob);
      labObjectUrls.set(rec.id, url);

      const thumb = document.createElement("div");
      thumb.className = "lab-thumb";
      thumb.innerHTML = `
        <img src="${url}" alt="検査結果 ${formatDate(rec.date)}" />
        <div class="lab-thumb-label">${formatDate(rec.date)}</div>
      `;
      thumb.addEventListener("click", () => openLabModal(rec, url));
      grid.appendChild(thumb);
    });
  }

  function openLabModal(rec, url) {
    const modal = document.getElementById("imageModal");
    const img = document.getElementById("imageModalImg");
    const meta = document.getElementById("imageModalMeta");
    const deleteBtn = document.getElementById("imageModalDelete");

    img.src = url;
    meta.textContent = `${formatDate(rec.date)}${rec.memo ? " / " + rec.memo : ""}`;
    modal.classList.remove("hidden");

    deleteBtn.onclick = async () => {
      if (!confirm("この検査画像を削除しますか?")) return;
      await DB.remove(DB.STORES.labImages, rec.id);
      modal.classList.add("hidden");
      await renderLabList();
    };
  }

  function initModal() {
    const modal = document.getElementById("imageModal");
    document.getElementById("imageModalClose").addEventListener("click", () => {
      modal.classList.add("hidden");
    });
    modal.querySelector(".modal-backdrop").addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }

  // ---------- グラフ ----------

  function drawLineChart(canvas, series, opts = {}) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const allPoints = series.flatMap((s) => s.points);
    if (allPoints.length === 0) {
      ctx.fillStyle = "#9aa5b1";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("データがありません", W / 2, H / 2);
      return;
    }

    const padding = { top: 20, right: 16, bottom: 28, left: 40 };
    const plotW = W - padding.left - padding.right;
    const plotH = H - padding.top - padding.bottom;

    const xs = allPoints.map((p) => p.x);
    const ys = allPoints.map((p) => p.y);
    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    if (xMin === xMax) {
      xMin -= 1;
      xMax += 1;
    }
    let yMin = opts.yMin ?? Math.min(...ys);
    let yMax = opts.yMax ?? Math.max(...ys);
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    const yPad = (yMax - yMin) * 0.15;
    yMin -= yPad;
    yMax += yPad;

    const xScale = (x) => padding.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const yScale = (y) => padding.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // グリッド線 + Y軸ラベル
    ctx.strokeStyle = "#e1e6ec";
    ctx.fillStyle = "#6b7684";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = yMin + ((yMax - yMin) * i) / gridLines;
      const py = yScale(y);
      ctx.beginPath();
      ctx.moveTo(padding.left, py);
      ctx.lineTo(W - padding.right, py);
      ctx.stroke();
      ctx.fillText(Math.round(y).toString(), padding.left - 6, py + 4);
    }

    // X軸ラベル(始点・終点)
    ctx.textAlign = "center";
    ctx.fillText(
      opts.formatX ? opts.formatX(xMin) : "",
      padding.left + 10,
      H - 8
    );
    ctx.fillText(
      opts.formatX ? opts.formatX(xMax) : "",
      W - padding.right - 10,
      H - 8
    );

    // 系列を描画
    series.forEach((s) => {
      if (s.points.length === 0) return;
      const sorted = [...s.points].sort((a, b) => a.x - b.x);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      sorted.forEach((p, i) => {
        const px = xScale(p.x);
        const py = yScale(p.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      ctx.fillStyle = s.color;
      sorted.forEach((p) => {
        ctx.beginPath();
        ctx.arc(xScale(p.x), yScale(p.y), 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  function formatShortDate(ts) {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  async function drawBpChart() {
    const canvas = document.getElementById("bpChart");
    const records = await DB.getAll(DB.STORES.bloodPressure);
    const sysPoints = records.map((r) => ({ x: new Date(r.datetime).getTime(), y: r.systolic }));
    const diaPoints = records.map((r) => ({ x: new Date(r.datetime).getTime(), y: r.diastolic }));
    drawLineChart(
      canvas,
      [
        { points: sysPoints, color: "#2563a8" },
        { points: diaPoints, color: "#109696" },
      ],
      { formatX: formatShortDate }
    );
  }

  async function drawWeightChart() {
    const canvas = document.getElementById("weightChart");
    const records = await DB.getAll(DB.STORES.weight);
    const points = records.map((r) => ({ x: new Date(r.datetime).getTime(), y: r.weight }));
    drawLineChart(canvas, [{ points, color: "#2563a8" }], { formatX: formatShortDate });
  }

  // ---------- 補助 ----------

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function refreshAll() {
    await Promise.all([renderBpList(), renderWeightList(), renderLabList()]);
    if (document.getElementById("tab-graph").classList.contains("active")) {
      drawBpChart();
      drawWeightChart();
    }
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
    initTabs();
    initMenu();
    initTtsToggle();
    initModal();
    initBpForm();
    initWeightForm();
    initLabForm();
    initServiceWorker();
    await refreshAll();
  });
})();
