/* =====================================================
   INA · RÉGIE DE MOISSON
   Une année sans notice indexée = JAMAIS INDEXÉE (virgin),
   jamais « complète ». Le ✓ ne peut apparaître que si
   indexed > 0 et remaining = 0.
   ===================================================== */
const CFG='tvretroEditCfg',VIEWS='inaBoardViews',PLAN='inaBoardPlan',HIST='inaBoardHistory',TGT='inaBoardTargets',ORCH='inaBoardOrch',SND='inaBoardSound';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const nf=n=>Number(n||0).toLocaleString('fr-FR');
const slugify=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'programme';
const nrm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const uid=()=>Math.random().toString(36).slice(2,10);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const KEYS=['indexed','cached','current','outdated','with_elements','empty','remaining','elements','days'];
const blank=y=>({year:y,...Object.fromEntries(KEYS.map(k=>[k,0])),coverage:0,sample:[],virgin:true,estimate:0});
const fmtDur=s=>{s=Math.max(0,Math.round(s));const m=Math.floor(s/60);return m?`${m} min ${String(s%60).padStart(2,'0')} s`:`${s} s`;};
const fmtDate=t=>{if(!t)return'';const d=new Date(t);return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});};
const unb64=s=>{const bin=atob(String(s).replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));};
const LIVE=['idle','queued','dispatched','running'],DONE=['success','failure','error','cancelled','skipped'];
const st=t=>t.state||'idle';
const isLive=t=>LIVE.includes(st(t));
const isDone=t=>DONE.includes(st(t));
/* règle unique : aucune notice indexée => jamais indexé */
const virginOf=e=>!e||!(Number(e.indexed)>0);
const volumeOf=e=>virginOf(e)?(Number(e.estimate)||0):Math.max(0,Number(e.remaining)||0);

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
 plan:JSON.parse(localStorage.getItem(PLAN)||'[]'),history:JSON.parse(localStorage.getItem(HIST)||'[]'),
 sel:new Set(),planFilter:'active',views:JSON.parse(localStorage.getItem(VIEWS)||'[]'),
 orch:{running:false,paused:false,strategy:'serial',delay:2000,cap:25,mode:'all',autoArchive:false,startedAt:0,sent:0,
   ...JSON.parse(localStorage.getItem(ORCH)||'{}'),running:false,paused:false},
 sound:localStorage.getItem(SND)!=='off',
 detail:null,pollTimer:null,loopToken:0,diag:[]};
S.plan.forEach(t=>{t.id=t.id||uid();});

/* ---------- son ---------- */
let AC=null;
function blip(kind){
 if(!S.sound)return;
 try{
  AC=AC||new (window.AudioContext||window.webkitAudioContext)();
  if(AC.state==='suspended')AC.resume();
  const seq=kind==='ok'?[[660,0],[990,.09]]:kind==='ko'?[[220,0],[165,.11]]:[[520,0]];
  seq.forEach(([f,d])=>{
   const o=AC.createOscillator(),g=AC.createGain(),t0=AC.currentTime+d;
   o.type=kind==='ko'?'sawtooth':'sine';o.frequency.value=f;
   g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(kind==='ko'?.05:.045,t0+.012);
   g.gain.exponentialRampToValueAtTime(.0001,t0+.16);
   o.connect(g);g.connect(AC.destination);o.start(t0);o.stop(t0+.18);});
 }catch(e){}
}
function renderSound(){const b=$('#btn-sound');b.textContent=S.sound?'🔔':'🔕';b.classList.toggle('off',!S.sound);
 b.title=S.sound?'Signal sonore activé — cliquer pour couper':'Signal sonore coupé — cliquer pour activer';}

/* ---------- UI ---------- */
function toast(m,k='',a){const e=document.createElement('div');e.className='toast '+k;e.innerHTML=`<span>${esc(m)}</span>`;
 if(a){const b=document.createElement('button');b.textContent=a.label;b.onclick=()=>{a.fn();e.remove();};e.appendChild(b);}
 $('#toasts').appendChild(e);setTimeout(()=>{e.style.transition='opacity .3s';e.style.opacity='0';setTimeout(()=>e.remove(),320);},a?9000:4200);}
async function copy(t,m){try{await navigator.clipboard.writeText(t);}catch(e){const a=document.createElement('textarea');a.value=t;document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();}toast(m||'Copié.','ok');}
function dl(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);}
function showTip(el,text){const t=$('#tip');t.textContent=text;t.hidden=false;const r=el.getBoundingClientRect();
 const w=t.offsetWidth;let left=Math.min(Math.max(8,r.left),innerWidth-w-8);let top=r.bottom+8;
 if(top+t.offsetHeight>innerHeight-8)top=r.top-t.offsetHeight-8;
 t.style.left=left+'px';t.style.top=Math.max(8,top)+'px';}
function hideTip(){$('#tip').hidden=true;}
function tokenNewUrl(){return `https://github.com/settings/personal-access-tokens/new?name=TV+Retro+Regie&description=Moisson+INA+%2B+editeur&target_name=${encodeURIComponent(S.cfg.owner||'xbodin2g')}&expires_in=366&contents=write&actions=write`;}

/* ---------- GitHub ---------- */
const live=()=>!!(S.cfg.owner&&S.cfg.repo&&S.cfg.token);
const ghH=()=>({Authorization:`Bearer ${String(S.cfg.token).replace(/\s+/g,'')}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});
async function rawGh(path,opts={},cfg=S.cfg){
 let r,txt='';
 try{r=await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`,
  {cache:'no-store',...opts,headers:{...ghH(),...(opts.body?{'Content-Type':'application/json'}:{}),...(opts.headers||{})}});txt=await r.text();}
 catch(e){return {ok:false,status:0,message:'Réseau bloqué : '+e.message,data:null};}
 let msg='';try{const j=txt?JSON.parse(txt):null;if(j&&j.message)msg=j.message;}catch(e){}
 let data=null;try{data=txt?JSON.parse(txt):null;}catch(e){}
 return {ok:r.ok,status:r.status,message:msg,data};
}
function explain(res){
 if(res.ok)return '';
 if(res.status===401)return '401 — token invalide, expiré ou révoqué.';
 if(res.status===403)return `403 — ${res.message||'accès refusé'}. Permission manquante sur le token, ou quota dépassé.`;
 if(res.status===404)return `404 — ${res.message||'introuvable'}. Dépôt, workflow ou fichier absent, ou token sans accès.`;
 if(res.status===422)return `422 — ${res.message||'entrées refusées'}. Vérifie les inputs du workflow et workflow_dispatch sur la branche.`;
 return `HTTP ${res.status}${res.message?' — '+res.message:''}`;
}
async function gh(path,opts={}){const res=await rawGh(path,opts);if(res.status===204)return null;if(!res.ok)throw new Error(explain(res));return res.data;}
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
  url:r.html_url,created:r.created_at,updated:r.updated_at,started:r.run_started_at}));
}
async function dispatchTask(t){
 const inputs={mode:S.orch.mode,program:'Club Dorothée',program_custom:t.program,year:String(t.year),
  max_notices:String(t.max||S.f.batch),retry_empty:'false',refresh_stale:'false',origin:'dashboard'};
 if(!live()){
  t.state='running';t.runId='demo-'+uid();t.sentAt=Date.now();t.demo=true;delete t.error;
  S.mine.add(t.runId);persistMine();blip('tick');
  setTimeout(()=>{if(t.state==='running'){t.state=Math.random()<.88?'success':'failure';t.endedAt=Date.now();
   blip(t.state==='success'?'ok':'ko');afterTaskSettled();}},7000+Math.random()*6000);
  return;
 }
 const id=await resolveWorkflow();
 await gh(`/actions/workflows/${id}/dispatches`,{method:'POST',body:JSON.stringify({ref:S.cfg.branch||'main',inputs})});
 t.state='dispatched';t.sentAt=Date.now();delete t.error;blip('tick');
 await sleep(2600);await fetchRuns();
 const claimed=new Set([...S.plan,...S.history].map(x=>x.runId).filter(Boolean).map(String));
 const cand=S.runs.filter(r=>!claimed.has(String(r.id))&&nrm(r.name).includes(nrm(t.program))&&String(r.name).includes(String(t.year)))
  .sort((a,b)=>new Date(b.created)-new Date(a.created))[0];
 if(cand){t.runId=cand.id;S.mine.add(cand.id);persistMine();t.state=cand.status==='completed'?(cand.conclusion==='success'?'success':'failure'):'running';}
}
function persistMine(){localStorage.setItem('inaMineRuns',JSON.stringify([...S.mine].slice(-400)));}
function syncTasks(){
 const byId=new Map(S.runs.map(r=>[String(r.id),r]));let changed=false;
 S.plan.forEach(t=>{
  if(!t.runId||t.demo)return;
  const r=byId.get(String(t.runId));if(!r)return;
  t.url=r.url;const before=st(t);
  if(r.status==='completed'){t.state=r.conclusion==='success'?'success':r.conclusion==='cancelled'?'cancelled':'failure';t.endedAt=new Date(r.updated).getTime();}
  else t.state=r.status==='queued'?'queued':'running';
  if(before!==st(t)){changed=true;if(isDone(t))blip(t.state==='success'?'ok':'ko');}
 });
 if(changed)afterTaskSettled();
}
function afterTaskSettled(){
 if(S.orch.autoArchive){
  const ok=S.plan.filter(t=>t.state==='success');
  if(ok.length){S.history=[...ok.map(t=>({...t,archivedAt:Date.now()})),...S.history].slice(0,500);
   S.plan=S.plan.filter(t=>t.state!=='success');ok.forEach(t=>S.sel.delete(t.id));persistHistory();}
 }
 persistPlan();renderPlan();renderOrch();renderRuns();render();kpis();
}
function demoRuns(){
 return [...S.plan,...S.history].filter(t=>t.runId).slice(0,40).map(t=>({id:t.runId,
  name:`🏛️ ${t.program} · ${t.year} · ${S.orch.mode}`,
  status:['running','queued','dispatched'].includes(st(t))?'in_progress':'completed',
  conclusion:t.state==='success'?'success':t.state==='failure'?'failure':t.state==='cancelled'?'cancelled':null,
  url:'#',created:new Date(t.sentAt||Date.now()).toISOString(),updated:new Date(t.endedAt||Date.now()).toISOString(),
  started:new Date(t.sentAt||Date.now()).toISOString()}));
}

