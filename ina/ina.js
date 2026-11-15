/* =====================================================
   INA · TABLEAU DE MOISSON — cache = fichier présent
   ===================================================== */
const VIEWS='inaBoardViews',PLAN='inaBoardPlan',CFG='tvretroEditCfg';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const nf=n=>Number(n||0).toLocaleString('fr-FR');
const S={cov:null,src:'live',f:{q:'',decade:'all',year:'all',state:'all',sort:'left',view:'matrix',batch:400},
 plan:JSON.parse(localStorage.getItem(PLAN)||'[]'),views:JSON.parse(localStorage.getItem(VIEWS)||'[]'),detail:null};

function toast(m,k='',a){const e=document.createElement('div');e.className='toast '+k;e.innerHTML=`<span>${esc(m)}</span>`;
 if(a){const b=document.createElement('button');b.textContent=a.label;b.onclick=()=>{a.fn();e.remove();};e.appendChild(b);}
 $('#toasts').appendChild(e);setTimeout(()=>{e.style.transition='opacity .3s';e.style.opacity='0';setTimeout(()=>e.remove(),320);},a?7000:3200);}
async function copy(t,m){try{await navigator.clipboard.writeText(t);}catch(e){
 const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}
 toast(m||'Copié.','ok');}
/* normalise ancien format (downloaded) → nouveau (cached) */
function normCell(e){const cached=e.cached??e.downloaded??0;
 return {...e,cached,current:e.current??cached,outdated:e.outdated??0,
  coverage:e.indexed?+(100*cached/e.indexed).toFixed(1):0};}

function seed(){
 const shows=["Club Dorothée","Récré A2","Amuse 3","Cabou Cadin","Vitamine","Youpi ! L'école est finie","Giga","Les Visiteurs du mercredi","Le Disney Channel","Les Minikeums","Discopuce","Multitop"];
 const years=[];for(let y=1975;y<=1999;y++)years.push(y);
 const programs=shows.map((p,i)=>{
  const ys=years.filter(y=>i<4||y>=1980+i%6).map(y=>{
   const indexed=40+((i*37+y*13)%520);
   const cached=Math.min(indexed,Math.round(indexed*(((i*7+y)%11)/10)));
   const outdated=(i+y)%4===0?Math.round(cached*.3):0;
   const withE=Math.round(cached*(.45+((i+y)%5)/12));
   return normCell({year:y,indexed,cached,current:cached-outdated,outdated,with_elements:withE,
    empty:cached-withE,remaining:indexed-cached,elements:withE*(3+i%4),days:Math.round(withE*.7),
    sample:Array.from({length:Math.min(6,indexed-cached)},(_,k)=>`TV_${100000+i*9000+y+k}.001`)});});
  const t={};['indexed','cached','current','outdated','with_elements','empty','remaining','elements','days'].forEach(k=>t[k]=ys.reduce((s,e)=>s+e[k],0));
  t.coverage=t.indexed?+(100*t.cached/t.indexed).toFixed(1):0;
  return {program:p,slug:p.toLowerCase().replace(/[^a-z0-9]+/g,'-'),years:ys,totals:t};});
 const g={};['indexed','cached','current','outdated','with_elements','empty','remaining','elements','days'].forEach(k=>g[k]=programs.reduce((s,p)=>s+p.totals[k],0));
 g.coverage=g.indexed?+(100*g.cached/g.indexed).toFixed(1):0;
 return {generated_at:new Date().toISOString(),parser_version:5,programs,orphans:[],totals:g,
  health:{outdated:g.outdated,orphans:0,advice:g.outdated?[`${g.outdated} notice(s) d'ancienne version : déjà en cache, un rebuild local suffit.`]:[]},
  queue:programs.flatMap(p=>p.years.filter(e=>e.remaining>0).map(e=>({program:p.program,year:e.year,remaining:e.remaining}))).sort((a,b)=>b.remaining-a.remaining)};
}

