/***********************
 * CONFIG
 ***********************/
const API_URL =
  "https://script.google.com/macros/s/AKfycbxzZa_bHktlywIA1hZ9UMhHJJwBSY-82Ng0oxjUOlyWis9CCEl8rMciu1E-_0JyZzM/exec";

let data = { oumiya: [], abdoulaye: [] };

// Charts
let lineCharts = { oumiya: null, abdoulaye: null };
let dashboardBar = null;

/***********************
 * UI
 ***********************/
function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 1800);
}

function setActiveBtn(tab) {
  ["oumiya", "abdoulaye", "dashboard"].forEach((t) => {
    const b = document.getElementById("btn-" + t);
    if (!b) return;
    b.classList.toggle("active", t === tab);
  });
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
  const el = document.getElementById(tab);
  if (el) el.classList.remove("hidden");
  setActiveBtn(tab);
}

/***********************
 * Dates / Filters
 ***********************/
function parseDate(yyyy_mm_dd) {
  const [y, m, d] = (yyyy_mm_dd || "").split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function startEndForRange(range) {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start;

  if (range === "day") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  } else if (range === "week") {
    const day = now.getDay(); // 0=dim,1=lun
    const diffToMon = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon, 0, 0, 0);
  } else if (range === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  } else {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
  }
  return { start, end };
}

function filterLivesByDates(lives, start, end) {
  return (lives || []).filter((l) => {
    const d = parseDate(l.date);
    return d >= start && d <= end;
  });
}

function getPersonFilter(person) {
  const range = document.getElementById(person + "Range")?.value || "month";
  let start, end;

  if (range === "custom") {
    const s = document.getElementById(person + "Start")?.value;
    const e = document.getElementById(person + "End")?.value;
    if (s && e) {
      const sd = parseDate(s);
      const ed = parseDate(e);
      start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), 0, 0, 0);
      end = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 59, 59);
    } else {
      const se = startEndForRange("month");
      start = se.start; end = se.end;
    }
  } else {
    const se = startEndForRange(range);
    start = se.start; end = se.end;
  }

  return { start, end };
}

/***********************
 * JSONP (anti-CORS, GitHub Pages, iPhone OK)
 ***********************/
function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => p.set(k, String(v)));
  return p.toString();
}

function jsonp(url, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Timeout JSONP"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cb]; } catch {}
      script.remove();
    }

    window[cb] = (payload) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP error"));
    };

    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb + "&_=" + Date.now();
    document.body.appendChild(script);
  });
}

/***********************
 * Sheets API (100% Google Sheets)
 ***********************/
async function apiList(personUpper) {
  const url = `${API_URL}?${qs({ action: "list", person: personUpper })}`;
  const j = await jsonp(url);
  if (!j.ok) throw new Error(j.error || "list error");
  return j.rows || [];
}

async function apiAdd(personUpper, live) {
  const url = `${API_URL}?${qs({
    action: "add",
    person: personUpper,
    date: live.date,
    time: live.time,
    viewers: live.viewers,
    likes: live.likes,
    duration: live.duration,
    comments: live.comments,
    revenue: live.revenue,
  })}`;
  const j = await jsonp(url);
  if (!j.ok) throw new Error(j.error || "add error");
}

async function apiReset(personUpper) {
  const url = `${API_URL}?${qs({ action: "reset", person: personUpper })}`;
  const j = await jsonp(url);
  if (!j.ok) throw new Error(j.error || "reset error");
}

/***********************
 * Sync (SHEETS = source unique)
 ***********************/
function sanitizeLive(l) {
  return {
    date: String(l.date || ""),
    time: String(l.time || ""),
    viewers: Number(l.viewers || 0),
    likes: Number(l.likes || 0),
    duration: Number(l.duration || 0),
    comments: Number(l.comments || 0),
    revenue: Number(l.revenue || 0),
  };
}

