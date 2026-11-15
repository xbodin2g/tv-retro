/* =====================================================
   INA · RÉGIE DE MOISSON
   Matrice des cibles + plan + orchestration GitHub
   + diagnostic de permissions (403).
   ===================================================== */
const CFG='tvretroEditCfg',VIEWS='inaBoardViews',PLAN='inaBoardPlan',TGT='inaBoardTargets',ORCH='inaBoardOrch';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const nf=n=>Number(n||0).toLocaleString('fr-FR');
const slugify=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'programme';
const nrm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const KEYS=['indexed','cached','current','outdated','with_elements','empty','remaining','elements','days'];
const blank=y=>({year:y,...Object.fromEntries(KEYS.map(k=>[k,0])),coverage:0,sample:[],virgin:true,estimate:0});
const uid=()=>Math.random().toString(36).slice(2,10);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fmtDur=s=>{s=Math.max(0,Math.round(s));const m=Math.floor(s/60);return m?`${m} min ${String(s%60).padStart(2,'0')} s`:`${s} s`;};
const unb64=s=>{const bin=atob(String(s).replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));};

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

const S={cfg:{owner:'xbodin2g',repo:'tv-retro',branch:'main',workflow:'ina-enrich.yml',token:'',...JSON.parse(localStorage.getItem(CFG)||'{}')},
 report:null,targets:null,raw:{},cov:null,src:'live',globalAvg:150,wfId:null,runs:[],
 mine:new Set(JSON.parse(localStorage.getItem('inaMineRuns')||'[]')),
 f:{q:'',decade:'all',year:'all',state:'all',sort:'prio',view:'matrix',batch:400,names:'short'},
 plan:JSON.parse(localStorage.getItem(PLAN)||'[]'),views:JSON.parse(localStorage.getItem(VIEWS)||'[]'),
 orch:{running:false,paused:false,strategy:'serial',delay:2000,cap:25,mode:'all',startedAt:0,sent:0,...JSON.parse(localStorage.getItem(ORCH)||'{}'),running:false,paused:false},
 detail:null,pollTimer:null,loopToken:0,diag:[]};

/* ---------- UI ---------- */
function toast(m,k='',a){const e=document.createElement('div');e.className='toast '+k;e.innerHTML=`<span>${esc(m)}</span>`;
 if(a){const b=document.createElement('button');b.textContent=a.label;b.onclick=()=>{a.fn();e.remove();};e.appendChild(b);}
 $('#toasts').appendChild(e);setTimeout(()=>{e.style.transition='opacity .3s';e.style.opacity='0';setTimeout(()=>e.remove(),320);},a?8000:4000);}
