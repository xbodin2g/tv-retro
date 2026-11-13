// =====================================================
// TV RÉTRO ÉDITEUR — couche overrides persistante
// v3 : fermeture auto des réglages + reprise du chargement
// =====================================================
const CFG_KEY='tvretroEditCfg';
const state={cfg:JSON.parse(localStorage.getItem(CFG_KEY)||'{}'),meta:null,cache:{},loaded:new Set(),yearCache:{},
  q:'',period:'all',year:'all',genre:'all',channel:'all',groups:[],expanded:new Set(),
  dayYear:null,dayDate:null,dayData:null,dayPrograms:[],overrides:{},shas:{},pending:{},editing:null,currentTab:'search'};

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function norm(v){if(!v)return'';return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function slug(v){return norm(v).replace(/\s+/g,'-').replace(/^-|-$/g,'')||'autre';}
function nDate(d){if(!d)return null;const p=String(d).trim().split(/[-\/]/);if(p.length!==3)return null;let day,mo,yr;if(p[0].length===4){yr=p[0];mo=p[1];day=p[2];}else{day=p[0];mo=p[1];yr=p[2];}day=String(day).padStart(2,'0');mo=String(mo).padStart(2,'0');const t=new Date(+yr,+mo-1,+day);if(t.getFullYear()!=+yr||t.getMonth()!=+mo-1||t.getDate()!=+day)return null;return `${day}-${mo}-${yr}`;}
function shortDate(d){const n=nDate(d);if(!n)return d||'';const[a,b,c]=n.split('-');return `${a}/${b}/${c}`;}
function dKey(d){const n=nDate(d);if(!n)return[9999,9999,9999];const[a,b,c]=n.split('-').map(Number);return[c,b,a];}
function nTime(v){const m=String(v||'').trim().match(/^(\d{1,2})[:h.](\d{2})$/);if(!m)return'';const h=+m[1],mi=+m[2];return h>23||mi>59?'':`${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;}
function tKey(t){if(!t||!t.includes(':'))return 9999;const[h,m]=t.split(':').map(Number);return h>=5?(h-5)*60+m:(h+19)*60+m;}
function progId(date,time,channel){return `${nDate(date)||date}__${String(time||'sans-heure').replace(':','h')}__${slug(channel)}__p`;}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('show'),3400);}
function b64(str){const b=new TextEncoder().encode(str);let s='';b.forEach(x=>s+=String.fromCharCode(x));return btoa(s);}
function unb64(s){const bin=atob(s.replace(/\n/g,''));const b=Uint8Array.from(bin,c=>c.charCodeAt(0));return new TextDecoder().decode(b);}
function siteUrl(){return `https://${state.cfg.owner||'xbodin2g'}.github.io/${state.cfg.repo||'tv-retro'}/edit/`;}

// ---------- GitHub ----------
const configured=()=>state.cfg.owner&&state.cfg.repo&&state.cfg.token;
function apiUrl(path){const c=state.cfg;return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}?ref=${encodeURIComponent(c.branch||'main')}`;}
async function ghGet(path){const r=await fetch(apiUrl(path),{headers:{Authorization:`Bearer ${state.cfg.token}`,Accept:'application/vnd.github+json'},cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw new Error(`GitHub ${r.status} sur ${path}`);return r.json();}
async function ghPut(path,content,message){const c=state.cfg;const body={message,content:b64(content),branch:c.branch||'main'};const sha=state.shas[path];if(sha)body.sha=sha;const r=await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`,{method:'PUT',headers:{Authorization:`Bearer ${c.token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`Écriture ${r.status} : ${(await r.text()).slice(0,200)}`);const j=await r.json();state.shas[path]=j.content?.sha;return j;}

async function loadOverrideYear(year){
  if(state.overrides[year])return state.overrides[year];
  let data={year:Number(year),programs:{}};
  if(configured()){
    try{const p=`${state.cfg.path||'data'}/overrides/${year}.json`;const f=await ghGet(p);if(f){state.shas[p]=f.sha;data=JSON.parse(unb64(f.content));}}
    catch(e){console.warn(e);toast('⚠️ Lecture overrides impossible : '+e.message);}
  }
  data.programs=data.programs||{};state.overrides[year]=data;return data;
}

// ---------- Source ----------
async function ensureYearLoaded(year){
  if(state.yearCache[year])return state.yearCache[year];
  const r=await fetch(`../data/${year}.json?t=`+Date.now(),{cache:'no-store'});
  if(!r.ok)return null;
  const d=await r.json();state.yearCache[year]=d;return d;
}
function sourceDay(date){const y=date.split('-')[2];return state.yearCache[y]?.dates?.[date]||state.dayData?.dates?.[date]||null;}
function findProgram(date,time,channel){const d=sourceDay(date);if(!d)return null;return (d.programs||[]).find(p=>p.time===time&&p.channel===channel)||null;}

// ---------- Métadonnées ----------
async function loadMeta(){
  if(location.protocol==='file:'){
    $('#search-status').innerHTML=`⚠️ Fichier ouvert en local : les données ne peuvent pas être lues. Ouvre plutôt <code>${esc(siteUrl())}</code>`;
    return false;
  }
  try{
    const r=await fetch('../data/search_meta.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('search_meta.json introuvable — lance generate_index_only');
    state.meta=await r.json();
    const dec=[...new Set((state.meta.years||[]).map(y=>Math.floor(y/10)*10))].sort();
    $('#f-period').innerHTML='<option value="all">Toute la base</option>'+dec.map(d=>`<option value="${d}">Années ${String(d).slice(2)}</option>`).join('');
    $('#f-genre').innerHTML='<option value="all">Tous genres</option>'+(state.meta.genres||[]).map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
    $('#f-channel').innerHTML='<option value="all">Toutes chaînes</option>'+(state.meta.channels||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#channels-list').innerHTML=(state.meta.channels||[]).map(c=>`<option value="${esc(c)}">`).join('');
    $('#d-year').innerHTML=(state.meta.years||[]).slice().reverse().map(y=>`<option value="${y}">${y}</option>`).join('');
    fillYears();
    $('#search-status').textContent=`Base chargée : ${state.meta.total_programs} programmes · ${(state.meta.years||[]).length} années`;
    return true;
  }catch(e){$('#search-status').textContent='❌ '+e.message;return false;}
}
function fillYears(){let ys=state.meta?.years||[];if(state.period!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+state.period);$('#f-year').innerHTML='<option value="all">Toutes années</option>'+ys.map(y=>`<option value="${y}">${y}</option>`).join('');}
function searchYears(){if(state.year!=='all')return[+state.year];let ys=state.meta?.years||[];if(state.period!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+state.period);return ys;}
async function loadSearchYear(y){
  if(state.loaded.has(y))return;
  const r=await fetch(`../data/search/${y}.json?t=`+Date.now(),{cache:'no-store'});
  const d=r.ok?await r.json():{programs:[]};const ch=state.meta.channels||[],ge=state.meta.genres||[];
  state.cache[y]=(d.programs||[]).map(x=>({title:x[0]||'',channel:ch[x[1]]||'Autres',date:x[2]||'',time:x[3]||'',genre:ge[x[4]]||'autre',people:x[5]||'',nt:norm(x[0]),np:norm(x[5])}));
  state.loaded.add(y);
}
let deb=null;
function schedule(){clearTimeout(deb);deb=setTimeout(runSearch,250);}
async function runSearch(){
  if(!state.meta)return;
  const words=norm(state.q).split(' ').filter(Boolean);
  const filtered=state.genre!=='all'||state.channel!=='all';
  if(!words.length&&!filtered){$('#search-results').innerHTML='<p class="status">Tapez un titre ou choisissez un filtre.</p>';$('#search-status').textContent='';return;}
  const ys=searchYears();$('#search-status').textContent='⏳ Chargement…';
  await Promise.all(ys.map(loadSearchYear));
  const g=new Map();let total=0;
  for(const y of ys)for(const r of state.cache[y]||[]){
    if(state.genre!=='all'&&r.genre!==state.genre)continue;
    if(state.channel!=='all'&&r.channel!==state.channel)continue;
    if(words.length){const h=r.nt+' '+r.np;if(!words.every(w=>h.includes(w)))continue;}
    total++;const k=r.nt+'|'+r.channel;let o=g.get(k);
    if(!o){o={key:k,title:r.title,channel:r.channel,genre:r.genre,occ:[]};g.set(k,o);}
    o.occ.push({date:r.date,time:r.time});
  }
  const arr=[...g.values()];arr.forEach(o=>o.occ.sort((a,b)=>{const x=dKey(a.date),z=dKey(b.date);for(let i=0;i<3;i++)if(x[i]!==z[i])return x[i]-z[i];return tKey(a.time)-tKey(b.time);}));
  arr.sort((a,b)=>b.occ.length-a.occ.length);
  state.groups=arr;state.expanded=new Set();
  $('#search-status').textContent=`${total} diffusions · ${arr.length} émissions`;
  renderGroups();
}
async function renderGroups(){
  const box=$('#search-results');
  if(!state.groups.length){box.innerHTML='<p class="status">Aucun résultat.</p>';return;}
  const ys=[...new Set(state.groups.slice(0,150).flatMap(g=>g.occ.map(o=>o.date.split('-')[2])))];
  if(configured())await Promise.all(ys.map(loadOverrideYear));
  box.innerHTML=state.groups.slice(0,150).map(g=>{
    const open=state.expanded.has(g.key);
    const dates=open?`<div class="dates">${g.occ.map(o=>{
      const ov=state.overrides[o.date.split('-')[2]]?.programs?.[progId(o.date,o.time,g.channel)];
      return `<button class="chip${ov?' edited':''}" data-edit="${esc(o.date)}|${esc(o.time)}|${esc(g.channel)}|${esc(g.title)}"><b>${esc(shortDate(o.date))}${ov?' ✏️':''}</b><span>${esc(o.time||'--:--')}</span></button>`;}).join('')}</div>`:'';
    return `<div class="group"><button class="group-head" data-toggle="${esc(g.key)}"><span class="group-title">${esc(g.title)}</span><span class="tag ch">${esc(g.channel)}</span><span class="tag ge">${esc(g.genre)}</span><span class="tag n">${g.occ.length}</span><span>${open?'−':'+'}</span></button>${dates}</div>`;
  }).join('');
}

// ---------- Journée ----------
async function loadDay(){
  const y=$('#d-year').value;if(!y)return;
  $('#day-status').textContent='⏳ Chargement…';
  const d=await ensureYearLoaded(y);
  if(!d){$('#day-status').textContent='Année introuvable (ouvre le site en ligne, pas le fichier local).';return;}
  const dates=Object.keys(d.dates||{}).sort((a,b)=>{const x=dKey(a),z=dKey(b);for(let i=0;i<3;i++)if(x[i]!==z[i])return x[i]-z[i];return 0;});
  state.dayYear=y;state.dayData=d;
  $('#d-date').innerHTML=dates.map(x=>`<option value="${esc(x)}">${esc(shortDate(x))}</option>`).join('');
  if(!state.dayDate||!dates.includes(state.dayDate))state.dayDate=dates[0];
  $('#d-date').value=state.dayDate||'';
  await renderDay();
}
async function renderDay(){
  const date=$('#d-date').value||state.dayDate;if(!date)return;
  state.dayDate=date;
  if(configured())await loadOverrideYear(date.split('-')[2]);
  const dd=sourceDay(date);
  const ps=((dd?.programs)||[]).slice().sort((a,b)=>tKey(a.time)-tKey(b.time));
  state.dayPrograms=ps;
  $('#day-status').textContent=`${shortDate(date)} · ${ps.length} programmes`;
  const ovMap=state.overrides[date.split('-')[2]]?.programs||{};
  $('#day-results').innerHTML=ps.map(p=>{
    const ov=ovMap[progId(date,p.time,p.channel)];
    const els=(p.segments||[]).map(s=>s.title).join(' · ');
    return `<div class="prow${ov?' edited':''}"><div class="ptime">${esc(p.time||'--:--')}</div><div class="pbody"><b>${esc(p.title)} ${ov?'<span class="tag ed">corrigé</span>':''}</b><small>${esc(p.channel)}${p.description?' — '+esc(p.description):''}</small>${els?`<div class="pels">🧩 ${esc(els)}</div>`:''}</div><button class="btn small" data-edit="${esc(date)}|${esc(p.time)}|${esc(p.channel)}|${esc(p.title)}">✏️</button></div>`;
  }).join('')||'<p class="status">Aucun programme.</p>';
}

// ---------- Éditeur ----------
async function openEditor(date,time,channel,title){
  const year=date.split('-')[2];
  if(!state.yearCache[year]){toast('⏳ Chargement des détails d\'origine…');await ensureYearLoaded(year);}
  if(configured())await loadOverrideYear(year);
  const id=progId(date,time,channel);
  const ov=state.overrides[year]?.programs?.[id];
  const src=findProgram(date,time,channel);
  const srcEls=(src?.segments||[]).map(s=>s.title);
  state.editing={date,time,channel,id,year,isNew:false,srcCount:srcEls.length};
  $('#ed-title').textContent=ov?'Modifier la correction':'Corriger le programme';
  $('#ed-sub').textContent=`${shortDate(date)} · ${time||'--:--'} · ${channel} — ${src?srcEls.length+' détail(s) d\'origine chargés':'⚠️ source introuvable'}`;
  $('#ed-date').value=date;$('#ed-time').value=time;$('#ed-channel').value=channel;
  $('#ed-action').value=ov?.action||'patch';
  $('#ed-name').value=ov?.title??title??src?.title??'';
  $('#ed-desc').value=ov?.description??src?.description??'';
  $('#ed-note').value=ov?.note||'';
  $('#ed-locked').checked=!!ov?.locked;
  const mode=ov?.elements_mode||'merge';
  document.querySelectorAll('input[name=ed-mode]').forEach(r=>r.checked=r.value===mode);
  renderElements(ov&&Array.isArray(ov.elements)?ov.elements.slice():srcEls);
  $('#editor-overlay').hidden=false;
}
function openNewProgram(){
  const date=state.dayDate||nDate(new Date().toLocaleDateString('fr-FR'))||'1996-01-01';
  state.editing={date,time:'',channel:'',id:null,year:date.split('-')[2],isNew:true,srcCount:0};
  $('#ed-title').textContent='Ajouter un programme';
  $('#ed-sub').textContent='Nouveau programme créé dans la couche overrides.';
  $('#ed-date').value=date;$('#ed-time').value='';$('#ed-channel').value='';
  $('#ed-action').value='add';$('#ed-name').value='';$('#ed-desc').value='';$('#ed-note').value='';
  $('#ed-locked').checked=true;
  document.querySelectorAll('input[name=ed-mode]').forEach(r=>r.checked=r.value==='replace');
  renderElements([]);$('#editor-overlay').hidden=false;
}
function renderElements(list){
  $('#ed-elements').innerHTML=list.map((t,i)=>`<div class="el"><input type="text" value="${esc(t)}" data-el="${i}"><button data-up="${i}" title="Monter">↑</button><button data-down="${i}" title="Descendre">↓</button><button data-del="${i}" title="Supprimer">✕</button></div>`).join('')||'<p class="status">Aucun détail.</p>';
}
function readElements(){return [...document.querySelectorAll('#ed-elements input[data-el]')].map(i=>i.value.trim()).filter(Boolean);}
function injectOriginButton(){
  const row=$('#btn-add-element')?.parentElement;
  if(!row||$('#btn-reload-origin'))return;
  const b=document.createElement('button');
  b.id='btn-reload-origin';b.className='btn small';b.type='button';b.textContent='↺ Origine';
  b.title='Recharger les détails depuis les données générées';
  b.onclick=()=>{const e=state.editing;if(!e)return;const src=findProgram(e.date,e.time,e.channel);const els=(src?.segments||[]).map(s=>s.title);renderElements(els);toast(els.length?`↺ ${els.length} détails d'origine rechargés`:'Aucun détail d\'origine');};
  row.appendChild(b);
}
function savePending(){
  const e=state.editing;if(!e)return;
  const date=nDate($('#ed-date').value);const time=nTime($('#ed-time').value);const channel=$('#ed-channel').value.trim();
  if(!date||!channel){toast('❌ Date et chaîne obligatoires');return;}
  const action=$('#ed-action').value;
  if(action==='add'&&!time){toast('❌ Heure obligatoire pour un ajout');return;}
  const mode=document.querySelector('input[name=ed-mode]:checked').value;
  const els=readElements();
  if(mode==='replace'&&e.srcCount>0&&els.length<e.srcCount){
    if(!confirm(`⚠️ Mode « Remplacer tout ».\n\nLa source contient ${e.srcCount} détail(s).\nTu vas en enregistrer ${els.length}.\n\nLes détails non listés seront SUPPRIMÉS pour ce programme.\n\nContinuer ?`))return;
  }
  const year=date.split('-')[2];
  const id=action==='add'?progId(date,time,channel):e.id||progId(date,time,channel);
  state.pending[year]=state.pending[year]||{};
  state.pending[year][id]={date,time,channel,action,title:$('#ed-name').value.trim(),description:$('#ed-desc').value.trim(),
    elements:els,elements_mode:mode,locked:$('#ed-locked').checked,note:$('#ed-note').value.trim(),updated_at:new Date().toISOString()};
  $('#editor-overlay').hidden=true;updatePending();toast('✔ Mis en attente — pense à enregistrer sur GitHub');
}
function updatePending(){
  const n=Object.values(state.pending).reduce((s,m)=>s+Object.keys(m).length,0);
  $('#pending-badge').textContent=n;
  const box=$('#pending-list');
  if(!n){box.innerHTML='<p class="status">Aucune modification en attente.</p>';return;}
  box.innerHTML=Object.entries(state.pending).flatMap(([y,m])=>Object.entries(m).map(([id,p])=>
    `<div class="prow"><div class="ptime">${esc(p.time||'--:--')}</div><div class="pbody"><b>${esc(p.title||'(sans titre)')}</b><small>${esc(shortDate(p.date))} · ${esc(p.channel)} · ${esc(p.action)} · ${p.elements.length} détail(s) · ${esc(p.elements_mode)}${p.locked?' · 🔒':''}</small></div><button class="btn small danger" data-drop="${esc(y)}|${esc(id)}">✕</button></div>`)).join('');
}
async function commitAll(){
  if(!configured()){toast('❌ Configure d\'abord les réglages');openSettings();return;}
  const years=Object.keys(state.pending);if(!years.length){toast('ℹ️ Rien à enregistrer');return;}
  $('#btn-commit').disabled=true;
  try{
    for(const y of years){
      const path=`${state.cfg.path||'data'}/overrides/${y}.json`;
      delete state.overrides[y];
      const remote=await loadOverrideYear(y);
      const merged={year:Number(y),updated_at:new Date().toISOString(),programs:{...(remote.programs||{}),...state.pending[y]}};
      await ghPut(path,JSON.stringify(merged,null,2),`edit(overrides): ${y} — ${Object.keys(state.pending[y]).length} correction(s)`);
      state.overrides[y]=merged;
    }
    state.pending={};updatePending();
    toast('✅ Enregistré. Relance generate_index_only.');
    if(state.currentTab==='day')renderDay();else renderGroups();
  }catch(e){toast('❌ '+e.message);}finally{$('#btn-commit').disabled=false;}
}

// ---------- Réglages ----------
function openSettings(){const c=state.cfg;$('#st-owner').value=c.owner||'xbodin2g';$('#st-repo').value=c.repo||'tv-retro';$('#st-branch').value=c.branch||'main';$('#st-path').value=c.path||'data';$('#st-token').value=c.token||'';$('#st-status').textContent='';$('#settings-overlay').hidden=false;}
function closeSettings(){$('#settings-overlay').hidden=true;}
async function saveSettings(){
  state.cfg={owner:$('#st-owner').value.trim(),repo:$('#st-repo').value.trim(),branch:$('#st-branch').value.trim()||'main',path:$('#st-path').value.trim()||'data',token:$('#st-token').value.trim()};
  localStorage.setItem(CFG_KEY,JSON.stringify(state.cfg));
  state.overrides={};state.shas={};refreshConn();
  closeSettings();
  toast('💾 Réglages enregistrés');
  if(!state.meta)await loadMeta();
  if(state.currentTab==='day'&&state.dayData)renderDay();
}
function refreshConn(){const p=$('#conn-state');if(configured()){p.textContent=`${state.cfg.owner}/${state.cfg.repo}`;p.className='pill on';}else{p.textContent='non connecté';p.className='pill off';}}
async function testConn(){
  $('#st-status').textContent='⏳ Test en cours…';
  try{
    const r=await fetch(`https://api.github.com/repos/${$('#st-owner').value.trim()}/${$('#st-repo').value.trim()}`,{headers:{Authorization:`Bearer ${$('#st-token').value.trim()}`,Accept:'application/vnd.github+json'}});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();
    $('#st-status').textContent=`✅ Connecté à ${j.full_name} — clique maintenant « Enregistrer »`;
  }catch(e){$('#st-status').textContent='❌ '+e.message;}
}

// ---------- Init ----------
function setTab(t){state.currentTab=t;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+t));if(t==='day'&&!state.dayData)loadDay();if(t==='pending')updatePending();}
document.addEventListener('DOMContentLoaded',async()=>{
  refreshConn();updatePending();injectOriginButton();
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  $('#btn-settings').onclick=openSettings;$('#st-close').onclick=closeSettings;
  $('#st-save').onclick=saveSettings;$('#st-test').onclick=testConn;
  $('#st-clear').onclick=()=>{state.cfg.token='';localStorage.setItem(CFG_KEY,JSON.stringify(state.cfg));$('#st-token').value='';refreshConn();toast('🗑️ Token effacé');};
  $('#q').oninput=e=>{state.q=e.target.value;schedule();};
  $('#f-period').onchange=e=>{state.period=e.target.value;state.year='all';fillYears();runSearch();};
  $('#f-year').onchange=e=>{state.year=e.target.value;runSearch();};
  $('#f-genre').onchange=e=>{state.genre=e.target.value;runSearch();};
  $('#f-channel').onchange=e=>{state.channel=e.target.value;runSearch();};
  $('#btn-reset').onclick=()=>{state.q='';state.period='all';state.year='all';state.genre='all';state.channel='all';$('#q').value='';['#f-period','#f-year','#f-genre','#f-channel'].forEach(s=>$(s).value='all');fillYears();$('#search-results').innerHTML='';$('#search-status').textContent='';};
  $('#btn-load-day').onclick=loadDay;$('#d-year').onchange=()=>{state.dayDate=null;loadDay();};
  $('#d-date').onchange=renderDay;$('#btn-add-program').onclick=openNewProgram;
  $('#btn-commit').onclick=commitAll;
  $('#btn-discard').onclick=()=>{if(confirm('Annuler toutes les modifications en attente ?')){state.pending={};updatePending();toast('🗑️ Annulé');}};
  $('#ed-close').onclick=()=>$('#editor-overlay').hidden=true;
  $('#ed-save').onclick=savePending;
  $('#ed-remove').onclick=()=>{const e=state.editing;if(e?.id&&state.pending[e.year]){delete state.pending[e.year][e.id];updatePending();}$('#editor-overlay').hidden=true;toast('Correction retirée de la file');};
  $('#btn-add-element').onclick=()=>{const v=$('#ed-new-element').value.trim();if(!v)return;renderElements([...readElements(),v]);$('#ed-new-element').value='';};
  $('#ed-new-element').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#btn-add-element').click();}};
  $('#st-token').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveSettings();}};
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-toggle]');if(t){const k=t.dataset.toggle;state.expanded.has(k)?state.expanded.delete(k):state.expanded.add(k);renderGroups();return;}
    const ed=e.target.closest('[data-edit]');if(ed){const[d,ti,c,tt]=ed.dataset.edit.split('|');openEditor(d,ti,c,tt);return;}
    const dr=e.target.closest('[data-drop]');if(dr){const[y,id]=dr.dataset.drop.split('|');delete state.pending[y][id];if(!Object.keys(state.pending[y]).length)delete state.pending[y];updatePending();return;}
    const del=e.target.closest('[data-del]');if(del){const l=readElements();l.splice(+del.dataset.del,1);renderElements(l);return;}
    const up=e.target.closest('[data-up]');if(up){const l=readElements();const i=+up.dataset.up;if(i>0){[l[i-1],l[i]]=[l[i],l[i-1]];renderElements(l);}return;}
    const dn=e.target.closest('[data-down]');if(dn){const l=readElements();const i=+dn.dataset.down;if(i<l.length-1){[l[i+1],l[i]]=[l[i],l[i+1]];renderElements(l);}return;}
  });
  ['#editor-overlay','#settings-overlay'].forEach(s=>$(s).addEventListener('click',e=>{if(e.target===$(s))$(s).hidden=true;}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){['#editor-overlay','#settings-overlay'].forEach(s=>$(s).hidden=true);}});
  await loadMeta();
  if(!configured())openSettings();
});