async function loadAllFromSheets() {
  toast("⏳ Synchronisation...");
  const [o, a] = await Promise.all([apiList("OUMIYA"), apiList("ABDOULAYE")]);

  data.oumiya = (o || []).map(sanitizeLive);
  data.abdoulaye = (a || []).map(sanitizeLive);

  data.oumiya.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
  data.abdoulaye.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));

  redrawAll();
  toast("✅ Sync Sheets OK");
}

/***********************
 * Forms
 ***********************/
function createForm(person) {
  const container = document.getElementById("form-" + person);
  if (!container) return;

  container.innerHTML = `
    <form onsubmit="addLive(event,'${person}')">
      <input name="date" type="date" required>
      <input name="time" type="time" required>
      <input name="viewers" type="number" placeholder="Spectateurs" min="0" required>
      <input name="likes" type="number" placeholder="Likes" min="0" required>
      <input name="duration" type="number" placeholder="Durée (min)" min="0" required>
      <input name="comments" type="number" placeholder="Commentaires" min="0" required>
      <input name="revenue" type="number" placeholder="CA" min="0" step="0.01" required>
      <button type="submit">Ajouter Live</button>
    </form>
  `;

  container.querySelector('input[name="date"]').value =
    new Date().toISOString().slice(0, 10);
}

async function addLive(e, person) {
  e.preventDefault();
  const f = e.target;

  const live = {
    date: f.date.value,
    time: f.time.value,
    viewers: Number(f.viewers.value || 0),
    likes: Number(f.likes.value || 0),
    duration: Number(f.duration.value || 0),
    comments: Number(f.comments.value || 0),
    revenue: Number(f.revenue.value || 0),
  };

  try {
    toast("⏳ Envoi vers Sheets...");
    await apiAdd(person.toUpperCase(), live);
    toast("✅ Ajouté sur Sheets");

    f.reset();
    f.date.value = new Date().toISOString().slice(0, 10);

    // Recharge depuis la source unique (Sheets)
    await loadAllFromSheets();
  } catch (err) {
    console.warn(err);
    toast("❌ Envoi Sheets impossible");
  }
}

/***********************
 * Charts
 ***********************/
function renderLine(person, lives) {
  const canvas = document.getElementById("line-" + person);
  if (!canvas || typeof Chart === "undefined") return;

  const labels = lives.map((l) => `${l.date} ${l.time}`);

  if (lineCharts[person]) lineCharts[person].destroy();

  lineCharts[person] = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Spectateurs", data: lives.map(l=>l.viewers), tension: 0.25, yAxisID: "ySmall" },
        { label: "Durée (min)", data: lives.map(l=>l.duration), tension: 0.25, yAxisID: "ySmall" },
        { label: "Commentaires", data: lives.map(l=>l.comments), tension: 0.25, yAxisID: "ySmall" },
        { label: "Likes", data: lives.map(l=>l.likes), tension: 0.25, yAxisID: "yBig" },
        { label: "CA", data: lives.map(l=>l.revenue), tension: 0.25, yAxisID: "yBig" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        ySmall: { type: "linear", position: "left", beginAtZero: true },
        yBig: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false } },
      },
    },
  });
}

