const API_URL = "https://script.google.com/macros/s/AKfycbz3M4gWp9Py4_K1f5DzY6-6Sf68aJ6kn97WLjaqXtDg_53FpMq8HRbj58lrLP536g/exec";

let data = { oumiya: [], abdoulaye: [] };
let lineCharts = { oumiya: null, abdoulaye: null };
let dashboardBar = null;

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 1800);
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.add("hidden"));
  const el = document.getElementById(tab);
  if (el) el.classList.remove("hidden");

  ["oumiya", "abdoulaye", "dashboard"].forEach((t) => {
    const b = document.getElementById("btn-" + t);
    if (b) b.classList.toggle("active", t === tab);
  });
}

/* ===========================
   JSONP (anti CORS)
   =========================== */
function jsonp(params) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const url = new URL(API_URL);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    url.searchParams.set("callback", cb);

    const script = document.createElement("script");
    script.src = url.toString();
    script.async = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, 10000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cb];
      script.remove();
    }

    window[cb] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP error"));
    };

    document.head.appendChild(script);
  });
}

async function apiList(personUpper) {
  const j = await jsonp({ action: "list", person: personUpper });
  if (!j.ok) throw new Error(j.error || "list error");
  return j.rows || [];
}

async function apiAdd(personUpper, live) {
  const j = await jsonp({
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
  if (!j.ok) throw new Error(j.error || "add error");
}

async function apiReset(personUpper) {
  const j = await jsonp({ action: "reset", person: personUpper });
  if (!j.ok) throw new Error(j.error || "reset error");
}

/* ===========================
   UI: Forms
   =========================== */
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
      <button class="btn" type="submit">Ajouter Live</button>
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
    toast("✅ Enregistré !");
    f.reset();
    f.date.value = new Date().toISOString().slice(0, 10);
    await loadAll();
  } catch (err) {
    console.warn(err);
    toast("❌ Envoi impossible (JSONP)");
  }
}

/* ===========================
   Charts + Tables
   =========================== */
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
    tbody.innerHTML = `<tr><td colspan="7" style="opacity:.7">Aucun live</td></tr>`;
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

  if (dashboardBar) dashboardBar.destroy();
  dashboardBar = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Spectateurs", "Likes", "Durée", "Commentaires", "CA"],
      datasets: [
        { label: "Oumiya", data: [o.viewers, o.likes, o.duration, o.comments, o.revenue] },
        { label: "Abdoulaye", data: [a.viewers, a.likes, a.duration, a.comments, a.revenue] },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
}

/* ===========================
   Actions
   =========================== */
async function resetAll() {
  if (!confirm("Supprimer toutes les données Sheets ?")) return;
  try {
    toast("⏳ Reset...");
    await Promise.all([apiReset("OUMIYA"), apiReset("ABDOULAYE")]);
    toast("✅ Reset OK");
    await loadAll();
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

/* ===========================
   Load all
   =========================== */
async function loadAll() {
  try {
    toast("⏳ Chargement Sheets...");
    const [o, a] = await Promise.all([apiList("OUMIYA"), apiList("ABDOULAYE")]);
    data.oumiya = o;
    data.abdoulaye = a;

    renderLine("oumiya", data.oumiya);
    renderTable("oumiya", data.oumiya);

    renderLine("abdoulaye", data.abdoulaye);
    renderTable("abdoulaye", data.abdoulaye);

    updateDashboard();
    toast("✅ OK");
  } catch (err) {
    console.warn(err);
    toast("❌ Impossible de lire Sheets");
  }
}

/* ===========================
   INIT
   =========================== */
function init() {
  window.showTab = showTab;
  window.addLive = addLive;
  window.resetAll = resetAll;
  window.exportPDF = exportPDF;

  createForm("oumiya");
  createForm("abdoulaye");

  showTab("oumiya");
  loadAll();
}

document.addEventListener("DOMContentLoaded", init);
