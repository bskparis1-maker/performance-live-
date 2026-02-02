/***********************
 * CONFIG
 ***********************/
const API_URL =
  "https://script.google.com/macros/s/AKfycbxzZa_bHktlywIA1hZ9UMhHJJwBSY-82Ng0oxjUOlyWis9CCEl8rMciu1E-_0JyZzM/exec";

/***********************
 * DATA
 ***********************/
let data = { oumiya: [], abdoulaye: [] };
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
  setTimeout(() => el.classList.add("hidden"), 2200);
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
  document.getElementById(tab)?.classList.remove("hidden");

  ["oumiya", "abdoulaye", "dashboard"].forEach((p) => {
    const b = document.getElementById("btn-" + p);
    if (b) b.classList.toggle("active", p === tab);
  });

  if (tab === "oumiya") refreshPerson("oumiya");
  if (tab === "abdoulaye") refreshPerson("abdoulaye");
  if (tab === "dashboard") updateDashboard();
}

/***********************
 * URL helpers
 ***********************/
function qs(obj) {
  return new URLSearchParams(obj).toString();
}

function buildUrl(params) {
  // ✅ IMPORTANT: si API_URL n'a pas "?", on met "?"
  return API_URL + (API_URL.includes("?") ? "&" : "?") + qs(params);
}

/***********************
 * JSONP (anti-CORS)
 ***********************/
function jsonp(url, timeoutMs = 12000) {
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
      try {
        delete window[cb];
      } catch {}
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
      reject(new Error("JSONP error (script load failed)"));
    };

    // ✅ cache buster pour éviter les vieilles réponses
    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb + "&_=" + Date.now();
    document.body.appendChild(script);
  });
}

/***********************
 * API Sheets
 ***********************/
async function apiList(personUpper) {
  const url = buildUrl({ action: "list", person: personUpper });
  const j = await jsonp(url);
  if (!j || !j.ok) throw new Error(j?.error || "list error");
  return j.rows || [];
}

async function apiAdd(personUpper, live) {
  const url = buildUrl({
    action: "add",
    person: personUpper,
    date: live.date,
    time: live.time,
    viewers: live.viewers,
    likes: live.likes,
    duration: live.duration,
    comments: live.comments,
    revenue: live.revenue,
  });
  const j = await jsonp(url);
  if (!j || !j.ok) throw new Error(j?.error || "add error");
}

async function apiReset(personUpper) {
  const url = buildUrl({ action: "reset", person: personUpper });
  const j = await jsonp(url);
  if (!j || !j.ok) throw new Error(j?.error || "reset error");
}

/***********************
 * Data helpers
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

/***********************
 * Load
 ***********************/
async function loadAll() {
  try {
    toast("⏳ Lecture Sheets...");
    const [o, a] = await Promise.all([apiList("OUMIYA"), apiList("ABDOULAYE")]);

    data.oumiya = (o || []).map(sanitizeLive);
    data.abdoulaye = (a || []).map(sanitizeLive);

    data.oumiya.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
    data.abdoulaye.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));

    redrawAll();
    toast("✅ Sheets OK");
  } catch (e) {
    console.warn(e);
    toast("❌ Impossible de lire Sheets");
  }
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

  container.querySelector('input[name="date"]').value = new Date().toISOString().slice(0, 10);
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
    toast("⏳ Envoi Sheets...");
    await apiAdd(person.toUpperCase(), live);
    toast("✅ Envoyé");
    f.reset();
    f.date.value = new Date().toISOString().slice(0, 10);
    await loadAll();
  } catch (err) {
    console.warn(err);
    toast("❌ Envoi impossible");
  }
}

/***********************
 * Filters (simple : on affiche tout, et tu peux ajouter tes filtres après)
 ***********************/
function refreshPerson(person) {
  renderLine(person, data[person]);
  renderTable(person, data[person]);
}

/***********************
 * Charts + Tables
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
        { label: "Spectateurs", data: lives.map((l) => l.viewers), yAxisID: "ySmall", tension: 0.25 },
        { label: "Durée (min)", data: lives.map((l) => l.duration), yAxisID: "ySmall", tension: 0.25 },
        { label: "Commentaires", data: lives.map((l) => l.comments), yAxisID: "ySmall", tension: 0.25 },
        { label: "Likes", data: lives.map((l) => l.likes), yAxisID: "yBig", tension: 0.25 },
        { label: "CA", data: lives.map((l) => l.revenue), yAxisID: "yBig", tension: 0.25 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      interaction: { mode: "index", intersect: false },
      scales: {
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
    tbody.innerHTML = `<tr><td colspan="7" style="color:#b7b7c9;">Aucun live</td></tr>`;
    return;
  }

  lives.forEach((l) => {
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
  });
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

function updateDashboard() {
  const canvas = document.getElementById("dashboardChart");
  if (!canvas || typeof Chart === "undefined") return;

  const o = aggregate(data.oumiya);
  const a = aggregate(data.abdoulaye);

  const labels = ["Spectateurs", "Likes", "Durée", "Commentaires", "CA"];
  const datasets = [
    { label: "Oumiya", data: [o.viewers, o.likes, o.duration, o.comments, o.revenue] },
    { label: "Abdoulaye", data: [a.viewers, a.likes, a.duration, a.comments, a.revenue] },
  ];

  if (dashboardBar) dashboardBar.destroy();
  dashboardBar = new Chart(canvas, {
    type: "bar",
    data: { labels, datasets },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
}

/***********************
 * Actions
 ***********************/
async function resetAll() {
  if (!confirm("Supprimer toutes les données sur Google Sheets ?")) return;
  try {
    toast("⏳ Reset...");
    await Promise.all([apiReset("OUMIYA"), apiReset("ABDOULAYE")]);
    await loadAll();
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
  doc.setFontSize(9);
  doc.text(JSON.stringify(data, null, 2).slice(0, 3500), 14, 28);
  doc.save("performance.pdf");
}

/***********************
 * Render + Init
 ***********************/
function redrawAll() {
  refreshPerson("oumiya");
  refreshPerson("abdoulaye");
  updateDashboard();
}

function init() {
  window.showTab = showTab;
  window.addLive = addLive;
  window.refreshPerson = refreshPerson;
  window.resetAll = resetAll;
  window.exportPDF = exportPDF;

  createForm("oumiya");
  createForm("abdoulaye");

  showTab("oumiya");
  loadAll();
}

document.addEventListener("DOMContentLoaded", init);
