const API_URL = "https://script.google.com/macros/s/AKfycbz3M4gWp9Py4_K1f5DzY6-6Sf68aJ6kn97WLjaqXtDg_53FpMq8HRbj58lrLP536g/exec";

let data = { oumiya: [], abdoulaye: [] };
let charts = { oumiya: null, abdoulaye: null, dashboard: null };

function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(()=>el.classList.add("hidden"),2000);
}

function showTab(tab){
  document.querySelectorAll(".tab").forEach(s=>s.classList.add("hidden"));
  document.getElementById(tab).classList.remove("hidden");
  ["oumiya","abdoulaye","dashboard"].forEach(t=>{
    document.getElementById("btn-"+t).classList.toggle("active", t===tab);
  });
}

async function fetchJSON(url, opt){
  const r = await fetch(url, { cache:"no-store", ...opt });
  const t = await r.text();
  let j;
  try{ j = JSON.parse(t); } catch { throw new Error("Non JSON: "+t.slice(0,120)); }
  return j;
}

async function apiList(person){
  const j = await fetchJSON(`${API_URL}?action=list&person=${person}`);
  if(!j.ok) throw new Error(j.error||"list error");
  return j.rows || [];
}

async function apiAdd(person, live){
  const j = await fetchJSON(API_URL,{
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify({ action:"add", person, ...live })
  });
  if(!j.ok) throw new Error(j.error||"add error");
}

async function apiReset(person){
  const j = await fetchJSON(API_URL,{
    method:"POST",
    headers:{ "Content-Type":"text/plain;charset=utf-8" },
    body: JSON.stringify({ action:"reset", person })
  });
  if(!j.ok) throw new Error(j.error||"reset error");
}

function createForm(person){
  const c = document.getElementById("form-"+person.toLowerCase());
  c.innerHTML = `
    <form onsubmit="addLive(event,'${person}')">
      <input name="date" type="date" required>
      <input name="time" type="time" required>
      <input name="viewers" type="number" placeholder="Spectateurs" min="0" required>
      <input name="likes" type="number" placeholder="Likes" min="0" required>
      <input name="duration" type="number" placeholder="Durée" min="0" required>
      <input name="comments" type="number" placeholder="Commentaires" min="0" required>
      <input name="revenue" type="number" placeholder="CA" min="0" step="0.01" required>
      <button class="btn" type="submit">Ajouter Live</button>
    </form>
  `;
  c.querySelector("input[name=date]").value = new Date().toISOString().slice(0,10);
}

async function addLive(e, person){
  e.preventDefault();
  const f = e.target;
  const live = {
    date:f.date.value,
    time:f.time.value,
    viewers:+f.viewers.value,
    likes:+f.likes.value,
    duration:+f.duration.value,
    comments:+f.comments.value,
    revenue:+f.revenue.value
  };
  try{
    toast("⏳ Envoi...");
    await apiAdd(person, live);
    toast("✅ Ajouté");
    f.reset();
    f.date.value = new Date().toISOString().slice(0,10);
    await loadAll();
  }catch(err){
    console.warn(err);
    toast("❌ Erreur envoi");
  }
}

function renderTable(id, rows){
  const tb = document.getElementById(id);
  tb.innerHTML = "";
  if(!rows.length){
    tb.innerHTML = `<tr><td colspan="7" style="opacity:.7">Aucun live</td></tr>`;
    return;
  }
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td><td>${r.time}</td><td>${r.viewers}</td><td>${r.likes}</td>
      <td>${r.duration}</td><td>${r.comments}</td><td>${(+r.revenue).toFixed(2)}</td>
    `;
    tb.appendChild(tr);
  });
}

function renderLine(canvasId, rows, key){
  const c = document.getElementById(canvasId);
  if(!c || typeof Chart==="undefined") return;

  const labels = rows.map(r=>`${r.date} ${r.time}`);

  if(charts[key]) charts[key].destroy();

  charts[key] = new Chart(c,{
    type:"line",
    data:{
      labels,
      datasets:[
        { label:"Spectateurs", data: rows.map(r=>r.viewers), yAxisID:"ySmall", tension:.25 },
        { label:"Durée", data: rows.map(r=>r.duration), yAxisID:"ySmall", tension:.25 },
        { label:"Commentaires", data: rows.map(r=>r.comments), yAxisID:"ySmall", tension:.25 },
        { label:"Likes", data: rows.map(r=>r.likes), yAxisID:"yBig", tension:.25 },
        { label:"CA", data: rows.map(r=>r.revenue), yAxisID:"yBig", tension:.25 },
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{ mode:"index", intersect:false },
      scales:{
        ySmall:{ position:"left", beginAtZero:true },
        yBig:{ position:"right", beginAtZero:true, grid:{ drawOnChartArea:false } }
      }
    }
  });
}

function agg(rows){
  return rows.reduce((a,r)=>{
    a.viewers+=+r.viewers; a.likes+=+r.likes; a.duration+=+r.duration; a.comments+=+r.comments; a.revenue+=+r.revenue;
    return a;
  },{viewers:0,likes:0,duration:0,comments:0,revenue:0});
}

function renderDashboard(){
  const c = document.getElementById("dashboardChart");
  if(!c || typeof Chart==="undefined") return;

  const o = agg(data.oumiya);
  const a = agg(data.abdoulaye);

  if(charts.dashboard) charts.dashboard.destroy();

  charts.dashboard = new Chart(c,{
    type:"bar",
    data:{
      labels:["Spectateurs","Likes","Durée","Commentaires","CA"],
      datasets:[
        { label:"Oumiya", data:[o.viewers,o.likes,o.duration,o.comments,o.revenue] },
        { label:"Abdoulaye", data:[a.viewers,a.likes,a.duration,a.comments,a.revenue] }
      ]
    },
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ beginAtZero:true } } }
  });
}

async function loadAll(){
  try{
    toast("⏳ Chargement...");
    const [o,a] = await Promise.all([apiList("OUMIYA"), apiList("ABDOULAYE")]);
    data.oumiya = o;
    data.abdoulaye = a;

    renderTable("table-oumiya", data.oumiya);
    renderLine("line-oumiya", data.oumiya, "oumiya");

    renderTable("table-abdoulaye", data.abdoulaye);
    renderLine("line-abdoulaye", data.abdoulaye, "abdoulaye");

    renderDashboard();
    toast("✅ OK");
  }catch(err){
    console.warn(err);
    toast("❌ Impossible de lire Sheets");
  }
}

async function resetAll(){
  if(!confirm("Reset Sheets ?")) return;
  try{
    await Promise.all([apiReset("OUMIYA"), apiReset("ABDOULAYE")]);
    await loadAll();
    toast("✅ Reset OK");
  }catch(err){
    console.warn(err);
    toast("❌ Reset impossible");
  }
}

function exportPDF(){
  const { jsPDF } = window.jspdf || {};
  if(!jsPDF) return toast("❌ jsPDF non chargé");
  const doc = new jsPDF();
  doc.text("Live Performance Report", 14, 16);
  doc.setFontSize(9);
  doc.text(JSON.stringify(data, null, 2).slice(0, 3500), 14, 28);
  doc.save("performance.pdf");
}

function init(){
  window.showTab = showTab;
  window.addLive = addLive;
  window.resetAll = resetAll;
  window.exportPDF = exportPDF;

  createForm("OUMIYA");
  createForm("ABDOULAYE");
  showTab("oumiya");
  loadAll();
}

document.addEventListener("DOMContentLoaded", init);