async function load(){
 $('#status').textContent='⏳ Chargement…';
 try{const r=await fetch('../data/ina/coverage.json?t='+Date.now(),{cache:'no-store'});
  if(r.ok){S.cov=await r.json();S.src='live';}else throw 0;}catch(e){S.cov=seed();S.src='demo';}
 S.cov.programs.forEach(p=>{p.years=p.years.map(normCell);
  const t=p.totals;if(t.cached===undefined){t.cached=t.downloaded||0;t.current=t.current??t.cached;t.outdated=t.outdated||0;}
  t.coverage=t.indexed?+(100*t.cached/t.indexed).toFixed(1):0;});
 const g=S.cov.totals;if(g.cached===undefined){g.cached=g.downloaded||0;g.current=g.current??g.cached;g.outdated=g.outdated||0;}
 g.coverage=g.indexed?+(100*g.cached/g.indexed).toFixed(1):0;
 const p=$('#src-pill');p.textContent=S.src==='live'?'DONNÉES RÉELLES':'DÉMONSTRATION';p.className='pill '+(S.src==='live'?'ok':'warn');
 $('#stamp').textContent='maj '+String(S.cov.generated_at||'').slice(0,16).replace('T',' ')+' · parser v'+(S.cov.parser_version||'?');
 $('#note').hidden=S.src==='live';
 if(S.src!=='live')$('#note').innerHTML='⚠️ <code>data/ina/coverage.json</code> introuvable — aperçu simulé. Lance le workflow en mode <b>report-only</b>.';
 const h=S.cov.health||{},hb=$('#health');
 if(h.advice&&h.advice.length){hb.hidden=false;hb.innerHTML='<b>État du cache</b><ul>'+h.advice.map(a=>`<li>${esc(a)}</li>`).join('')+'</ul>';}
 else hb.hidden=true;
 const cfg=JSON.parse(localStorage.getItem(CFG)||'{}');
 $('#wf-link').href=`https://github.com/${cfg.owner||'xbodin2g'}/${cfg.repo||'tv-retro'}/actions/workflows/ina-enrich.yml`;
 const years=[...new Set(S.cov.programs.flatMap(p=>p.years.map(e=>e.year)))].sort((a,b)=>a-b);
 $('#f-decade').innerHTML='<option value="all">Toutes</option>'+[...new Set(years.map(y=>Math.floor(y/10)*10))].map(d=>`<option value="${d}">${String(d).slice(2)}s</option>`).join('');
 fillYears(years);renderViews();renderPlan();renderOrph();render();
}
function fillYears(years){
 let ys=years||[...new Set(S.cov.programs.flatMap(p=>p.years.map(e=>e.year)))].sort((a,b)=>a-b);
 if(S.f.decade!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+S.f.decade);
 $('#f-year').innerHTML='<option value="all">Toutes</option>'+ys.map(y=>`<option value="${y}">${y}</option>`).join('');
}
function cells(){
 const q=S.f.q.trim().toLowerCase(),out=[];
 S.cov.programs.forEach(p=>{
  if(q&&!p.program.toLowerCase().includes(q))return;
  p.years.forEach(e=>{
   if(S.f.decade!=='all'&&Math.floor(e.year/10)*10!==+S.f.decade)return;
   if(S.f.year!=='all'&&e.year!==+S.f.year)return;
   if(S.f.state==='todo'&&e.remaining<=0)return;
   if(S.f.state==='done'&&e.remaining>0)return;
   if(S.f.state==='virgin'&&e.cached>0)return;
   if(S.f.state==='old'&&!e.outdated)return;
   out.push({program:p.program,slug:p.slug,...e});});});
 out.sort((a,b)=>S.f.sort==='alpha'?a.program.localeCompare(b.program,'fr')||a.year-b.year
  :S.f.sort==='cov'?a.coverage-b.coverage||b.remaining-a.remaining
  :S.f.sort==='works'?b.elements-a.elements:b.remaining-a.remaining||a.program.localeCompare(b.program,'fr'));
 return out;
}
function kpis(){
 const c=cells(),t=c.reduce((a,e)=>{['indexed','cached','with_elements','remaining','elements','outdated'].forEach(k=>a[k]+=e[k]||0);return a;},
  {indexed:0,cached:0,with_elements:0,remaining:0,elements:0,outdated:0});
 $('#k-indexed').textContent=nf(t.indexed);$('#k-cached').textContent=nf(t.cached);
 $('#k-works').textContent=nf(t.with_elements);$('#k-left').textContent=nf(t.remaining);
 $('#k-elements').textContent=nf(t.elements);$('#k-old').textContent=nf(t.outdated);
 $('#k-runs').textContent=nf(Math.ceil(t.remaining/S.f.batch));
}
const cls=c=>c>=99.5?'c4':c>=75?'c3':c>=40?'c2':c>0?'c1':'c0';
const inPlan=(p,y)=>S.plan.some(i=>i.program===p&&i.year===y);
function render(){
 kpis();const c=cells(),board=$('#board');
 $('#status').textContent=`${nf(c.length)} couple(s) émission × année · ${nf(new Set(c.map(x=>x.program)).size)} émission(s)`;
 if(!c.length){board.innerHTML='<div class="empty"><b>Rien ne correspond</b>Élargis les filtres.</div>';return;}
 if(S.f.view==='list'){
  board.innerHTML='<div class="rows">'+c.slice(0,600).map(e=>`<div class="row" data-cell="${esc(e.program)}|${e.year}"><div class="nm"><b>${esc(e.program)}</b><small>${e.year} · ${nf(e.cached)}/${nf(e.indexed)} en cache${e.outdated?` · ${nf(e.outdated)} ancienne version`:''} · ${nf(e.with_elements)} œuvrées</small></div><div class="track"><i style="width:${e.coverage}%"></i></div><div class="num ${e.remaining?'left':'ok'}">${e.remaining?'−'+nf(e.remaining):'✓'}</div></div>`).join('')+'</div>';
  return;}
 const progs=[...new Set(c.map(x=>x.program))],years=[...new Set(c.map(x=>x.year))].sort((a,b)=>a-b);
 const map=new Map(c.map(e=>[e.program+'|'+e.year,e]));
 board.innerHTML=`<table><thead><tr><th>Émission</th>${years.map(y=>`<th>${y}</th>`).join('')}<th>Reste</th></tr></thead><tbody>${
  progs.map(p=>{const tot=c.filter(x=>x.program===p).reduce((s,x)=>s+x.remaining,0);
   return `<tr><th title="${esc(p)}">${esc(p)}</th>${years.map(y=>{const e=map.get(p+'|'+y);
    if(!e)return '<td><span class="cell void">·</span></td>';
    return `<td><span class="cell ${cls(e.coverage)}${e.outdated?' old':''}${inPlan(p,y)?' picked':''}" data-cell="${esc(p)}|${y}" title="${esc(p)} ${y} — ${e.cached}/${e.indexed} en cache (${e.coverage} %), reste ${e.remaining}${e.outdated?', '+e.outdated+' ancienne version':''}">${e.remaining?e.remaining:'✓'}</span></td>`;}).join('')}<td class="num ${tot?'left':'ok'}">${tot?nf(tot):'✓'}</td></tr>`;}).join('')
 }</tbody></table>`;
}
function renderOrph(){
 const o=S.cov.orphans||[],box=$('#orph');
 if(!o.length){box.hidden=true;return;}
 box.hidden=false;
 box.innerHTML='<header><strong>Notices en cache hors index</strong><span class="cnt">'+nf(o.reduce((s,x)=>s+x.count,0))+'</span></header><div class="orph-body">'
  +o.map(x=>`<div class="pitem"><b>${esc(x.program)}</b><code>${nf(x.count)} notices</code><code>${nf(x.with_elements)} œuvrées</code></div>`).join('')
  +'<p class="status">Ces fichiers existent mais ne sont rattachés à aucun index : lance <b>index-only</b> sur l\'émission pour les réintégrer.</p></div>';
}
function renderPlan(){
 $('#plan-count').textContent=S.plan.length;const b=$('#plan-body');
 if(!S.plan.length){b.innerHTML='<p class="status">Vide. ⇧clic sur une case, ou « ⚡ Auto ».</p>';localStorage.setItem(PLAN,'[]');return;}
 let runs=0,secs=0;const batch=S.f.batch;
 b.innerHTML=S.plan.map((i,k)=>{const n=Math.ceil(i.remaining/batch);runs+=n;secs+=i.remaining*3.2+Math.floor(i.remaining/40)*22;
  return `<div class="pitem"><b>${esc(i.program)} · ${i.year}</b><code>reste ${nf(i.remaining)}</code><code>${n} run(s)</code><button class="mini" data-copy="${k}">📋</button><button class="mini danger" data-rm="${k}">✕</button></div>`;}).join('')
  +`<div class="pitem" style="border-color:var(--phos)"><b>Total</b><code>${runs} run(s)</code><code>≈ ${Math.round(secs/60)} min</code></div>`;
 localStorage.setItem(PLAN,JSON.stringify(S.plan));
}
function addToPlan(program,year){
 const e=S.cov.programs.find(p=>p.program===program)?.years.find(y=>y.year===year);
 if(!e||!e.remaining)return toast('Rien à moissonner ici.','warn');
 if(inPlan(program,year))return toast('Déjà dans le plan.','warn');
 S.plan.push({program,year,remaining:e.remaining});renderPlan();render();
 toast(`${program} ${year} ajouté.`,'ok',{label:'Annuler',fn:()=>{S.plan=S.plan.filter(i=>!(i.program===program&&i.year===year));renderPlan();render();}});
}
function openDetail(program,year){
 const e=S.cov.programs.find(x=>x.program===program)?.years.find(x=>x.year===year);if(!e)return;
 S.detail={program,year,remaining:e.remaining};
 $('#d-title').textContent=program;$('#d-sub').textContent=`Année ${year} — parser v${S.cov.parser_version}`;
 const batch=S.f.batch,runs=Math.ceil(e.remaining/batch),per=Math.min(e.remaining,batch)||batch;
 $('#d-body').innerHTML=`
  <div class="kv"><span>Indexées</span><b>${nf(e.indexed)}</b>
  <span>En cache (fichier présent)</span><b style="color:var(--phos)">${nf(e.cached)}</b>
  <span>— version courante</span><b>${nf(e.current)}</b>
  <span>— ancienne version</span><b style="color:var(--amber)">${nf(e.outdated)}</b>
  <span>Avec œuvres</span><b>${nf(e.with_elements)}</b><span>Sans œuvre</span><b>${nf(e.empty)}</b>
  <span>Reste à télécharger</span><b style="color:var(--red)">${nf(e.remaining)}</b>
  <span>Œuvres relevées</span><b>${nf(e.elements)}</b><span>Jours couverts</span><b>${nf(e.days)}</b>
  <span>Couverture</span><b>${e.coverage} %</b></div>
  <div class="track" style="width:100%"><i style="width:${e.coverage}%"></i></div>
  ${e.outdated?`<p class="status">◦ ${nf(e.outdated)} notice(s) d'ancienne version sont <b>déjà en cache</b> : elles seront re-normalisées localement, sans requête.</p>`:''}
  <p class="status">Lot de ${batch} → <b>${runs}</b> run(s). ≈ ${Math.round((per*3.2+Math.floor(per/40)*22)/60)} min par run.</p>
  <div class="cmd">mode: all\nprogram: ${esc(program)}\nyear: ${year}\nmax_notices: ${per}</div>
  ${e.sample?.length?`<div><p class="status">Exemples de notices manquantes</p><div class="ids">${e.sample.map(s=>`<code>${esc(s)}</code>`).join('')}</div></div>`:''}`;
 $('#d-add').disabled=!e.remaining;
 $('#scrim').hidden=false;$('#drawer').hidden=false;document.body.style.overflow='hidden';
}
function closeDetail(){$('#scrim').hidden=true;$('#drawer').hidden=true;document.body.style.overflow='';}
function renderViews(){
 $('#views').innerHTML=S.views.length?S.views.map(v=>`<button class="vchip" data-v="${esc(v.id)}"><b>⭐ ${esc(v.name)}</b><i data-vd="${esc(v.id)}">✕</i></button>`).join('')
 :'<span class="status">⭐ Mémorise une combinaison de filtres.</span>';
}
document.addEventListener('DOMContentLoaded',async()=>{
 $('#btn-reload').onclick=load;
 $('#q').oninput=e=>{S.f.q=e.target.value;render();};
 $('#f-decade').onchange=e=>{S.f.decade=e.target.value;S.f.year='all';fillYears();render();};
 $('#f-year').onchange=e=>{S.f.year=e.target.value;render();};
 $('#f-state').onchange=e=>{S.f.state=e.target.value;render();};
 $('#f-sort').onchange=e=>{S.f.sort=e.target.value;render();};
 $('#f-view').onchange=e=>{S.f.view=e.target.value;render();};
 $('#f-batch').onchange=e=>{S.f.batch=+e.target.value;renderPlan();render();};
 $('#btn-reset').onclick=()=>{S.f={...S.f,q:'',decade:'all',year:'all',state:'all',sort:'left'};
  $('#q').value='';$('#f-decade').value='all';fillYears();$('#f-year').value='all';$('#f-state').value='all';$('#f-sort').value='left';render();};
 $('#btn-view-save').onclick=()=>{const n=prompt('Nom de la vue :','Ma vue');if(!n)return;
  S.views.push({id:'v'+Date.now(),name:n.slice(0,32),f:{...S.f}});localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();toast('Vue enregistrée.','ok');};
 $('#btn-auto').onclick=()=>{const top=(S.cov.queue||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10);
  if(!top.length)return toast('Rien à ajouter.','warn');
  const b=[...S.plan];S.plan.push(...top.map(t=>({...t})));renderPlan();render();
  toast(`${top.length} couple(s) ajouté(s).`,'ok',{label:'Annuler',fn:()=>{S.plan=b;renderPlan();render();}});};
 $('#btn-plan-clear').onclick=()=>{if(!S.plan.length)return;const b=[...S.plan];S.plan=[];renderPlan();render();
  toast('Plan vidé.','warn',{label:'Annuler',fn:()=>{S.plan=b;renderPlan();render();}});};
 $('#btn-copy-plan').onclick=()=>{if(!S.plan.length)return toast('Plan vide.','warn');
  copy('Émission\tAnnée\tmax_notices\tRuns\n'+S.plan.map(i=>`${i.program}\t${i.year}\t${Math.min(i.remaining,S.f.batch)}\t${Math.ceil(i.remaining/S.f.batch)}`).join('\n'),'Plan copié.');};
 $('#btn-csv').onclick=()=>{if(!S.plan.length)return toast('Plan vide.','warn');
  const csv='program,year,max_notices,runs\n'+S.plan.map(i=>`"${i.program}",${i.year},${Math.min(i.remaining,S.f.batch)},${Math.ceil(i.remaining/S.f.batch)}`).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='plan-moisson-ina.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast('CSV téléchargé.','ok');};
 $('#d-close').onclick=$('#d-close2').onclick=$('#scrim').onclick=closeDetail;
 $('#d-add').onclick=()=>{if(S.detail){addToPlan(S.detail.program,S.detail.year);closeDetail();}};
 $('#d-copy').onclick=()=>{const d=S.detail;if(!d)return;
  copy(`mode: all\nprogram: ${d.program}\nyear: ${d.year}\nmax_notices: ${Math.min(d.remaining,S.f.batch)||S.f.batch}`,'Paramètres copiés.');};
 document.addEventListener('click',e=>{
  const vd=e.target.closest('[data-vd]');if(vd){S.views=S.views.filter(v=>v.id!==vd.dataset.vd);localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();return;}
  const vw=e.target.closest('[data-v]');if(vw){const v=S.views.find(x=>x.id===vw.dataset.v);if(!v)return;S.f={...v.f};
   $('#q').value=S.f.q;$('#f-decade').value=S.f.decade;fillYears();$('#f-year').value=S.f.year;$('#f-state').value=S.f.state;$('#f-sort').value=S.f.sort;$('#f-view').value=S.f.view;$('#f-batch').value=S.f.batch;renderPlan();render();return;}
  const rm=e.target.closest('[data-rm]');if(rm){const k=+rm.dataset.rm,it=S.plan[k];S.plan.splice(k,1);renderPlan();render();
   toast('Retiré.','warn',{label:'Annuler',fn:()=>{S.plan.splice(k,0,it);renderPlan();render();}});return;}
  const cp=e.target.closest('[data-copy]');if(cp){const i=S.plan[+cp.dataset.copy];
   copy(`mode: all\nprogram: ${i.program}\nyear: ${i.year}\nmax_notices: ${Math.min(i.remaining,S.f.batch)}`,'Paramètres copiés.');return;}
  const c=e.target.closest('[data-cell]');if(c){const[p,y]=c.dataset.cell.split('|');
   if(e.shiftKey)addToPlan(p,+y);else openDetail(p,+y);return;}
 });
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeDetail();
  if(e.key==='/'&&!/input|select|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus();}
 });
 await load();
});