async function copy(t,m){try{await navigator.clipboard.writeText(t);}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}toast(m||'Copié.','ok');}
function dl(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function showTip(el,text){const t=$('#tip');t.textContent=text;t.hidden=false;const r=el.getBoundingClientRect();
 const w=t.offsetWidth;let left=Math.min(Math.max(8,r.left),innerWidth-w-8);let top=r.bottom+8;
 if(top+t.offsetHeight>innerHeight-8)top=r.top-t.offsetHeight-8;
 t.style.left=left+'px';t.style.top=Math.max(8,top)+'px';}
function hideTip(){$('#tip').hidden=true;}
function tokenNewUrl(){const o=S.cfg.owner||'xbodin2g';
 return `https://github.com/settings/personal-access-tokens/new?name=TV+Retro+Regie&description=Moisson+INA+%2B+editeur&target_name=${encodeURIComponent(o)}&expires_in=366&contents=write&actions=write`;}

/* ---------- GitHub ---------- */
const live=()=>!!(S.cfg.owner&&S.cfg.repo&&S.cfg.token);
const ghH=()=>({Authorization:`Bearer ${String(S.cfg.token).replace(/\s+/g,'')}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
async function rawGh(path,opts={},cfg=S.cfg){
 const url=`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`;
 let r,txt='';
 try{r=await fetch(url,{cache:'no-store',...opts,headers:{...ghH(),...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})}});txt=await r.text();}
 catch(e){return {ok:false,status:0,message:'Réseau bloqué : '+e.message,data:null};}
 let msg='';try{const j=txt?JSON.parse(txt):null;if(j&&j.message)msg=j.message;}catch(e){}
 return {ok:r.ok,status:r.status,message:msg,data:(()=>{try{return txt?JSON.parse(txt):null;}catch(e){return null;}})()};
}
function explain(res){
 if(res.ok)return '';
 if(res.status===401)return '401 — token invalide, expiré ou révoqué.';
 if(res.status===403)return `403 — ${res.message||'accès refusé'}. Permission manquante sur le token, ou quota dépassé.`;
 if(res.status===404)return `404 — ${res.message||'introuvable'}. Dépôt, workflow ou fichier absent, ou token sans accès à ce dépôt.`;
 if(res.status===422)return `422 — ${res.message||'entrées refusées'}. Vérifie que le workflow déclare bien les inputs et que workflow_dispatch est présent sur la branche.`;
 return `HTTP ${res.status}${res.message?' — '+res.message:''}`;
}
async function gh(path,opts={}){
 const res=await rawGh(path,opts);
 if(res.status===204)return null;
 if(!res.ok)throw new Error(explain(res));
 return res.data;
}
async function resolveWorkflow(){
 if(S.wfId)return S.wfId;
 const j=await gh('/actions/workflows?per_page=100');
 const file=(S.cfg.workflow||'ina-enrich.yml').replace(/^.*\//,'');
 const w=(j?.workflows||[]).find(x=>x.path.endsWith('/'+file))||(j?.workflows||[]).find(x=>/ina/i.test(x.name));
 if(!w)throw new Error(`Workflow « ${file} » introuvable dans le dépôt.`);
 S.wfId=w.id;return w.id;
}
async function fetchRuns(){
 if(!live()){S.runs=demoRuns();return;}
 const j=await gh('/actions/runs?event=workflow_dispatch&per_page=40');
 S.runs=(j?.workflow_runs||[]).map(r=>({id:r.id,name:r.display_title||r.name,status:r.status,conclusion:r.conclusion,
  url:r.html_url,created:r.created_at,updated:r.updated_at,started:r.run_started_at,attempt:r.run_attempt}));
}
async function dispatchTask(t){
 const inputs={mode:S.orch.mode,program:'Club Dorothée',program_custom:t.program,
  year:String(t.year),max_notices:String(t.max||S.f.batch),retry_empty:'false',refresh_stale:'false',origin:'dashboard'};
 if(!live()){
  t.state='running';t.runId='demo-'+uid();t.sentAt=Date.now();t.demo=true;delete t.error;
  S.mine.add(t.runId);persistMine();
  setTimeout(()=>{if(t.state==='running'){t.state=Math.random()<.9?'success':'failure';t.endedAt=Date.now();renderPlan();renderRuns();}},7000+Math.random()*6000);
  return;
 }
 const id=await resolveWorkflow();
 await gh(`/actions/workflows/${id}/dispatches`,{method:'POST',body:JSON.stringify({ref:S.cfg.branch||'main',inputs})});
 t.state='dispatched';t.sentAt=Date.now();delete t.error;
 await sleep(2600);
 await fetchRuns();
 const claimed=new Set(S.plan.map(x=>x.runId).filter(Boolean));
 const cand=S.runs.filter(r=>!claimed.has(r.id)&&nrm(r.name).includes(nrm(t.program))&&String(r.name).includes(String(t.year)))
  .sort((a,b)=>new Date(b.created)-new Date(a.created))[0];
 if(cand){t.runId=cand.id;S.mine.add(cand.id);persistMine();t.state=cand.status==='completed'?(cand.conclusion==='success'?'success':'failure'):'running';}
}
function persistMine(){localStorage.setItem('inaMineRuns',JSON.stringify([...S.mine].slice(-300)));}
function syncTasks(){
 const byId=new Map(S.runs.map(r=>[String(r.id),r]));
 S.plan.forEach(t=>{
  if(!t.runId||t.demo)return;
  const r=byId.get(String(t.runId));if(!r)return;
  t.url=r.url;
  if(r.status==='completed'){t.state=r.conclusion==='success'?'success':r.conclusion==='cancelled'?'cancelled':'failure';t.endedAt=new Date(r.updated).getTime();}
  else t.state=r.status==='queued'?'queued':'running';
 });
}
function demoRuns(){
 return S.plan.filter(t=>t.runId).map(t=>({id:t.runId,name:`🏛️ ${t.program} · ${t.year} · ${S.orch.mode}`,
  status:['running','queued','dispatched'].includes(t.state)?'in_progress':'completed',
  conclusion:t.state==='success'?'success':t.state==='failure'?'failure':t.state==='cancelled'?'cancelled':null,
  url:'#',created:new Date(t.sentAt||Date.now()).toISOString(),updated:new Date(t.endedAt||Date.now()).toISOString(),
  started:new Date(t.sentAt||Date.now()).toISOString(),attempt:1}));
}

/* ---------- diagnostic ---------- */
function renderDiag(){
 const b=$('#diag-out');
 if(!S.diag.length){b.innerHTML='<p class="status">Lance le diagnostic pour savoir précisément quelle permission manque.</p>';return;}
 b.innerHTML=S.diag.map(d=>`<div class="drow ${d.state}"><span class="ic">${d.state==='ok'?'✅':d.state==='ko'?'❌':'⏳'}</span>
  <span class="tx"><b>${esc(d.label)}</b><small>${esc(d.detail||'')}</small></span>
  <span class="need">${esc(d.need)}</span></div>`).join('');
}
function diagCfg(){return {...S.cfg,owner:$('#s-owner').value.trim()||S.cfg.owner,repo:$('#s-repo').value.trim()||S.cfg.repo,
 branch:$('#s-branch').value.trim()||'main',workflow:$('#s-workflow').value.trim()||'ina-enrich.yml',token:$('#s-token').value.replace(/\s+/g,'')};}
async function runDiag(){
 const c=diagCfg();
 if(!c.owner||!c.repo||!c.token){toast('Renseigne propriétaire, dépôt et token.','err');return;}
 S.diag=[{label:'Lecture du dépôt',need:'Metadata: read',state:'wait',detail:'…'}];renderDiag();
 const step=async(label,need,fn)=>{
  const row={label,need,state:'wait',detail:'…'};S.diag.push(row);renderDiag();
  try{const r=await fn();row.state=r.ok?'ok':'ko';row.detail=r.detail||explain(r)||'OK';}
  catch(e){row.state='ko';row.detail=e.message;}
  renderDiag();return row.state==='ok';
 };
 await step('Lecture du dépôt','Metadata: read',async()=>{
  const r=await rawGh('',{},c);return {...r,detail:r.ok?`${r.data.full_name} · branche par défaut ${r.data.default_branch}`:explain(r)};});
 let wf=null;
 await step('Liste des workflows','Actions: read',async()=>{
  const r=await rawGh('/actions/workflows?per_page=100',{},c);
  if(r.ok){const file=c.workflow.replace(/^.*\//,'');wf=(r.data.workflows||[]).find(x=>x.path.endsWith('/'+file));
   return {...r,detail:wf?`${r.data.total_count} workflow(s) · ${file} trouvé (id ${wf.id})`:`${r.data.total_count} workflow(s) mais ${file} ABSENT`};}
  return {...r,detail:explain(r)};});
 await step('Lecture des runs','Actions: read',async()=>{
  const r=await rawGh('/actions/runs?per_page=1',{},c);
  return {...r,detail:r.ok?`${r.data.total_count} run(s) au total`:explain(r)};});
 await step('Fichier workflow à jour','Contents: read',async()=>{
  const r=await rawGh(`/contents/.github/workflows/${c.workflow}?ref=${encodeURIComponent(c.branch)}`,{},c);
  if(!r.ok)return {...r,detail:explain(r)};
  const txt=unb64(r.data.content||'');
  const miss=['workflow_dispatch','program_custom','origin'].filter(k=>!txt.includes(k));
  return {...r,ok:!miss.length,detail:miss.length?`Champs absents : ${miss.join(', ')} → remplace le fichier workflow`:'workflow_dispatch + program_custom + origin présents'};});
 await step('Lecture de la couverture','Contents: read',async()=>{
  const r=await rawGh(`/contents/data/ina/coverage.json?ref=${encodeURIComponent(c.branch)}`,{},c);
  return {...r,detail:r.ok?'coverage.json lisible':explain(r)+' (normal si jamais généré)'};});
 const ko=S.diag.filter(d=>d.state==='ko');
 if(!ko.length)toast('Lecture OK. Teste maintenant l\'écriture.','ok');
 else toast(`${ko.length} point(s) bloquant(s) — voir le détail.`,'err');
}
async function diagWrite(){
 const c=diagCfg();
 if(!c.token){toast('Token requis.','err');return;}
 if(!confirm('Le test d\'écriture déclenche UN run réel en mode report-only.\n\nIl régénère le tableau de couverture et ne fait AUCUNE requête à l\'INA.\n\nContinuer ?'))return;
 const row={label:'Déclencher un workflow (report-only)',need:'Actions: write',state:'wait',detail:'…'};
 S.diag.push(row);renderDiag();
 try{
  let id=wfIdFromDiag();
  if(!id){const j=await gh('/actions/workflows?per_page=100');
   const file=c.workflow.replace(/^.*\//,'');
   const w=(j?.workflows||[]).find(x=>x.path.endsWith('/'+file));
   if(!w)throw new Error(`Workflow ${file} introuvable.`);id=w.id;}
  const res=await rawGh(`/actions/workflows/${id}/dispatches`,{method:'POST',body:JSON.stringify({
   ref:c.branch,inputs:{mode:'report-only',program:'Club Dorothée',program_custom:'',year:'1989',
    max_notices:'400',retry_empty:'false',refresh_stale:'false',origin:'diagnostic'}})},c);
  row.state=res.ok?'ok':'ko';
  row.detail=res.ok?'Run déclenché — Actions: write est bien accordée.':explain(res);
  if(res.ok){S.wfId=id;toast('Écriture OK. Tu peux lancer tes séries.','ok');await sleep(2500);await fetchRuns();renderRuns();}
  else toast(row.detail,'err');
 }catch(e){row.state='ko';row.detail=e.message;toast(e.message,'err');}
 renderDiag();renderPermAlert();
}
function wfIdFromDiag(){return S.wfId;}
function renderPermAlert(){
 const errs=S.plan.filter(t=>t.error&&/403|401/.test(t.error));
 const b=$('#perm-alert');
 if(!errs.length){b.hidden=true;return;}
 b.hidden=false;
 b.innerHTML=`<strong>⛔ ${errs.length} envoi(s) refusé(s) par GitHub</strong>
  <ol><li>Ouvre <a class="mini" href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">tes tokens</a> et clique sur ton token.</li>
  <li><b>Repository permissions → Actions → Read and write</b>, puis <b>Update token</b>. La valeur du token ne change pas.</li>
  <li>Reviens ici, <b>🔑 GitHub → ▶ Tester la lecture</b> puis <b>✍ Tester l'écriture</b>.</li>
  <li>Clique <b>↻ Réessayer les échecs</b> pour remettre la série en file.</li></ol>
  <div class="row-btns"><button class="btn small" id="perm-diag">🔍 Ouvrir le diagnostic</button>
  <a class="btn small" href="${esc(tokenNewUrl())}" target="_blank" rel="noopener">↗ Nouveau token pré-rempli</a>
  <button class="btn small ghost" id="perm-dismiss">Masquer</button></div>
  <p class="hint">Message GitHub : ${esc(errs[0].error)}</p>`;
 $('#perm-diag').onclick=openSettings;
 $('#perm-dismiss').onclick=()=>{b.hidden=true;};
}

/* ---------- orchestration ---------- */
function persistPlan(){localStorage.setItem(PLAN,JSON.stringify(S.plan));}
function persistOrch(){const{strategy,delay,cap,mode}=S.orch;localStorage.setItem(ORCH,JSON.stringify({strategy,delay,cap,mode}));}
const pendingTasks=()=>S.plan.filter(t=>!t.state||t.state==='idle');
const activeTasks=()=>S.plan.filter(t=>['dispatched','queued','running'].includes(t.state));
async function launch(){
 if(S.orch.running)return;
 const todo=pendingTasks();
 if(!todo.length)return toast('Aucune tâche à lancer. Ajoute des cibles au plan.','warn');
 const n=Math.min(todo.length,S.orch.cap);
 if(!live()){
  if(!confirm(`Pas de token GitHub : la série sera SIMULÉE (${n} tâche(s)).\n\nAucun run réel. Continuer ?`))return;
 }else if(n>3){
  if(!confirm(`Lancer ${n} run(s) GitHub réels ?\n\nEnchaînement : ${S.orch.strategy==='serial'?'séquentiel':'rafale espacée'}.\nGarde cet onglet ouvert${S.orch.strategy==='serial'?' pour enchaîner automatiquement':''}.`))return;
 }
 S.orch.running=true;S.orch.paused=false;S.orch.startedAt=Date.now();S.orch.sent=0;
 const token=++S.loopToken;renderOrch();renderPlan();
 try{
  for(const t of todo.slice(0,n)){
   if(token!==S.loopToken||!S.orch.running)break;
   while(S.orch.paused&&token===S.loopToken)await sleep(600);
   if(token!==S.loopToken||!S.orch.running)break;
   if(S.orch.strategy==='serial'){
    while(activeTasks().length&&token===S.loopToken){await sleep(3000);await pollOnce();}
    if(token!==S.loopToken||!S.orch.running)break;
   }
   t.state='queued';renderPlan();
   try{await dispatchTask(t);S.orch.sent++;}
   catch(e){t.state='error';t.error=e.message;toast(`${t.program} ${t.year} — ${e.message}`,'err');
    if(/403|401/.test(e.message)){renderPermAlert();S.orch.running=false;persistPlan();renderPlan();renderOrch();
     toast('Série interrompue : corrige la permission du token puis réessaie.','err');break;}}
   persistPlan();renderPlan();renderOrch();renderRuns();renderPermAlert();
   if(S.orch.strategy==='burst')await sleep(S.orch.delay);
  }
  if(S.orch.strategy==='serial'&&S.orch.running){
   while(activeTasks().length&&token===S.loopToken&&S.orch.running){await sleep(4000);await pollOnce();}
  }
 }finally{
  if(token===S.loopToken){const wasRunning=S.orch.running;S.orch.running=false;S.orch.paused=false;renderOrch();renderPlan();
   if(wasRunning){const ok=S.plan.filter(t=>t.state==='success').length,ko=S.plan.filter(t=>['failure','error'].includes(t.state)).length;
    toast(`Série terminée — ${ok} réussite(s), ${ko} échec(s).`,ko?'warn':'ok');}}
 }
}
function pause(){S.orch.paused=!S.orch.paused;renderOrch();toast(S.orch.paused?'Enchaînement en pause.':'Reprise.','warn');}
function stop(){S.orch.running=false;S.orch.paused=false;S.loopToken++;
 S.plan.forEach(t=>{if(t.state==='queued')t.state='idle';});
 persistPlan();renderOrch();renderPlan();toast('Enchaînement arrêté. Les runs déjà partis continuent sur GitHub.','warn');}
async function pollOnce(){try{await fetchRuns();syncTasks();persistPlan();}catch(e){}
 renderPlan();renderRuns();renderOrch();kpis();}
function startPolling(){if(S.pollTimer)clearInterval(S.pollTimer);
 S.pollTimer=setInterval(()=>{if(activeTasks().length||S.orch.running||!live())pollOnce();else if(!S.runs.length)pollOnce();},12000);}

/* ---------- couverture ---------- */
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
 return {generated_at:new Date().toISOString(),parser_version:5,programs,orphans:[],health:{advice:[]}};
}
function rebuild(){
 const known=[];Object.values(S.raw).forEach(r=>Object.values(r.years).forEach(e=>{if(e.indexed)known.push(e.indexed);}));
 S.globalAvg=known.length?Math.round(known.reduce((a,b)=>a+b,0)/known.length):150;
 const programs=[],used=new Set();
 S.targets.forEach(t=>{
  const slug=t.slug||slugify(t.program);used.add(slug);
  const raw=S.raw[slug]||{program:t.program,years:{}};
  const ky=Object.values(raw.years).filter(e=>e.indexed).map(e=>e.indexed);
  const avg=ky.length?Math.round(ky.reduce((a,b)=>a+b,0)/ky.length):S.globalAvg;
  const from=Math.min(t.from,t.to),to=Math.max(t.from,t.to),years=[];
  for(let y=from;y<=to;y++){const r=raw.years[y];years.push(r?{...r,virgin:false,estimate:0}:{...blank(y),estimate:avg});}
  Object.values(raw.years).forEach(r=>{if(r.year<from||r.year>to)years.push({...r,virgin:false,estimate:0});});
  years.sort((a,b)=>a.year-b.year);
  const totals=Object.fromEntries(KEYS.map(k=>[k,years.reduce((s,e)=>s+(e[k]||0),0)]));
  totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
  totals.virgin=years.filter(e=>e.virgin).length;
  totals.estimate=years.reduce((s,e)=>s+(e.estimate||0),0);
  programs.push({program:t.program,slug,channel:t.channel||'',priority:t.priority||9,from,to,harvested_at:raw.harvested_at||'',years,totals});});
 Object.entries(S.raw).forEach(([slug,raw])=>{
  if(used.has(slug))return;
  const years=Object.values(raw.years).sort((a,b)=>a.year-b.year).map(e=>({...e,virgin:false,estimate:0}));
  const totals=Object.fromEntries(KEYS.map(k=>[k,years.reduce((s,e)=>s+(e[k]||0),0)]));
  totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;totals.virgin=0;totals.estimate=0;
  programs.push({program:raw.program,slug,channel:'',priority:9,from:null,to:null,years,totals});});
 const totals=Object.fromEntries(KEYS.map(k=>[k,programs.reduce((s,p)=>s+p.totals[k],0)]));
 totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
 totals.virgin=programs.reduce((s,p)=>s+p.totals.virgin,0);
 totals.estimate=programs.reduce((s,p)=>s+p.totals.estimate,0);
 const queue=programs.flatMap(p=>p.years.filter(e=>e.remaining>0).map(e=>({program:p.program,year:e.year,remaining:e.remaining,virgin:false}))).sort((a,b)=>b.remaining-a.remaining);
 const frontier=programs.flatMap(p=>p.years.filter(e=>e.virgin).map(e=>({program:p.program,year:e.year,remaining:e.estimate||S.globalAvg,virgin:true,priority:p.priority}))).sort((a,b)=>a.priority-b.priority||a.year-b.year);
 const advice=[...(S.report?.health?.advice||[])];
 if(totals.virgin)advice.push(`${nf(totals.virgin)} cible(s) jamais indexée(s) — volume estimé ${nf(totals.estimate)} notices.`);
 if(totals.outdated)advice.push(`${nf(totals.outdated)} notice(s) d'ancienne version : déjà en cache, re-normalisation locale automatique.`);
 S.cov={generated_at:S.report?.generated_at,parser_version:S.report?.parser_version||5,programs,totals,queue,frontier,orphans:S.report?.orphans||[],health:{advice}};
}
async function load(){
 $('#status').textContent='⏳ Chargement…';
 let rep=null,tgt=null;
 if(location.protocol!=='file:'){
  try{const r=await fetch('../data/ina/coverage.json?t='+Date.now(),{cache:'no-store'});if(r.ok)rep=await r.json();}catch(e){}
  try{const r=await fetch('../data/ina/targets.json?t='+Date.now(),{cache:'no-store'});if(r.ok)tgt=await r.json();}catch(e){}
 }
 S.src=rep?'live':'demo';S.report=rep||seedReport();
 const local=JSON.parse(localStorage.getItem(TGT)||'null');
 S.targets=(local&&local.programs)||(tgt&&tgt.programs)||DEFAULT_TARGETS.map(t=>({...t}));
 S.targets.forEach(t=>{t.slug=t.slug||slugify(t.program);t.from=+t.from||1970;t.to=+t.to||1999;t.priority=+t.priority||9;});
 S.raw={};
 (S.report.programs||[]).forEach(p=>{
  const slug=p.slug||slugify(p.program),years={};
  (p.years||[]).forEach(e=>{const cached=e.cached??e.downloaded??0;
   years[e.year]={...e,cached,current:e.current??cached,outdated:e.outdated||0,coverage:e.indexed?+(100*cached/e.indexed).toFixed(1):0};});
  S.raw[slug]={program:p.program,years,harvested_at:p.harvested_at||''};
  if(!S.targets.some(t=>t.slug===slug)){const ys=Object.keys(years).map(Number);
   S.targets.push({program:p.program,slug,channel:'',from:ys.length?Math.min(...ys):1970,to:ys.length?Math.max(...ys):1999,priority:9});}});
 rebuild();refreshChrome();refreshFilters();renderHealth();renderViews();renderPlan();renderOrch();renderOrph();render();renderPermAlert();renderDiag();
 try{await fetchRuns();syncTasks();}catch(e){}
 renderRuns();renderPlan();kpis();startPolling();
}
function refreshChrome(){
 const p=$('#src-pill');p.textContent=S.src==='live'?'DONNÉES RÉELLES':'APERÇU SIMULÉ';p.className='pill '+(S.src==='live'?'ok':'warn');
 const g=$('#gh-pill');g.textContent=live()?`${S.cfg.owner}/${S.cfg.repo}`:'GitHub non connecté';g.className='pill '+(live()?'ok':'off');
 $('#stamp').textContent='maj '+String(S.cov.generated_at||'').slice(0,16).replace('T',' ')+' · parser v'+S.cov.parser_version;
 $('#note').hidden=S.src==='live';
 if(S.src!=='live')$('#note').innerHTML='⚠️ <code>data/ina/coverage.json</code> introuvable — aperçu simulé avec le registre complet. Lance le workflow en mode <b>targets</b> puis <b>report-only</b>.';
 $('#wf-link').href=`https://github.com/${S.cfg.owner}/${S.cfg.repo}/actions/workflows/${S.cfg.workflow||'ina-enrich.yml'}`;
 $('#tok-new').href=tokenNewUrl();
}
function refreshFilters(){
 const years=[...new Set(S.cov.programs.flatMap(p=>p.years.map(e=>e.year)))].sort((a,b)=>a-b);
 $('#f-decade').innerHTML='<option value="all">Toutes</option>'+[...new Set(years.map(y=>Math.floor(y/10)*10))].map(d=>`<option value="${d}">${String(d).slice(2)}s</option>`).join('');
 let ys=years;if(S.f.decade!=='all')ys=ys.filter(y=>Math.floor(y/10)*10===+S.f.decade);
 $('#f-year').innerHTML='<option value="all">Toutes</option>'+ys.map(y=>`<option value="${y}">${y}</option>`).join('');
 $('#f-year').value=ys.includes(+S.f.year)?S.f.year:'all';
}
function renderHealth(){const a=S.cov.health.advice||[],b=$('#health');
 if(!a.length){b.hidden=true;return;}b.hidden=false;b.innerHTML='<b>État de la moisson</b><ul>'+a.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>';}
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
 $('#k-runs').textContent=nf(Math.ceil(t.est/S.f.batch));
 const act=activeTasks().length;$('#k-active').textContent=nf(act);
 $('#rec').className='rec'+(act||S.orch.running?' busy':'');
}
const cls=c=>c>=99.5?'c4':c>=75?'c3':c>=40?'c2':c>0?'c1':'c0';
const inPlan=(p,y)=>S.plan.some(i=>i.program===p&&i.year===y);
function render(){
 kpis();const c=cells(),board=$('#board');
 board.classList.toggle('full-names',S.f.names==='full');
 $('#status').textContent=`${nf(c.length)} cible(s) · ${nf(new Set(c.map(x=>x.program)).size)} émission(s) · ${nf(c.filter(x=>x.virgin).length)} jamais indexée(s)`;
 if(!c.length){board.innerHTML='<div class="empty"><b>Aucune cible ne correspond</b>Élargis les filtres, ou ajoute une émission via 🎯 Cibles.</div>';return;}
 if(S.f.view==='list'){
  board.innerHTML='<div class="rows">'+c.slice(0,700).map(e=>`<div class="row${e.virgin?' v':''}" data-cell="${esc(e.program)}|${e.year}"><div class="nm"><b>${esc(e.program)}</b><small>${e.year}${e.channel?' · '+esc(e.channel):''} · ${e.virgin?`jamais indexé — ≈ ${nf(e.estimate)} notices`:`${nf(e.cached)}/${nf(e.indexed)} en cache · ${nf(e.with_elements)} œuvrées`}</small></div><div class="track"><i style="width:${e.virgin?0:e.coverage}%"></i></div><div class="num ${e.virgin?'vg':e.remaining?'left':'ok'}">${e.virgin?'?':e.remaining?'−'+nf(e.remaining):'✓'}</div></div>`).join('')+'</div>';
  return;}
 const progs=[...new Set(c.map(x=>x.program))],years=[...new Set(c.map(x=>x.year))].sort((a,b)=>a-b);
 const map=new Map(c.map(e=>[e.program+'|'+e.year,e])),meta=new Map(S.cov.programs.map(p=>[p.program,p]));
 board.innerHTML=`<table><thead><tr><th class="col-name">Émission</th>${years.map(y=>`<th>${y}</th>`).join('')}<th>Reste</th></tr></thead><tbody>${
  progs.map(p=>{const m=meta.get(p);const tot=c.filter(x=>x.program===p).reduce((s,x)=>s+(x.virgin?0:x.remaining),0);
   const vg=c.filter(x=>x.program===p&&x.virgin).length;
   const sub=`${m?.channel?m.channel+' · ':''}${vg?vg+' à démarrer':'tout indexé'}`;
   return `<tr><th class="col-name"><span class="nm-line" data-tip="${esc(p)}">${esc(p)}</span><span class="nm-sub">${esc(sub)}</span></th>${years.map(y=>{const e=map.get(p+'|'+y);
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
  +o.map(x=>`<div class="pitem"><span class="grip"></span><b>${esc(x.program)}</b><code>${nf(x.count)}</code><code>${nf(x.with_elements)} œuvrées</code></div>`).join('')
  +'<p class="status">Lance <b>index-only</b> sur l\'émission pour les rattacher.</p></div>';
}
const LBL={idle:'à lancer',queued:'envoi',dispatched:'envoyé',running:'en cours',success:'réussi',failure:'échec',error:'erreur',cancelled:'annulé',skipped:'ignoré'};
function taskRuns(t){const b=t.max||S.f.batch;return Math.max(1,Math.ceil((t.remaining||b)/b));}
function renderPlan(){
 $('#plan-count').textContent=S.plan.length;const b=$('#plan-body');
 if(!S.plan.length){b.innerHTML='<p class="status">Vide. ⇧clic une case de la matrice, ou 🌱 Démarrer / ⚡ Compléter. Puis ▶ Lancer la série.</p>';persistPlan();return;}
 b.innerHTML=S.plan.map((t,i)=>{
  const st=t.state||'idle';
  const dur=t.sentAt?fmtDur(((t.endedAt||Date.now())-t.sentAt)/1000):'';
  return `<div class="pitem st-${st}" draggable="true" data-pi="${i}"><span class="grip">⠿</span>
   <b title="${esc(t.program)} · ${t.year}">${esc(t.program)} · ${t.year}</b>
   ${t.virgin?'<span class="badge v">à démarrer</span>':''}
   <span class="badge ${st}">${LBL[st]||st}</span>
   <code>${t.virgin?'≈':'reste'} ${nf(t.remaining)}</code><code>${taskRuns(t)} run(s)</code>
   ${dur?`<code>${dur}</code>`:''}
   ${t.url&&t.url!=='#'?`<a class="mini" href="${esc(t.url)}" target="_blank" rel="noopener">↗</a>`:''}
   ${['dispatched','queued','running'].includes(st)&&t.runId&&!t.demo?`<button class="mini danger" data-cancel="${i}">⏹</button>`:''}
   <button class="mini" data-relaunch="${i}" title="Remettre en file">↻</button>
   <button class="mini" data-copy="${i}">📋</button>
   <button class="mini danger" data-rm="${i}">✕</button>
   ${t.error?`<span class="perr"><code>${esc(t.error)}</code><button class="mini" data-copyerr="${i}">📋</button></span>`:''}</div>`;}).join('');
 persistPlan();
}
function renderOrch(){
 const total=S.plan.length,done=S.plan.filter(t=>['success','failure','error','cancelled','skipped'].includes(t.state)).length;
 $('#orch-progress').style.width=(total?100*done/total:0)+'%';
 const act=activeTasks().length;
 $('#orch-status').textContent=total
  ?`${done}/${total} tâche(s) traitée(s) · ${act} active(s) · ${nf(pendingTasks().length)} en attente`+(S.orch.startedAt?` · écoulé ${fmtDur((Date.now()-S.orch.startedAt)/1000)}`:'')
  :'Aucune tâche planifiée.';
 $('#btn-launch').disabled=S.orch.running||!pendingTasks().length;
 $('#btn-pause').disabled=!S.orch.running;
 $('#btn-pause').textContent=S.orch.paused?'▶ Reprendre':'⏸ Pause';
 $('#btn-stop').disabled=!S.orch.running;
 $('#orch-hint').textContent=S.orch.strategy==='serial'
  ?'Séquentiel : un run à la fois, le suivant part dès la fin du précédent. Fiable avec la file GitHub — garde cet onglet ouvert.'
  :'Rafale : envois espacés, mais GitHub ne garde qu\'un run en attente par groupe ; au-delà, des runs peuvent être écartés. Réservé aux petits lots.';
 $('#o-strategy').value=S.orch.strategy;$('#o-delay').value=String(S.orch.delay);
 $('#o-cap').value=String(S.orch.cap);$('#o-mode').value=S.orch.mode;
}
function renderRuns(){
 const mine=$('#runs-mine').checked;
 const list=S.runs.filter(r=>!mine||S.mine.has(r.id)||S.mine.has(String(r.id)));
 $('#runs-count').textContent=list.length;
 const b=$('#runs-body');
 if(!list.length){b.innerHTML='<p class="status">Aucun run à afficher. '+(live()?'Lance une série ou décoche « Mes envois seulement ».':'Connecte GitHub pour voir les runs réels.')+'</p>';return;}
 b.innerHTML=list.slice(0,40).map(r=>{
  const st=r.status==='completed'?(r.conclusion||'terminé'):r.status==='queued'?'queued':'running';
  const dur=r.started?fmtDur(((r.status==='completed'?new Date(r.updated):Date.now())-new Date(r.started))/1000):'';
  return `<div class="pitem st-${st}"><span class="grip"></span><b title="${esc(r.name)}">${esc(r.name)}</b>
   <span class="badge ${st}">${esc(st)}</span>${dur?`<code>${dur}</code>`:''}
   <code>#${esc(String(r.id).slice(-6))}</code>
   ${r.url&&r.url!=='#'?`<a class="mini" href="${esc(r.url)}" target="_blank" rel="noopener">↗</a>`:''}
   ${r.status!=='completed'&&live()&&!String(r.id).startsWith('demo')?`<button class="mini danger" data-runcancel="${r.id}">⏹</button>`:''}</div>`;}).join('');
}
function addToPlan(program,year,silent){
 const p=S.cov.programs.find(x=>x.program===program),e=p?.years.find(x=>x.year===year);
 if(!e)return false;
 if(!e.virgin&&!e.remaining){if(!silent)toast('Rien à moissonner ici.','warn');return false;}
 if(inPlan(program,year)){if(!silent)toast('Déjà dans le plan.','warn');return false;}
 S.plan.push({id:uid(),program,year,remaining:e.virgin?(e.estimate||S.globalAvg):e.remaining,virgin:!!e.virgin,max:S.f.batch,state:'idle'});
 renderPlan();renderOrch();render();
 if(!silent)toast(`${program} ${year} ajouté.`,'ok',{label:'Annuler',fn:()=>{S.plan=S.plan.filter(i=>!(i.program===program&&i.year===year));renderPlan();renderOrch();render();}});
 return true;
}
function anyOpen(){return !$('#drawer').hidden||!$('#tdrawer').hidden||!$('#sdrawer').hidden;}
function lock(){document.body.style.overflow=anyOpen()?'hidden':'';}
function openDetail(program,year){
 const p=S.cov.programs.find(x=>x.program===program),e=p?.years.find(x=>x.year===year);if(!e)return;
 const vol=e.virgin?(e.estimate||S.globalAvg):e.remaining;
 S.detail={program,year,remaining:vol,virgin:!!e.virgin};
 $('#d-title').textContent=program;
 $('#d-sub').textContent=`${year}${p.channel?' · '+p.channel:''} — ${e.virgin?'jamais indexé':'indexé'}`;
 const batch=S.f.batch,runs=Math.max(1,Math.ceil(vol/batch)),per=Math.min(vol,batch)||batch;
 $('#d-body').innerHTML=e.virgin?`
  <div class="kv"><span>État</span><b style="color:var(--magenta)">jamais indexé</b>
  <span>Volume estimé</span><b>≈ ${nf(vol)}</b><span>Base</span><b>${p.years.some(x=>x.indexed)?'moyenne émission':'moyenne globale'}</b>
  <span>Plage</span><b>${p.from}→${p.to}</b><span>Priorité</span><b>${p.priority}</b></div>
  <p class="status">Le premier run <b>indexe l'année puis moissonne</b>. Le volume réel sera connu à l'issue de ce run.</p>
  <div class="cmd">mode: ${esc(S.orch.mode)}\nprogram: ${esc(program)}\nyear: ${year}\nmax_notices: ${per}</div>
  <p class="status">Lot de ${batch} → <b>${runs}</b> run(s) estimé(s) · ≈ ${Math.round((per*3.2+Math.floor(per/40)*22)/60)} min par run.</p>`
 :`<div class="kv"><span>Indexées</span><b>${nf(e.indexed)}</b>
  <span>En cache</span><b style="color:var(--phos)">${nf(e.cached)}</b>
  <span>— version courante</span><b>${nf(e.current)}</b><span>— ancienne</span><b style="color:var(--amber)">${nf(e.outdated)}</b>
  <span>Avec œuvres</span><b>${nf(e.with_elements)}</b><span>Sans œuvre</span><b>${nf(e.empty)}</b>
  <span>Reste</span><b style="color:var(--red)">${nf(e.remaining)}</b>
  <span>Œuvres</span><b>${nf(e.elements)}</b><span>Jours</span><b>${nf(e.days)}</b><span>Couverture</span><b>${e.coverage} %</b></div>
  <div class="track big"><i style="width:${e.coverage}%"></i></div>
  ${e.outdated?`<p class="status">◦ ${nf(e.outdated)} notice(s) d'ancienne version déjà en cache : re-normalisation locale, sans requête.</p>`:''}
  <p class="status">Lot de ${batch} → <b>${runs}</b> run(s) · ≈ ${Math.round((per*3.2+Math.floor(per/40)*22)/60)} min par run.</p>
  <div class="cmd">mode: ${esc(S.orch.mode)}\nprogram: ${esc(program)}\nyear: ${year}\nmax_notices: ${per}</div>
  ${e.sample?.length?`<div><p class="status">Notices manquantes (exemples)</p><div class="ids">${e.sample.map(s=>`<code>${esc(s)}</code>`).join('')}</div></div>`:''}`;
 $('#d-run').disabled=!vol;$('#d-add').disabled=!vol||inPlan(program,year);
 $('#scrim').hidden=false;$('#drawer').hidden=false;lock();
}
function closeDetail(){$('#scrim').hidden=true;$('#drawer').hidden=true;lock();}
function renderTargets(){
 $('#t-body').innerHTML=S.targets.map((t,i)=>`<div class="trow" draggable="true" data-ti="${i}">
  <span class="grip">⠿</span>
  <input value="${esc(t.program)}" data-tf="program" data-i="${i}" aria-label="Émission">
  <input type="number" value="${t.from}" data-tf="from" data-i="${i}" min="1960" max="2010" aria-label="De">
  <input type="number" value="${t.to}" data-tf="to" data-i="${i}" min="1960" max="2010" aria-label="À">
  <button class="del" data-tdel="${i}" title="Retirer">✕</button></div>`).join('')||'<p class="status">Registre vide.</p>';
}
function persistTargets(){localStorage.setItem(TGT,JSON.stringify({version:1,updated_at:new Date().toISOString(),programs:S.targets}));}
function targetsChanged(){persistTargets();rebuild();refreshFilters();renderHealth();render();renderTargets();}
function openTargets(){renderTargets();$('#tscrim').hidden=false;$('#tdrawer').hidden=false;lock();}
function closeTargets(){$('#tscrim').hidden=true;$('#tdrawer').hidden=true;lock();}
function openSettings(){
 $('#s-owner').value=S.cfg.owner||'';$('#s-repo').value=S.cfg.repo||'';$('#s-branch').value=S.cfg.branch||'main';
 $('#s-workflow').value=S.cfg.workflow||'ina-enrich.yml';$('#s-token').value=S.cfg.token||'';$('#s-status').textContent='';
 $('#tok-new').href=tokenNewUrl();renderDiag();
 $('#sscrim').hidden=false;$('#sdrawer').hidden=false;lock();
}
function closeSettings(){$('#sscrim').hidden=true;$('#sdrawer').hidden=true;lock();}
async function saveSettings(){
 S.cfg={...S.cfg,owner:$('#s-owner').value.trim(),repo:$('#s-repo').value.trim(),branch:$('#s-branch').value.trim()||'main',
  workflow:$('#s-workflow').value.trim()||'ina-enrich.yml',token:$('#s-token').value.replace(/\s+/g,'')};
 localStorage.setItem(CFG,JSON.stringify(S.cfg));S.wfId=null;
 refreshChrome();closeSettings();toast('Connexion enregistrée.','ok');
 try{await fetchRuns();syncTasks();renderRuns();renderPlan();}catch(e){toast(e.message,'err');}
}
async function testSettings(){
 $('#s-status').textContent='⏳ Test…';
 const c=diagCfg();
 const a=await rawGh('',{},c);
 if(!a.ok){$('#s-status').textContent='❌ '+explain(a);return;}
 const w=await rawGh('/actions/workflows?per_page=100',{},c);
 if(!w.ok){$('#s-status').innerHTML=`✅ dépôt ok · ❌ workflows : ${esc(explain(w))}`;return;}
 const file=c.workflow.replace(/^.*\//,'');
 const found=(w.data.workflows||[]).find(x=>x.path.endsWith('/'+file));
 $('#s-status').innerHTML=`✅ <b>${esc(a.data.full_name)}</b> · ${w.data.total_count} workflow(s)${found?` · <b>${esc(file)}</b> id ${found.id}`:` — <b>${esc(file)}</b> introuvable`}. Lance le diagnostic pour vérifier l'écriture.`;
}
function renderViews(){
 $('#views').innerHTML=S.views.length?S.views.map(v=>`<button class="vchip" data-v="${esc(v.id)}"><b>⭐ ${esc(v.name)}</b><i data-vd="${esc(v.id)}">✕</i></button>`).join('')
 :'<span class="status">⭐ Mémorise une combinaison de filtres.</span>';
}

document.addEventListener('DOMContentLoaded',async()=>{
 $('#btn-reload').onclick=load;
 $('#btn-targets').onclick=openTargets;
 $('#btn-settings').onclick=openSettings;
 $('#q').oninput=e=>{S.f.q=e.target.value;render();};
 $('#f-decade').onchange=e=>{S.f.decade=e.target.value;S.f.year='all';refreshFilters();render();};
 $('#f-year').onchange=e=>{S.f.year=e.target.value;render();};
 $('#f-state').onchange=e=>{S.f.state=e.target.value;render();};
 $('#f-sort').onchange=e=>{S.f.sort=e.target.value;render();};
 $('#f-view').onchange=e=>{S.f.view=e.target.value;render();};
 $('#f-names').onchange=e=>{S.f.names=e.target.value;render();};
 $('#f-batch').onchange=e=>{S.f.batch=+e.target.value;S.plan.forEach(t=>{if(!t.state||t.state==='idle')t.max=S.f.batch;});renderPlan();renderOrch();render();};
 $('#btn-reset').onclick=()=>{S.f={...S.f,q:'',decade:'all',year:'all',state:'all',sort:'prio'};
  $('#q').value='';$('#f-decade').value='all';refreshFilters();$('#f-state').value='all';$('#f-sort').value='prio';render();};
 $('#btn-view-save').onclick=()=>{const n=prompt('Nom de la vue :','Ma vue');if(!n)return;
  S.views.push({id:'v'+Date.now(),name:n.slice(0,32),f:{...S.f}});localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();toast('Vue enregistrée.','ok');};
 $('#o-strategy').onchange=e=>{S.orch.strategy=e.target.value;persistOrch();renderOrch();};
 $('#o-delay').onchange=e=>{S.orch.delay=+e.target.value;persistOrch();};
 $('#o-cap').onchange=e=>{S.orch.cap=+e.target.value;persistOrch();};
 $('#o-mode').onchange=e=>{S.orch.mode=e.target.value;persistOrch();};
 $('#btn-launch').onclick=launch;
 $('#btn-pause').onclick=pause;
 $('#btn-stop').onclick=stop;
 $('#btn-retry').onclick=()=>{let n=0;S.plan.forEach(t=>{if(['failure','error','cancelled'].includes(t.state)){t.state='idle';t.runId=null;t.url=null;t.sentAt=null;t.endedAt=null;delete t.error;n++;}});
  renderPlan();renderOrch();renderPermAlert();toast(n?`${n} tâche(s) remise(s) en file.`:'Aucun échec à réessayer.',n?'ok':'warn');};
 $('#btn-start').onclick=()=>{const top=(S.cov.frontier||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10);
  if(!top.length)return toast('Aucune cible vierge.','warn');
  const before=S.plan.length;top.forEach(t=>addToPlan(t.program,t.year,true));
  renderPlan();renderOrch();toast(`${S.plan.length-before} démarrage(s) ajouté(s).`,'ok',{label:'Annuler',fn:()=>{S.plan=S.plan.slice(0,before);renderPlan();renderOrch();render();}});};
 $('#btn-fill').onclick=()=>{const top=(S.cov.queue||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10);
  if(!top.length)return toast('Aucun reste connu.','warn');
  const before=S.plan.length;top.forEach(t=>addToPlan(t.program,t.year,true));
  renderPlan();renderOrch();toast(`${S.plan.length-before} complétion(s) ajoutée(s).`,'ok',{label:'Annuler',fn:()=>{S.plan=S.plan.slice(0,before);renderPlan();renderOrch();render();}});};
 $('#btn-plan-clear').onclick=()=>{if(!S.plan.length)return;const b=[...S.plan];S.plan=[];renderPlan();renderOrch();render();renderPermAlert();
  toast('Plan vidé.','warn',{label:'Annuler',fn:()=>{S.plan=b;renderPlan();renderOrch();render();renderPermAlert();}});};
 $('#btn-copy-plan').onclick=()=>{if(!S.plan.length)return toast('Plan vide.','warn');
  copy('Émission\tAnnée\tÉtat\tmax_notices\tRuns\n'+S.plan.map(i=>`${i.program}\t${i.year}\t${i.virgin?'à démarrer':'en cours'}\t${i.max||S.f.batch}\t${taskRuns(i)}`).join('\n'),'Plan copié.');};
 $('#btn-csv').onclick=()=>{if(!S.plan.length)return toast('Plan vide.','warn');
  dl('plan-moisson-ina.csv','program,year,state,max_notices,runs,status\n'+S.plan.map(i=>`"${i.program}",${i.year},${i.virgin?'virgin':'partial'},${i.max||S.f.batch},${taskRuns(i)},${i.state||'idle'}`).join('\n'),'text/csv');toast('CSV téléchargé.','ok');};
 $('#btn-runs-refresh').onclick=async()=>{try{await fetchRuns();syncTasks();renderRuns();renderPlan();kpis();toast('Runs actualisés.','ok');}catch(e){toast(e.message,'err');}};
 $('#runs-mine').onchange=renderRuns;
 $('#d-close').onclick=$('#d-close2').onclick=$('#scrim').onclick=closeDetail;
 $('#d-add').onclick=()=>{if(S.detail){addToPlan(S.detail.program,S.detail.year);closeDetail();}};
 $('#d-copy').onclick=()=>{const d=S.detail;if(!d)return;
  copy(`mode: ${S.orch.mode}\nprogram: ${d.program}\nyear: ${d.year}\nmax_notices: ${Math.min(d.remaining,S.f.batch)||S.f.batch}`,'Paramètres copiés.');};
 $('#d-run').onclick=async()=>{const d=S.detail;if(!d)return;
  addToPlan(d.program,d.year,true);
  const t=S.plan.find(x=>x.program===d.program&&x.year===d.year);closeDetail();
  if(!t)return;
  if(!live()&&!confirm('Pas de token : run SIMULÉ. Continuer ?'))return;
  t.state='queued';renderPlan();
  try{await dispatchTask(t);toast(`${t.program} ${t.year} déclenché.`,'ok');}
  catch(e){t.state='error';t.error=e.message;toast(e.message,'err');}
  persistPlan();renderPlan();renderOrch();renderRuns();renderPermAlert();};
 $('#t-close').onclick=$('#t-close2').onclick=$('#tscrim').onclick=closeTargets;
 $('#t-add').onclick=()=>{const n=$('#t-new').value.trim();if(!n)return toast('Titre requis.','err');
  if(S.targets.some(t=>t.slug===slugify(n)))return toast('Déjà au registre.','warn');
  const a=+$('#t-from').value||1987,b=+$('#t-to').value||1997;
  S.targets.unshift({program:n,slug:slugify(n),channel:'',from:Math.min(a,b),to:Math.max(a,b),priority:1});
  $('#t-new').value='';targetsChanged();toast(`${n} ajoutée.`,'ok');};
 $('#t-new').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#t-add').click();}};
 $('#t-export').onclick=()=>{dl('targets.json',JSON.stringify({version:1,updated_at:new Date().toISOString(),note:"Registre des cibles de moisson INA.",programs:S.targets},null,2),'application/json');
  toast('targets.json téléchargé — place-le dans data/ina/.','ok');};
 $('#t-file').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;
  try{const j=JSON.parse(await f.text());if(!Array.isArray(j.programs))throw 0;
   S.targets=j.programs.map(t=>({program:t.program,slug:t.slug||slugify(t.program),channel:t.channel||'',from:+t.from||1970,to:+t.to||1999,priority:+t.priority||9}));
   targetsChanged();toast(`${S.targets.length} cibles importées.`,'ok');}catch(x){toast('Fichier invalide.','err');}
  e.target.value='';};
 $('#t-body').addEventListener('input',e=>{const f=e.target.dataset.tf;if(!f)return;
  const t=S.targets[+e.target.dataset.i];if(!t)return;
  if(f==='program'){t.program=e.target.value;t.slug=slugify(e.target.value);}else t[f]=+e.target.value||t[f];
  persistTargets();rebuild();refreshFilters();render();});
 $('#s-close').onclick=$('#s-close2').onclick=$('#sscrim').onclick=closeSettings;
 $('#s-save').onclick=saveSettings;$('#s-test').onclick=testSettings;
 $('#diag-run').onclick=runDiag;$('#diag-write').onclick=diagWrite;
 $('#s-token').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveSettings();}};
 $('#s-clear').onclick=()=>{S.cfg.token='';localStorage.setItem(CFG,JSON.stringify(S.cfg));$('#s-token').value='';S.wfId=null;refreshChrome();toast('Token effacé.','warn');};
 document.addEventListener('mouseover',e=>{const t=e.target.closest('[data-tip]');if(t)showTip(t,t.dataset.tip);});
 document.addEventListener('mouseout',e=>{if(e.target.closest('[data-tip]'))hideTip();});
 document.addEventListener('click',async e=>{
  const vd=e.target.closest('[data-vd]');if(vd){S.views=S.views.filter(v=>v.id!==vd.dataset.vd);localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();return;}
  const vw=e.target.closest('[data-v]');if(vw){const v=S.views.find(x=>x.id===vw.dataset.v);if(!v)return;S.f={...v.f};
   $('#q').value=S.f.q;$('#f-decade').value=S.f.decade;refreshFilters();$('#f-year').value=S.f.year;$('#f-state').value=S.f.state;
   $('#f-sort').value=S.f.sort;$('#f-view').value=S.f.view;$('#f-batch').value=S.f.batch;$('#f-names').value=S.f.names;renderPlan();renderOrch();render();return;}
  const td=e.target.closest('[data-tdel]');if(td){const i=+td.dataset.tdel,rm=S.targets[i];S.targets.splice(i,1);targetsChanged();
   toast(`${rm.program} retirée.`,'warn',{label:'Annuler',fn:()=>{S.targets.splice(i,0,rm);targetsChanged();}});return;}
  const rc=e.target.closest('[data-runcancel]');if(rc){const id=rc.dataset.runcancel;
   if(!confirm('Annuler ce run GitHub ?'))return;
   try{await gh(`/actions/runs/${id}/cancel`,{method:'POST'});toast('Annulation demandée.','warn');await pollOnce();}
   catch(x){toast(x.message,'err');}return;}
  const cn=e.target.closest('[data-cancel]');if(cn){const t=S.plan[+cn.dataset.cancel];
   if(!t?.runId)return;if(!confirm(`Annuler le run de ${t.program} ${t.year} ?`))return;
   try{await gh(`/actions/runs/${t.runId}/cancel`,{method:'POST'});toast('Annulation demandée.','warn');await pollOnce();}
   catch(x){toast(x.message,'err');}return;}
  const ce=e.target.closest('[data-copyerr]');if(ce){const t=S.plan[+ce.dataset.copyerr];if(t?.error)copy(t.error,'Erreur copiée.');return;}
  const rl=e.target.closest('[data-relaunch]');if(rl){const t=S.plan[+rl.dataset.relaunch];if(!t)return;
   t.state='idle';t.runId=null;t.url=null;t.sentAt=null;t.endedAt=null;delete t.error;renderPlan();renderOrch();renderPermAlert();
   toast(`${t.program} ${t.year} remis en file.`,'ok');return;}
  const rm=e.target.closest('[data-rm]');if(rm){const k=+rm.dataset.rm,it=S.plan[k];S.plan.splice(k,1);renderPlan();renderOrch();render();renderPermAlert();
   toast('Retiré du plan.','warn',{label:'Annuler',fn:()=>{S.plan.splice(k,0,it);renderPlan();renderOrch();render();renderPermAlert();}});return;}
  const cp=e.target.closest('[data-copy]');if(cp){const i=S.plan[+cp.dataset.copy];
   copy(`mode: ${S.orch.mode}\nprogram: ${i.program}\nyear: ${i.year}\nmax_notices: ${i.max||S.f.batch}`,'Paramètres copiés.');return;}
  const c=e.target.closest('[data-cell]');if(c){const[p,y]=c.dataset.cell.split('|');
   if(e.shiftKey)addToPlan(p,+y);else openDetail(p,+y);return;}
 });
 let kind=null,from=null;
 document.addEventListener('dragstart',e=>{
  const p=e.target.closest('[data-pi]'),t=e.target.closest('[data-ti]');
  if(p){kind='plan';from=+p.dataset.pi;p.classList.add('drag');}
  else if(t){kind='tgt';from=+t.dataset.ti;t.classList.add('drag');}else return;
  e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',String(from));}catch(x){}});
 document.addEventListener('dragend',()=>{$$('.pitem,.trow').forEach(x=>x.classList.remove('drag','over'));kind=null;from=null;});
 document.addEventListener('dragover',e=>{if(kind===null)return;
  const el=e.target.closest(kind==='plan'?'[data-pi]':'[data-ti]');if(!el)return;
  e.preventDefault();$$(kind==='plan'?'.pitem':'.trow').forEach(x=>x.classList.remove('over'));el.classList.add('over');});
 document.addEventListener('drop',e=>{if(kind===null)return;
  const el=e.target.closest(kind==='plan'?'[data-pi]':'[data-ti]');if(!el)return;e.preventDefault();
  const to=+(kind==='plan'?el.dataset.pi:el.dataset.ti),arr=kind==='plan'?S.plan:S.targets;
  const [x]=arr.splice(from,1);arr.splice(to,0,x);
  if(kind==='plan'){renderPlan();renderOrch();}else{S.targets.forEach((t,i)=>t.priority=i+1);targetsChanged();}
  kind=null;from=null;});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#sdrawer').hidden)closeSettings();else if(!$('#tdrawer').hidden)closeTargets();else closeDetail();hideTip();}
  if(e.key==='/'&&!/input|select|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus();}});
 window.addEventListener('beforeunload',e=>{if(S.orch.running&&S.orch.strategy==='serial'){e.preventDefault();e.returnValue='';}});
 await load();
 if(!live())setTimeout(openSettings,400);
});