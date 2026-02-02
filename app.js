/***********************
 * CONFIG
 ***********************/
const API_URL = "https://script.google.com/macros/s/AKfycbwXxsuxb5VHiG9YzpXHR2qF9W-IddzB01gck3F2ACEXhy-byEM91mKodfZCr9UsYeE/exec";

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
 * Helpers
 ***********************/
function qs(obj) {
  return new URLSearchParams(obj).toString();
}

async function fetchJson(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      ...options,
    });
    const txt = await res.text();
    let j;
    try {
      j = JSON.parse(txt);
    } catch {
      throw new Error("Réponse non JSON: " + txt.slice(0, 120));
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return j;
  } finally {
    clearTimeout(t);
  }
}

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
 * API
 ***********************/
async function apiPing() {
  return fetchJson(`${API_URL}?${qs({ action: "ping" })}`);
}

async function apiList(personUpper) {
  const j = await fetchJson(`${API_URL}?${qs({ action: "list", person: personUpper })}`);
  if (!j.ok) throw new Error(j.error || "list error");
  return j.rows || [];
}

async function apiAdd(personUpper, live) {
  const j = await fetchJson(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script safe
    body: JSON.stringify({ action: "add", person: personUpper, ...live }),
  });
  if (!j.ok) throw new Error(j.error || "add error");
}

async function apiReset(personUpper) {
  const j = await fetchJson(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "reset", person: personUpper }),
  });
  if (!j.ok) throw new Error(j.error || "reset error");
}

/***********************
 * Load
 ***********************/
async function loadAll() {
  try {
    toast("⏳ Chargement Sheets...");
    const [o, a] = await Promise.all([apiList("OUMIYA"), apiList("ABDOULAYE")]);

    data.oumiya = (o || []).map(sanitizeLive);
    data.abdoulaye = (a || []).map(sanitizeLive);

    data.oumiya.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));
    data.abdoulaye.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time));

    redrawAll();
    toast("✅ Données chargées");
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
    toast("⏳ Envoi...");
    await apiAdd(person.toUpperCase(), live);
    toast("✅ Ajouté");
    f.reset();
    f.date.value = new Date().toISOString().slice(0, 10);
    await loadAll();
  } catch (err) {
    console.warn(err);
    toast("❌ Envoi échoué");
  }
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

function refreshPerson(person) {
  renderLine(person, data[person]);
  renderTable(person, data[person]);
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
  if (!confirm("Supprimer toutes les données Sheets ?")) return;
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
 * INIT
 ***********************/
function redrawAll() {
  refreshPerson("oumiya");
  refreshPerson("abdoulaye");
  updateDashboard();
}

async function init() {
  window.showTab = showTab;
  window.addLive = addLive;
  window.refreshPerson = refreshPerson;
  window.resetAll = resetAll;
  window.exportPDF = exportPDF;

  createForm("oumiya");
  createForm("abdoulaye");
  showTab("oumiya");

  // Ping simple pour vérifier l’API
  try {
    await apiPing();
  } catch (e) {
    console.warn(e);
    toast("❌ API inaccessible (déploiement?)");
    return;
  }

  loadAll();
}

document.addEventListener("DOMContentLoaded", init);