/* ---------- diagnostic ---------- */
function renderDiag(){
 const b=$('#diag-out');
 if(!S.diag.length){b.innerHTML='<p class="status">Lance le diagnostic pour savoir précisément quelle permission manque.</p>';return;}
 b.innerHTML=S.diag.map(d=>`<div class="drow ${d.state}"><span class="ic">${d.state==='ok'?'✅':d.state==='ko'?'❌':'⏳'}</span>
  <span class="tx"><b>${esc(d.label)}</b><small>${esc(d.detail||'')}</small></span><span class="need">${esc(d.need)}</span></div>`).join('');
}
function diagCfg(){return {...S.cfg,owner:$('#s-owner').value.trim()||S.cfg.owner,repo:$('#s-repo').value.trim()||S.cfg.repo,
 branch:$('#s-branch').value.trim()||'main',workflow:$('#s-workflow').value.trim()||'ina-enrich.yml',token:$('#s-token').value.replace(/\s+/g,'')};}
async function runDiag(){
 const c=diagCfg();
 if(!c.owner||!c.repo||!c.token){toast('Renseigne propriétaire, dépôt et token.','err');return;}
 S.diag=[];renderDiag();
 const step=async(label,need,fn)=>{const row={label,need,state:'wait',detail:'…'};S.diag.push(row);renderDiag();
  try{const r=await fn();row.state=r.ok?'ok':'ko';row.detail=r.detail||explain(r)||'OK';}catch(e){row.state='ko';row.detail=e.message;}
  renderDiag();};
 await step('Lecture du dépôt','Metadata: read',async()=>{const r=await rawGh('',{},c);
  return {...r,detail:r.ok?`${r.data.full_name} · branche ${r.data.default_branch}`:explain(r)};});
 await step('Liste des workflows','Actions: read',async()=>{const r=await rawGh('/actions/workflows?per_page=100',{},c);
  if(r.ok){const file=c.workflow.replace(/^.*\//,'');const wf=(r.data.workflows||[]).find(x=>x.path.endsWith('/'+file));
   if(wf)S.wfId=wf.id;
   return {...r,detail:wf?`${r.data.total_count} workflow(s) · ${file} id ${wf.id}`:`${r.data.total_count} workflow(s) mais ${file} ABSENT`};}
  return {...r,detail:explain(r)};});
 await step('Lecture des runs','Actions: read',async()=>{const r=await rawGh('/actions/runs?per_page=1',{},c);
  return {...r,detail:r.ok?`${r.data.total_count} run(s)`:explain(r)};});
 await step('Fichier workflow à jour','Contents: read',async()=>{
  const r=await rawGh(`/contents/.github/workflows/${c.workflow}?ref=${encodeURIComponent(c.branch)}`,{},c);
  if(!r.ok)return {...r,detail:explain(r)};
  const txt=unb64(r.data.content||'');const miss=['workflow_dispatch','program_custom','origin'].filter(k=>!txt.includes(k));
  return {...r,ok:!miss.length,detail:miss.length?`Champs absents : ${miss.join(', ')} → remplace le fichier workflow`:'workflow_dispatch + program_custom + origin présents'};});
 await step('Lecture de la couverture','Contents: read',async()=>{
  const r=await rawGh(`/contents/data/ina/coverage.json?ref=${encodeURIComponent(c.branch)}`,{},c);
  if(!r.ok)return {...r,detail:explain(r)+' (normal si jamais généré)'};
  let n=0,v=0;try{const j=JSON.parse(unb64(r.data.content||''));
   (j.programs||[]).forEach(p=>(p.years||[]).forEach(e=>{n++;if(!(Number(e.indexed)>0))v++;}));}catch(e){}
  return {...r,detail:`coverage.json lisible · ${n} couple(s) dont ${v} jamais indexé(s)`};});
 const ko=S.diag.filter(d=>d.state==='ko').length;
 toast(ko?`${ko} point(s) bloquant(s) — voir le détail.`:'Lecture OK. Teste maintenant l\'écriture.',ko?'err':'ok');
}
async function diagWrite(){
 const c=diagCfg();
 if(!c.token){toast('Token requis.','err');return;}
 if(!confirm('Le test d\'écriture déclenche UN run réel en mode report-only.\n\nIl régénère le tableau et ne fait AUCUNE requête à l\'INA.\n\nContinuer ?'))return;
 const row={label:'Déclencher un workflow (report-only)',need:'Actions: write',state:'wait',detail:'…'};
 S.diag.push(row);renderDiag();
 try{
  let id=S.wfId;
  if(!id){const j=await gh('/actions/workflows?per_page=100');const file=c.workflow.replace(/^.*\//,'');
   const w=(j?.workflows||[]).find(x=>x.path.endsWith('/'+file));if(!w)throw new Error(`Workflow ${file} introuvable.`);id=w.id;S.wfId=id;}
  const res=await rawGh(`/actions/workflows/${id}/dispatches`,{method:'POST',body:JSON.stringify({ref:c.branch,
   inputs:{mode:'report-only',program:'Club Dorothée',program_custom:'',year:'1989',max_notices:'400',
    retry_empty:'false',refresh_stale:'false',origin:'diagnostic'}})},c);
  row.state=res.ok?'ok':'ko';row.detail=res.ok?'Run déclenché — Actions: write accordée.':explain(res);
  if(res.ok){blip('ok');toast('Écriture OK. Tu peux lancer tes séries.','ok');await sleep(2500);await fetchRuns();renderRuns();}
  else{blip('ko');toast(row.detail,'err');}
 }catch(e){row.state='ko';row.detail=e.message;toast(e.message,'err');}
 renderDiag();renderPermAlert();
}
function renderPermAlert(){
 const errs=[...S.plan,...S.history].filter(t=>t.error&&/403|401/.test(t.error));
 const b=$('#perm-alert');
 if(!errs.length){b.hidden=true;return;}
 b.hidden=false;
 b.innerHTML=`<strong>⛔ ${errs.length} envoi(s) refusé(s) par GitHub</strong>
  <ol><li>Ouvre <a class="mini" href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener">tes tokens</a> et clique sur ton token.</li>
  <li><b>Repository permissions → Actions → Read and write</b>, puis <b>Update token</b>. La valeur ne change pas.</li>
  <li>Reviens ici : <b>🔑 GitHub → ▶ Tester la lecture</b> puis <b>✍ Tester l'écriture</b>.</li>
  <li><b>↻ Réessayer les échecs</b> remet la série en file.</li></ol>
  <div class="row-btns"><button class="btn small" id="perm-diag">🔍 Ouvrir le diagnostic</button>
  <a class="btn small" href="${esc(tokenNewUrl())}" target="_blank" rel="noopener">↗ Nouveau token pré-rempli</a>
  <button class="btn small ghost" id="perm-dismiss">Masquer</button></div>
  <p class="hint">Message GitHub : ${esc(errs[0].error)}</p>`;
 $('#perm-diag').onclick=openSettings;$('#perm-dismiss').onclick=()=>{b.hidden=true;};
}

/* ---------- persistance ---------- */
function persistPlan(){localStorage.setItem(PLAN,JSON.stringify(S.plan));}
function persistHistory(){localStorage.setItem(HIST,JSON.stringify(S.history.slice(0,500)));}
function persistOrch(){const{strategy,delay,cap,mode,autoArchive}=S.orch;localStorage.setItem(ORCH,JSON.stringify({strategy,delay,cap,mode,autoArchive}));}
const pendingTasks=()=>S.plan.filter(t=>st(t)==='idle');
const activeTasks=()=>S.plan.filter(t=>['dispatched','queued','running'].includes(st(t)));
const inPlan=(p,y)=>S.plan.some(t=>t.program===p&&t.year===y&&isLive(t));
const hasDone=(p,y)=>S.plan.some(t=>t.program===p&&t.year===y&&isDone(t))||S.history.some(t=>t.program===p&&t.year===y);

/* ---------- orchestration ---------- */
async function launch(){
 if(S.orch.running)return;
 const todo=pendingTasks();
 if(!todo.length)return toast('Aucune tâche à lancer. Ajoute des cibles, ou archive les terminées.','warn');
 const n=Math.min(todo.length,S.orch.cap);
 if(!live()){if(!confirm(`Pas de token GitHub : la série sera SIMULÉE (${n} tâche(s)).\n\nAucun run réel. Continuer ?`))return;}
 else if(n>3&&!confirm(`Lancer ${n} run(s) GitHub réels ?\n\nEnchaînement : ${S.orch.strategy==='serial'?'séquentiel':'rafale espacée'}.\nGarde cet onglet ouvert${S.orch.strategy==='serial'?' pour enchaîner automatiquement':''}.`))return;
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
   catch(e){t.state='error';t.error=e.message;blip('ko');toast(`${t.program} ${t.year} — ${e.message}`,'err');
    if(/403|401/.test(e.message)){renderPermAlert();S.orch.running=false;persistPlan();renderPlan();renderOrch();
     toast('Série interrompue : corrige la permission du token puis réessaie.','err');break;}}
   persistPlan();renderPlan();renderOrch();renderRuns();renderPermAlert();
   if(S.orch.strategy==='burst')await sleep(S.orch.delay);
  }
  if(S.orch.strategy==='serial'&&S.orch.running){
   while(activeTasks().length&&token===S.loopToken&&S.orch.running){await sleep(4000);await pollOnce();}
  }
 }finally{
  if(token===S.loopToken){
   const was=S.orch.running;S.orch.running=false;S.orch.paused=false;renderOrch();renderPlan();
   if(was){
    const ok=S.plan.filter(t=>t.state==='success').length+S.history.filter(t=>t.state==='success'&&t.sentAt>=S.orch.startedAt).length;
    const ko=S.plan.filter(t=>['failure','error'].includes(st(t))).length;
    toast(`Série terminée — ${ok} réussite(s), ${ko} échec(s). Couverture actualisée.`,'ok',
      {label:'🧹 Archiver terminées',fn:archiveDone});
    await refreshCoverage(true);
   }
  }
 }
}
function pause(){S.orch.paused=!S.orch.paused;renderOrch();toast(S.orch.paused?'Enchaînement en pause.':'Reprise.','warn');}
function stop(){S.orch.running=false;S.orch.paused=false;S.loopToken++;
 S.plan.forEach(t=>{if(st(t)==='queued')t.state='idle';});
 persistPlan();renderOrch();renderPlan();toast('Enchaînement arrêté. Les runs déjà partis continuent sur GitHub.','warn');}
