/***********************
 * CONFIG
 ***********************/
const API_URL = "https://script.google.com/macros/s/AKfycbwJHN77_i3GKjEYCzeymi0R8lS9IC8nlLzbduUJBVb5ZiFizzqRfey95_4rgQfRlk8/exec";
const LOCAL_KEY = "livePerformance_local_v1";

let data = { oumiya: [], abdoulaye: [] };
let charts = { oumiya: null, abdoulaye: null, dashboard: null };

/***********************
 * JSONP
 ***********************/
function qs(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => p.set(k, String(v)));
  return p.toString();
}

function jsonp(url, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Timeout JSONP"));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cb]; } catch {}
      s.remove();
    }

    window[cb] = (res) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(res);
    };

    s.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP error"));
    };

    s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb + "&_=" + Date.now();
    document.body.appendChild(s);
  });
}

/***********************
 * API
 ***********************/
const apiList = (p) => jsonp(`${API_URL}?${qs({ action: "list", person: p })}`);
const apiAdd  = (p, l) => jsonp(`${API_URL}?${qs({ action: "add", person: p, ...l })}`);
const apiReset = (p) => jsonp(`${API_URL}?${qs({ action: "reset", person: p })}`);

/***********************
 * Local storage
 ***********************/
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { oumiya: [], abdoulaye: [] }; }
  catch { return { oumiya: [], abdoulaye: [] }; }
}
function saveLocal() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

/***********************
 * UI
 ***********************/
function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
  document.getElementById(tab)?.classList.remove("hidden");
}

function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1800);
}

/***********************
 * DATA
 ***********************/
function addLive(e, person) {
  e.preventDefault();
  const f = e.target;

  const live = {
    date: f.date.value,
    time: f.time.value,
    viewers: +f.viewers.value,
    likes: +f.likes.value,
    duration: +f.duration.value,
    comments: +f.comments.value,
    revenue: +f.revenue.value,
  };

  data[person].push(live);
  saveLocal();
  redrawAll();

  apiAdd(person.toUpperCase(), live)
    .then(() => loadSheets())
    .catch(() => toast("⚠️ Sync Sheets impossible"));
}

/***********************
 * CHARTS
 ***********************/
function renderLine(person) {
  const ctx = document.getElementById("line-" + person);
  if (!ctx) return;

  if (charts[person]) charts[person].destroy();

  charts[person] = new Chart(ctx, {
    type: "line",
    data: {
      labels: data[person].map(l => `${l.date} ${l.time}`),
      datasets: [
        { label: "Spectateurs", data: data[person].map(l=>l.viewers) },
        { label: "Likes", data: data[person].map(l=>l.likes) },
        { label: "Durée", data: data[person].map(l=>l.duration) },
        { label: "Commentaires", data: data[person].map(l=>l.comments) },
        { label: "CA", data: data[person].map(l=>l.revenue) },
      ]
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function redrawAll() {
  renderLine("oumiya");
  renderLine("abdoulaye");
}

/***********************
 * LOAD
 ***********************/
function loadSheets() {
  Promise.all([apiList("OUMIYA"), apiList("ABDOULAYE")])
    .then(([o,a]) => {
      data.oumiya = o.rows || [];
      data.abdoulaye = a.rows || [];
      saveLocal();
      redrawAll();
      toast("✅ Sync Sheets OK");
    })
    .catch(() => toast("⚠️ Sync Sheets bloquée"));
}

/***********************
 * INIT
 ***********************/
document.addEventListener("DOMContentLoaded", () => {
  window.showTab = showTab;
  window.addLive = addLive;

  data = loadLocal();
  redrawAll();
  loadSheets();
  showTab("oumiya");
});