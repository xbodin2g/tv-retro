/* =====================================================
   TV RÉTRO · RÉGIE — éditeur d'archives
   Couche overrides permanente. LIVE (GitHub) ou DÉMO.
   ===================================================== */
const CFG_KEY='tvretroEditCfg',VIEWS_KEY='tvretroEditViews',DEMO_OV_KEY='tvretroEditDemoOv';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function norm(v){if(!v)return'';return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function slug(v){return norm(v).replace(/\s+/g,'-').replace(/^-|-$/g,'')||'autre';}
function nDate(d){if(!d)return null;const p=String(d).trim().split(/[-\/]/);if(p.length!==3)return null;let day,mo,yr;if(p[0].length===4){yr=p[0];mo=p[1];day=p[2];}else{day=p[0];mo=p[1];yr=p[2];}day=String(day).padStart(2,'0');mo=String(mo).padStart(2,'0');const t=new Date(+yr,+mo-1,+day);if(t.getFullYear()!=+yr||t.getMonth()!=+mo-1||t.getDate()!=+day)return null;return `${day}-${mo}-${yr}`;}
function shortDate(d){const n=nDate(d);if(!n)return d||'';const[a,b,c]=n.split('-');return `${a}/${b}/${c}`;}
function dKey(d){const n=nDate(d);if(!n)return[9999,99,99];const[a,b,c]=n.split('-').map(Number);return[c,b,a];}
function cmpDate(a,b){const x=dKey(a),y=dKey(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;}
function nTime(v){const m=String(v||'').trim().match(/^(\d{1,2})[:h.](\d{2})$/);if(!m)return'';const h=+m[1],mi=+m[2];return h>23||mi>59?'':`${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;}
function tKey(t){if(!t||!t.includes(':'))return 9999;const[h,m]=t.split(':').map(Number);return h>=5?(h-5)*60+m:(h+19)*60+m;}
function progId(d,t,c){return `${nDate(d)||d}__${String(t||'sans-heure').replace(':','h')}__${slug(c)}__p`;}
function b64(s){const b=new TextEncoder().encode(s);let o='';b.forEach(x=>o+=String.fromCharCode(x));return btoa(o);}
function unb64(s){const bin=atob(String(s).replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
const CH_HUE={'ORTF 1':'--amber','ORTF 2':'--violet','ORTF 3':'--cyan','TF1':'--blue','Antenne 2':'--red','France 2':'--red','FR3':'--green','France 3':'--green','Canal+':'--soft','TV6':'--magenta','M6':'--magenta','La Cinq':'--violet','La Sept':'--cyan','Arte':'--amber','La Cinquième':'--cyan','France 5':'--cyan'};
function chTag(c){const v=CH_HUE[c]||'--blue';return `<span class="tag" style="background:color-mix(in srgb,var(${v}) 16%,transparent);border-color:color-mix(in srgb,var(${v}) 55%,transparent);color:var(${v})">${esc(c)}</span>`;}

/* ---------- jeu de secours ---------- */
const DEMO_SHOWS=[
 {t:"Club Dorothée",c:"TF1",g:"jeunesse",p:"Dorothée, Ariane, Jacky, Corbier",h:["07:10","09:27","16:05"],e:["Sailor Moon","Dragon Ball Z","Power Rangers","La Croisière Foll'Amour","Les Minipouss","Jeanne et Serge","Nick Larson","Les Années fac","Premiers baisers","Salut les Musclés"]},
 {t:"Le Noël de l'amitié du Club Dorothée",c:"TF1",g:"jeunesse",p:"Dorothée, Ariane, Jacky, Corbier",h:["08:55"],e:["Sailor Moon","Dragon Ball Z","Les Chevaliers du Zodiaque","Salut les Musclés","Premiers baisers"]},
 {t:"Récré A2",c:"Antenne 2",g:"jeunesse",p:"Dorothée, Pierre Jacquemont, Ariane",h:["16:10","17:45"],e:["Émilie","Les Paladins de France","Discopuce","Papivole","Les Quat'z Amis","Sido et Rémi","La Caverne d'Abracadabra"]},
 {t:"Amuse 3",c:"FR3",g:"jeunesse",p:"",h:["08:00","17:30"],e:["Petit Ours Brun","Inspecteur Gadget","Lucky Luke","Souris noire","Les petits malins","Naturimages"]},
 {t:"Cabou Cadin",c:"Canal+",g:"jeunesse",p:"Philippe Dana",h:["07:00","08:05"],e:["Les Minipouss","Mister T.","Tom et Jerry","Bogus","Mimi Cracra"]},
 {t:"Vitamine",c:"TF1",g:"jeunesse",p:"Dorothée, Jacky",h:["07:20"],e:["Les Gummies","Visionaries","Tarzan","Galaxie Express 99"]},
 {t:"Youpi ! L'école est finie",c:"La Cinq",g:"jeunesse",p:"",h:["07:30","16:10"],e:["Le magicien d'Oz","Robotech","Flo et les Robinson suisses","Les aventures du petit koala"]},
 {t:"Giga",c:"France 2",g:"jeunesse",p:"",h:["17:10"],e:["Dragon Ball Z","Les Chevaliers du Zodiaque","Bécébégé"]},
 {t:"Les Visiteurs du mercredi",c:"TF1",g:"jeunesse",p:"Roger Zabel, Pierrette Brès",h:["14:00"],e:["Croque-Vacances","Le Village dans les nuages","Midi Première"]},
 {t:"Multitop",c:"M6",g:"musique",p:"",h:["11:00"],e:[]},
 {t:"Hit Machine",c:"M6",g:"musique",p:"Charly et Lulu",h:["10:30"],e:[]},
 {t:"Top 50",c:"Canal+",g:"musique",p:"Marc Toesca",h:["20:30"],e:[]},
 {t:"Le Journal de la Une",c:"TF1",g:"journal",p:"Yves Mourousi",h:["13:00","20:00"],e:[]},
 {t:"Questions pour un champion",c:"France 3",g:"jeu",p:"Julien Lepers",h:["18:25"],e:[]},
 {t:"La Roue de la Fortune",c:"TF1",g:"jeu",p:"Christian Morin, Fanfan",h:["19:20"],e:[]},
 {t:"Santa Barbara",c:"TF1",g:"feuilleton",p:"",h:["18:55"],e:[]},
 {t:"Columbo",c:"TF1",g:"série",p:"Peter Falk",h:["20:35"],e:[]},
 {t:"Cocktail",c:"TF1",g:"film",p:"Tom Cruise",h:["20:45"],e:["Film de Roger Donaldson"]},
 {t:"Dimanche Martin",c:"Antenne 2",g:"variétés",p:"Jacques Martin",h:["14:10"],e:["Le monde est à vous","Magnum","L'école des fans"]}
];
const DEMO_DATES=["03-01-1980","20-11-1980","15-05-1985","24-12-1992","15-05-1996","19-06-1996","04-12-1996"];
function channelOk(c,d){const y=+d.split('-')[2],m=+d.split('-')[1],after=y>1992||(y===1992&&m>=9);
 if(c==='Canal+')return y>=1984;if(c==='M6')return y>=1987;if(c==='La Cinq')return y>=1986&&y<=1992;
 if(c==='France 2'||c==='France 3')return after;if(c==='Antenne 2'||c==='FR3')return !after;return true;}
function buildDemo(){
 const rows=[],days={};
 DEMO_DATES.forEach(d=>{const progs=[];
  DEMO_SHOWS.filter(s=>channelOk(s.c,d)).forEach(s=>{
   const seed=hash(s.t+d),times=s.h.filter((_,i)=>((seed>>i)&1)||i===0);
   times.forEach(h=>{
    const els=s.e.length?s.e.filter((_,i)=>(hash(s.t+d+h)>>i)&1).slice(0,5):[];
    const title=s.t.toUpperCase();
    rows.push([title,0,d,h,s.g,s.p]);
    progs.push({time:h,channel:s.c,title,description:s.g==='jeunesse'?'Programme jeunesse':(s.p?'Présenté par '+s.p:''),
     segments:els.map((t,i)=>({index:i,title:t,raw:t,source:'ina'})),ina_notice:els.length?'TV_'+(100000+seed%800000)+'.001':''});
   });
  });
  progs.sort((a,b)=>tKey(a.time)-tKey(b.time));
  days[d]={date:d,source:'demo',programs_count:progs.length,programs:progs};
 });
 const channels=[...new Set(DEMO_SHOWS.map(s=>s.c))].filter(c=>rows.some(r=>DEMO_SHOWS.find(s=>s.t.toUpperCase()===r[0]).c===c));
 rows.forEach(r=>{r[1]=channels.indexOf(DEMO_SHOWS.find(s=>s.t.toUpperCase()===r[0]).c);});
 const genres=[...new Set(rows.map(r=>r[4]))],years=[...new Set(DEMO_DATES.map(d=>+d.split('-')[2]))].sort((a,b)=>a-b);
 const byYear={};rows.forEach(r=>{const y=r[2].split('-')[2];(byYear[y]=byYear[y]||[]).push(r);});
 const counts={};rows.forEach(r=>counts[r[0]]=(counts[r[0]]||0)+1);
 const people={};rows.forEach(r=>String(r[5]).split(/,\s*/).filter(Boolean).forEach(p=>people[p]=(people[p]||0)+1));
 return {meta:{channels,genres,years,total_programs:rows.length,
  top_shows:Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,40),
  top_people:Object.entries(people).sort((a,b)=>b[1]-a[1]).slice(0,40)},byYear,days};
}

/* ---------- état ---------- */
const S={cfg:JSON.parse(localStorage.getItem(CFG_KEY)||'{}'),mode:'demo',demo:null,meta:null,
 rows:{},loaded:new Set(),days:{},overrides:{},shas:{},pending:{},sel:new Set(),
 views:JSON.parse(localStorage.getItem(VIEWS_KEY)||'[]'),
 f:{q:'',period:'all',year:'all',genre:'all',channel:'all',sort:'count'},groups:[],open:new Set(),
 day:{year:null,date:null,channel:'all'},ed:null,tab:'search',busy:false};
const configured=()=>!!(S.cfg.owner&&S.cfg.repo&&S.cfg.token);
const ovPath=y=>`${S.cfg.path||'data'}/overrides/${y}.json`;

function toast(msg,kind='',action){
 const el=document.createElement('div');el.className='toast '+kind;el.innerHTML=`<span>${esc(msg)}</span>`;
 if(action){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.onclick=()=>{action.fn();el.remove();};el.appendChild(b);}
 $('#toasts').appendChild(el);
 setTimeout(()=>{el.style.transition='opacity .3s,transform .3s';el.style.opacity='0';el.style.transform='translateY(10px)';setTimeout(()=>el.remove(),320);},action?7000:3600);
}

/* ---------- GitHub ---------- */
const ghHeaders=()=>({Authorization:`Bearer ${String(S.cfg.token).replace(/\s+/g,'')}`,Accept:'application/vnd.github+json'});
async function ghGet(p){const r=await fetch(`https://api.github.com/repos/${S.cfg.owner}/${S.cfg.repo}/contents/${p}?ref=${encodeURIComponent(S.cfg.branch||'main')}&t=${Date.now()}`,{headers:ghHeaders(),cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw new Error(`GitHub ${r.status}`);return r.json();}
async function ghPut(p,content,message){const body={message,content:b64(content),branch:S.cfg.branch||'main'};if(S.shas[p])body.sha=S.shas[p];
 const r=await fetch(`https://api.github.com/repos/${S.cfg.owner}/${S.cfg.repo}/contents/${p}`,{method:'PUT',headers:{...ghHeaders(),'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)throw new Error(`Écriture ${r.status} — ${(await r.text()).slice(0,160)}`);
 const j=await r.json();S.shas[p]=j.content?.sha;return j;}
async function testConnection(owner,repo,token){
 const t=String(token||'').replace(/\s+/g,'');
 if(!owner||!repo)throw new Error('Propriétaire et dépôt requis.');
 if(!t)throw new Error('Token vide.');
 const r=await fetch(`https://api.github.com/repos/${owner}/${repo}`,{headers:{Authorization:`Bearer ${t}`,Accept:'application/vnd.github+json'},cache:'no-store'});
 if(r.status===401)throw new Error('401 — token invalide ou expiré.');
 if(r.status===403)throw new Error('403 — permission refusée (Contents: Read and write ?) ou quota atteint.');
 if(r.status===404)throw new Error('404 — dépôt introuvable ou token sans accès.');
 if(!r.ok)throw new Error('HTTP '+r.status);
 return r.json();
}

/* ---------- données ---------- */
async function bootstrap(){
 if(location.protocol!=='file:'){
  try{const r=await fetch('../data/search_meta.json?t='+Date.now(),{cache:'no-store'});if(r.ok){S.meta=await r.json();S.mode='live';}}catch(e){}
 }
 if(!S.meta){S.demo=buildDemo();S.meta=S.demo.meta;S.mode='demo';}
 const m=S.meta,dec=[...new Set((m.years||[]).map(y=>Math.floor(y/10)*10))].sort((a,b)=>a-b);
 $('#f-period').innerHTML='<option value="all">Toute la base</option>'+dec.map(d=>`<option value="${d}">Années ${String(d).slice(2)}</option>`).join('');
 $('#f-genre').innerHTML='<option value="all">Tous</option>'+(m.genres||[]).map(g=>`<option value="${esc(g)}">${esc(g)}</option>`).join('');
 const chOpts='<option value="all">Toutes</option>'+(m.channels||[]).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 $('#f-channel').innerHTML=chOpts;$('#d-channel').innerHTML=chOpts;
 $('#channels-list').innerHTML=(m.channels||[]).map(c=>`<option value="${esc(c)}">`).join('');
 $('#d-year').innerHTML=(m.years||[]).slice().reverse().map(y=>`<option value="${y}">${y}</option>`).join('');
 fillYears();
 $('#stat-programs').textContent=(m.total_programs||0).toLocaleString('fr-FR');
 $('#stat-shows').textContent=(m.top_shows||[]).length.toLocaleString('fr-FR');
 $('#stat-years').textContent=(m.years||[]).length;
 if(S.mode==='demo'){$('#demo-banner').hidden=false;
  $('#demo-banner').innerHTML=location.protocol==='file:'
   ?`⚠️ Fichier ouvert depuis le disque : données du dépôt illisibles. <b>Mode démonstration</b> — tout l'éditeur fonctionne, l'enregistrement produit un JSON. Pour le mode réel : <code>https://${esc(S.cfg.owner||'xbodin2g')}.github.io/${esc(S.cfg.repo||'tv-retro')}/edit/</code>`
   :`⚠️ Données du dépôt injoignables — <b>mode démonstration</b>. Lance <code>generate_index_only</code> puis recharge pour le mode réel.`;}
 refreshStatus();renderViews();renderPending();renderSearchEmpty();
 $('#search-status').textContent=`${(m.total_programs||0).toLocaleString('fr-FR')} programmes · ${(m.years||[]).length} années — tape une recherche ou choisis un filtre.`;
}
function refreshStatus(){
 const m=$('#status-mode');m.textContent=S.mode==='live'?'LIVE':'DÉMO';m.className='pill '+(S.mode==='live'?'ok':'warn');
 $('#onair-dot').className='onair'+(S.mode==='live'&&configured()?' live':'');
 const c=$('#status-conn');
 if(configured()){c.textContent=`${S.cfg.owner}/${S.cfg.repo}`;c.className='pill ok';}else{c.textContent='non connecté';c.className='pill off';}
}
async function ensureRows(y){
 if(S.loaded.has(y))return;
 if(S.mode==='demo'){S.rows[y]=(S.demo.byYear[y]||[]).map(decode);S.loaded.add(y);return;}
 let d={programs:[]};
 try{const r=await fetch(`../data/search/${y}.json?t=`+Date.now(),{cache:'no-store'});if(r.ok)d=await r.json();}catch(e){}
 S.rows[y]=(d.programs||[]).map(decode);S.loaded.add(y);
}
function decode(r){const ch=S.meta.channels||[],ge=S.meta.genres||[];
 return {title:r[0]||'',channel:ch[r[1]]||'Autres',date:r[2]||'',time:r[3]||'',genre:ge[r[4]]||'autre',people:r[5]||'',nt:norm(r[0]),np:norm(r[5])};}
async function ensureDay(y){
 if(S.days[y])return S.days[y];
 if(S.mode==='demo'){S.days[y]=S.demo.days;return S.days[y];}
 try{const r=await fetch(`../data/${y}.json?t=`+Date.now(),{cache:'no-store'});if(r.ok){const d=await r.json();S.days[y]=d.dates||{};}}catch(e){}
 S.days[y]=S.days[y]||{};return S.days[y];
}
function srcProgram(d,t,c){const day=S.days[d.split('-')[2]]?.[d];if(!day)return null;
 return (day.programs||[]).find(p=>p.time===t&&p.channel===c)||null;}
async function loadOv(y){
 if(S.overrides[y])return S.overrides[y];
 let data={year:+y,programs:{}};
 if(S.mode==='demo'){const all=JSON.parse(localStorage.getItem(DEMO_OV_KEY)||'{}');data=all[y]||data;}
 else if(configured()){try{const f=await ghGet(ovPath(y));if(f){S.shas[ovPath(y)]=f.sha;data=JSON.parse(unb64(f.content));}}catch(e){toast('Lecture overrides : '+e.message,'warn');}}
 data.programs=data.programs||{};S.overrides[y]=data;return data;
}
function effOv(d,t,c){const y=d.split('-')[2];return S.pending[y]?.[progId(d,t,c)]||S.overrides[y]?.programs?.[progId(d,t,c)]||null;}

/* ---------- vues ---------- */
function renderViews(){
 $('#views-row').innerHTML=S.views.length
  ?S.views.map(v=>`<button class="view-chip" data-view="${esc(v.id)}" type="button"><b>⭐ ${esc(v.name)}</b><i data-viewdel="${esc(v.id)}">✕</i></button>`).join('')
  :`<span class="hint">⭐ Enregistre une combinaison de filtres pour la retrouver en un clic.</span>`;
}
function saveView(){
 const name=prompt('Nom de la vue :',[S.f.q,S.f.channel!=='all'?S.f.channel:'',S.f.genre!=='all'?S.f.genre:''].filter(Boolean).join(' · ')||'Ma vue');
 if(!name)return;
 S.views.push({id:'v'+Date.now(),name:name.slice(0,40),f:{...S.f}});
 localStorage.setItem(VIEWS_KEY,JSON.stringify(S.views));renderViews();toast('Vue enregistrée.','ok');
}
function applyView(id){const v=S.views.find(x=>x.id===id);if(!v)return;S.f={...v.f};
 $('#q').value=S.f.q;$('#f-period').value=S.f.period;fillYears();$('#f-year').value=S.f.year;
 $('#f-genre').value=S.f.genre;$('#f-channel').value=S.f.channel;$('#f-sort').value=S.f.sort;runSearch();}

/* ---------- recherche ---------- */
function fillYears(){let ys=S.meta?.years||[];if(S.f.period!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+S.f.period);
 $('#f-year').innerHTML='<option value="all">Toutes</option>'+ys.map(y=>`<option value="${y}">${y}</option>`).join('');}
function targetYears(){if(S.f.year!=='all')return[+S.f.year];let ys=S.meta?.years||[];if(S.f.period!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+S.f.period);return ys;}
let deb=null;const schedule=()=>{clearTimeout(deb);deb=setTimeout(runSearch,220);};
function renderSearchEmpty(){
 const picks=(S.meta?.top_shows||[]).slice(0,10);
 $('#search-results').innerHTML=`<div class="empty"><b>Que veux-tu corriger ?</b>Cherche une émission, une série, un film ou un présentateur — ou filtre par genre et chaîne.${picks.length?`<div class="dates" style="border:0;justify-content:center;margin-top:.8rem">${picks.map(p=>`<button class="chip" data-suggest="${esc(p[0])}" type="button"><b>${esc(p[0])}</b><span>${p[1]} diffusions</span></button>`).join('')}</div>`:''}</div>`;
}
async function runSearch(){
 if(!S.meta)return;
 const words=norm(S.f.q).split(' ').filter(Boolean),filtered=S.f.genre!=='all'||S.f.channel!=='all';
 if(!words.length&&!filtered){$('#search-status').textContent='';renderSearchEmpty();return;}
 const ys=targetYears();$('#search-status').textContent='⏳ Chargement des index…';
 await Promise.all(ys.map(ensureRows));
 const g=new Map();let total=0;
 for(const y of ys)for(const r of S.rows[y]||[]){
  if(S.f.genre!=='all'&&r.genre!==S.f.genre)continue;
  if(S.f.channel!=='all'&&r.channel!==S.f.channel)continue;
  if(words.length){const h=r.nt+' '+r.np;if(!words.every(w=>h.includes(w)))continue;}
  total++;const k=r.nt+'|'+r.channel;let o=g.get(k);
  if(!o){o={key:k,title:r.title,channel:r.channel,genre:r.genre,occ:[]};g.set(k,o);}
  o.occ.push({date:r.date,time:r.time});
 }
 const arr=[...g.values()];
 arr.forEach(o=>o.occ.sort((a,b)=>cmpDate(a.date,b.date)||tKey(a.time)-tKey(b.time)));
 arr.sort((a,b)=>S.f.sort==='alpha'?a.title.localeCompare(b.title,'fr'):S.f.sort==='recent'?cmpDate(b.occ[b.occ.length-1].date,a.occ[a.occ.length-1].date):b.occ.length-a.occ.length);
 S.groups=arr;S.open=new Set();
 $('#search-status').textContent=`${total.toLocaleString('fr-FR')} diffusions · ${arr.length.toLocaleString('fr-FR')} émissions`;
 await renderGroups();
}
async function renderGroups(){
 const box=$('#search-results');
 if(!S.groups.length){box.innerHTML='<div class="empty"><b>Aucun résultat</b>Élargis la période ou retire un filtre.</div>';return;}
 const shown=S.groups.slice(0,150),ys=[...new Set(shown.flatMap(g=>g.occ.map(o=>o.date.split('-')[2])))];
 await Promise.all(ys.map(loadOv));
 box.innerHTML=shown.map(g=>{
  const open=S.open.has(g.key);
  const dates=open?`<div class="dates">${g.occ.map(o=>{const ov=effOv(o.date,o.time,g.channel);
   return `<button class="chip${ov?' edited':''}" type="button" data-edit="${esc(o.date)}|${esc(o.time)}|${esc(g.channel)}|${esc(g.title)}"><b>${esc(shortDate(o.date))}${ov?' ✏️':''}</b><span>${esc(o.time||'--:--')}</span></button>`;}).join('')}</div>`:'';
  return `<div class="group"><button class="group-head" type="button" data-toggle="${esc(g.key)}"><span class="gtitle">${esc(g.title)}</span>${chTag(g.channel)}<span class="tag ge">${esc(g.genre)}</span><span class="tag n">${g.occ.length}</span><span class="chev">${open?'−':'+'}</span></button>${dates}</div>`;
 }).join('')+(S.groups.length>150?`<p class="status">… ${S.groups.length-150} autres émissions. Affine la recherche.</p>`:'');
}

/* ---------- journée ---------- */
async function loadDay(){
 const y=$('#d-year').value;if(!y)return;
 $('#day-status').textContent='⏳ Chargement…';
 const days=await ensureDay(y),dates=Object.keys(days).sort(cmpDate);
 S.day.year=y;
 $('#d-date').innerHTML=dates.length?dates.map(d=>`<option value="${esc(d)}">${esc(shortDate(d))}</option>`).join(''):'<option value="">— aucune journée —</option>';
 if(!S.day.date||!dates.includes(S.day.date))S.day.date=dates[0]||null;
 $('#d-date').value=S.day.date||'';
 await renderDay();
}
async function renderDay(){
 const d=$('#d-date').value||S.day.date;
 if(!d){$('#day-status').textContent='Aucune journée disponible pour cette année.';$('#day-results').innerHTML='';return;}
 S.day.date=d;const y=d.split('-')[2];await loadOv(y);
 let ps=[...(S.days[y]?.[d]?.programs||[])];
 Object.values(S.pending[y]||{}).forEach(o=>{if(o.action==='add'&&o.date===d&&!ps.some(p=>p.time===o.time&&p.channel===o.channel))
  ps.push({time:o.time,channel:o.channel,title:o.title,description:o.description,segments:(o.elements||[]).map((t,i)=>({index:i,title:t}))});});
 ps=ps.filter(p=>S.day.channel==='all'||p.channel===S.day.channel).sort((a,b)=>tKey(a.time)-tKey(b.time));
 $('#day-status').textContent=`${shortDate(d)} · ${ps.length} programme(s)`;
 $('#day-results').innerHTML=ps.length?ps.map(p=>{
  const ov=effOv(d,p.time,p.channel),title=ov?.title||p.title;
  const els=ov&&Array.isArray(ov.elements)?ov.elements:(p.segments||[]).map(s=>s.title);
  const hid=ov?.action==='hide';
  return `<div class="prow${ov?' edited':''}${hid?' hidden-p':''}"><div class="ptime">${esc(ov?.time||p.time||'--:--')}</div><div class="pbody"><b>${esc(title)} ${ov?`<span class="tag ${hid?'hid':'ed'}">${hid?'masqué':'corrigé'}</span>`:''}</b><small>${esc(p.channel)}${p.description?' — '+esc(p.description):''}${ov?.locked?' · 🔒':''}</small>${els.length?`<div class="pels">🧩 ${els.map(t=>`<em>${esc(t)}</em>`).join(' · ')}</div>`:''}</div><div class="pacts"><button class="btn small" type="button" data-edit="${esc(d)}|${esc(p.time)}|${esc(p.channel)}|${esc(p.title)}">✏️ Éditer</button></div></div>`;
 }).join(''):'<div class="empty"><b>Journée vide</b>Ajoute un programme ou change de chaîne.</div>';
}

/* ---------- tiroir ---------- */
async function openEditor(d,t,c,title){
 const y=d.split('-')[2];
 if(!S.days[y]){toast('Chargement des détails d\'origine…');await ensureDay(y);}
 await loadOv(y);
 const ov=effOv(d,t,c),src=srcProgram(d,t,c),srcEls=(src?.segments||[]).map(s=>s.title);
 S.ed={date:d,time:t,channel:c,id:progId(d,t,c),year:y,srcCount:srcEls.length,isNew:false};
 $('#dr-title').textContent=ov?'Modifier la correction':'Corriger le programme';
 $('#dr-sub').textContent=`${shortDate(d)} · ${t||'--:--'} · ${c} — ${src?srcEls.length+' détail(s) d\'origine':'source non chargée'}`;
 $('#ed-date').value=d;$('#ed-time').value=t;$('#ed-channel').value=c;
 $('#ed-action').value=ov?.action||'patch';
 $('#ed-name').value=ov?.title??title??src?.title??'';
 $('#ed-desc').value=ov?.description??src?.description??'';
 $('#ed-note').value=ov?.note||'';$('#ed-locked').checked=!!ov?.locked;
 const mode=ov?.elements_mode||'merge';
 $$('input[name=ed-mode]').forEach(r=>r.checked=r.value===mode);
 const list=ov&&Array.isArray(ov.elements)?ov.elements.slice():srcEls;
 renderEls(list);
 $('#dr-delete').hidden=!ov;
 openLayer('drawer');
 revealDetails(list.length>0);
}
function openNew(){
 const d=S.day.date||DEMO_DATES[3];
 S.ed={date:d,time:'',channel:'',id:null,year:d.split('-')[2],srcCount:0,isNew:true};
 $('#dr-title').textContent='Ajouter un programme';
 $('#dr-sub').textContent='Nouvelle entrée dans la couche overrides.';
 $('#ed-date').value=d;$('#ed-time').value='';$('#ed-channel').value=S.day.channel!=='all'?S.day.channel:'';
 $('#ed-action').value='add';$('#ed-name').value='';$('#ed-desc').value='';$('#ed-note').value='';$('#ed-locked').checked=true;
 $$('input[name=ed-mode]').forEach(r=>r.checked=r.value==='replace');
 renderEls([]);$('#dr-delete').hidden=true;
 openLayer('drawer');
 setTimeout(()=>$('#ed-name').focus(),80);
}
function revealDetails(hasRows){
 requestAnimationFrame(()=>{
  const body=$('#drawer-body'),block=$('#details-block');
  if(body&&block){
   const top=block.offsetTop-body.offsetTop;
   body.scrollTo({top:Math.max(0,top-12),behavior:'smooth'});
  }
  setTimeout(()=>{
   const first=$('#ed-elements input[data-el]');
   if(hasRows&&first)first.focus({preventScroll:true});
   else if(!hasRows)$('#ed-new').focus({preventScroll:true});
  },260);
 });
}
function renderEls(list){
 const box=$('#ed-elements');
 box.innerHTML=list.length
  ?list.map((t,i)=>`<div class="el" draggable="true" data-i="${i}"><span class="grip" title="Glisser pour réordonner">⠿</span><span class="num">${i+1}</span><input value="${esc(t)}" data-el="${i}" aria-label="Détail ${i+1}"><button type="button" data-up="${i}" title="Monter (Alt+↑)">↑</button><button type="button" data-down="${i}" title="Descendre (Alt+↓)">↓</button><button type="button" data-del="${i}" title="Supprimer">✕</button></div>`).join('')
  :'<p class="none">Aucun détail pour l\'instant.<br>Ajoute une œuvre ci-dessous, ou recharge l\'origine avec <b>↺ Origine</b>.</p>';
 updateElCount();
}
function updateElCount(){
 const n=readEls().length;
 $('#el-count').textContent=n;
 $('#el-hint').textContent=n
  ?`${n} détail(s) — glisse ⠿ pour réordonner, Alt+↑/↓ au clavier.`
  :'Liste vide : en mode « Fusionner », les détails existants seront conservés.';
}
const readEls=()=>$$('#ed-elements input[data-el]').map(i=>i.value.trim()).filter(Boolean);
function rawEls(){return $$('#ed-elements input[data-el]').map(i=>i.value);}
function moveEl(from,to){const l=rawEls();if(to<0||to>=l.length)return;const[x]=l.splice(from,1);l.splice(to,0,x);renderEls(l);
 const inp=$(`#ed-elements input[data-el="${to}"]`);if(inp)inp.focus({preventScroll:true});}
function saveToPending(){
 const e=S.ed;if(!e)return;
 const d=nDate($('#ed-date').value),t=nTime($('#ed-time').value),c=$('#ed-channel').value.trim();
 if(!d||!c)return toast('Date et chaîne obligatoires.','err');
 const action=$('#ed-action').value;
 if(action!=='hide'&&!t)return toast('Heure obligatoire.','err');
 const mode=document.querySelector('input[name=ed-mode]:checked').value,els=readEls();
 if(mode==='replace'&&e.srcCount>0&&els.length<e.srcCount&&!confirm(`Mode « Remplacer tout ».\n\nLa source contient ${e.srcCount} détail(s), tu en enregistres ${els.length}.\nLes détails absents de ta liste seront supprimés pour ce programme.\n\nContinuer ?`))return;
 const y=d.split('-')[2],id=action==='add'?progId(d,t,c):e.id||progId(d,t,c);
 S.pending[y]=S.pending[y]||{};
 S.pending[y][id]={date:d,time:t,channel:c,action,title:$('#ed-name').value.trim(),description:$('#ed-desc').value.trim(),
  elements:els,elements_mode:mode,locked:$('#ed-locked').checked,note:$('#ed-note').value.trim(),updated_at:new Date().toISOString()};
 closeLayer('drawer');renderPending();refreshAfterMutation();
 toast('Correction mise en attente.','ok',{label:'Ouvrir la file',fn:()=>setTab('pending')});
}

/* ---------- file ---------- */
const pendingCount=()=>Object.values(S.pending).reduce((n,m)=>n+Object.keys(m).length,0);
function renderPending(){
 const n=pendingCount();$('#pending-badge').textContent=n;$('#stat-edits').textContent=n;
 $('#btn-commit').disabled=!n||S.busy;$('#btn-export').disabled=!n;$('#btn-discard').disabled=!n;
 const box=$('#pending-list');
 if(!n){box.innerHTML='<div class="empty"><b>Aucune modification en attente</b>Cherche une émission, ouvre le tiroir ✏️ et corrige : tout arrive ici avant l\'envoi.</div>';$('#bulk-bar').hidden=true;return;}
 const rows=Object.entries(S.pending).flatMap(([y,m])=>Object.entries(m).map(([id,p])=>({y,id,p})));
 $('#bulk-bar').hidden=S.sel.size===0;$('#bulk-count').textContent=S.sel.size;
 box.innerHTML=rows.map(({y,id,p})=>`<div class="prow edited"><input type="checkbox" data-sel="${esc(y)}|${esc(id)}" ${S.sel.has(y+'|'+id)?'checked':''} aria-label="Sélectionner"><div class="ptime">${esc(p.time||'--:--')}</div><div class="pbody"><b>${esc(p.title||'(sans titre)')} <span class="tag ${p.action==='hide'?'hid':'ed'}">${esc(p.action)}</span></b><small>${esc(shortDate(p.date))} · ${esc(p.channel)} · ${(p.elements||[]).length} détail(s) · ${esc(p.elements_mode)}${p.locked?' · 🔒':''}${p.note?' · 📝':''}</small></div><div class="pacts"><button class="btn small" type="button" data-edit="${esc(p.date)}|${esc(p.time)}|${esc(p.channel)}|${esc(p.title)}">✏️</button><button class="btn small danger ghost" type="button" data-drop="${esc(y)}|${esc(id)}">✕</button></div></div>`).join('');
}
function dropPending(y,id,silent){
 const p=S.pending[y]?.[id];if(!p)return;
 delete S.pending[y][id];if(!Object.keys(S.pending[y]).length)delete S.pending[y];
 S.sel.delete(y+'|'+id);renderPending();refreshAfterMutation();
 if(!silent)toast('Correction retirée.','warn',{label:'Annuler',fn:()=>{S.pending[y]=S.pending[y]||{};S.pending[y][id]=p;renderPending();refreshAfterMutation();}});
}
function refreshAfterMutation(){if(S.tab==='day')renderDay();else if(S.tab==='search'&&S.groups.length)renderGroups();}
async function commit(){
 const years=Object.keys(S.pending);if(!years.length)return;
 if(S.mode==='demo'||!configured()){exportJSON();return toast(configured()?'Mode démo : export JSON produit.':'Configure GitHub, ou utilise l\'export JSON.','warn');}
 S.busy=true;renderPending();
 try{
  for(const y of years){
   delete S.overrides[y];
   const remote=await loadOv(y);
   const merged={year:+y,updated_at:new Date().toISOString(),programs:{...(remote.programs||{}),...S.pending[y]}};
   await ghPut(ovPath(y),JSON.stringify(merged,null,2),`edit(overrides): ${y} — ${Object.keys(S.pending[y]).length} correction(s)`);
   S.overrides[y]=merged;
  }
  const n=pendingCount();S.pending={};S.sel.clear();renderPending();refreshAfterMutation();
  toast(`${n} correction(s) enregistrée(s). Relance generate_index_only.`,'ok');
 }catch(e){toast(e.message,'err');}finally{S.busy=false;renderPending();}
}
function exportJSON(){
 const years=Object.keys(S.pending);if(!years.length)return;
 if(S.mode==='demo'){const all=JSON.parse(localStorage.getItem(DEMO_OV_KEY)||'{}');years.forEach(y=>{all[y]={year:+y,updated_at:new Date().toISOString(),programs:{...(all[y]?.programs||{}),...S.pending[y]}};});localStorage.setItem(DEMO_OV_KEY,JSON.stringify(all));}
 years.forEach(y=>{
  const base=S.overrides[y]?.programs||{};
  const merged={year:+y,updated_at:new Date().toISOString(),programs:{...base,...S.pending[y]}};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(merged,null,2)],{type:'application/json'}));
  a.download=`${y}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
 });
 toast(`${years.length} fichier(s) téléchargé(s) — place-les dans data/overrides/.`,'ok');
}

/* ---------- couches ---------- */
function openLayer(which){
 if(which==='drawer'){$('#drawer-scrim').hidden=false;$('#drawer').hidden=false;}
 else{$('#settings-scrim').hidden=false;$('#settings').hidden=false;setTimeout(()=>$('#st-owner').focus(),70);}
 document.body.style.overflow='hidden';
}
function closeLayer(which){
 if(which==='drawer'){$('#drawer-scrim').hidden=true;$('#drawer').hidden=true;}
 else{$('#settings-scrim').hidden=true;$('#settings').hidden=true;}
 if($('#drawer').hidden&&$('#settings').hidden)document.body.style.overflow='';
}
function openSettings(){
 const c=S.cfg;$('#st-owner').value=c.owner||'xbodin2g';$('#st-repo').value=c.repo||'tv-retro';
 $('#st-branch').value=c.branch||'main';$('#st-path').value=c.path||'data';$('#st-token').value=c.token||'';
 $('#st-status').textContent='';openLayer('settings');
}
function saveSettings(){
 S.cfg={owner:$('#st-owner').value.trim(),repo:$('#st-repo').value.trim(),branch:$('#st-branch').value.trim()||'main',
  path:$('#st-path').value.trim()||'data',token:$('#st-token').value.replace(/\s+/g,'')};
 localStorage.setItem(CFG_KEY,JSON.stringify(S.cfg));
 S.overrides={};S.shas={};refreshStatus();closeLayer('settings');
 toast('Réglages enregistrés.','ok');refreshAfterMutation();
}
async function doTest(){
 $('#st-status').textContent='⏳ Test en cours…';
 try{const j=await testConnection($('#st-owner').value.trim(),$('#st-repo').value.trim(),$('#st-token').value);
  $('#st-status').innerHTML=`✅ <b>${esc(j.full_name)}</b> — branche par défaut <code>${esc(j.default_branch)}</code>. Clique « Enregistrer et fermer ».`;
 }catch(e){$('#st-status').textContent='❌ '+e.message;}
}
function setTab(t){
 S.tab=t;$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 $$('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+t));
 if(t==='day'&&!S.day.year)loadDay();
 if(t==='pending')renderPending();
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded',async()=>{
 $$('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
 $('#btn-settings').onclick=openSettings;
 $('#st-close').onclick=$('#st-close2').onclick=$('#settings-scrim').onclick=()=>closeLayer('settings');
 $('#st-save').onclick=saveSettings;$('#st-test').onclick=doTest;
 $('#st-token').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveSettings();}};
 $('#st-clear').onclick=()=>{S.cfg.token='';localStorage.setItem(CFG_KEY,JSON.stringify(S.cfg));$('#st-token').value='';refreshStatus();toast('Token effacé.','warn');};
 $('#dr-close').onclick=$('#dr-cancel').onclick=$('#drawer-scrim').onclick=()=>closeLayer('drawer');
 $('#dr-save').onclick=saveToPending;
 $('#dr-delete').onclick=()=>{const e=S.ed;if(e?.id)dropPending(e.year,e.id);closeLayer('drawer');};
 $('#q').oninput=e=>{S.f.q=e.target.value;schedule();};
 $('#f-period').onchange=e=>{S.f.period=e.target.value;S.f.year='all';fillYears();runSearch();};
 $('#f-year').onchange=e=>{S.f.year=e.target.value;runSearch();};
 $('#f-genre').onchange=e=>{S.f.genre=e.target.value;runSearch();};
 $('#f-channel').onchange=e=>{S.f.channel=e.target.value;runSearch();};
 $('#f-sort').onchange=e=>{S.f.sort=e.target.value;runSearch();};
 $('#btn-save-view').onclick=saveView;
 $('#btn-reset').onclick=()=>{S.f={q:'',period:'all',year:'all',genre:'all',channel:'all',sort:'count'};
  $('#q').value='';$('#f-period').value='all';fillYears();$('#f-genre').value='all';$('#f-channel').value='all';$('#f-sort').value='count';
  S.groups=[];$('#search-status').textContent='';renderSearchEmpty();};
 $('#btn-load-day').onclick=loadDay;
 $('#d-year').onchange=()=>{S.day.date=null;S.day.year=null;loadDay();};
 $('#d-date').onchange=renderDay;
 $('#d-channel').onchange=e=>{S.day.channel=e.target.value;renderDay();};
 $('#btn-add').onclick=openNew;
 $('#btn-add-el').onclick=()=>{const v=$('#ed-new').value.trim();if(!v)return;renderEls([...rawEls(),v]);$('#ed-new').value='';$('#ed-new').focus();
  const box=$('#ed-elements');box.scrollTop=box.scrollHeight;};
 $('#ed-new').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#btn-add-el').click();}};
 $('#btn-origin').onclick=()=>{const e=S.ed;if(!e)return;const src=srcProgram(e.date,e.time,e.channel);
  const els=(src?.segments||[]).map(s=>s.title);renderEls(els);
  toast(els.length?`${els.length} détail(s) d'origine rechargés.`:'Aucun détail d\'origine pour ce programme.','warn');};
 $('#btn-clear-els').onclick=()=>{const old=rawEls();if(!old.length)return;renderEls([]);
  toast('Liste vidée.','warn',{label:'Annuler',fn:()=>renderEls(old)});};
 $('#ed-elements').addEventListener('input',e=>{if(e.target.matches('input[data-el]'))updateElCount();});
 $('#ed-elements').addEventListener('keydown',e=>{
  if(!e.altKey||!e.target.matches('input[data-el]'))return;
  const i=+e.target.dataset.el;
  if(e.key==='ArrowUp'){e.preventDefault();moveEl(i,i-1);}
  if(e.key==='ArrowDown'){e.preventDefault();moveEl(i,i+1);}
 });
 $('#btn-commit').onclick=commit;$('#btn-export').onclick=exportJSON;
 $('#btn-discard').onclick=()=>{const backup=JSON.parse(JSON.stringify(S.pending));S.pending={};S.sel.clear();renderPending();refreshAfterMutation();
  toast('File vidée.','warn',{label:'Annuler',fn:()=>{S.pending=backup;renderPending();refreshAfterMutation();}});};
 $('#btn-bulk-delete').onclick=()=>{const keys=[...S.sel],backup=JSON.parse(JSON.stringify(S.pending));
  keys.forEach(k=>{const[y,id]=k.split('|');if(S.pending[y]){delete S.pending[y][id];if(!Object.keys(S.pending[y]).length)delete S.pending[y];}});
  S.sel.clear();renderPending();refreshAfterMutation();
  toast(`${keys.length} correction(s) supprimée(s).`,'warn',{label:'Annuler',fn:()=>{S.pending=backup;renderPending();refreshAfterMutation();}});};

 document.addEventListener('click',e=>{
  const sug=e.target.closest('[data-suggest]');if(sug){$('#q').value=sug.dataset.suggest;S.f.q=sug.dataset.suggest;runSearch();return;}
  const vd=e.target.closest('[data-viewdel]');if(vd){S.views=S.views.filter(v=>v.id!==vd.dataset.viewdel);localStorage.setItem(VIEWS_KEY,JSON.stringify(S.views));renderViews();return;}
  const vw=e.target.closest('[data-view]');if(vw){applyView(vw.dataset.view);return;}
  const tg=e.target.closest('[data-toggle]');if(tg){const k=tg.dataset.toggle;S.open.has(k)?S.open.delete(k):S.open.add(k);renderGroups();return;}
  const ed=e.target.closest('[data-edit]');if(ed){const[d,t,c,ti]=ed.dataset.edit.split('|');openEditor(d,t,c,ti);return;}
  const dr=e.target.closest('[data-drop]');if(dr){const[y,id]=dr.dataset.drop.split('|');dropPending(y,id);return;}
  const del=e.target.closest('[data-del]');if(del){const l=rawEls(),i=+del.dataset.del,removed=l[i];l.splice(i,1);renderEls(l);
   toast(`« ${removed} » retiré.`,'warn',{label:'Annuler',fn:()=>{const c=rawEls();c.splice(i,0,removed);renderEls(c);}});return;}
  const up=e.target.closest('[data-up]');if(up){moveEl(+up.dataset.up,+up.dataset.up-1);return;}
  const dn=e.target.closest('[data-down]');if(dn){moveEl(+dn.dataset.down,+dn.dataset.down+1);return;}
 });
 document.addEventListener('change',e=>{const s=e.target.closest('[data-sel]');if(s){s.checked?S.sel.add(s.dataset.sel):S.sel.delete(s.dataset.sel);renderPending();}});

 let dragFrom=null;
 document.addEventListener('dragstart',e=>{const el=e.target.closest('.el');if(!el)return;dragFrom=+el.dataset.i;el.classList.add('drag');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(dragFrom));}catch(x){}});
 document.addEventListener('dragend',()=>{$$('.el').forEach(x=>x.classList.remove('drag','over'));dragFrom=null;});
 document.addEventListener('dragover',e=>{const el=e.target.closest('.el');if(!el||dragFrom===null)return;e.preventDefault();$$('.el').forEach(x=>x.classList.remove('over'));el.classList.add('over');});
 document.addEventListener('drop',e=>{const el=e.target.closest('.el');if(!el||dragFrom===null)return;e.preventDefault();moveEl(dragFrom,+el.dataset.i);dragFrom=null;});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#settings').hidden)closeLayer('settings');else if(!$('#drawer').hidden)closeLayer('drawer');}
  if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement.tagName)){e.preventDefault();setTab('search');$('#q').focus();}
 });

 await bootstrap();
 if(!configured()&&S.mode==='live')openSettings();
});