async function pollOnce(){try{await fetchRuns();syncTasks();persistPlan();}catch(e){}
 renderPlan();renderRuns();renderOrch();kpis();}
function startPolling(){if(S.pollTimer)clearInterval(S.pollTimer);
 S.pollTimer=setInterval(()=>{if(activeTasks().length||S.orch.running||!live())pollOnce();else if(!S.runs.length)pollOnce();},12000);}

/* ---------- file : sélection / archivage ---------- */
function visibleTasks(){return S.plan.map((t,i)=>({t,i})).filter(({t})=>S.planFilter==='all'?true:S.planFilter==='done'?isDone(t):isLive(t));}
function archiveTasks(list,label){
 if(!list.length){toast('Rien à archiver.','warn');return;}
 const bp=[...S.plan],bh=[...S.history],ids=new Set(list.map(t=>t.id));
 S.history=[...list.map(t=>({...t,archivedAt:Date.now()})),...S.history].slice(0,500);
 S.plan=S.plan.filter(t=>!ids.has(t.id));ids.forEach(id=>S.sel.delete(id));
 persistPlan();persistHistory();renderAll();
 toast(`${list.length} tâche(s) archivée(s) — ${label}.`,'ok',
  {label:'Annuler',fn:()=>{S.plan=bp;S.history=bh;persistPlan();persistHistory();renderAll();}});
}
function archiveDone(){archiveTasks(S.plan.filter(isDone),'les slots sont libérés');}
function newSeries(){
 if(!S.plan.length&&!S.history.length){toast('La file est déjà vide.','warn');return;}
 if(S.orch.running){toast('Arrête la série en cours d\'abord.','warn');return;}
 const bp=[...S.plan],bh=[...S.history];
 if(S.plan.length)S.history=[...S.plan.map(t=>({...t,archivedAt:Date.now()})),...S.history].slice(0,500);
 S.plan=[];S.sel.clear();S.planFilter='active';
 persistPlan();persistHistory();renderAll();refreshCoverage(true);
 toast('Nouvelle série prête — file vidée, couverture actualisée.','ok',
  {label:'Annuler',fn:()=>{S.plan=bp;S.history=bh;persistPlan();persistHistory();renderAll();}});
}
function removeSelected(){
 const ids=new Set(S.sel);if(!ids.size)return;
 const bp=[...S.plan],n=S.plan.filter(t=>ids.has(t.id)).length;
 S.plan=S.plan.filter(t=>!ids.has(t.id));S.sel.clear();persistPlan();renderAll();
 toast(`${n} tâche(s) retirée(s).`,'warn',{label:'Annuler',fn:()=>{S.plan=bp;persistPlan();renderAll();}});
}
function requeueTasks(list){
 let n=0;list.forEach(t=>{t.state='idle';t.runId=null;t.url=null;t.sentAt=null;t.endedAt=null;delete t.error;delete t.demo;n++;});
 syncTaskVolumes();persistPlan();renderAll();
 toast(n?`${n} tâche(s) remise(s) en file.`:'Rien à remettre.',n?'ok':'warn');
}
function restoreFromHistory(id){
 const h=S.history.find(t=>t.id===id);if(!h)return;
 if(inPlan(h.program,h.year)){toast('Déjà dans la file active.','warn');return;}
 S.history=S.history.filter(t=>t.id!==id);
 S.plan.push({...h,id:uid(),state:'idle',runId:null,url:null,sentAt:null,endedAt:null,error:undefined,demo:undefined});
 syncTaskVolumes();persistPlan();persistHistory();renderAll();
 toast(`${h.program} ${h.year} restaurée dans la file.`,'ok');
}