function renderTable(person, lives) {
  const tbody = document.getElementById("table-" + person);
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!lives.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" style="color:#b7b7c9;">Aucun live sur cette période</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const l of lives) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.date}</td>
      <td>${l.time}</td>
      <td>${l.viewers}</td>
      <td>${l.likes}</td>
      <td>${l.duration}</td>
      <td>${l.comments}</td>
      <td>${Number(l.revenue).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function refreshPerson(person) {
  const { start, end } = getPersonFilter(person);
  const filtered = filterLivesByDates(data[person], start, end);
  renderLine(person, filtered);
  renderTable(person, filtered);
}

/***********************
 * Dashboard
 ***********************/
function aggregate(lives) {
  const t = { viewers: 0, likes: 0, duration: 0, comments: 0, revenue: 0 };
  (lives || []).forEach((l) => {
    t.viewers += l.viewers;
    t.likes += l.likes;
    t.duration += l.duration;
    t.comments += l.comments;
    t.revenue += l.revenue;
  });
  return t;
}

function applyDashboardFilter() {
  updateDashboard();
}

function updateDashboard() {
  const canvas = document.getElementById("dashboardChart");
  if (!canvas || typeof Chart === "undefined") return;

  const range = document.getElementById("rangeSelect")?.value || "month";
  const showO = document.getElementById("showOumiya")?.checked ?? true;
  const showA = document.getElementById("showAbdoulaye")?.checked ?? true;

  let start, end;
  if (range === "custom") {
    const s = document.getElementById("startDate")?.value;
    const e = document.getElementById("endDate")?.value;
    if (s && e) {
      const sd = parseDate(s);
      const ed = parseDate(e);
      start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), 0, 0, 0);
      end = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 59, 59);
    } else {
      const se = startEndForRange("month");
      start = se.start; end = se.end;
    }
  } else {
    const se = startEndForRange(range);
    start = se.start; end = se.end;
  }

  const o = aggregate(filterLivesByDates(data.oumiya, start, end));
  const a = aggregate(filterLivesByDates(data.abdoulaye, start, end));

  const datasets = [];
  if (showO) datasets.push({
    label: "Oumiya",
    data: [
      { x: "Spectateurs", y: o.viewers },
      { x: "Likes", y: o.likes },
      { x: "Durée", y: o.duration },
      { x: "Commentaires", y: o.comments },
      { x: "CA", y: o.revenue },
    ],
  });

  if (showA) datasets.push({
    label: "Abdoulaye",
    data: [
      { x: "Spectateurs", y: a.viewers },
      { x: "Likes", y: a.likes },
      { x: "Durée", y: a.duration },
      { x: "Commentaires", y: a.comments },
      { x: "CA", y: a.revenue },
    ],
  });

  if (dashboardBar) dashboardBar.destroy();
  dashboardBar = new Chart(canvas, {
    type: "bar",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: { xAxisKey: "x", yAxisKey: "y" },
      scales: {
        x: { type: "category" },
        y: { beginAtZero: true },
      },
    },
  });
}

/***********************
 * Actions
 ***********************/
async function resetAll() {
  if (!confirm("Supprimer toutes les données sur Google Sheets ?")) return;

  try {
    toast("⏳ Reset Sheets...");
    await Promise.all([apiReset("OUMIYA"), apiReset("ABDOULAYE")]);
    await loadAllFromSheets();
    toast("✅ Reset OK");
  } catch (e) {
    console.warn(e);
    toast("❌ Reset impossible");
  }
}

function exportPDF() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return toast("❌ jsPDF non chargé");
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Live Performance Report", 14, 16);
  doc.setFontSize(10);
  doc.text(JSON.stringify(data, null, 2).slice(0, 3500), 14, 28);
  doc.save("performance.pdf");
}

/***********************
 * Render
 ***********************/
function redrawAll() {
  refreshPerson("oumiya");
  refreshPerson("abdoulaye");
  updateDashboard();
}

/***********************
 * INIT
 ***********************/
function init() {
  window.showTab = showTab;
  window.addLive = addLive;
  window.refreshPerson = refreshPerson;
  window.applyDashboardFilter = applyDashboardFilter;
  window.resetAll = resetAll;
  window.exportPDF = exportPDF;

  createForm("oumiya");
  createForm("abdoulaye");

  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  document.getElementById("startDate").value = start;
  document.getElementById("endDate").value = end;

  ["oumiya", "abdoulaye"].forEach((p) => {
    document.getElementById(p + "Start").value = start;
    document.getElementById(p + "End").value = end;
  });

  showTab("oumiya");

  // Source unique = Google Sheets
  loadAllFromSheets().catch((e) => {
    console.warn(e);
    toast("❌ Impossible de charger Sheets");
  });
}

document.addEventListener("DOMContentLoaded", init);