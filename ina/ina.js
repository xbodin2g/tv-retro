/* =====================================================
   INA · TABLEAU DE MOISSON
   Matrice complète : cibles du registre × état de moisson,
   y compris les couples jamais indexés.
   ===================================================== */
const VIEWS='inaBoardViews',PLAN='inaBoardPlan',TGT='inaBoardTargets',CFG='tvretroEditCfg';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const nf=n=>Number(n||0).toLocaleString('fr-FR');
const slugify=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'programme';
const KEYS=['indexed','cached','current','outdated','with_elements','empty','remaining','elements','days'];
const blank=y=>({year:y,...Object.fromEntries(KEYS.map(k=>[k,0])),coverage:0,sample:[],virgin:true,estimate:0});
const S={report:null,targets:null,raw:{},cov:null,src:'live',globalAvg:150,
 f:{q:'',decade:'all',year:'all',state:'all',sort:'prio',view:'matrix',batch:400},
 plan:JSON.parse(localStorage.getItem(PLAN)||'[]'),views:JSON.parse(localStorage.getItem(VIEWS)||'[]'),detail:null};

function toast(m,k='',a){const e=document.createElement('div');e.className='toast '+k;e.innerHTML=`<span>${esc(m)}</span>`;
 if(a){const b=document.createElement('button');b.textContent=a.label;b.onclick=()=>{a.fn();e.remove();};e.appendChild(b);}
 $('#toasts').appendChild(e);setTimeout(()=>{e.style.transition='opacity .3s';e.style.opacity='0';setTimeout(()=>e.remove(),320);},a?7000:3200);}
async function copy(t,m){try{await navigator.clipboard.writeText(t);}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}toast(m||'Copié.','ok');}
function dl(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}

const DEFAULT_TARGETS=[["Club Dorothée","TF1",1987,1997,1],["Récré A2","Antenne 2",1978,1987,1],["Amuse 3","FR3",1985,1997,1],
["Cabou Cadin","Canal+",1985,1993,2],["Vitamine","TF1",1983,1987,2],["Youpi ! L'école est finie","La Cinq",1987,1992,2],
["Les Visiteurs du mercredi","TF1",1975,1983,2],["Croque-Vacances","TF1",1981,1987,3],["Le Village dans les nuages","TF1",1982,1986,3],
["Le réveil des babalous","FR3",1986,1991,3],["Discopuce","Antenne 2",1978,1987,3],["Giga","Antenne 2",1987,1996,2],
["Ça cartoon","Canal+",1986,1999,2],["Canaille Peluche","Canal+",1986,1993,3],["Décode pas Bunny","Canal+",1990,1996,3],
["Le Disney Channel","FR3",1988,1996,2],["Debout les enfants","FR3",1987,1994,3],["Samdynamite","FR3",1987,1993,3],
["Télétaz","FR3",1988,1993,3],["Les Minikeums","France 3",1993,1999,2],["Disney Parade","TF1",1989,1998,3],
["Disney Club","TF1",1990,1996,3],["Club Mini","TF1",1990,1996,4],["À tout Spip","TF1",1993,1996,4],
["TF! Jeunesse","TF1",1997,1999,3],["Télévisator 2","France 2",1993,1995,4],["Chalu Maureen","France 2",1994,1996,4],
["Graffi'6","M6",1987,1991,3],["M6 Kid","M6",1990,1999,3],["Multitop","M6",1987,1996,3],
["Salut les Musclés","TF1",1987,1997,4],["Premiers baisers","TF1",1991,1997,4],["Les années fac","TF1",1995,1998,4],
["Cellulo","La Cinquième",1995,1999,4]].map(([program,channel,from,to,priority])=>({program,slug:slugify(program),channel,from,to,priority}));

function seedReport(){
 const programs=DEFAULT_TARGETS.slice(0,12).map((t,i)=>{
  const years={};
  for(let y=t.from;y<=Math.min(t.to,t.from+4+i%3);y++){
   const indexed=60+((i*37+y*13)%460);
   const cached=Math.min(indexed,Math.round(indexed*(((i*7+y)%11)/10)));
   const outdated=(i+y)%4===0?Math.round(cached*.3):0;
   const withE=Math.round(cached*(.45+((i+y)%5)/12));
   years[y]={year:y,indexed,cached,current:cached-outdated,outdated,with_elements:withE,empty:cached-withE,
    remaining:indexed-cached,elements:withE*(3+i%4),days:Math.round(withE*.7),
    coverage:+(100*cached/indexed).toFixed(1),sample:Array.from({length:Math.min(5,indexed-cached)},(_,k)=>`TV_${100000+i*9000+y+k}.001`)};}
  return {program:t.program,slug:t.slug,years,harvested_at:new Date().toISOString()};});
 return {generated_at:new Date().toISOString(),parser_version:5,programs,orphans:[],
  health:{advice:['Aperçu simulé : lance le workflow en mode targets puis report-only pour les vraies données.']}};
}