/* ---------- couverture ---------- */
function seedReport(){
 const programs=DEFAULT_TARGETS.slice(0,12).map((t,i)=>{
  const years=[];
  for(let y=t.from;y<=Math.min(t.to,t.from+4+i%3);y++){
   const indexed=60+((i*37+y*13)%460);
   const cached=Math.min(indexed,Math.round(indexed*(((i*7+y)%11)/10)));
   const outdated=(i+y)%4===0?Math.round(cached*.3):0;
   const withE=Math.round(cached*(.45+((i+y)%5)/12));
   years.push({year:y,indexed,cached,current:cached-outdated,outdated,with_elements:withE,empty:cached-withE,
    remaining:indexed-cached,elements:withE*(3+i%4),days:Math.round(withE*.7),
    coverage:+(100*cached/indexed).toFixed(1),sample:Array.from({length:Math.min(5,indexed-cached)},(_,k)=>`TV_${100000+i*9000+y+k}.001`)});}
  return {program:t.program,slug:t.slug,years,harvested_at:new Date().toISOString()};});
 return {generated_at:new Date().toISOString(),parser_version:5,programs,orphans:[],health:{advice:[]}};
}
function ingestReport(){
 S.raw={};
 (S.report.programs||[]).forEach(p=>{
  const slug=p.slug||slugify(p.program),years={};
  (p.years||[]).forEach(e=>{
   const indexed=Number(e.indexed)||0,cached=Number(e.cached??e.downloaded)||0;
   years[e.year]={...e,indexed,cached,current:Number(e.current??cached)||0,outdated:Number(e.outdated)||0,
    remaining:Number(e.remaining)||0,estimate:Number(e.estimate)||0,
    coverage:indexed?+(100*cached/indexed).toFixed(1):0,virgin:indexed===0,
    sample:Array.isArray(e.sample)?e.sample:[]};});
  S.raw[slug]={program:p.program,years,harvested_at:p.harvested_at||''};
  if(!S.targets.some(t=>t.slug===slug)){
   const ys=Object.keys(years).map(Number).filter(y=>years[y].indexed>0);
   S.targets.push({program:p.program,slug,channel:'',from:ys.length?Math.min(...ys):1970,to:ys.length?Math.max(...ys):1999,priority:9});}});
}
function makeCell(r,y,avg){
 if(virginOf(r)){
  const est=Number(r?.estimate)||avg||S.globalAvg||150;
  return {...blank(y),...(r||{}),year:y,indexed:0,cached:0,current:0,outdated:0,with_elements:0,empty:0,
   remaining:0,elements:Number(r?.elements)||0,days:Number(r?.days)||0,coverage:0,
   sample:Array.isArray(r?.sample)?r.sample:[],virgin:true,estimate:est};
 }
 return {...r,year:y,virgin:false,estimate:0,coverage:Number(r.indexed)?+(100*(Number(r.cached)||0)/Number(r.indexed)).toFixed(1):0,
  sample:Array.isArray(r.sample)?r.sample:[]};
}
function rebuild(){
 const known=[];Object.values(S.raw).forEach(r=>Object.values(r.years).forEach(e=>{if(Number(e.indexed)>0)known.push(Number(e.indexed));}));
 S.globalAvg=known.length?Math.round(known.reduce((a,b)=>a+b,0)/known.length):150;
 const programs=[],used=new Set();
 S.targets.forEach(t=>{
  const slug=t.slug||slugify(t.program);used.add(slug);
  const raw=S.raw[slug]||{program:t.program,years:{}};
  const ky=Object.values(raw.years).filter(e=>Number(e.indexed)>0).map(e=>Number(e.indexed));
  const avg=ky.length?Math.round(ky.reduce((a,b)=>a+b,0)/ky.length):S.globalAvg;
  const from=Math.min(t.from,t.to),to=Math.max(t.from,t.to),years=[];
  for(let y=from;y<=to;y++)years.push(makeCell(raw.years[y],y,avg));
  Object.values(raw.years).forEach(r=>{if(r.year<from||r.year>to)years.push(makeCell(r,r.year,avg));});
  years.sort((a,b)=>a.year-b.year);
  const totals=Object.fromEntries(KEYS.map(k=>[k,years.reduce((s,e)=>s+(Number(e[k])||0),0)]));
  totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
  totals.virgin=years.filter(e=>e.virgin).length;
  totals.estimate=years.reduce((s,e)=>s+(Number(e.estimate)||0),0);
  programs.push({program:t.program,slug,channel:t.channel||'',priority:t.priority||9,from,to,harvested_at:raw.harvested_at||'',years,totals});});
 Object.entries(S.raw).forEach(([slug,raw])=>{
  if(used.has(slug))return;
  const years=Object.values(raw.years).sort((a,b)=>a.year-b.year).map(r=>makeCell(r,r.year,S.globalAvg));
  const totals=Object.fromEntries(KEYS.map(k=>[k,years.reduce((s,e)=>s+(Number(e[k])||0),0)]));
  totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
  totals.virgin=years.filter(e=>e.virgin).length;totals.estimate=years.reduce((s,e)=>s+(Number(e.estimate)||0),0);
  programs.push({program:raw.program,slug,channel:'',priority:9,from:null,to:null,years,totals});});
 const totals=Object.fromEntries(KEYS.map(k=>[k,programs.reduce((s,p)=>s+p.totals[k],0)]));
 totals.coverage=totals.indexed?+(100*totals.cached/totals.indexed).toFixed(1):0;
 totals.virgin=programs.reduce((s,p)=>s+p.totals.virgin,0);
 totals.estimate=programs.reduce((s,p)=>s+p.totals.estimate,0);
 const queue=programs.flatMap(p=>p.years.filter(e=>!e.virgin&&e.remaining>0).map(e=>({program:p.program,year:e.year,remaining:e.remaining,virgin:false}))).sort((a,b)=>b.remaining-a.remaining);
 const frontier=programs.flatMap(p=>p.years.filter(e=>e.virgin).map(e=>({program:p.program,year:e.year,remaining:e.estimate||S.globalAvg,virgin:true,priority:p.priority}))).sort((a,b)=>a.priority-b.priority||a.year-b.year);
 const advice=[...(S.report?.health?.advice||[])];
 if(totals.virgin)advice.push(`${nf(totals.virgin)} cible(s) jamais indexée(s) — volume estimé ${nf(totals.estimate)} notices. Elles sont planifiables : le premier run indexe puis moissonne.`);
 if(totals.outdated)advice.push(`${nf(totals.outdated)} notice(s) d'ancienne version : déjà en cache, re-normalisation locale automatique.`);
 S.cov={generated_at:S.report?.generated_at,parser_version:S.report?.parser_version||5,programs,totals,queue,frontier,orphans:S.report?.orphans||[],health:{advice}};
}
function cellOf(program,year){return S.cov?.programs.find(p=>p.program===program)?.years.find(e=>e.year===year)||null;}
function syncTaskVolumes(){
 S.plan.forEach(t=>{
  if(st(t)!=='idle')return;
  const e=cellOf(t.program,t.year);if(!e)return;
  t.virgin=!!e.virgin;t.remaining=volumeOf(e)||S.globalAvg;
 });
 persistPlan();
}
async function refreshCoverage(silent){
 let rep=null;
 if(live()){
  const r=await rawGh(`/contents/data/ina/coverage.json?ref=${encodeURIComponent(S.cfg.branch||'main')}&t=${Date.now()}`);
  if(r.ok&&r.data?.content){try{rep=JSON.parse(unb64(r.data.content));}catch(e){}}
 }
 if(!rep&&location.protocol!=='file:'){
  try{const r=await fetch('../data/ina/coverage.json?t='+Date.now(),{cache:'no-store'});if(r.ok)rep=await r.json();}catch(e){}
 }
 if(!rep){if(!silent)toast('Couverture introuvable — lance le workflow en mode report-only.','warn');return false;}
 S.report=rep;S.src='live';ingestReport();rebuild();syncTaskVolumes();
 refreshChrome();refreshFilters();renderHealth();renderOrph();renderAll();
 if(!silent)toast('Couverture actualisée.','ok');
 return true;
}
async function load(){
 $('#status').textContent='⏳ Chargement…';
 let rep=null,tgt=null;
 if(location.protocol!=='file:'){
  try{const r=await fetch('../data/ina/coverage.json?t='+Date.now(),{cache:'no-store'});if(r.ok)rep=await r.json();}catch(e){}
  try{const r=await fetch('../data/ina/targets.json?t='+Date.now(),{cache:'no-store'});if(r.ok)tgt=await r.json();}catch(e){}
 }
 S.src=rep?'live':'demo';S.report=rep||seedReport();
 const localT=JSON.parse(localStorage.getItem(TGT)||'null');
 S.targets=(localT&&localT.programs)||(tgt&&tgt.programs)||DEFAULT_TARGETS.map(t=>({...t}));
 S.targets.forEach(t=>{t.slug=t.slug||slugify(t.program);t.from=+t.from||1970;t.to=+t.to||1999;t.priority=+t.priority||9;});
 ingestReport();rebuild();syncTaskVolumes();
 refreshChrome();refreshFilters();renderHealth();renderViews();renderOrph();renderAll();renderPermAlert();renderDiag();renderSound();
 try{await fetchRuns();syncTasks();}catch(e){}
 renderRuns();renderPlan();kpis();startPolling();
}
function renderAll(){renderPlan();renderOrch();render();kpis();renderHistory();}
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
  :S.f.sort==='left'?volumeOf(b)-volumeOf(a)||a.program.localeCompare(b.program,'fr')
  :a.priority-b.priority||a.program.localeCompare(b.program,'fr')||a.year-b.year);
 return out;
}
function kpis(){
 const c=cells(),t=c.reduce((a,e)=>{KEYS.forEach(k=>a[k]+=Number(e[k])||0);a.virgin+=e.virgin?1:0;a.est+=volumeOf(e);return a;},
  {virgin:0,est:0,...Object.fromEntries(KEYS.map(k=>[k,0]))});
 $('#k-virgin').textContent=nf(t.virgin);$('#k-indexed').textContent=nf(t.indexed);
 $('#k-cached').textContent=nf(t.cached);$('#k-works').textContent=nf(t.with_elements);
 $('#k-left').textContent=nf(t.remaining);$('#k-elements').textContent=nf(t.elements);
 $('#k-runs').textContent=nf(Math.ceil(t.est/S.f.batch));
 const act=activeTasks().length;$('#k-active').textContent=nf(act);
 $('#rec').className='rec'+(act||S.orch.running?' busy':'');
}
const cls=c=>c>=99.5?'c4':c>=75?'c3':c>=40?'c2':c>0?'c1':'c0';
function cellTitle(program,e){
 if(e.virgin)return `${program} ${e.year} — JAMAIS INDEXÉ · volume estimé ≈ ${nf(e.estimate)} notices · planifiable`;
 return `${program} ${e.year} — ${nf(e.cached)}/${nf(e.indexed)} en cache (${e.coverage} %) · reste ${nf(e.remaining)}${e.remaining?'':' · COMPLET'}`;
}
function render(){
 kpis();const c=cells(),board=$('#board');
 board.classList.toggle('full-names',S.f.names==='full');
 $('#status').textContent=`${nf(c.length)} cible(s) · ${nf(new Set(c.map(x=>x.program)).size)} émission(s) · ${nf(c.filter(x=>x.virgin).length)} jamais indexée(s) · ${nf(c.filter(x=>!x.virgin&&!x.remaining).length)} complète(s)`;
 if(!c.length){board.innerHTML='<div class="empty"><b>Aucune cible ne correspond</b>Élargis les filtres, ou ajoute une émission via 🎯 Cibles.</div>';return;}
 if(S.f.view==='list'){
  board.innerHTML='<div class="rows">'+c.slice(0,700).map(e=>`<div class="row${e.virgin?' v':''}" data-cell="${esc(e.program)}|${e.year}"><div class="nm"><b>${esc(e.program)}</b><small>${e.year}${e.channel?' · '+esc(e.channel):''} · ${e.virgin?`jamais indexé — ≈ ${nf(e.estimate)} notices`:`${nf(e.cached)}/${nf(e.indexed)} en cache · ${nf(e.with_elements)} œuvrées`}</small></div><div class="track"><i style="width:${e.virgin?0:e.coverage}%"></i></div><div class="num ${e.virgin?'vg':e.remaining?'left':'ok'}">${e.virgin?'?':e.remaining?'−'+nf(e.remaining):'✓'}</div></div>`).join('')+'</div>';
  return;}
 const progs=[...new Set(c.map(x=>x.program))],years=[...new Set(c.map(x=>x.year))].sort((a,b)=>a-b);
 const map=new Map(c.map(e=>[e.program+'|'+e.year,e])),meta=new Map(S.cov.programs.map(p=>[p.program,p]));
 board.innerHTML=`<table><thead><tr><th class="col-name">Émission</th>${years.map(y=>`<th>${y}</th>`).join('')}<th>Reste</th></tr></thead><tbody>${
  progs.map(p=>{const m=meta.get(p);const tot=c.filter(x=>x.program===p&&!x.virgin).reduce((s,x)=>s+x.remaining,0);
   const vg=c.filter(x=>x.program===p&&x.virgin).length;
   const sub=`${m?.channel?m.channel+' · ':''}${vg?vg+' à démarrer':'tout indexé'}`;
   return `<tr><th class="col-name"><span class="nm-line" data-tip="${esc(p)}">${esc(p)}</span><span class="nm-sub">${esc(sub)}</span></th>${years.map(y=>{const e=map.get(p+'|'+y);
    if(!e)return '<td><span class="cell na">·</span></td>';
    const done=hasDone(p,y)?' hasdone':'',pick=inPlan(p,y)?' picked':'';
    if(e.virgin)return `<td><span class="cell virgin${done}${pick}" data-cell="${esc(p)}|${y}" title="${esc(cellTitle(p,e))}">?</span></td>`;
    return `<td><span class="cell ${cls(e.coverage)}${done}${pick}${e.outdated?' old':''}" data-cell="${esc(p)}|${y}" title="${esc(cellTitle(p,e))}">${e.remaining?nf(e.remaining):'✓'}</span></td>`;}).join('')}<td class="num ${tot?'left':'ok'}">${tot?nf(tot):'✓'}</td></tr>`;}).join('')
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

/* ---------- file ---------- */
const LBL={idle:'à lancer',queued:'envoi',dispatched:'envoyé',running:'en cours',success:'réussi',failure:'échec',error:'erreur',cancelled:'annulé',skipped:'ignoré'};
function taskRuns(t){const b=t.max||S.f.batch;return Math.max(1,Math.ceil((t.remaining||b)/b));}
function renderPlan(){
 const nLive=S.plan.filter(isLive).length,nDone=S.plan.filter(isDone).length;
 $('#plan-count').textContent=nLive;
 $('#pf-active').textContent=nLive;$('#pf-done').textContent=nDone;$('#pf-all').textContent=S.plan.length;
 $$('.pft').forEach(b=>b.classList.toggle('active',b.dataset.pf===S.planFilter));
 const vis=visibleTasks(),b=$('#plan-body');
 $('#plan-bulk').hidden=S.sel.size===0;$('#bulk-count').textContent=S.sel.size;
 $('#bulk-all').checked=vis.length>0&&vis.every(({t})=>S.sel.has(t.id));
 $('#btn-archive').disabled=!nDone;
 if(!S.plan.length){
  b.innerHTML=`<div class="empty"><b>File vide — prête pour une nouvelle série</b>
   ⇧clic une case de la matrice, ou les boutons 🌱 Démarrer / ⚡ Compléter.
   ${S.history.length?`<br><button class="btn small" id="empty-hist">🗄 Voir l'historique (${S.history.length})</button>`:''}</div>`;
  const eh=$('#empty-hist');if(eh)eh.onclick=openHistory;persistPlan();return;}
 if(!vis.length){
  b.innerHTML=`<div class="empty"><b>Aucune tâche dans ce filtre</b>
   ${nDone?`${nDone} tâche(s) terminée(s) attendent d'être archivées.<br><button class="btn small primary" id="empty-arch">🧹 Archiver les terminées</button>`:'Change de filtre ci-dessus.'}</div>`;
  const ea=$('#empty-arch');if(ea)ea.onclick=archiveDone;persistPlan();return;}
 b.innerHTML=vis.map(({t,i})=>{
  const s=st(t),dur=t.sentAt?fmtDur(((t.endedAt||Date.now())-t.sentAt)/1000):'';
  return `<div class="pitem st-${s}${S.sel.has(t.id)?' sel':''}" draggable="true" data-pi="${i}">
   <span class="grip">⠿</span><input class="pick" type="checkbox" data-sel-task="${esc(t.id)}" ${S.sel.has(t.id)?'checked':''} aria-label="Sélectionner">
   <b title="${esc(t.program)} · ${t.year}">${esc(t.program)} · ${t.year}</b>
   ${t.virgin?'<span class="badge v">à démarrer</span>':''}
   <span class="badge ${s}">${LBL[s]||s}</span>
   <code>${t.virgin?'≈':'reste'} ${nf(t.remaining)}</code><code>${taskRuns(t)} run(s)</code>
   ${dur?`<code>${dur}</code>`:''}
   ${t.url&&t.url!=='#'?`<a class="mini" href="${esc(t.url)}" target="_blank" rel="noopener">↗</a>`:''}
   ${['dispatched','queued','running'].includes(s)&&t.runId&&!t.demo?`<button class="mini danger" data-cancel="${i}">⏹</button>`:''}
   ${isDone(t)?`<button class="mini" data-arch="${i}" title="Archiver">🗄</button>`:''}
   <button class="mini" data-relaunch="${i}" title="Remettre en file">↻</button>
   <button class="mini" data-copy="${i}">📋</button>
   <button class="mini danger" data-rm="${i}">✕</button>
   ${t.error?`<span class="perr"><code>${esc(t.error)}</code><button class="mini" data-copyerr="${i}">📋</button></span>`:''}</div>`;}).join('');
 persistPlan();
}
function renderOrch(){
 const lv=S.plan.filter(isLive),dn=S.plan.filter(isDone),total=lv.length+dn.length;
 $('#orch-progress').style.width=(total?100*dn.length/total:0)+'%';
 const act=activeTasks().length;
 $('#orch-status').textContent=total
  ?`${dn.length}/${total} terminée(s) · ${act} active(s) · ${nf(pendingTasks().length)} à lancer`+(S.orch.startedAt?` · écoulé ${fmtDur((Date.now()-S.orch.startedAt)/1000)}`:'')
  :'File vide — ajoute des cibles pour démarrer une série.';
 $('#btn-launch').disabled=S.orch.running||!pendingTasks().length;
 $('#btn-pause').disabled=!S.orch.running;
 $('#btn-pause').textContent=S.orch.paused?'▶ Reprendre':'⏸ Pause';
 $('#btn-stop').disabled=!S.orch.running;
 $('#btn-newseries').disabled=S.orch.running;
 $('#orch-hint').textContent=S.orch.strategy==='serial'
  ?'Séquentiel : un run à la fois, le suivant part dès la fin du précédent. Garde cet onglet ouvert. Les tâches terminées libèrent leur slot — archive-les pour repartir.'
  :'Rafale : envois espacés, mais GitHub ne garde qu\'un run en attente par groupe ; au-delà, des runs peuvent être écartés. Réservé aux petits lots.';
 $('#o-strategy').value=S.orch.strategy;$('#o-delay').value=String(S.orch.delay);
 $('#o-cap').value=String(S.orch.cap);$('#o-mode').value=S.orch.mode;$('#o-autoarchive').checked=!!S.orch.autoArchive;
}
function renderRuns(){
 const mine=$('#runs-mine').checked;
 const list=S.runs.filter(r=>!mine||S.mine.has(r.id)||S.mine.has(String(r.id)));
 $('#runs-count').textContent=list.length;
 const b=$('#runs-body');
 if(!list.length){b.innerHTML='<p class="status">Aucun run à afficher. '+(live()?'Lance une série ou décoche « Mes envois seulement ».':'Connecte GitHub pour voir les runs réels.')+'</p>';return;}
 b.innerHTML=list.slice(0,40).map(r=>{
  const s=r.status==='completed'?(r.conclusion||'terminé'):r.status==='queued'?'queued':'running';
  const dur=r.started?fmtDur(((r.status==='completed'?new Date(r.updated):Date.now())-new Date(r.started))/1000):'';
  return `<div class="pitem st-${s}"><span class="grip"></span><b title="${esc(r.name)}">${esc(r.name)}</b>
   <span class="badge ${s}">${esc(s)}</span>${dur?`<code>${dur}</code>`:''}<code>#${esc(String(r.id).slice(-6))}</code>
   ${r.url&&r.url!=='#'?`<a class="mini" href="${esc(r.url)}" target="_blank" rel="noopener">↗</a>`:''}
   ${r.status!=='completed'&&live()&&!String(r.id).startsWith('demo')?`<button class="mini danger" data-runcancel="${r.id}">⏹</button>`:''}</div>`;}).join('');
}
function addToPlan(program,year,silent){
 const e=cellOf(program,year);
 if(!e){if(!silent)toast('Cible introuvable.','warn');return false;}
 const vol=volumeOf(e)||(e.virgin?S.globalAvg:0);
 if(!vol){if(!silent)toast('Cette année est déjà complète — rien à moissonner.','warn');return false;}
 if(inPlan(program,year)){if(!silent)toast('Déjà dans la file active.','warn');return false;}
 S.plan.push({id:uid(),program,year,remaining:vol,virgin:!!e.virgin,max:S.f.batch,state:'idle'});
 if(S.planFilter==='done')S.planFilter='active';
 persistPlan();renderPlan();renderOrch();render();
 if(!silent)toast(`${program} ${year} ajouté à la file.`,'ok',
  {label:'Annuler',fn:()=>{S.plan=S.plan.filter(t=>!(t.program===program&&t.year===year&&st(t)==='idle'));persistPlan();renderPlan();renderOrch();render();}});
 return true;
}
function bulkAdd(list,label){
 const before=S.plan.length;let n=0;
 list.forEach(t=>{if(addToPlan(t.program,t.year,true))n++;});
 if(S.planFilter==='done')S.planFilter='active';
 persistPlan();renderPlan();renderOrch();render();
 if(!n)return toast('Rien de nouveau — tout est déjà dans la file ou complet.','warn');
 toast(`${n} ${label} ajoutée(s).`,'ok',{label:'Annuler',fn:()=>{S.plan=S.plan.slice(0,before);persistPlan();renderPlan();renderOrch();render();}});
}

/* ---------- drawers ---------- */
function anyOpen(){return ['#drawer','#tdrawer','#hdrawer','#sdrawer'].some(s=>!$(s).hidden);}
function lock(){document.body.style.overflow=anyOpen()?'hidden':'';}
function openDetail(program,year){
 const p=S.cov.programs.find(x=>x.program===program),e=p?.years.find(x=>x.year===year);if(!e)return;
 const virgin=!!e.virgin,vol=volumeOf(e)||(virgin?S.globalAvg:0);
 S.detail={program,year,remaining:vol,virgin};
 $('#d-title').textContent=program;
 $('#d-sub').textContent=`${year}${p.channel?' · '+p.channel:''} — plage ${p.from}→${p.to}`;
 const batch=S.f.batch,runs=Math.max(1,Math.ceil(vol/batch)),per=Math.min(vol,batch)||batch;
 const past=[...S.plan.filter(isDone),...S.history].filter(t=>t.program===program&&t.year===year).sort((a,b)=>(b.endedAt||0)-(a.endedAt||0))[0];
 const banner=virgin
  ?`<div class="state-banner v"><b>? JAMAIS INDEXÉ</b> — aucune notice répertoriée pour cette année. Le premier run indexe l'année puis moissonne.</div>`
  :e.remaining>0
   ?`<div class="state-banner p"><b>EN COURS</b> — ${nf(e.remaining)} notice(s) restent à télécharger sur ${nf(e.indexed)} indexée(s).</div>`
   :`<div class="state-banner c"><b>✓ COMPLET</b> — les ${nf(e.indexed)} notice(s) indexée(s) sont toutes en cache.</div>`;
 const stats=virgin
  ?`<div class="kv"><span>Notices indexées</span><b>0</b>
    <span>Volume estimé</span><b>≈ ${nf(vol)}</b>
    <span>Base de l'estimation</span><b>${p.years.some(x=>x.indexed>0)?'moyenne émission':'moyenne globale'}</b>
    <span>Priorité</span><b>${p.priority}</b></div>`
  :`<div class="kv"><span>Indexées</span><b>${nf(e.indexed)}</b>
    <span>En cache</span><b style="color:var(--phos)">${nf(e.cached)}</b>
    <span>— version courante</span><b>${nf(e.current)}</b><span>— ancienne</span><b style="color:var(--amber)">${nf(e.outdated)}</b>
    <span>Avec œuvres</span><b>${nf(e.with_elements)}</b><span>Sans œuvre</span><b>${nf(e.empty)}</b>
    <span>Reste</span><b style="color:var(--red)">${nf(e.remaining)}</b>
    <span>Œuvres</span><b>${nf(e.elements)}</b><span>Jours</span><b>${nf(e.days)}</b><span>Couverture</span><b>${e.coverage} %</b></div>
    <div class="track big"><i style="width:${e.coverage}%"></i></div>`;
 $('#d-body').innerHTML=banner+stats
  +(past?`<div class="kv"><span>Dernier passage</span><b>${esc(LBL[st(past)]||st(past))}</b><span>Le</span><b>${esc(fmtDate(past.endedAt||past.sentAt))}</b></div>`:'')
  +(vol?`<p class="status">Lot de ${batch} → <b>${runs}</b> run(s) · ≈ ${Math.round((per*3.2+Math.floor(per/40)*22)/60)} min par run.</p>
    <div class="cmd">mode: ${esc(S.orch.mode)}\nprogram: ${esc(program)}\nyear: ${year}\nmax_notices: ${per}</div>`:'')
  +(e.sample?.length?`<div><p class="status">Notices manquantes (exemples)</p><div class="ids">${e.sample.map(s=>`<code>${esc(s)}</code>`).join('')}</div></div>`:'');
 const queued=inPlan(program,year),why=$('#d-why');
 why.className='why '+(queued?'no':vol?(virgin?'v':''):'ok');
 why.textContent=queued?'Déjà dans la file active — retire-la ou lance-la depuis la file.'
  :vol?(virgin?'Année vierge : le volume est une estimation, elle devient exacte après le premier run.':'Prêt à être ajouté ou lancé immédiatement.')
  :'Année complète : aucun bouton actif, c\'est normal. Choisis une année « ? » ou avec un reste.';
 $('#d-run').disabled=!vol;$('#d-add').disabled=!vol||queued;
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
function targetsChanged(){persistTargets();rebuild();syncTaskVolumes();refreshFilters();renderHealth();renderAll();renderTargets();}
function openTargets(){renderTargets();$('#tscrim').hidden=false;$('#tdrawer').hidden=false;lock();}
function closeTargets(){$('#tscrim').hidden=true;$('#tdrawer').hidden=true;lock();}
function renderHistory(){
 const h=S.history,ok=h.filter(t=>t.state==='success').length,ko=h.filter(t=>['failure','error'].includes(st(t))).length;
 $('#h-stat').innerHTML=`<span class="badge">${h.length} archivée(s)</span><span class="badge success">${ok} réussie(s)</span><span class="badge failure">${ko} échec(s)</span>`;
 $('#h-sub').textContent=h.length?`${h.length} tâche(s) archivée(s) — restaurables à tout moment.`:'Aucune tâche archivée pour l\'instant.';
 $('#h-body').innerHTML=h.length?h.slice(0,300).map(t=>`<div class="pitem st-${st(t)}"><span class="grip"></span>
  <b title="${esc(t.program)} · ${t.year}">${esc(t.program)} · ${t.year}</b>
  <span class="badge ${st(t)}">${esc(LBL[st(t)]||st(t))}</span>
  <code>${esc(fmtDate(t.archivedAt||t.endedAt))}</code>
  ${t.url&&t.url!=='#'?`<a class="mini" href="${esc(t.url)}" target="_blank" rel="noopener">↗</a>`:''}
  <button class="mini" data-restore="${esc(t.id)}">↩ Restaurer</button>
  <button class="mini danger" data-hdel="${esc(t.id)}">✕</button></div>`).join('')
  :'<div class="empty"><b>Historique vide</b>Les tâches archivées depuis la file apparaîtront ici.</div>';
}
function openHistory(){renderHistory();$('#hscrim').hidden=false;$('#hdrawer').hidden=false;lock();}
function closeHistory(){$('#hscrim').hidden=true;$('#hdrawer').hidden=true;lock();}
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
 await refreshCoverage(true);
 try{await fetchRuns();syncTasks();renderRuns();renderPlan();}catch(e){toast(e.message,'err');}
}
async function testSettings(){
 $('#s-status').textContent='⏳ Test…';
 const c=diagCfg(),a=await rawGh('',{},c);
 if(!a.ok){$('#s-status').textContent='❌ '+explain(a);return;}
 const w=await rawGh('/actions/workflows?per_page=100',{},c);
 if(!w.ok){$('#s-status').innerHTML=`✅ dépôt ok · ❌ workflows : ${esc(explain(w))}`;return;}
 const file=c.workflow.replace(/^.*\//,''),found=(w.data.workflows||[]).find(x=>x.path.endsWith('/'+file));
 $('#s-status').innerHTML=`✅ <b>${esc(a.data.full_name)}</b> · ${w.data.total_count} workflow(s)${found?` · <b>${esc(file)}</b> id ${found.id}`:` — <b>${esc(file)}</b> introuvable`}. Lance le diagnostic pour vérifier l'écriture.`;
}
function renderViews(){
 $('#views').innerHTML=S.views.length?S.views.map(v=>`<button class="vchip" data-v="${esc(v.id)}"><b>⭐ ${esc(v.name)}</b><i data-vd="${esc(v.id)}">✕</i></button>`).join('')
 :'<span class="status">⭐ Mémorise une combinaison de filtres.</span>';
}

/* ---------- init ---------- */
document.addEventListener('DOMContentLoaded',async()=>{
 $('#btn-reload').onclick=async()=>{await refreshCoverage();try{await fetchRuns();syncTasks();renderRuns();renderPlan();}catch(e){}};
 $('#btn-targets').onclick=openTargets;
 $('#btn-settings').onclick=openSettings;
 $('#btn-sound').onclick=()=>{S.sound=!S.sound;localStorage.setItem(SND,S.sound?'on':'off');renderSound();if(S.sound)blip('tick');
  toast(S.sound?'Signal sonore activé.':'Signal sonore coupé.','ok');};
 $('#q').oninput=e=>{S.f.q=e.target.value;render();};
 $('#f-decade').onchange=e=>{S.f.decade=e.target.value;S.f.year='all';refreshFilters();render();};
 $('#f-year').onchange=e=>{S.f.year=e.target.value;render();};
 $('#f-state').onchange=e=>{S.f.state=e.target.value;render();};
 $('#f-sort').onchange=e=>{S.f.sort=e.target.value;render();};
 $('#f-view').onchange=e=>{S.f.view=e.target.value;render();};
 $('#f-names').onchange=e=>{S.f.names=e.target.value;render();};
 $('#f-batch').onchange=e=>{S.f.batch=+e.target.value;S.plan.forEach(t=>{if(st(t)==='idle')t.max=S.f.batch;});persistPlan();renderPlan();renderOrch();render();};
 $('#btn-reset').onclick=()=>{S.f={...S.f,q:'',decade:'all',year:'all',state:'all',sort:'prio'};
  $('#q').value='';$('#f-decade').value='all';refreshFilters();$('#f-state').value='all';$('#f-sort').value='prio';render();};
 $('#btn-view-save').onclick=()=>{const n=prompt('Nom de la vue :','Ma vue');if(!n)return;
  S.views.push({id:'v'+Date.now(),name:n.slice(0,32),f:{...S.f}});localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();toast('Vue enregistrée.','ok');};
 $('#o-strategy').onchange=e=>{S.orch.strategy=e.target.value;persistOrch();renderOrch();};
 $('#o-delay').onchange=e=>{S.orch.delay=+e.target.value;persistOrch();};
 $('#o-cap').onchange=e=>{S.orch.cap=+e.target.value;persistOrch();};
 $('#o-mode').onchange=e=>{S.orch.mode=e.target.value;persistOrch();};
 $('#o-autoarchive').onchange=e=>{S.orch.autoArchive=e.target.checked;persistOrch();
  toast(S.orch.autoArchive?'Les réussites partiront automatiquement à l\'historique.':'Archivage automatique désactivé.','ok');
  if(S.orch.autoArchive)afterTaskSettled();};
 $('#btn-launch').onclick=launch;$('#btn-pause').onclick=pause;$('#btn-stop').onclick=stop;
 $('#btn-retry').onclick=()=>requeueTasks(S.plan.filter(t=>['failure','error','cancelled'].includes(st(t))));
 $('#btn-archive').onclick=archiveDone;
 $('#btn-newseries').onclick=newSeries;
 $('#btn-history').onclick=openHistory;
 $('#btn-start').onclick=()=>bulkAdd((S.cov.frontier||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10),'cible(s) à démarrer');
 $('#btn-fill').onclick=()=>bulkAdd((S.cov.queue||[]).filter(q=>!inPlan(q.program,q.year)).slice(0,10),'complétion(s)');
 $('#btn-copy-plan').onclick=()=>{const l=S.plan.filter(isLive);if(!l.length)return toast('Aucune tâche active.','warn');
  copy('Émission\tAnnée\tÉtat\tmax_notices\tRuns\n'+l.map(i=>`${i.program}\t${i.year}\t${i.virgin?'à démarrer':'en cours'}\t${i.max||S.f.batch}\t${taskRuns(i)}`).join('\n'),'File active copiée.');};
 $('#btn-csv').onclick=()=>{if(!S.plan.length)return toast('File vide.','warn');
  dl('file-moisson-ina.csv','program,year,state,max_notices,runs,status\n'+S.plan.map(i=>`"${i.program}",${i.year},${i.virgin?'virgin':'partial'},${i.max||S.f.batch},${taskRuns(i)},${st(i)}`).join('\n'),'text/csv');toast('CSV téléchargé.','ok');};
 $$('.pft').forEach(b=>b.onclick=()=>{S.planFilter=b.dataset.pf;renderPlan();});
 $('#bulk-all').onchange=e=>{const vis=visibleTasks();
  if(e.target.checked)vis.forEach(({t})=>S.sel.add(t.id));else vis.forEach(({t})=>S.sel.delete(t.id));renderPlan();};
 $('#btn-bulk-none').onclick=()=>{S.sel.clear();renderPlan();};
 $('#btn-bulk-remove').onclick=removeSelected;
 $('#btn-bulk-requeue').onclick=()=>requeueTasks(S.plan.filter(t=>S.sel.has(t.id)));
 $('#btn-bulk-archive').onclick=()=>archiveTasks(S.plan.filter(t=>S.sel.has(t.id)),'sélection');
 $('#btn-runs-refresh').onclick=async()=>{try{await fetchRuns();syncTasks();renderRuns();renderPlan();kpis();toast('Runs actualisés.','ok');}catch(e){toast(e.message,'err');}};
 $('#runs-mine').onchange=renderRuns;
 $('#d-close').onclick=$('#d-close2').onclick=$('#scrim').onclick=closeDetail;
 $('#d-add').onclick=()=>{if(S.detail){addToPlan(S.detail.program,S.detail.year);closeDetail();}};
 $('#d-copy').onclick=()=>{const d=S.detail;if(!d)return;
  copy(`mode: ${S.orch.mode}\nprogram: ${d.program}\nyear: ${d.year}\nmax_notices: ${Math.min(d.remaining,S.f.batch)||S.f.batch}`,'Paramètres copiés.');};
 $('#d-run').onclick=async()=>{const d=S.detail;if(!d)return;
  addToPlan(d.program,d.year,true);
  const t=S.plan.find(x=>x.program===d.program&&x.year===d.year&&isLive(x));closeDetail();
  if(!t)return;
  if(!live()&&!confirm('Pas de token : run SIMULÉ. Continuer ?'))return;
  t.state='queued';renderPlan();
  try{await dispatchTask(t);toast(`${t.program} ${t.year} déclenché.`,'ok');}
  catch(e){t.state='error';t.error=e.message;blip('ko');toast(e.message,'err');}
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
  persistTargets();rebuild();syncTaskVolumes();refreshFilters();renderAll();});
 $('#h-close').onclick=$('#h-close2').onclick=$('#hscrim').onclick=closeHistory;
 $('#h-export').onclick=()=>{if(!S.history.length)return toast('Historique vide.','warn');
  dl('historique-moisson-ina.csv','program,year,state,sent_at,ended_at,run_id\n'+S.history.map(t=>`"${t.program}",${t.year},${st(t)},${t.sentAt?new Date(t.sentAt).toISOString():''},${t.endedAt?new Date(t.endedAt).toISOString():''},${t.runId||''}`).join('\n'),'text/csv');
  toast('Historique exporté.','ok');};
 $('#h-clear').onclick=()=>{if(!S.history.length)return;const b=[...S.history];S.history=[];persistHistory();renderHistory();render();
  toast('Historique vidé.','warn',{label:'Annuler',fn:()=>{S.history=b;persistHistory();renderHistory();render();}});};
 $('#s-close').onclick=$('#s-close2').onclick=$('#sscrim').onclick=closeSettings;
 $('#s-save').onclick=saveSettings;$('#s-test').onclick=testSettings;
 $('#diag-run').onclick=runDiag;$('#diag-write').onclick=diagWrite;
 $('#s-token').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveSettings();}};
 $('#s-clear').onclick=()=>{S.cfg.token='';localStorage.setItem(CFG,JSON.stringify(S.cfg));$('#s-token').value='';S.wfId=null;refreshChrome();toast('Token effacé.','warn');};
 document.addEventListener('mouseover',e=>{const t=e.target.closest('[data-tip]');if(t)showTip(t,t.dataset.tip);});
 document.addEventListener('mouseout',e=>{if(e.target.closest('[data-tip]'))hideTip();});
 document.addEventListener('change',e=>{
  const p=e.target.closest('[data-sel-task]');
  if(p){p.checked?S.sel.add(p.dataset.selTask):S.sel.delete(p.dataset.selTask);renderPlan();}});
 document.addEventListener('click',async e=>{
  const vd=e.target.closest('[data-vd]');if(vd){S.views=S.views.filter(v=>v.id!==vd.dataset.vd);localStorage.setItem(VIEWS,JSON.stringify(S.views));renderViews();return;}
  const vw=e.target.closest('[data-v]');if(vw){const v=S.views.find(x=>x.id===vw.dataset.v);if(!v)return;S.f={...v.f};
   $('#q').value=S.f.q;$('#f-decade').value=S.f.decade;refreshFilters();$('#f-year').value=S.f.year;$('#f-state').value=S.f.state;
   $('#f-sort').value=S.f.sort;$('#f-view').value=S.f.view;$('#f-batch').value=S.f.batch;$('#f-names').value=S.f.names;renderPlan();renderOrch();render();return;}
  const td=e.target.closest('[data-tdel]');if(td){const i=+td.dataset.tdel,rm=S.targets[i];S.targets.splice(i,1);targetsChanged();
   toast(`${rm.program} retirée.`,'warn',{label:'Annuler',fn:()=>{S.targets.splice(i,0,rm);targetsChanged();}});return;}
  const rs=e.target.closest('[data-restore]');if(rs){restoreFromHistory(rs.dataset.restore);return;}
  const hd=e.target.closest('[data-hdel]');if(hd){const id=hd.dataset.hdel,it=S.history.find(t=>t.id===id);
   S.history=S.history.filter(t=>t.id!==id);persistHistory();renderHistory();render();
   toast('Entrée supprimée.','warn',{label:'Annuler',fn:()=>{S.history=[it,...S.history];persistHistory();renderHistory();render();}});return;}
  const rc=e.target.closest('[data-runcancel]');if(rc){const id=rc.dataset.runcancel;
   if(!confirm('Annuler ce run GitHub ?'))return;
   try{await gh(`/actions/runs/${id}/cancel`,{method:'POST'});toast('Annulation demandée.','warn');await pollOnce();}catch(x){toast(x.message,'err');}return;}
  const cn=e.target.closest('[data-cancel]');if(cn){const t=S.plan[+cn.dataset.cancel];
   if(!t?.runId)return;if(!confirm(`Annuler le run de ${t.program} ${t.year} ?`))return;
   try{await gh(`/actions/runs/${t.runId}/cancel`,{method:'POST'});toast('Annulation demandée.','warn');await pollOnce();}catch(x){toast(x.message,'err');}return;}
  const ar=e.target.closest('[data-arch]');if(ar){const t=S.plan[+ar.dataset.arch];if(t)archiveTasks([t],'tâche');return;}
  const ce=e.target.closest('[data-copyerr]');if(ce){const t=S.plan[+ce.dataset.copyerr];if(t?.error)copy(t.error,'Erreur copiée.');return;}
  const rl=e.target.closest('[data-relaunch]');if(rl){const t=S.plan[+rl.dataset.relaunch];if(t)requeueTasks([t]);return;}
  const rm=e.target.closest('[data-rm]');if(rm){const k=+rm.dataset.rm,it=S.plan[k],bp=[...S.plan];
   S.plan.splice(k,1);S.sel.delete(it.id);persistPlan();renderAll();
   toast('Retirée de la file.','warn',{label:'Annuler',fn:()=>{S.plan=bp;persistPlan();renderAll();}});return;}
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
  if(kind==='plan'){persistPlan();renderPlan();renderOrch();}else{S.targets.forEach((t,i)=>t.priority=i+1);targetsChanged();}
  kind=null;from=null;});
 document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
   if(!$('#sdrawer').hidden)closeSettings();else if(!$('#hdrawer').hidden)closeHistory();
   else if(!$('#tdrawer').hidden)closeTargets();else closeDetail();hideTip();}
  if(e.key==='/'&&!/input|select|textarea/i.test(document.activeElement.tagName)){e.preventDefault();$('#q').focus();}});
 window.addEventListener('beforeunload',e=>{if(S.orch.running&&S.orch.strategy==='serial'){e.preventDefault();e.returnValue='';}});
 await load();
 if(!live())setTimeout(openSettings,400);
});