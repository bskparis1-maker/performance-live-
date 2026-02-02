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
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
  document.getElementById(tab).classList.remove("hidden");

  ["oumiya","abdoulaye","dashboard"].forEach(p=>{
    document.getElementById("btn-"+p).classList.toggle("active", p===tab);
  });

  if (tab==="dashboard") updateDashboard();
}

/***********************
 * JSONP
 ***********************/
function qs(o){
  return new URLSearchParams(o).toString();
}

function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb="cb_"+Math.random().toString(36).slice(2);
    const s=document.createElement("script");
    window[cb]=(res)=>{
      delete window[cb];
      s.remove();
      resolve(res);
    };
    s.onerror=()=>{
      delete window[cb];
      s.remove();
      reject(new Error("JSONP error"));
    };
    s.src=url+(url.includes("?")?"&":"?")+"callback="+cb+"&_="+Date.now();
    document.body.appendChild(s);
  });
}

/***********************
 * API SHEETS
 ***********************/
async function apiList(person){
  const j=await jsonp(API_URL+"&"+qs({action:"list",person}));
  if(!j.ok) throw j.error;
  return j.rows||[];
}

async function apiAdd(person,l){
  const j=await jsonp(API_URL+"&"+qs({action:"add",person,...l}));
  if(!j.ok) throw j.error;
}

async function apiReset(person){
  const j=await jsonp(API_URL+"&"+qs({action:"reset",person}));
  if(!j.ok) throw j.error;
}

/***********************
 * LOAD
 ***********************/
async function loadAll(){
  try{
    toast("⏳ Chargement Sheets...");
    data.oumiya=await apiList("OUMIYA");
    data.abdoulaye=await apiList("ABDOULAYE");
    redrawAll();
    toast("✅ Données chargées");
  }catch(e){
    console.error(e);
    toast("❌ Impossible de lire Sheets");
  }
}

/***********************
 * FORMS
 ***********************/
function createForm(person){
  document.getElementById("form-"+person).innerHTML=`
    <form onsubmit="addLive(event,'${person}')">
      <input type="date" name="date" required>
      <input type="time" name="time" required>
      <input type="number" name="viewers" placeholder="Spectateurs" required>
      <input type="number" name="likes" placeholder="Likes" required>
      <input type="number" name="duration" placeholder="Durée (min)" required>
      <input type="number" name="comments" placeholder="Commentaires" required>
      <input type="number" step="0.01" name="revenue" placeholder="CA" required>
      <button>Ajouter Live</button>
    </form>`;
}

async function addLive(e,person){
  e.preventDefault();
  const f=e.target;
  const live=Object.fromEntries(new FormData(f).entries());
  try{
    await apiAdd(person.toUpperCase(),live);
    toast("✅ Live ajouté");
    f.reset();
    await loadAll();
  }catch{
    toast("❌ Envoi échoué");
  }
}

/***********************
 * CHARTS & TABLES
 ***********************/
function renderLine(person,lives){
  const ctx=document.getElementById("line-"+person);
  if(lineCharts[person]) lineCharts[person].destroy();
  lineCharts[person]=new Chart(ctx,{
    type:"line",
    data:{
      labels:lives.map(l=>l.date+" "+l.time),
      datasets:[
        {label:"Spectateurs",data:lives.map(l=>+l.viewers)},
        {label:"Likes",data:lives.map(l=>+l.likes)},
        {label:"Durée",data:lives.map(l=>+l.duration)},
        {label:"Commentaires",data:lives.map(l=>+l.comments)},
        {label:"CA",data:lives.map(l=>+l.revenue)}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false}
  });
}

function renderTable(person,lives){
  const tb=document.getElementById("table-"+person);
  tb.innerHTML="";
  if(!lives.length){
    tb.innerHTML="<tr><td colspan='7'>Aucun live</td></tr>";
    return;
  }
  lives.forEach(l=>{
    tb.innerHTML+=`
      <tr>
        <td>${l.date}</td><td>${l.time}</td>
        <td>${l.viewers}</td><td>${l.likes}</td>
        <td>${l.duration}</td><td>${l.comments}</td>
        <td>${l.revenue}</td>
      </tr>`;
  });
}

function refreshPerson(p){
  renderLine(p,data[p]);
  renderTable(p,data[p]);
}

/***********************
 * DASHBOARD
 ***********************/
function updateDashboard(){
  const ctx=document.getElementById("dashboardChart");
  if(dashboardBar) dashboardBar.destroy();
  dashboardBar=new Chart(ctx,{
    type:"bar",
    data:{
      labels:["Spectateurs","Likes","Durée","Commentaires","CA"],
      datasets:[
        {label:"Oumiya",data:sum(data.oumiya)},
        {label:"Abdoulaye",data:sum(data.abdoulaye)}
      ]
    }
  });
}

function sum(arr){
  return [
    arr.reduce((a,b)=>a+ +b.viewers,0),
    arr.reduce((a,b)=>a+ +b.likes,0),
    arr.reduce((a,b)=>a+ +b.duration,0),
    arr.reduce((a,b)=>a+ +b.comments,0),
    arr.reduce((a,b)=>a+ +b.revenue,0)
  ];
}

/***********************
 * ACTIONS
 ***********************/
async function resetAll(){
  if(!confirm("Supprimer toutes les données Sheets ?")) return;
  await apiReset("OUMIYA");
  await apiReset("ABDOULAYE");
  await loadAll();
}

function exportPDF(){
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.text("Live Performance Tracker",10,10);
  doc.text(JSON.stringify(data,null,2),10,20);
  doc.save("tracker.pdf");
}

/***********************
 * INIT
 ***********************/
document.addEventListener("DOMContentLoaded",()=>{
  createForm("oumiya");
  createForm("abdoulaye");
  showTab("oumiya");
  loadAll();
});