/* ---------- construction de la couverture complète ---------- */
function rebuild(){
 const known=[];Object.values(S.raw).forEach(r=>Object.values(r.years).forEach(e=>{if(e.indexed)known.push(e.indexed);}));
 S.globalAvg=known.length?Math.round(known.reduce((a,b)=>a+b,0)/known.length):150;
 const programs=[],used=new Set();
 S.targets.forEach(t=>{
  const slug=t.slug||slugify(t.program);used.add(slug);
  const raw=S.raw[slug]||{program:t.program,years:{}};
  const ky=Object.values(raw.years).filter(e=>e.indexed).map(e=>e.indexed);
  const avg=ky.length?Math.round(ky.reduce((a,b)=>a+b,0)/ky.length):S.globalAvg;
  const years=[];
  const from=Math.min(t.from,t.to),to=Math.max(t.from,t.to);
  for(let y=from;y<=to;y++){
   const r=raw.years[y];
   years.push(r?{...r,virgin:false,estimate:0}:{...blank(y),estimate:avg});}
  Object.values(raw.years).forEach(r=>{if(r.year<from||r.year>to)years.push({...r,virgin:false,estimate:0,out_of_range:true});});
  years.sort((a,b)=>a.year-b.year);
  const totals=Object.fromEntries(KEYS.map(k=>[k,years.reduce((s,e)=>s+(e[k]||0),0)]));
  totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
  totals.virgin=years.filter(e=>e.virgin).length;
  totals.estimate=years.reduce((s,e)=>s+(e.estimate||0),0);
  programs.push({program:t.program,slug,channel:t.channel||'',priority:t.priority||9,from,to,
   harvested_at:raw.harvested_at||'',years,totals});});
 Object.entries(S.raw).forEach(([slug,raw])=>{
  if(used.has(slug))return;
  const years=Object.values(raw.years).sort((a,b)=>a.year-b.year).map(e=>({...e,virgin:false,estimate:0}));
  const totals=Object.fromEntries(KEYS.map(k=>[k,years.reduce((s,e)=>s+(e[k]||0),0)]));
  totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;totals.virgin=0;totals.estimate=0;
  programs.push({program:raw.program,slug,channel:'',priority:9,from:null,to:null,years,totals,untargeted:true});});
 const totals=Object.fromEntries(KEYS.map(k=>[k,programs.reduce((s,p)=>s+p.totals[k],0)]));
 totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
 totals.virgin=programs.reduce((s,p)=>s+p.totals.virgin,0);
 totals.estimate=programs.reduce((s,p)=>s+p.totals.estimate,0);
 const queue=programs.flatMap(p=>p.years.filter(e=>e.remaining>0).map(e=>({program:p.program,year:e.year,remaining:e.remaining,virgin:false}))).sort((a,b)=>b.remaining-a.remaining);
 const frontier=programs.flatMap(p=>p.years.filter(e=>e.virgin).map(e=>({program:p.program,year:e.year,remaining:e.estimate||S.globalAvg,virgin:true,priority:p.priority}))).sort((a,b)=>a.priority-b.priority||a.year-b.year);
 const advice=[...(S.report?.health?.advice||[])];
 if(totals.virgin)advice.push(`${nf(totals.virgin)} couple(s) jamais indexés — volume estimé ${nf(totals.estimate)} notices. Le premier run indexe puis moissonne.`);
 S.cov={generated_at:S.report?.generated_at,parser_version:S.report?.parser_version||5,
  programs,totals,queue,frontier,orphans:S.report?.orphans||[],health:{advice}};
}

async function load(){
 $('#status').textContent='⏳ Chargement…';
 let rep=null,tgt=null;
 if(location.protocol!=='file:'){
  try{const r=await fetch('../data/ina/coverage.json?t='+Date.now(),{cache:'no-store'});if(r.ok)rep=await r.json();}catch(e){}
  try{const r=await fetch('../data/ina/targets.json?t='+Date.now(),{cache:'no-store'});if(r.ok)tgt=await r.json();}catch(e){}
 }
 S.src=rep?'live':'demo';
 S.report=rep||seedReport();
 const local=JSON.parse(localStorage.getItem(TGT)||'null');
 S.targets=(local&&local.programs)||(tgt&&tgt.programs)||DEFAULT_TARGETS.map(t=>({...t}));
 S.targets.forEach(t=>{t.slug=t.slug||slugify(t.program);t.from=+t.from||1970;t.to=+t.to||1999;t.priority=+t.priority||9;});
 S.raw={};
 (S.report.programs||[]).forEach(p=>{
  const slug=p.slug||slugify(p.program);const years={};
  const list=p.years||[];
  list.forEach(e=>{const cached=e.cached??e.downloaded??0;
   years[e.year]={...e,cached,current:e.current??cached,outdated:e.outdated||0,
    coverage:e.indexed?+(100*cached/e.indexed).toFixed(1):0};});
  S.raw[slug]={program:p.program,years,harvested_at:p.harvested_at||''};
  if(!S.targets.some(t=>t.slug===slug)){
   const ys=Object.keys(years).map(Number);
   S.targets.push({program:p.program,slug,channel:'',from:ys.length?Math.min(...ys):1970,to:ys.length?Math.max(...ys):1999,priority:9});}
 });
 rebuild();
 const p=$('#src-pill');p.textContent=S.src==='live'?'DONNÉES RÉELLES':'DÉMONSTRATION';p.className='pill '+(S.src==='live'?'ok':'warn');
 $('#stamp').textContent='maj '+String(S.cov.generated_at||'').slice(0,16).replace('T',' ')+' · parser v'+S.cov.parser_version;
 $('#note').hidden=S.src==='live';
 if(S.src!=='live')$('#note').innerHTML='⚠️ <code>data/ina/coverage.json</code> introuvable — aperçu simulé avec le registre complet. Lance le workflow en mode <b>targets</b> puis <b>report-only</b>.';
 const cfg=JSON.parse(localStorage.getItem(CFG)||'{}');
 $('#wf-link').href=`https://github.com/${cfg.owner||'xbodin2g'}/${cfg.repo||'tv-retro'}/actions/workflows/ina-enrich.yml`;
 refreshFilters();renderHealth();renderViews();renderPlan();renderOrph();render();
}
function refreshFilters(){
 const years=[...new Set(S.cov.programs.flatMap(p=>p.years.map(e=>e.year)))].sort((a,b)=>a-b);
 $('#f-decade').innerHTML='<option value="all">Toutes</option>'+[...new Set(years.map(y=>Math.floor(y/10)*10))].map(d=>`<option value="${d}">${String(d).slice(2)}s</option>`).join('');
 let ys=years;if(S.f.decade!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+S.f.decade);
 $('#f-year').innerHTML='<option value="all">Toutes</option>'+ys.map(y=>`<option value="${y}">${y}</option>`).join('');
 $('#f-year').value=ys.includes(+S.f.year)?S.f.year:'all';
}
function renderHealth(){
 const a=S.cov.health.advice||[],b=$('#health');
 if(!a.length){b.hidden=true;return;}
 b.hidden=false;b.innerHTML='<b>État de la moisson</b><ul>'+a.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';
}
function cells(){
 const q=S.f.q.trim().toLowerCase(),out=[];
 S.cov.programs.forEach(p=>{
  if(q&&!p.program.toLowerCase().includes(q)&&!(p.channel||'').toLowerCase().includes(q))return;
  p.years.forEach(e=>{
   if(S.f.decade!=='all'&&Math.floor(e.year/10)*10!==+S.f.decade)return;
   if(S.f.year!=='all'&&e.year!==+S.f.year)return;
   if(S.f.state==='virgin'&&!e.virgin)return;
   if(S.f.state==='todo'&&(e.virgin||e.remaining<=0))return;
   if(S.f.state==='done'&&(e.virgin||e.remaining>0))return;
   if(S.f.state==='old'&&!e.outdated)return;
   if(S.f.state==='active'&&e.virgin)return;
   out.push({program:p.program,slug:p.slug,channel:p.channel,priority:p.priority,...e});});});
 out.sort((a,b)=>S.f.sort==='alpha'?a.program.localeCompare(b.program,'fr')||a.year-b.year
  :S.f.sort==='cov'?(a.virgin?-1:a.coverage)-(b.virgin?-1:b.coverage)||b.remaining-a.remaining
  :S.f.sort==='works'?b.elements-a.elements
  :S.f.sort==='left'?(b.virgin?b.estimate:b.remaining)-(a.virgin?a.estimate:a.remaining)||a.program.localeCompare(b.program,'fr')
  :a.priority-b.priority||a.program.localeCompare(b.program,'fr')||a.year-b.year);
 return out;
}
function kpis(){
 const c=cells(),t=c.reduce((a,e)=>{KEYS.forEach(k=>a[k]+=e[k]||0);a.virgin+=e.virgin?1:0;a.est+=e.virgin?(e.estimate||0):(e.remaining||0);return a;},
  {virgin:0,est:0,...Object.fromEntries(KEYS.map(k=>[k,0]))});
 $('#k-virgin').textContent=nf(t.virgin);$('#k-indexed').textContent=nf(t.indexed);
 $('#k-cached').textContent=nf(t.cached);$('#k-works').textContent=nf(t.with_elements);
 $('#k-left').textContent=nf(t.remaining);$('#k-elements').textContent=nf(t.elements);
 $('#k-old').textContent=nf(t.outdated);$('#k-runs').textContent=nf(Math.ceil(t.est/S.f.batch));
}
const cls=c=>c>=99.5?'c4':c>=75?'c3':c>=40?'c2':c>0?'c1':'c0';
const inPlan=(p,y)=>S.plan.some(i=>i.program===p&&i.year===y);
function render(){
 kpis();const c=cells(),board=$('#board');
 $('#status').textContent=`${nf(c.length)} cible(s) · ${nf(new Set(c.map(x=>x.program)).size)} émission(s) · ${nf(c.filter(x=>x.virgin).length)} jamais indexée(s)`;
 if(!c.length){board.innerHTML='<div class="empty"><b>Aucune cible ne correspond</b>Élargis les filtres, ou ajoute une émission via 🎯 Cibles.</div>';return;}
 if(S.f.view==='list'){
  board.innerHTML='<div class="rows">'+c.slice(0,700).map(e=>`<div class="row${e.virgin?' v':''}" data-cell="${esc(e.program)}|${e.year}"><div class="nm"><b>${esc(e.program)}</b><small>${e.year}${e.channel?' · '+esc(e.channel):''} · ${e.virgin?`jamais indexé — ≈ ${nf(e.estimate)} notices`:`${nf(e.cached)}/${nf(e.indexed)} en cache · ${nf(e.with_elements)} œuvrées`}</small></div><div class="track"><i style="width:${e.virgin?0:e.coverage}%"></i></div><div class="num ${e.virgin?'vg':e.remaining?'left':'ok'}">${e.virgin?'?':e.remaining?'−'+nf(e.remaining):'✓'}</div></div>`).join('')+'</div>';
  return;}
 const progs=[...new Set(c.map(x=>x.program))],years=[...new Set(c.map(x=>x.year))].sort((a,b)=>a-b);
 const map=new Map(c.map(e=>[e.program+'|'+e.year,e]));
 const meta=new Map(S.cov.programs.map(p=>[p.program,p]));
 board.innerHTML=`<table><thead><tr><th>Émission</th>${years.map(y=>`<th>${y}</th>`).join('')}<th>Reste</th></tr></thead><tbody>${
  progs.map(p=>{const m=meta.get(p);const tot=c.filter(x=>x.program===p).reduce((s,x)=>s+(x.virgin?0:x.remaining),0);
   const vg=c.filter(x=>x.program===p&&x.virgin).length;
   return `<tr><th title="${esc(p)}">${esc(p)}<small>${m?.channel?esc(m.channel)+' · ':''}${vg?vg+' à démarrer':'tout indexé'}</small></th>${years.map(y=>{const e=map.get(p+'|'+y);
    if(!e)return '<td><span class="cell na">·</span></td>';
    if(e.virgin)return `<td><span class="cell virgin${inPlan(p,y)?' picked':''}" data-cell="${esc(p)}|${y}" title="${esc(p)} ${y} — jamais indexé, ≈ ${e.estimate} notices">?</span></td>`;
    return `<td><span class="cell ${cls(e.coverage)}${e.outdated?' old':''}${inPlan(p,y)?' picked':''}" data-cell="${esc(p)}|${y}" title="${esc(p)} ${y} — ${e.cached}/${e.indexed} en cache (${e.coverage} %), reste ${e.remaining}">${e.remaining?e.remaining:'✓'}</span></td>`;}).join('')}<td class="num ${tot?'left':'ok'}">${tot?nf(tot):'✓'}</td></tr>`;}).join('')
 }</tbody></table>`;
}
function renderOrph(){
 const o=S.cov.orphans||[],b=$('#orph');
 if(!o.length){b.hidden=true;return;}
 b.hidden=false;
 b.innerHTML='<header><strong>En cache hors index</strong><span class="cnt">'+nf(o.reduce((s,x)=>s+x.count,0))+'</span></header><div class="orph-body">'
  +o.map(x=>`<div class="pitem"><b>${esc(x.program)}</b><code>${nf(x.count)}</code><code>${nf(x.with_elements)} œuvrées</code></div>`).join('')
  +'<p class="status">Lance <b>index-only</b> sur l\'émission pour les rattacher.</p></div>';
}
function renderPlan(){
 $('#plan-count').textContent=S.plan.length;const b=$('#plan-body');
 if(!S.plan.length){b.innerHTML='<p class="status">Vide. ⇧clic une case, 🌱 Démarrer (jamais indexés) ou ⚡ Compléter (restes connus).</p>';localStorage.setItem(PLAN,'[]');return;}
 let runs=0,secs=0;const batch=S.f.batch;
 b.innerHTML=S.plan.map((i,k)=>{const n=Math.max(1,Math.ceil(i.remaining/batch));runs+=n;secs+=i.remaining*3.2+Math.floor(i.remaining/40)*22;
  return `<div class="pitem" draggable="true" data-pi="${k}"><span class="grip">⠿</span><b>${esc(i.program)} · ${i.year}</b>${i.virgin?'<span class="virgin-tag">À DÉMARRER</span>':''}<code>${i.virgin?'≈':'reste'} ${nf(i.remaining)}</code><code>${n} run(s)</code><button class="mini" data-copy="${k}">📋</button><button class="mini danger" data-rm="${k}">✕</button></div>`;}).join('')
  +`<div class="pitem" style="border-color:var(--phos)"><span class="grip"></span><b>Total</b><code>${runs} run(s)</code><code>≈ ${Math.round(secs/60)} min</code></div>`;
 localStorage.setItem(PLAN,JSON.stringify(S.plan));
}
function addToPlan(program,year){
 const p=S.cov.programs.find(x=>x.program===program),e=p?.years.find(x=>x.year===year);
 if(!e)return;
 if(!e.virgin&&!e.remaining)return toast('Rien à moissonner ici.','warn');
 if(inPlan(program,year))return toast('Déjà dans le plan.','warn');
 S.plan.push({program,year,remaining:e.virgin?(e.estimate||S.globalAvg):e.remaining,virgin:!!e.virgin});
 renderPlan();render();
 toast(`${program} ${year} ajouté.`,'ok',{label:'Annuler',fn:()=>{S.plan=S.plan.filter(i=>!(i.program===program&&i.year===year));renderPlan();render();}});
}
function openDetail(program,year){
 const p=S.cov.programs.find(x=>x.program===program),e=p?.years.find(x=>x.year===year);if(!e)return;
 const vol=e.virgin?(e.estimate||S.globalAvg):e.remaining;
 S.detail={program,year,remaining:vol,virgin:!!e.virgin};
 $('#d-title').textContent=program;
 $('#d-sub').textContent=`${year}${p.channel?' · '+p.channel:''} — ${e.virgin?'jamais indexé':'indexé'}`;
 const batch=S.f.batch,runs=Math.max(1,Math.ceil(vol/batch)),per=Math.min(vol,batch)||batch;
 $('#d-body').innerHTML=e.virgin?`
  <div class="kv"><span>État</span><b style="color:var(--magenta)">jamais indexé</b>
  <span>Volume estimé</span><b>≈ ${nf(vol)}</b><span>Base de l'estimation</span><b>${p.years.some(x=>x.indexed)?'moyenne de l\'émission':'moyenne globale'}</b>
  <span>Plage de l'émission</span><b>${p.from}→${p.to}</b><span>Priorité</span><b>${p.priority}</b></div>
  <p class="status">Le premier run <b>indexe l'année puis moissonne</b> les notices. Le volume réel sera connu à l'issue de ce run.</p>
  <div class="cmd">mode: all\nprogram: ${esc(program)}\nyear: ${year}\nmax_notices: ${per}</div>
  <p class="status">Lot de ${batch} → <b>${runs}</b> run(s) estimé(s). ≈ ${Math.round((per*3.2+Math.floor(per/40)*22)/60)} min par run.</p>`
 :`<div class="kv"><span>Indexées</span><b>${nf(e.indexed)}</b>
  <span>En cache</span><b style="color:var(--phos)">${nf(e.cached)}</b>
  <span>— version courante</span><b>${nf(e.current)}</b><span>— ancienne version</span><b style="color:var(--amber)">${nf(e.outdated)}</b>
  <span>Avec œuvres</span><b>${nf(e.with_elements)}</b><span>Sans œuvre</span><b>${nf(e.empty)}</b>
  <span>Reste à télécharger</span><b style="color:var(--red)">${nf(e.remaining)}</b>
  <span>Œuvres relevées</span><b>${nf(e.elements)}</b><span>Jours couverts</span><b>${nf(e.days)}</b>
  <span>Couverture</span><b>${e.coverage} %</b></div>
  <div class="track" style="width:100%"><i style="width:${e.coverage}%"></i></div>
  ${e.outdated?`<p class="status">◦ ${nf(e.outdated)} notice(s) d'ancienne version sont déjà en cache : re-normalisation locale, sans requête.</p>`:''}
  <p class="status">Lot de ${batch} → <b>${runs}</b> run(s). ≈ ${Math.round((per*3.2+Math.floor(per/40)*22)/60)} min par run.</p>
  <div class="cmd">mode: all\nprogram: ${esc(program)}\nyear: ${year}\nmax_notices: ${per}</div>
  ${e.sample?.length?`<div><p class="status">Notices manquantes (exemples)</p><div class="ids">${e.sample.map(s=>`<code>${esc(s)}</code>`).join('')}</div></div>`:''}`;
 $('#d-add').disabled=!vol;
 $('#scrim').hidden=false;$('#drawer').hidden=false;document.body.style.overflow='hidden';
}
function closeDetail(){$('#scrim').hidden=true;$('#drawer').hidden=true;if($('#tdrawer').hidden)document.body.style.overflow='';}

/* ---------- registre des cibles ---------- */
function renderTargets(){
 $('#t-body').innerHTML=S.targets.map((t,i)=>`<div class="trow" draggable="true" data-ti="${i}">
  <span class="grip">⠿</span>
  <input value="${esc(t.program)}" data-tf="program" data-i="${i}" aria-label="Émission">
  <input type="number" value="${t.from}" data-tf="from" data-i="${i}" min="1960" max="2010" aria-label="De">
  <input type="number" value="${t.to}" data-tf="to" data-i="${i}" min="1960" max="2010" aria-label="À">
  <button class="del" data-tdel="${i}" title="Retirer">✕</button></div>`).join('')
  ||'<p class="status">Registre vide — ajoute une émission ci-dessus.</p>';
}
function persistTargets(){localStorage.setItem(TGT,JSON.stringify({version:1,updated_at:new Date().toISOString(),programs:S.targets}));}
function targetsChanged(){persistTargets();rebuild();refreshFilters();renderHealth();render();renderTargets();}
function openTargets(){renderTargets();$('#tscrim').hidden=false;$('#tdrawer').hidden=false;document.body.style.overflow='hidden';}
function closeTargets(){$('#tscrim').hidden=true;$('#tdrawer').hidden=true;if($('#drawer').hidden)document.body.style.overflow='';}

function renderViews(){
 $('#views').innerHTML=S.views.length?S.views.map(v=>`<button class="vchip" data-v="${esc(v.id)}"><b>⭐ ${esc(v.name)}</b><i data-vd="${esc(v.id)}">✕</i></button>`).join('')
 :'<span class="status">⭐ Mémorise une combinaison de filtres.</span>';
}

document.addEventListener('DOMContentLoaded',async()=>{
 $('#btn-reload').onclick=load;
 $('#btn-targets').onclick=openTargets;
 $('#q').oninput=e=>{S.f.q=e.target.value;render();};
 $('#f-decade').onchange=e=>{S.f.decade=e.target.value;S.f.year='all';refreshFilters();render();};
 $('#f-year').onchange=e=>{S.f.year=e.target.value;render();};
 $('#f-state').onchange=e=>{S.f.state=e.target.value;render();};
 $('#f-sort').onchange=e=>{S.f.sort=e.target.value;render();};
 $('#f-view').onchange=e=>{S.f.view=e.target.value;render();};
 $('#f-batch').onchange=e=>{S.f.batch=+e.target.value;renderPlan();render();};
 $('#btn-reset').onclick=()=>{S.f={...S.f,q:'',decade:'all',year:'all',state:'all',sort:'prio'};
  $('#q').value='';$('#f-decade').value='all';refreshFilters();$('#f-state').value='all';$('#f-sort').value='prio';render();};
 $('#btn-view-save').onclick=()=>{const n=prompt('Nom de la vue :','Ma vue');if(!n)return;
  S.views.push({id:'v'+Date.now(),name:n.slice(0,32),f:{...S.f}});localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();toast('Vue enregistrée.','ok');};
 $('#btn-start').onclick=()=>{const top=(S.cov.frontier||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10);
  if(!top.length)return toast('Aucune cible vierge disponible.','warn');
  const b=[...S.plan];S.plan.push(...top.map(t=>({program:t.program,year:t.year,remaining:t.remaining,virgin:true})));renderPlan();render();
  toast(`${top.length} démarrage(s) ajouté(s).`,'ok',{label:'Annuler',fn:()=>{S.plan=b;renderPlan();render();}});};
 $('#btn-fill').onclick=()=>{const top=(S.cov.queue||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10);
  if(!top.length)return toast('Aucun reste connu.','warn');
  const b=[...S.plan];S.plan.push(...top.map(t=>({...t})));renderPlan();render();
  toast(`${top.length} complétion(s) ajoutée(s).`,'ok',{label:'Annuler',fn:()=>{S.plan=b;renderPlan();render();}});};
 $('#btn-plan-clear').onclick=()=>{if(!S.plan.length)return;const b=[...S.plan];S.plan=[];renderPlan();render();
  toast('Plan vidé.','warn',{label:'Annuler',fn:()=>{S.plan=b;renderPlan();render();}});};
 $('#btn-copy-plan').onclick=()=>{if(!S.plan.length)return toast('Plan vide.','warn');
  copy('Émission\tAnnée\tÉtat\tmax_notices\tRuns\n'+S.plan.map(i=>`${i.program}\t${i.year}\t${i.virgin?'à démarrer':'en cours'}\t${Math.min(i.remaining,S.f.batch)}\t${Math.max(1,Math.ceil(i.remaining/S.f.batch))}`).join('\n'),'Plan copié.');};
 $('#btn-csv').onclick=()=>{if(!S.plan.length)return toast('Plan vide.','warn');
  dl('plan-moisson-ina.csv','program,year,state,max_notices,runs\n'+S.plan.map(i=>`"${i.program}",${i.year},${i.virgin?'virgin':'partial'},${Math.min(i.remaining,S.f.batch)},${Math.max(1,Math.ceil(i.remaining/S.f.batch))}`).join('\n'),'text/csv');toast('CSV téléchargé.','ok');};
 $('#d-close').onclick=$('#d-close2').onclick=$('#scrim').onclick=closeDetail;
 $('#d-add').onclick=()=>{if(S.detail){addToPlan(S.detail.program,S.detail.year);closeDetail();}};
 $('#d-copy').onclick=()=>{const d=S.detail;if(!d)return;
  copy(`mode: all\nprogram: ${d.program}\nyear: ${d.year}\nmax_notices: ${Math.min(d.remaining,S.f.batch)||S.f.batch}`,'Paramètres copiés.');};
 $('#t-close').onclick=$('#t-close2').onclick=$('#tscrim').onclick=closeTargets;
 $('#t-add').onclick=()=>{const n=$('#t-new').value.trim();if(!n)return toast('Titre requis.','err');
  if(S.targets.some(t=>t.slug===slugify(n)))return toast('Déjà au registre.','warn');
  const a=+$('#t-from').value||1987,b=+$('#t-to').value||1997;
  S.targets.unshift({program:n,slug:slugify(n),channel:'',from:Math.min(a,b),to:Math.max(a,b),priority:1});
  $('#t-new').value='';targetsChanged();toast(`${n} ajoutée au registre.`,'ok');};
 $('#t-new').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#t-add').click();}};
 $('#t-export').onclick=()=>{dl('targets.json',JSON.stringify({version:1,updated_at:new Date().toISOString(),
  note:"Registre des cibles de moisson INA.",programs:S.targets},null,2),'application/json');
  toast('targets.json téléchargé — place-le dans data/ina/.','ok');};
 $('#t-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;
  try{const j=JSON.parse(await f.text());if(!Array.isArray(j.programs))throw new Error('format');
   S.targets=j.programs.map(t=>({program:t.program,slug:t.slug||slugify(t.program),channel:t.channel||'',
    from:+t.from||1970,to:+t.to||1999,priority:+t.priority||9}));
   targetsChanged();toast(`${S.targets.length} cibles importées.`,'ok');}
  catch(x){toast('Fichier invalide.','err');}
  e.target.value='';};
 $('#t-body').addEventListener('input',e=>{const f=e.target.dataset.tf;if(!f)return;
  const i=+e.target.dataset.i,t=S.targets[i];if(!t)return;
  if(f==='program'){t.program=e.target.value;t.slug=slugify(e.target.value);}
  else t[f]=+e.target.value||t[f];
  persistTargets();rebuild();refreshFilters();render();});
 document.addEventListener('click',e=>{
  const vd=e.target.closest('[data-vd]');if(vd){S.views=S.views.filter(v=>v.id!==vd.dataset.vd);localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();return;}
  const vw=e.target.closest('[data-v]');if(vw){const v=S.views.find(x=>x.id===vw.dataset.v);if(!v)return;S.f={...v.f};
   $('#q').value=S.f.q;$('#f-decade').value=S.f.decade;refreshFilters();$('#f-year').value=S.f.year;$('#f-state').value=S.f.state;$('#f-sort').value=S.f.sort;$('#f-view').value=S.f.view;$('#f-batch').value=S.f.batch;renderPlan();render();return;}
  const td=e.target.closest('[data-tdel]');if(td){const i=+td.dataset.tdel,rm=S.targets[i];S.targets.splice(i,1);targetsChanged();
   toast(`${rm.program} retirée.`,'warn',{label:'Annuler',fn:()=>{S.targets.splice(i,0,rm);targetsChanged();}});return;}
  const rm=e.target.closest('[data-rm]');if(rm){const k=+rm.dataset.rm,it=S.plan[k];S.plan.splice(k,1);renderPlan();render();
   toast('Retiré du plan.','warn',{label:'Annuler',fn:()=>{S.plan.splice(k,0,it);renderPlan();render();}});return;}
  const cp=e.target.closest('[data-copy]');if(cp){const i=S.plan[+cp.dataset.copy];
   copy(`mode: all\nprogram: ${i.program}\nyear: ${i.year}\nmax_notices: ${Math.min(i.remaining,S.f.batch)}`,'Paramètres copiés.');return;}
  const c=e.target.closest('[data-cell]');if(c){const[p,y]=c.dataset.cell.split('|');
   if(e.shiftKey)addToPlan(p,+y);else openDetail(p,+y);return;}
 });
 let dragKind=null,dragFrom=null;
 document.addEventListener('dragstart',e=>{
  const p=e.target.closest('[data-pi]'),t=e.target.closest('[data-ti]');
  if(p){dragKind='plan';dragFrom=+p.dataset.pi;p.classList.add('drag');}
  else if(t){dragKind='tgt';dragFrom=+t.dataset.ti;t.classList.add('drag');}
  else return;
  e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(dragFrom));}catch(x){}});
 document.addEventListener('dragend',()=>{$$('.pitem,.trow').forEach(x=>x.classList.remove('drag','over'));dragKind=null;dragFrom=null;});
 document.addEventListener('dragover',e=>{
  if(dragKind===null)return;
  const el=e.target.closest(dragKind==='plan'?'[data-pi]':'[data-ti]');if(!el)return;
  e.preventDefault();$$(dragKind==='plan'?'.pitem':'.trow').forEach(x=>x.classList.remove('over'));el.classList.add('over');});
 document.addEventListener('drop',e=>{
  if(dragKind===null)return;
  const el=e.target.closest(dragKind==='plan'?'[data-pi]':'[data-ti]');if(!el)return;
  e.preventDefault();
  const to=+(dragKind==='plan'?el.dataset.pi:el.dataset.ti);
  const arr=dragKind==='plan'?S.plan:S.targets;
  const [x]=arr.splice(dragFrom,1);arr.splice(to,0,x);
  if(dragKind==='plan'){renderPlan();}
  else{S.targets.forEach((t,i)=>t.priority=i+1);targetsChanged();}
  dragKind=null;dragFrom=null;});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#tdrawer').hidden)closeTargets();else closeDetail();}
  if(e.key==='/'&&!/input|select|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus();}});
 await load();
});