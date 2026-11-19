// =====================================================
// TV RÉTRO — œuvres INA bornées au créneau de l'émission
// =====================================================
const state={currentView:'browse',selectedDecade:null,selectedYear:null,selectedDate:null,
 playlist:loadStoredPlaylist(),index:null,yearData:null,dayOpen:false,currentPrograms:[],currentProgramMap:new Map(),
 filters:{query:'',channel:'all',showSegments:true},suggestions:[],timelineZoom:2.4,timelinePrograms:[],
 tmdbKey:localStorage.getItem('retroTmdbKey')||'',
 search:{meta:null,metaLoaded:false,filtersReady:false,cache:{},loadedYears:new Set(),loading:false,query:'',genre:'all',channel:'all',period:'all',year:'all',evening:false,sort:'count',groups:[],totalMatches:0,expanded:new Set()},
 podcast:{loaded:false,loading:false,items:[],byKey:new Map(),meta:null,error:'',source:''},
 ina:{cov:null,slugByTitle:new Map(),cache:{},loading:new Set(),enabled:true,stats:{attached:0,rejected:0}},
 player:{el:null,item:null}};
let toastTimeout=null,videoPanelToken=0,searchDebounce=null,searchRunToken=0,infoToken=0,tlTouchArmed=null;
const LAST_DAY_STORAGE_KEY='retroLastDay',NIGHT_CUTOFF_HOUR=5,HIDDEN_GENRES=['météo'];
const MAX_BLOCK_MIN=210,MIN_BLOCK_MIN=20,SLOT_TOL_MIN=3;
const CHARTS_BASE='https://xbodin2g.github.io/top-singles-hebdo/';
const PODCAST_JSON='data/podcasts/anisong.json',PODCAST_RSS='https://anisong.lepodcast.fr/rss';
const PODCAST_KEEP='la belle histoire des generiques tele';
const CHANNEL_ORDER=['ORTF 1','ORTF 2','ORTF 3','TF1','Antenne 2','France 2','FR3','France 3','Canal+','TV6','M6','La Cinq','La Sept','Arte','La Cinquième','France 5'];
const CHANNEL_ALIASES={'OR1':'ORTF 1','OR2':'ORTF 2','OR3':'ORTF 3','ORTF 1':'ORTF 1','ORTF 2':'ORTF 2','ORTF 3':'ORTF 3','ORTF1':'ORTF 1','ORTF2':'ORTF 2','ORTF3':'ORTF 3','TF1':'TF1','A2':'Antenne 2','ANTENNE 2':'Antenne 2','F2':'France 2','FRANCE 2':'France 2','FR3':'FR3','FR 3':'FR3','F3':'France 3','FRANCE 3':'France 3','C+':'Canal+','CANAL+':'Canal+','CANAL':'Canal+','TV6':'TV6','L5':'La Cinq','LA5':'La Cinq','LA 5':'La Cinq','LA CINQ':'La Cinq','LA CINQUIEME':'La Cinquième','LA CINQUIÈME':'La Cinquième','CINQ':'La Cinq','M6':'M6','LA SEPT':'La Sept','L7':'La Sept','LA7':'La Sept','LA 7':'La Sept','ARTE':'Arte','FRANCE 5':'France 5'};
const CHANNEL_COLORS={'ORTF 1':'#6b7280','ORTF 2':'#8b5cf6','ORTF 3':'#0ea5e9','TF1':'#1f3a5f','Antenne 2':'#8c2f39','France 2':'#c2410c','FR3':'#2f6b4f','France 3':'#15803d','Canal+':'#111827','TV6':'#db2777','M6':'#31708f','La Cinq':'#6b4f8c','La Sept':'#0f766e','Arte':'#b32222','La Cinquième':'#0891b2','France 5':'#0e7490'};
const YOUTH_HINTS=['club dorothee','recre a2','amuse 3','cabou cadin','vitamine','youpi','giga','disney','minikeums','samdynamite','teletaz','croque','visiteurs du mercredi','village dans les nuages','avant l ecole','tf jeunesse','club mini','tout spip','graffitis','cellulo','zouzous','m6 kid','multitop','debut les enfants','chalu maureen','televisator','babalous','ecole buissonniere','ecole des champions','salut les muscles','premiers baisers'];

document.addEventListener('DOMContentLoaded',initializeApp);
async function initializeApp(){
 injectStyles();injectSearchUI();injectInfoUI();injectTooltip();injectPlayer();
 setupNavigation();setupDayToolbarListeners();setupPlaylistListeners();setupVideoPanelListeners();
 setupSearchListeners();setupYearsClickListener();setupInfoListeners();setupPlayerListeners();
 updatePlaylistDisplay();registerServiceWorker();
 if(!await loadIndex({display:false}))return;
 buildSuggestions();
 if(!await restoreLastDay())displayYears();
 loadPodcastIndex();loadInaCoverage();
}
// ---------- helpers ----------
function escapeHtml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function normalizeText(v){if(!v)return'';return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function cssSafeId(v){return String(v||'').replace(/[^a-zA-Z0-9_-]/g,'-').replace(/^-+|-+$/g,'')||'id';}
function normalizeDate(d){if(!d)return null;const v=String(d).trim();let p;if(v.includes('-'))p=v.split('-');else if(v.includes('/'))p=v.split('/');else return null;if(p.length!==3)return null;let day,month,year;if(p[0].length===4){year=p[0];month=p[1];day=p[2];}else{day=p[0];month=p[1];year=p[2];}day=String(day).padStart(2,'0');month=String(month).padStart(2,'0');const nd=+day,nm=+month,ny=+year;if(Number.isNaN(nd)||Number.isNaN(nm)||Number.isNaN(ny))return null;const t=new Date(ny,nm-1,nd);if(t.getFullYear()!==ny||t.getMonth()!==nm-1||t.getDate()!==nd)return null;return `${day}-${month}-${year}`;}
function dateToDate(d){const n=normalizeDate(d);if(!n)return null;const[a,b,c]=n.split('-').map(Number);return new Date(c,b-1,a);}
function isoDate(d){const n=normalizeDate(d);if(!n)return'';const[a,b,c]=n.split('-');return `${c}-${b}-${a}`;}
function formatDateLabel(d){const n=normalizeDate(d);if(!n)return d||'';const[a,b,c]=n.split('-');try{const dt=new Date(+c,+b-1,+a);return `${dt.toLocaleDateString('fr-FR',{weekday:'long'})} ${a}/${b}/${c}`;}catch{return `${a}/${b}/${c}`;}}
function formatShortDate(d){const n=normalizeDate(d);if(!n)return d||'';const[a,b,c]=n.split('-');return `${a}/${b}/${c}`;}
function dateSortKey(d){const n=normalizeDate(d);if(!n)return[9999,9999,9999];const[a,b,c]=n.split('-').map(Number);return[c,b,a];}
function sortDates(ds){return[...ds].sort((a,b)=>{const x=dateSortKey(a),y=dateSortKey(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;});}
function normalizeTime(v){if(!v)return'';const m=String(v).trim().match(/^(\d{1,2})[:h.](\d{2})/);if(!m)return'';const h=+m[1],mi=+m[2];return h>23||mi>59?'':`${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}`;}
function timeSortKey(t){if(!t||!t.includes(':'))return 9999;const[h,m]=t.split(':').map(Number);if(Number.isNaN(h)||Number.isNaN(m))return 9999;return h>=NIGHT_CUTOFF_HOUR?(h-NIGHT_CUTOFF_HOUR)*60+m:(h+24-NIGHT_CUTOFF_HOUR)*60+m;}
function minToLabel(m){if(!Number.isFinite(m)||m>=9999)return'—';const t=(m+NIGHT_CUTOFF_HOUR*60)%1440;return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;}
function canonicalChannel(v){const raw=String(v||'').trim();if(!raw)return'Autres';const u=raw.toUpperCase();if(CHANNEL_ALIASES[u])return CHANNEL_ALIASES[u];const nu=normalizeText(raw).toUpperCase();if(CHANNEL_ALIASES[nu])return CHANNEL_ALIASES[nu];const c=nu.replace(/\s+/g,'');if(CHANNEL_ALIASES[c])return CHANNEL_ALIASES[c];return raw;}
function channelRank(c){const i=CHANNEL_ORDER.indexOf(c);return i===-1?CHANNEL_ORDER.length+1:i;}
function channelColor(c){return CHANNEL_COLORS[c]||'#404853';}
function slugChannel(c){return normalizeText(c).replace(/\s+/g,'-').replace(/^-|-$/g,'')||'autre';}
function cleanTitle(v){let t=String(v||'').trim().replace(/\s+/g,' ');const p=t.split(/\s+[-–—]\s+/);if(p.length===2&&normalizeText(p[0])===normalizeText(p[1]))return p[0].trim();return t;}
function truncateText(v,n){const t=String(v||'');return t.length<=n?t:`${t.slice(0,n-1)}…`;}
function fmtSec(s){s=Math.max(0,Math.round(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`;}
function isYouth(p){const t=normalizeText(p.title||'');return YOUTH_HINTS.some(k=>t.includes(k))||/jeunesse/i.test(p.description||'');}
function ageDays(iso){if(!iso)return null;const d=new Date(iso);if(isNaN(d))return null;return Math.floor((Date.now()-d.getTime())/86400000);}
// ---------- charts / film ----------
function isChartShow(t){const n=normalizeText(t);return /\btop 50\b|\bhit machine\b|\bhit parade\b|\btop club\b|\btube d argent\b|\btop 40\b/.test(n);}
function isoWeekKey(d){const dt=dateToDate(d);if(!dt)return'';const x=new Date(Date.UTC(dt.getFullYear(),dt.getMonth(),dt.getDate()));const dn=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-dn);const y0=new Date(Date.UTC(x.getUTCFullYear(),0,1));const w=Math.ceil((((x-y0)/86400000)+1)/7);return `${x.getUTCFullYear()}-${String(w).padStart(2,'0')}`;}
function chartsUrl(d){return `${CHARTS_BASE}?retro=${encodeURIComponent(isoWeekKey(d))}&date=${encodeURIComponent(isoDate(d))}`;}
function parseFilmMeta(p){const d=String(p.description||'');if(!/\bfilm\b|\btelefilm\b/i.test(d))return null;const y=(d.match(/\((\d{4})\)/)||[])[1]||(d.match(/\b(19\d{2}|20\d{2})\b/)||[])[1]||'';let r=(d.match(/film\s+de\s+([A-ZÀ-Ý][^,.(;]+)/i)||[])[1]||'';if(!r)r=(d.match(/\bde\s+([A-ZÀ-Ý][a-zà-ÿ]+\s+[A-ZÀ-Ý][a-zà-ÿ]+)/)||[])[1]||'';r=r.trim();return(!y&&!r)?null:{year:y,director:r};}
// ---------- storage ----------
function loadStoredPlaylist(){try{const raw=localStorage.getItem('retroPlaylist');if(!raw)return[];const p=JSON.parse(raw);if(!Array.isArray(p))return[];return p.filter(x=>x&&typeof x==='object'&&x.id&&x.date&&x.title).map(x=>({id:String(x.id),date:String(x.date),time:x.time?String(x.time):'',title:String(x.title),channel:x.channel?String(x.channel):'',description:x.description?String(x.description):'',parentTitle:x.parentTitle?String(x.parentTitle):'',type:x.type?String(x.type):'program',elements:Array.isArray(x.elements)?x.elements:[],addedAt:x.addedAt||new Date().toISOString()}));}catch(e){return[];}}
function savePlaylist(){try{localStorage.setItem('retroPlaylist',JSON.stringify(state.playlist));}catch(e){showToast('❌ Sauvegarde impossible');}}
function setStoredLastDay(y,d){try{localStorage.setItem(LAST_DAY_STORAGE_KEY,JSON.stringify({year:y,date:d,updatedAt:new Date().toISOString()}));}catch(e){}}
function getStoredLastDay(){try{const r=localStorage.getItem(LAST_DAY_STORAGE_KEY);if(!r)return null;const p=JSON.parse(r);return(!p||!p.year||!p.date)?null:{year:String(p.year),date:String(p.date)};}catch(e){return null;}}
function clearStoredLastDay(){try{localStorage.removeItem(LAST_DAY_STORAGE_KEY);}catch(e){}}
async function restoreLastDay(){const s=getStoredLastDay();if(!s)return false;if(!state.index?.years?.[s.year]){clearStoredLastDay();return false;}try{if(!await selectYear(s.year,{display:false}))return false;return selectDate(s.date)===true;}catch(e){return false;}}
// ---------- index ----------
async function loadIndex(o={}){try{const base=document.baseURI||location.href;const r=await fetch(new URL('data/index.json',base).href+`?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`data/index.json (HTTP ${r.status})`);const t=await r.text();if(!t.trim())throw new Error('index vide');state.index=JSON.parse(t);if(!state.index?.years){showNoData('Structure d’index invalide.');return false;}if(!Object.keys(state.index.years).some(y=>/^\d{4}$/.test(y))){showNoData('Aucune année. Lance generate_index_only.');return false;}if(o.display!==false)displayYears();return true;}catch(e){showNoData(e.message);return false;}}
function showNoData(m='Lance le scraping puis generate_index_only.'){const c=document.getElementById('years-container');if(c)c.innerHTML=`<div class="empty-state"><div class="retro-tv">📺</div><h2>Aucune donnée disponible</h2><p>${escapeHtml(m)}</p></div>`;const g=document.getElementById('programs-groups');if(g)g.innerHTML='';}
function programKey(p){return p.time?`${p.time}|${p.channel||'Autres'}`:`${normalizeText(p.title)}|${p.channel||'Autres'}`;}
function dedupePrograms(ps){const m=new Map();for(const raw of ps){if(!raw||typeof raw!=='object')continue;const p={time:normalizeTime(raw.time),channel:canonicalChannel(raw.channel)||'Autres',title:cleanTitle(raw.title)||'Programme non identifié',description:String(raw.description||'').trim().replace(/\s+/g,' '),segments:Array.isArray(raw.segments)?raw.segments:[]};const k=programKey(p);if(!m.has(k)){m.set(k,p);continue;}const e=m.get(k);if(p.title.length>e.title.length)e.title=p.title;if(p.description.length>e.description.length)e.description=p.description;if(!e.time&&p.time)e.time=p.time;if(!e.segments.length&&p.segments.length)e.segments=p.segments;}
 return[...m.values()].sort((a,b)=>{const x=channelRank(a.channel),y=channelRank(b.channel);if(x!==y)return x-y;const u=timeSortKey(a.time),v=timeSortKey(b.time);if(u!==v)return u-v;return normalizeText(a.title).localeCompare(normalizeText(b.title));});}
function flattenChannels(ch){if(!ch||typeof ch!=='object')return[];return Object.values(ch).flat().filter(Boolean);}
function groupProgramsByChannel(ps){const m=new Map();for(const p of ps){const c=p.channel||'Autres';if(!m.has(c))m.set(c,[]);m.get(c).push(p);}return[...m.entries()].sort((a,b)=>channelRank(a[0])-channelRank(b[0])).map(([channel,progs])=>({channel,programs:[...progs].sort((a,b)=>timeSortKey(a.time)-timeSortKey(b.time))}));}
function makeProgramId(d,t,c,sfx='p'){return `${normalizeDate(d)||String(d||'')}__${String(t||'sans-heure').replace(':','h')}__${slugChannel(c||'Autres')}__${String(sfx||'p').replace(/[^a-zA-Z0-9_-]/g,'-')}`;}
function programAnchorId(d,p){return `prog-${cssSafeId(makeProgramId(d,p.time,p.channel,'p'))}`;}
// ---------- créneaux ----------
function slotWindows(programs){
 const byCh=new Map();
 programs.forEach(p=>{const c=normalizeText(p.channel||'Autres');if(!byCh.has(c))byCh.set(c,[]);byCh.get(c).push(p);});
 const win=new Map();
 byCh.forEach(list=>{
  const timed=list.filter(p=>timeSortKey(p.time)<9999).sort((a,b)=>timeSortKey(a.time)-timeSortKey(b.time));
  timed.forEach((p,i)=>{
   const s=timeSortKey(p.time);
   const next=i+1<timed.length?timeSortKey(timed[i+1].time):Infinity;
   const end=Math.max(s+MIN_BLOCK_MIN,Math.min(next,s+MAX_BLOCK_MIN));
   win.set(p,{start:s,end,next,capped:next>s+MAX_BLOCK_MIN});
  });
  list.filter(p=>timeSortKey(p.time)>=9999).forEach(p=>win.set(p,null));
 });
 return win;}
function slotLabel(w){if(!w)return'—';return `${minToLabel(w.start)} → ${minToLabel(w.end)}`;}
// ---------- browse ----------
function displayYears(){const c=document.getElementById('years-container');if(!c)return;if(!state.index?.years){showNoData();return;}
 const years=Object.keys(state.index.years).filter(y=>/^\d{4}$/.test(y)).sort((a,b)=>+a-+b);if(!years.length){showNoData();return;}
 const dec={};years.forEach(y=>{const d=Math.floor(+y/10)*10;(dec[d]=dec[d]||[]).push(y);});
 const dk=Object.keys(dec).map(Number).sort((a,b)=>a-b);
 if(!state.selectedDecade||!dec[state.selectedDecade])state.selectedDecade=String(dk[0]);
 const sel=+state.selectedDecade;
 const tabs=dk.map(d=>`<button class="decade-tab${d===sel?' active':''}" type="button" onclick="selectDecade('${d}')"><span class="decade-label">${String(d).slice(2)}s</span><span class="decade-count">${dec[d].length} an${dec[d].length>1?'s':''}</span></button>`).join('');
 const cards=(dec[sel]||[]).map(y=>`<button class="year-btn" onclick="selectYear('${escapeHtml(y)}')"><span class="year-number">${escapeHtml(y)}</span><span class="year-info">${Number(state.index.years[y].total_programs||0)} programmes archivés</span></button>`).join('');
 c.innerHTML=`${renderSuggestionsHTML()}<h2 class="years-title">📅 Choisissez une décennie puis une année</h2><div class="decade-tabs">${tabs}</div><div class="years-grid">${cards}</div>`;}
function selectDecade(d){state.selectedDecade=String(d);displayYears();}
function setupYearsClickListener(){const c=document.getElementById('years-container');if(!c)return;c.addEventListener('click',e=>{if(e.target.closest('#reshuffle-suggestions')){buildSuggestions();displayYears();return;}const card=e.target.closest('[data-open-day]');if(card)openDay(card.dataset.openDay);});}
async function selectYear(y,o={}){state.selectedYear=y;state.selectedDate=null;state.yearData=null;showLoading(true);
 try{const base=document.baseURI||location.href;const r=await fetch(new URL(`data/${y}.json`,base).href+`?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`data/${y}.json (HTTP ${r.status})`);state.yearData=await r.json();
  if(!state.yearData?.dates){showToast(`⚠️ Aucune journée pour ${y}`);if(o.display!==false)displayYears();return false;}
  if(o.display!==false)displayDates(y);return true;
 }catch(e){showToast(`❌ ${e.message}`);if(o.display!==false)displayYears();return false;}finally{showLoading(false);}}
function displayDates(y){const c=document.getElementById('years-container');if(!c)return;const ds=state.yearData?.dates?sortDates(Object.keys(state.yearData.dates)):[];
 if(!ds.length){c.innerHTML=`<div class="year-header"><button class="back-btn" onclick="displayYears()">← Retour aux années</button><h2>📅 ${escapeHtml(y)}</h2></div><div class="empty-state"><h2>Aucune date disponible</h2></div>`;return;}
 c.innerHTML=`<div class="year-header"><button class="back-btn" onclick="displayYears()">← Retour aux années</button><h2>📅 ${escapeHtml(y)} — ${ds.length} journées disponibles</h2></div><div class="dates-grid">${ds.map(d=>{const dd=state.yearData.dates[d]||{};const n=Number(dd.programs_count||(Array.isArray(dd.programs)?dd.programs.length:0));return `<button class="date-btn" onclick="selectDate('${escapeHtml(d)}')"><span class="date-display">${escapeHtml(formatDateLabel(d))}</span><span class="date-info">${n} programmes</span><span class="date-source">${escapeHtml(dd.source||'inconnue')}</span></button>`;}).join('')}</div>`;}
function selectDate(date){const nd=normalizeDate(date)||date;if(!state.yearData?.dates){showToast('❌ Aucune donnée chargée');return false;}
 const dd=state.yearData.dates[nd]||state.yearData.dates[date];if(!dd){showToast('❌ Date indisponible');return false;}
 state.selectedDate=nd;state.filters={query:'',channel:'all',showSegments:true};
 const raw=Array.isArray(dd.programs)&&dd.programs.length?dd.programs:(dd.channels?flattenChannels(dd.channels):[]);
 state.currentPrograms=dedupePrograms(raw);openDayView(dd);return true;}
function openDayView(dd){const bl=document.getElementById('browse-list'),dp=document.getElementById('day-panel');if(!bl||!dp)return;state.dayOpen=true;bl.hidden=true;dp.hidden=false;renderDay(dd);setStoredLastDay(state.selectedYear,state.selectedDate);updatePlaylistReturnBar();window.scrollTo({top:0,behavior:'auto'});}
function closeDayView(){const bl=document.getElementById('browse-list'),dp=document.getElementById('day-panel');if(!bl||!dp)return;state.dayOpen=false;state.selectedDate=null;clearStoredLastDay();dp.hidden=true;bl.hidden=false;updatePlaylistReturnBar();if(state.selectedYear&&state.yearData)displayDates(state.selectedYear);else displayYears();window.scrollTo({top:0,behavior:'auto'});}
function reopenDayView(){if(!state.dayOpen||!state.yearData||!state.selectedDate)return false;const dd=state.yearData.dates[state.selectedDate];if(!dd)return false;const bl=document.getElementById('browse-list'),dp=document.getElementById('day-panel');if(!bl||!dp)return false;bl.hidden=true;dp.hidden=false;renderDay(dd);updatePlaylistReturnBar();return true;}
async function openDay(date,time,channel){const nd=normalizeDate(date);if(!nd){showToast('❌ Date invalide');return;}setActiveView('browse');if(!await selectYear(nd.split('-')[2],{display:false}))return;if(selectDate(nd)&&time&&channel){const a=programAnchorId(nd,{time:normalizeTime(time),channel:canonicalChannel(channel)});setTimeout(()=>jumpToProgram(a),260);}}
// ---------- day ----------
function renderDay(dd){const ps=state.currentPrograms;const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
 set('day-title',formatDateLabel(dd.date||state.selectedDate));set('day-meta',`${ps.length} programmes`);set('day-source',dd.source||'source inconnue');
 const si=document.getElementById('program-search');if(si)si.value=state.filters.query;
 const ss=document.getElementById('show-segments');if(ss)ss.checked=state.filters.showSegments;
 const chs=[...new Set(ps.map(p=>p.channel||'Autres'))].sort((a,b)=>channelRank(a)-channelRank(b));
 const cf=document.getElementById('channel-filter');if(cf)cf.innerHTML=`<option value="all">Toutes les chaînes</option>`+chs.map(c=>`<option value="${escapeHtml(c)}"${state.filters.channel===c?' selected':''}>${escapeHtml(c)}</option>`).join('');
 renderSummary(ps,document.getElementById('summary-details'));applyFilters();
 enrichDayWithIna(state.selectedDate).then(r=>{if(r&&r.attached>0){applyFilters();showToast(`🧩 ${r.attached} œuvre(s) INA rattachée(s) à leur créneau${r.rejected?` · ${r.rejected} hors créneau écartée(s)`:''}`);}});}
function setupDayToolbarListeners(){const dp=document.getElementById('day-panel');const bind=(id,ev,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener(ev,fn);};
 bind('program-search','input',e=>{state.filters.query=e.target.value;applyFilters();});
 bind('channel-filter','change',e=>{state.filters.channel=e.target.value;applyFilters();});
 bind('show-segments','change',e=>{state.filters.showSegments=e.target.checked;applyFilters();});
 bind('expand-all','click',()=>document.querySelectorAll('#programs-groups .channel-block').forEach(b=>setChannelBlockCollapsed(b,false)));
 bind('collapse-all','click',()=>document.querySelectorAll('#programs-groups .channel-block').forEach(b=>setChannelBlockCollapsed(b,true)));
 const tl=document.getElementById('day-timeline');
 if(tl){tl.addEventListener('click',e=>{const z=e.target.closest('[data-tl-zoom]');if(z){setTimelineZoom(z.dataset.tlZoom);return;}const b=e.target.closest('[data-target-anchor]');if(!b)return;if(tlTouchArmed===b){tlTouchArmed=null;setTimeout(hideTlTooltip,1600);return;}hideTlTooltip();jumpToProgram(b.dataset.targetAnchor);});
  tl.addEventListener('touchstart',e=>{const b=e.target.closest('.tl-block');if(b){tlTouchArmed=b;showTlTooltip(b);}else{tlTouchArmed=null;hideTlTooltip();}},{passive:true});
  tl.addEventListener('mouseover',e=>{const b=e.target.closest('.tl-block');if(b)showTlTooltip(b);});
  tl.addEventListener('mouseout',e=>{if(e.target.closest('.tl-block'))hideTlTooltip();});}
 if(dp)dp.addEventListener('click',handleDayClick);}
function handleDayClick(e){
 if(e.target.closest('#day-back-btn')){closeDayView();return;}
 const ex=e.target.closest('.elements-btn');if(ex){e.preventDefault();addAllElements(ex.dataset.elementsId);return;}
 const pc=e.target.closest('.podcast-btn');if(pc){openInfoPanel(pc.dataset.podId,'podcast');return;}
 const ch=e.target.closest('.charts-btn');if(ch){window.open(ch.dataset.chartsUrl,'_blank','noopener');return;}
 const inf=e.target.closest('.info-btn');if(inf){openInfoPanel(inf.dataset.infoId);return;}
 const vid=e.target.closest('.video-search-btn');if(vid){openVideoPanel(vid.dataset.videoId);return;}
 const hd=e.target.closest('.channel-header');if(hd){const b=hd.closest('.channel-block');if(b)setChannelBlockCollapsed(b,!b.classList.contains('collapsed'));return;}
 const jp=e.target.closest('[data-target-anchor]');if(jp){jumpToProgram(jp.dataset.targetAnchor);return;}
 const ad=e.target.closest('.add-to-playlist-btn');if(ad)addToPlaylist(ad.dataset.programId);}
function setChannelBlockCollapsed(b,c){if(!b)return;b.classList.toggle('collapsed',c);const h=b.querySelector('.channel-header'),t=b.querySelector('.channel-toggle');if(h)h.setAttribute('aria-expanded',String(!c));if(t)t.textContent=c?'+':'−';}
function jumpToProgram(a){let el=document.getElementById(a);if(!el){state.filters={...state.filters,query:'',channel:'all'};const si=document.getElementById('program-search'),cf=document.getElementById('channel-filter');if(si)si.value='';if(cf)cf.value='all';applyFilters();el=document.getElementById(a);}
 if(!el){showToast('❌ Programme introuvable');return;}const b=el.closest('.channel-block');if(b?.classList.contains('collapsed'))setChannelBlockCollapsed(b,false);
 el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('flash-highlight');setTimeout(()=>el.classList.remove('flash-highlight'),1200);}
function applyFilters(){const q=normalizeText(state.filters.query),ch=state.filters.channel;
 const f=state.currentPrograms.filter(p=>{if(ch!=='all'&&p.channel!==ch)return false;if(!q)return true;return normalizeText([p.title,p.description,p.channel,p.time,...(p.segments||[]).map(s=>s.title)].join(' ')).includes(q);});
 const c=document.getElementById('filtered-count');if(c)c.textContent=String(f.length);renderTimeline(f);renderGroups(f);}
// ---------- tooltip ----------
function injectTooltip(){if(document.getElementById('tl-tooltip'))return;const t=document.createElement('div');t.id='tl-tooltip';t.className='tl-tooltip';t.hidden=true;document.body.appendChild(t);}
function showTlTooltip(b){const t=document.getElementById('tl-tooltip');if(!t)return;t.textContent=b.dataset.tip||b.getAttribute('title')||'';t.hidden=false;const r=b.getBoundingClientRect(),w=t.offsetWidth;let l=Math.max(8,Math.min(r.left+r.width/2-w/2,innerWidth-w-8));let top=r.top-t.offsetHeight-8;if(top<8)top=r.bottom+8;t.style.left=l+'px';t.style.top=top+'px';}
function hideTlTooltip(){const t=document.getElementById('tl-tooltip');if(t)t.hidden=true;}
// ---------- timeline ----------
function setTimelineZoom(m){if(m==='in')state.timelineZoom=Math.min(6,state.timelineZoom+.6);else if(m==='out')state.timelineZoom=Math.max(1.2,state.timelineZoom-.6);else state.timelineZoom=2.4;renderTimeline(state.timelinePrograms);}
function tlLabel(min){const h=(NIGHT_CUTOFF_HOUR+Math.floor(min/60))%24,m=min%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
function renderTimeline(ps){const c=document.getElementById('day-timeline');if(!c)return;state.timelinePrograms=ps;
 if(!ps||!ps.length){c.innerHTML=`<div class="empty-state compact"><p>Aucune frise disponible.</p></div>`;return;}
 const gs=groupProgramsByChannel(ps),ppm=state.timelineZoom,TOTAL=1440,LAB=96,W=Math.round(TOTAL*ppm),ticks=[];
 for(let m=0;m<=TOTAL;m+=120)ticks.push(m);
 const grid=ticks.map(m=>`<span class="tl-gridline" style="left:${Math.round(m*ppm)}px"></span>`).join('');
 const axis=ticks.map(m=>`<span class="tl-tick" style="left:${Math.round(m*ppm)}px">${tlLabel(m)}</span>`).join('');
 const rows=gs.map(g=>{const list=g.programs.filter(p=>timeSortKey(p.time)<9999);
  const blocks=list.map((p,i)=>{const s=timeSortKey(p.time),n=i+1<list.length?timeSortKey(list[i+1].time):TOTAL,d=Math.max(12,Math.min(TOTAL-s,n-s));
   const l=Math.round(s*ppm),w=Math.max(18,Math.round(d*ppm)),a=programAnchorId(state.selectedDate,p),tip=`${p.time||''} · ${p.title||''}`;
   return `<button type="button" class="tl-block" data-target-anchor="${escapeHtml(a)}" data-tip="${escapeHtml(tip)}" style="left:${l}px;width:${w}px;--tl-color:${channelColor(g.channel)}" title="${escapeHtml(tip)}"><span class="tl-block-time">${escapeHtml(p.time||'')}</span><span class="tl-block-title">${escapeHtml(p.title||'')}</span></button>`;}).join('');
  return `<div class="tl-row"><div class="tl-label"><span class="tl-channel-dot" style="background:${channelColor(g.channel)}"></span>${escapeHtml(g.channel)}</div><div class="tl-track" style="width:${W}px">${blocks}</div></div>`;}).join('');
 c.innerHTML=`<div class="tl-controls"><span class="tl-hint">Frise proportionnelle · 05:00 → 05:00 · survolez / touchez un bloc</span><div class="tl-zoom"><button type="button" class="tiny-btn" data-tl-zoom="out">−</button><button type="button" class="tiny-btn" data-tl-zoom="reset">100%</button><button type="button" class="tiny-btn" data-tl-zoom="in">+</button></div></div><div class="tl-scroll"><div class="tl-canvas" style="width:${W+LAB}px"><div class="tl-grid" style="left:${LAB}px;width:${W}px">${grid}</div><div class="tl-axis" style="margin-left:${LAB}px;width:${W}px">${axis}</div>${rows}</div></div>`;}
// ---------- groups / rows ----------
function renderSummary(ps,det){const c=document.getElementById('day-summary');if(!c)return;const ev=ps.filter(p=>(p.time||'')>='20:30');
 if(!ev.length){if(det)det.hidden=true;c.innerHTML='';return;}if(det)det.hidden=false;
 c.innerHTML=`<div class="summary-grid">${ev.map(p=>`<button class="summary-chip" type="button" data-target-anchor="${escapeHtml(programAnchorId(state.selectedDate,p))}"><span class="summary-time">${escapeHtml(p.time||'--:--')}</span><span class="summary-channel">${escapeHtml(p.channel||'Autres')}</span><span class="summary-title">${escapeHtml(truncateText(p.title||'Programme',55))}</span></button>`).join('')}</div>`;}
function actionButtons(id,program,date,opts={}){let h='';
 if(opts.elements>0)h+=`<button class="elements-btn" type="button" data-elements-id="${escapeHtml(id)}" title="Ajouter les ${opts.elements} œuvres de ce créneau comme lignes séparées">🧩</button>`;
 if(isChartShow(program.title))h+=`<button class="charts-btn" type="button" data-charts-url="${escapeHtml(chartsUrl(date))}" title="Top singles de la semaine">📊</button>`;
 h+=`<button class="podcast-btn" type="button" data-pod-id="${escapeHtml(id)}" title="Podcast — générique français">🎧</button>`;
 h+=`<button class="info-btn" type="button" data-info-id="${escapeHtml(id)}" title="Fiche programme">ℹ️</button><button class="video-search-btn" type="button" data-video-id="${escapeHtml(id)}" title="Vidéos">▶️</button><button class="add-to-playlist-btn" type="button" data-program-id="${escapeHtml(id)}" title="Ajouter à la playlist">➕</button>`;
 return h;}
function renderGroups(ps){const c=document.getElementById('programs-groups');if(!c)return;state.currentProgramMap.clear();
 if(!ps.length){c.innerHTML=`<div class="empty-state compact"><h3>Aucun programme trouvé</h3><p>Modifiez la recherche ou la chaîne.</p></div>`;return;}
 c.innerHTML=groupProgramsByChannel(ps).map(g=>{const col=g.programs.length>12;
  return `<section class="channel-block${col?' collapsed':''}" data-channel="${escapeHtml(g.channel)}"><button class="channel-header" type="button" aria-expanded="${!col}"><span class="channel-badge" style="--channel-color:${channelColor(g.channel)}">${escapeHtml(g.channel)}</span><span class="channel-meta">${g.programs.length} programmes</span><span class="channel-toggle">${col?'+':'−'}</span></button><div class="channel-programs">${g.programs.map(p=>renderProgramRow(p)).join('')}</div></section>`;}).join('');}
function renderProgramRow(p){const date=state.selectedDate,pid=makeProgramId(date,p.time,p.channel,'p'),anchor=programAnchorId(date,p);
 const segs=state.filters.showSegments&&Array.isArray(p.segments)?p.segments:[];
 const snap=segs.map(s=>({title:s.title||'',time:s.time||'',source:s.source||''})).filter(s=>s.title);
 const inaTimes=segs.filter(s=>s.source==='ina'&&s.time).map(s=>s.time).sort();
 const range=inaTimes.length?`${inaTimes[0]} → ${inaTimes[inaTimes.length-1]}`:'';
 const win=p.inaSlot||null;
 state.currentProgramMap.set(pid,{id:pid,date,time:p.time||'',channel:p.channel||'',title:p.title||'',description:p.description||'',parentTitle:'',type:'program',elements:snap,slot:win?slotLabel(win):''});
 const segHtml=segs.length?`<details class="segments"><summary><span class="seg-count">${segs.length} œuvre${segs.length>1?'s':''} / extrait${segs.length>1?'s':''}</span>${range?` <span class="seg-range">${escapeHtml(range)}</span>`:''}${win?` <span class="seg-slot" title="Créneau retenu : ${escapeHtml(slotLabel(win))}${win.capped?' (borne de sécurité 3 h 30)':' (jusqu’au programme suivant)'}">créneau ${escapeHtml(slotLabel(win))}</span>`:''} <button class="elements-btn inline" type="button" data-elements-id="${escapeHtml(pid)}" title="Ajouter ces œuvres à la playlist">🧩 tout ajouter</button></summary><ul class="segments-list">${segs.map(s=>{
   const sid=makeProgramId(date,p.time,p.channel,`s${s.index}`);
   state.currentProgramMap.set(sid,{id:sid,date,time:s.time||p.time||'',channel:p.channel||'',title:s.title||'',description:s.raw||'',parentTitle:p.title||'',type:s.source==='ina'?'element':'segment',elements:[],slot:win?slotLabel(win):''});
   return `<li class="segment-item"><div class="segment-content"><div class="segment-title">${s.time?`<span class="seg-time">${escapeHtml(s.time)}</span> `:''}${escapeHtml(s.title||'Extrait')}${s.source==='ina'?' <span class="seg-src">INA</span>':''}</div>${s.raw&&s.raw!==s.title?`<div class="segment-raw">${escapeHtml(s.raw)}</div>`:''}</div><div class="segment-actions">${actionButtons(sid,{title:s.title},date)}</div></li>`;}).join('')}</ul></details>`:'';
 return `<article class="program-row" id="${escapeHtml(anchor)}"><div class="program-time">${escapeHtml(p.time||'--:--')}</div><div class="program-content"><div class="program-title">${escapeHtml(p.title||'Titre inconnu')}${snap.length?` <span class="el-count" title="${escapeHtml(range||'')}">${snap.length} 🧩</span>`:''}</div>${p.description?`<p class="program-description">${escapeHtml(p.description)}</p>`:''}${segHtml}</div><div class="program-actions">${actionButtons(pid,p,date,{elements:snap.length})}</div></article>`;}
// ---------- INA : rattachement strict au créneau ----------
async function loadInaCoverage(){if(!state.ina.enabled)return;
 try{const base=document.baseURI||location.href;const r=await fetch(new URL('data/ina/coverage.json',base).href+`?t=${Date.now()}`,{cache:'no-store'});
  if(!r.ok){state.ina.enabled=false;return;}
  const j=await r.json();state.ina.cov=j;state.ina.slugByTitle.clear();
  (j.programs||[]).forEach(p=>{if(p.slug)state.ina.slugByTitle.set(normalizeText(p.program),p.slug);});
  if(state.dayOpen&&state.selectedDate){const r2=await enrichDayWithIna(state.selectedDate);if(r2&&r2.attached>0)applyFilters();}
 }catch(e){state.ina.enabled=false;}}
async function inaListings(slug){if(state.ina.cache[slug])return state.ina.cache[slug];if(state.ina.loading.has(slug))return null;
 state.ina.loading.add(slug);
 try{const base=document.baseURI||location.href;const r=await fetch(new URL(`data/ina/listings/${slug}.json`,base).href+`?t=${Date.now()}`,{cache:'no-store'});
  const j=r.ok?await r.json():{entries:[]};state.ina.cache[slug]=j;return j;}
 catch(e){state.ina.cache[slug]={entries:[]};return state.ina.cache[slug];}
 finally{state.ina.loading.delete(slug);}}
function findInaSlug(title){const n=normalizeText(title);if(!n)return'';if(state.ina.slugByTitle.has(n))return state.ina.slugByTitle.get(n);
 for(const[k,v]of state.ina.slugByTitle){if(k&&k.length>=6&&(n.includes(k)||k.includes(n)))return v;}return'';}
async function enrichDayWithIna(date){
 if(!state.ina.enabled||!date||!state.currentPrograms.length)return null;
 state.currentPrograms.forEach(p=>{if(Array.isArray(p.segments))p.segments=p.segments.filter(s=>s.source!=='ina');p.inaSlot=null;});
 const win=slotWindows(state.currentPrograms);
 const slots=[];
 state.currentPrograms.forEach(p=>{const slug=findInaSlug(p.title);const w=win.get(p);
  if(slug&&w)slots.push({p,slug,w,ch:normalizeText(p.channel||'Autres'),bucket:new Map()});});
 if(!slots.length)return null;
 const slugs=[...new Set(slots.map(s=>s.slug))];
 const lists=await Promise.all(slugs.map(inaListings));
 const bySlug={};slugs.forEach((s,i)=>{const l=lists[i];if(l)bySlug[s]=(l.entries||[]).filter(e=>e.date===date&&e.work);});
 let attached=0,rejected=0;
 slugs.forEach(slug=>{
  const group=slots.filter(s=>s.slug===slug);
  (bySlug[slug]||[]).forEach(e=>{
   const ech=e.channel?normalizeText(canonicalChannel(e.channel)):'';
   const cands=group.filter(s=>!ech||s.ch===ech);
   if(!cands.length){rejected++;return;}
   const em=timeSortKey(normalizeTime(e.start||e.start_raw||''));
   let target=null;
   if(em>=9999){
    if(cands.length===1)target=cands[0];else{rejected++;return;}
   }else{
    for(const c of cands){
     if(em>=c.w.start-SLOT_TOL_MIN&&em<c.w.end){if(!target||c.w.start>target.w.start)target=c;}
    }
    if(!target){rejected++;return;}
   }
   const key=normalizeText(e.work);if(!key)return;
   const cur=target.bucket.get(key);
   const t=normalizeTime(e.start||e.start_raw||'');
   if(!cur)target.bucket.set(key,{title:e.work,raw:e.title&&normalizeText(e.title)!==key?e.title:'',time:t});
   else{if(t&&(!cur.time||t<cur.time))cur.time=t;if(!cur.raw&&e.title&&normalizeText(e.title)!==key)cur.raw=e.title;}
  });
 });
 slots.forEach(s=>{
  const have=new Set((s.p.segments||[]).map(x=>normalizeText(x.title)));
  have.add(normalizeText(s.p.title));
  const fresh=[];
  [...s.bucket.entries()].sort((a,b)=>(a[1].time||'99:99').localeCompare(b[1].time||'99:99')||a[0].localeCompare(b[0]))
   .forEach(([k,v])=>{if(have.has(k))return;have.add(k);
    fresh.push({index:900+fresh.length,title:v.title,raw:v.raw,time:v.time||'',source:'ina'});});
  if(fresh.length){s.p.segments=[...(s.p.segments||[]),...fresh];s.p.inaSlot=s.w;attached+=fresh.length;}
  else if(s.bucket.size)s.p.inaSlot=s.w;
 });
 state.ina.stats={attached,rejected};
 return {attached,rejected};}
// ---------- podcast ----------
async function loadPodcastIndex(force=false){
 if(state.podcast.loading||(state.podcast.loaded&&!force))return state.podcast;
 state.podcast.loading=true;state.podcast.error='';updatePodcastBadge();
 try{const base=document.baseURI||location.href;const r=await fetch(new URL(PODCAST_JSON,base).href+`?t=${Date.now()}`,{cache:'no-store'});
  if(r.ok){ingestPodcast(await r.json(),'index');state.podcast.loading=false;updatePodcastBadge();return state.podcast;}
 }catch(e){}
 const proxies=[u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,u=>`https://corsproxy.io/?${encodeURIComponent(u)}`];
 for(const p of proxies){
  try{const r=await fetch(p(PODCAST_RSS),{cache:'no-store'});if(!r.ok)continue;
   const j=parseRssClient(await r.text());
   if(j.items.length){ingestPodcast(j,'flux live');state.podcast.loading=false;updatePodcastBadge();return state.podcast;}
  }catch(e){}}
 state.podcast.error="Index podcast absent. Lance le workflow 🎧 Podcast Index.";
 state.podcast.loading=false;updatePodcastBadge();return state.podcast;}
function ingestPodcast(j,source){
 const items=(j.items||[]).filter(i=>normalizeText(i.title).startsWith(PODCAST_KEEP));
 state.podcast.items=items;state.podcast.meta=j;state.podcast.source=source;state.podcast.loaded=true;
 state.podcast.byKey=new Map();
 items.forEach(i=>{if(i.family==='special')return;(i.keys||i.works||[]).forEach(k=>{const n=normalizeText(k);if(!n)return;const a=state.podcast.byKey.get(n)||[];a.push(i);state.podcast.byKey.set(n,a);});});
 updatePlaylistDisplay();}
function parseRssClient(xml){
 const doc=new DOMParser().parseFromString(xml,'text/xml');
 const chan=doc.querySelector('channel');
 const out={source:PODCAST_RSS,title:chan?.querySelector('title')?.textContent||'ANISONG',generated_at:new Date().toISOString(),refresh:'live',items:[]};
 const ns='http://www.itunes.com/dtds/podcast-1.0.dtd';
 doc.querySelectorAll('item').forEach(it=>{
  const g=t=>it.querySelector(t)?.textContent?.trim()||'';
  const gi=t=>it.getElementsByTagNameNS(ns,t)[0]?.textContent?.trim()||'';
  const title=g('title');if(!normalizeText(title).startsWith(PODCAST_KEEP))return;
  const enc=it.querySelector('enclosure'),dur=gi('duration');
  const parts=dur.split(':').map(Number);const secs=parts.some(isNaN)?0:parts.reduce((a,b)=>a*60+b,0);
  let version=1;[...title.matchAll(/\[([^\]]{1,20})\]/g)].forEach(m=>{const v=m[1].match(/^V\s*(\d+)$/i);if(v)version=+v[1];});
  const clean=title.replace(/\[[^\]]*\]/g,'').trim();
  const parens=[...clean.matchAll(/\(([^)]{2,90})\)/g)].map(m=>m[1].trim());
  const body=clean.replace(/\([^)]*\)/g,'').trim();
  const num=(body.match(/#\s*([0-9]+|SP|HS)/i)||[])[1]||'';
  const subject=(body.includes('|')?body.split('|')[1]:body.replace(/^.*?#\s*(?:[0-9]+|SP|HS)\s*/i,'')).trim().replace(/^[-–—:|\s]+|[-–—:|\s]+$/g,'');
  const special=/^(SP|HS)$/i.test(num);
  const works=special?[]:[subject,...parens].filter(Boolean);
  const keys=new Set(),nw=[];
  works.forEach(w=>{const k=normalizeText(w);if(k&&k.length>2){nw.push(k);keys.add(k);}});
  keys.add(normalizeText(title));
  let date='';try{const d=new Date(g('pubDate'));if(!isNaN(d))date=d.toISOString().slice(0,10);}catch(e){}
  out.items.push({id:g('guid')||g('link')||title,title,link:g('link'),audio:enc?.getAttribute('url')||'',
   date,duration:secs?fmtSec(secs):dur,seconds:secs,number:num.toUpperCase(),version,
   family:special?'special':'serie',subject,works:nw,persons:special?[normalizeText(subject)]:[],
   keys:[...keys],desc:(g('description')||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,900),image:''});});
 out.count=out.items.length;out.with_audio=out.items.filter(i=>i.audio).length;
 out.latest=out.items.map(i=>i.date).sort().pop()||'';
 return out;}
function podcastMatches(title){
 const n=normalizeText(title);if(!n||n.length<3)return[];
 const seen=new Set(),out=[];
 const push=a=>(a||[]).forEach(i=>{if(i.family==='special')return;if(seen.has(i.id))return;seen.add(i.id);out.push(i);});
 push(state.podcast.byKey.get(n));
 if(!out.length)for(const[k,arr]of state.podcast.byKey){if(k.length<4)continue;if(k.includes(n)||n.includes(k))push(arr);}
 out.sort((a,b)=>(b.version||1)-(a.version||1)||String(b.date).localeCompare(String(a.date)));
 return out;}
function updatePodcastBadge(){const el=document.getElementById('podcast-state');if(!el)return;
 const p=state.podcast;
 if(p.loading){el.textContent='🎧 chargement du flux…';return;}
 if(!p.loaded){el.textContent='🎧 podcast indisponible';return;}
 const age=ageDays(p.meta?.generated_at);
 el.textContent=`🎧 ${p.items.length} épisodes · ${p.byKey.size} œuvres${age!=null?` · maj ${age} j`:''} · ${p.source}`;}
function podcastCard(i){
 const playing=state.player.item&&state.player.item.id===i.id;
 return `<div class="pc-card${playing?' playing':''}">
  <div class="pc-top"><span class="pc-num">#${escapeHtml(i.number||'?')}${(i.version||1)>1?` <b class="pc-v">V${i.version}</b>`:''}</span>
   <span class="pc-work">${escapeHtml(i.subject||i.title)}</span>
   ${i.duration?`<span class="pc-dur">${escapeHtml(i.duration)}</span>`:''}</div>
  ${i.desc?`<p class="pc-desc">${escapeHtml(truncateText(i.desc,260))}</p>`:''}
  <div class="pc-actions">
   ${i.audio?`<button class="pc-play" type="button" data-pc-play="${escapeHtml(i.id)}">${playing?'⏸ Lecture':'▶ Écouter'}</button>`:`<span class="pc-noaudio">audio non publié</span>`}
   ${i.link?`<a class="pc-link" href="${escapeHtml(i.link)}" target="_blank" rel="noopener">↗ Fiche épisode</a>`:''}
   ${i.date?`<span class="pc-date">${escapeHtml(i.date)}</span>`:''}
  </div></div>`;}
async function renderPodcastInto(el,title,token){
 if(!el)return;
 el.innerHTML=`<div class="info-loading"><span class="video-inline-spinner"></span> Recherche du générique français…</div>`;
 await loadPodcastIndex();
 if(token!==infoToken)return;
 if(!state.podcast.loaded){el.innerHTML=`<div class="info-empty">${escapeHtml(state.podcast.error||'Index podcast indisponible.')} <button class="tiny-btn" type="button" data-pc-retry="1">↻ Réessayer</button></div>`;return;}
 const hits=podcastMatches(title);
 if(!hits.length){el.innerHTML=`<div class="info-empty">Aucun épisode « La Belle Histoire des Génériques Télé » pour <b>${escapeHtml(title)}</b>. <button class="tiny-btn" type="button" data-pc-refresh="1">↻ Actualiser le flux</button></div>`;return;}
 el.innerHTML=(hits.length>1?`<p class="pc-multi">${hits.length} versions disponibles — la plus récente d’abord.</p>`:'')+hits.map(podcastCard).join('');}
// ---------- player ----------
function injectPlayer(){
 if(document.getElementById('pc-player'))return;
 const bar=document.createElement('div');bar.id='pc-player';bar.className='pc-player';bar.hidden=true;
 bar.innerHTML=`<button class="pp-toggle" id="pp-toggle" type="button" aria-label="Lecture / pause">▶</button>
  <div class="pp-meta"><div class="pp-title" id="pp-title">—</div><div class="pp-sub" id="pp-sub">ANISONG</div></div>
  <input class="pp-seek" id="pp-seek" type="range" min="0" max="100" value="0" step="0.1" aria-label="Position">
  <span class="pp-time" id="pp-time">0:00</span>
  <button class="pp-back" id="pp-back" type="button" title="−15 s">−15</button>
  <button class="pp-fwd" id="pp-fwd" type="button" title="+15 s">+15</button>
  <a class="pp-link" id="pp-link" href="#" target="_blank" rel="noopener" title="Fiche épisode">↗</a>
  <button class="pp-close" id="pp-close" type="button" aria-label="Fermer le lecteur">✕</button>`;
 document.body.appendChild(bar);
 const a=document.createElement('audio');a.id='pc-audio';a.preload='none';document.body.appendChild(a);
 state.player.el=a;}
function setupPlayerListeners(){
 const a=state.player.el;if(!a)return;
 const t=document.getElementById('pp-toggle'),seek=document.getElementById('pp-seek'),time=document.getElementById('pp-time');
 t.onclick=()=>{if(a.paused)a.play().catch(()=>showToast('❌ Lecture impossible'));else a.pause();};
 document.getElementById('pp-back').onclick=()=>{a.currentTime=Math.max(0,a.currentTime-15);};
 document.getElementById('pp-fwd').onclick=()=>{a.currentTime=Math.min(a.duration||0,a.currentTime+15);};
 document.getElementById('pp-close').onclick=closePlayer;
 seek.oninput=()=>{if(a.duration)a.currentTime=a.duration*(+seek.value/100);};
 a.addEventListener('play',()=>{t.textContent='⏸';document.body.classList.add('pc-playing');refreshPodcastPlaying();});
 a.addEventListener('pause',()=>{t.textContent='▶';document.body.classList.remove('pc-playing');refreshPodcastPlaying();});
 a.addEventListener('ended',()=>{t.textContent='▶';document.body.classList.remove('pc-playing');refreshPodcastPlaying();});
 a.addEventListener('error',()=>{if(a.getAttribute('src'))showToast('❌ Flux audio illisible — ouvre la fiche épisode.');});
 a.addEventListener('timeupdate',()=>{const d=a.duration||state.player.item?.seconds||0;
  if(d){seek.value=String((a.currentTime/d)*100);time.textContent=`${fmtSec(a.currentTime)} / ${fmtSec(d)}`;}
  else time.textContent=fmtSec(a.currentTime);});
 document.addEventListener('click',e=>{
  const p=e.target.closest('[data-pc-play]');
  if(p){const it=state.podcast.items.find(x=>x.id===p.dataset.pcPlay);if(it)playPodcast(it);return;}
  if(e.target.closest('[data-pc-retry]')||e.target.closest('[data-pc-refresh]')){
   state.podcast.loaded=false;
   loadPodcastIndex(true).then(()=>{const el=document.getElementById('info-podcast');if(el)renderPodcastInto(el,document.getElementById('info-title')?.textContent||'',infoToken);});
   return;}});}
function playPodcast(item){
 const a=state.player.el;if(!a||!item.audio){showToast('❌ Pas d’audio publié pour cet épisode.');return;}
 if(state.player.item&&state.player.item.id===item.id){if(a.paused)a.play().catch(()=>{});else a.pause();refreshPodcastPlaying();return;}
 state.player.item=item;a.src=item.audio;a.load();
 document.getElementById('pp-title').textContent=item.subject||item.title;
 document.getElementById('pp-sub').textContent=`ANISONG · #${item.number||'?'}${(item.version||1)>1?` V${item.version}`:''}${item.date?' · '+item.date:''}`;
 const l=document.getElementById('pp-link');if(item.link){l.href=item.link;l.hidden=false;}else l.hidden=true;
 document.getElementById('pc-player').hidden=false;document.body.classList.add('has-player');
 a.play().catch(()=>showToast('▶ Appuie sur lecture pour démarrer.'));
 refreshPodcastPlaying();}
function closePlayer(){const a=state.player.el;if(a){a.pause();a.removeAttribute('src');a.load();}
 state.player.item=null;document.getElementById('pc-player').hidden=true;
 document.body.classList.remove('has-player','pc-playing');refreshPodcastPlaying();}
function refreshPodcastPlaying(){const id=state.player.item?.id;
 document.querySelectorAll('[data-pc-play]').forEach(b=>{
  const on=b.dataset.pcPlay===id&&!state.player.el?.paused;
  b.textContent=on?'⏸ Lecture':'▶ Écouter';
  b.closest('.pc-card')?.classList.toggle('playing',b.dataset.pcPlay===id);});}
// ---------- info panel ----------
function injectInfoUI(){
 if(!document.getElementById('info-overlay')){const o=document.createElement('div');o.id='info-overlay';o.className='info-overlay';o.hidden=true;
  o.innerHTML=`<div class="info-panel" role="dialog" aria-modal="true"><button class="info-close" type="button" onclick="closeInfoPanel()">✕</button><div class="info-header"><div class="info-icon">📖</div><h3 id="info-title"></h3><p id="info-meta" class="info-meta"></p><p id="info-slot" class="info-slot" hidden></p><p id="podcast-state" class="pc-state"></p></div><div id="info-body" class="info-body"></div><div class="info-footer"><button class="tiny-btn" type="button" onclick="openTmdbSettings()">⚙️ Clé TMDB</button><button class="tiny-btn" type="button" id="info-charts-btn" hidden>📊 Top semaine</button><button class="tiny-btn" type="button" id="info-elements-btn" hidden>🧩 Détailler</button><button class="tiny-btn" type="button" id="info-video-btn">▶️ Vidéos</button></div></div>`;
  document.body.appendChild(o);}
 if(!document.getElementById('tmdb-overlay')){const s=document.createElement('div');s.id='tmdb-overlay';s.className='info-overlay';s.hidden=true;
  s.innerHTML=`<div class="info-panel settings-panel" role="dialog" aria-modal="true"><button class="info-close" type="button" onclick="closeTmdbSettings()">✕</button><div class="info-header"><div class="info-icon">🔑</div><h3>Clé API TMDB</h3><p class="info-meta">Optionnelle — affiches & synopsis</p></div><div class="info-body"><p class="settings-help">Wikipédia et le podcast fonctionnent sans clé. TMDB ajoute affiches et synopsis ; la clé reste dans ton navigateur.</p><label class="settings-label">Clé API TMDB (v3)</label><input type="text" id="tmdb-key-input" class="settings-input" placeholder="ex : 0123456789abcdef..." autocomplete="off"><div class="settings-actions"><a class="retro-btn" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Obtenir une clé ↗</a><button class="retro-btn" type="button" onclick="saveTmdbKey()">Enregistrer</button><button class="tiny-btn" type="button" onclick="clearTmdbKey()">Effacer</button></div><div class="integrations"><div class="info-section-title">🔌 Intégrations</div><div class="integration-item"><strong>🧩 Œuvres INA</strong><span class="ok">Bornées au créneau</span><p>Chaque œuvre est rattachée au bloc dont l'heure de début précède son passage, et jamais au-delà du programme suivant. Le matin et l'après-midi ne se mélangent plus.</p></div><div class="integration-item"><strong>🎧 Podcast ANISONG</strong><span class="ok">Actif</span><p>« La Belle Histoire des Génériques Télé » uniquement — les épisodes sur les interprètes japonais sont écartés. Index actualisé chaque samedi.</p></div><div class="integration-item"><strong>📊 Charts singles</strong><span class="ok">Actif</span><p>Top 50 / Hit Machine → top de la semaine.</p></div></div></div></div>`;
  document.body.appendChild(s);}
 const nav=document.querySelector('.nav');
 if(nav&&!document.getElementById('settings-nav-btn')){const b=document.createElement('button');b.id='settings-nav-btn';b.className='nav-btn nav-gear';b.type='button';b.title='TMDB & intégrations';b.textContent='⚙️';b.addEventListener('click',openTmdbSettings);nav.appendChild(b);}}
function setupInfoListeners(){
 const io=document.getElementById('info-overlay');if(io)io.addEventListener('click',e=>{if(e.target===io)closeInfoPanel();});
 const to=document.getElementById('tmdb-overlay');if(to)to.addEventListener('click',e=>{if(e.target===to)closeTmdbSettings();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!document.getElementById('info-overlay')?.hidden)closeInfoPanel();if(!document.getElementById('tmdb-overlay')?.hidden)closeTmdbSettings();}});
 const vb=document.getElementById('info-video-btn');if(vb)vb.addEventListener('click',()=>{const id=vb.dataset.programId;closeInfoPanel();if(id)openVideoPanel(id);});
 const cb=document.getElementById('info-charts-btn');if(cb)cb.addEventListener('click',()=>{if(cb.dataset.chartsUrl)window.open(cb.dataset.chartsUrl,'_blank','noopener');});
 const eb=document.getElementById('info-elements-btn');if(eb)eb.addEventListener('click',()=>{const id=eb.dataset.programId;closeInfoPanel();if(id)addAllElements(id);});}
function infoSearchTitle(p){let t=p.type==='segment'||p.type==='element'?p.title:(p.title||'');t=String(t).replace(/\s+[-–—]\s+.*$/,'').trim();return t||p.title||'';}
function wikiMatches(s,m){if(!m)return true;const t=normalizeText((s.extract||'')+' '+(s.title||''));if(m.director){const l=normalizeText(m.director).split(' ').pop();if(l&&!t.includes(l))return false;}if(m.year&&!t.includes(m.year))return false;return true;}
async function fetchWikipediaInfo(title,meta){const tries=[title];if(meta?.director)tries.push(`${title} ${meta.director}`);if(meta?.year)tries.push(`${title} ${meta.year} film`);
 for(const q of tries){const or=await fetch(`https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=3&namespace=0&format=json&origin=*`);if(!or.ok)continue;const od=await or.json();
  for(const page of (od?.[1]||[])){const sr=await fetch(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page)}`);if(!sr.ok)continue;const s=await sr.json();if(s.type==='disambiguation')continue;
   if(wikiMatches(s,meta))return{source:'Wikipédia',title:s.title,extract:s.extract||'',thumb:s.thumbnail?.source||null,url:s.content_urls?.desktop?.page||`https://fr.wikipedia.org/wiki/${encodeURIComponent(page)}`};}}
 return null;}
async function fetchTmdbInfo(title,key,meta){const q=encodeURIComponent(title),y=meta?.year?`&year=${meta.year}`:'',py=meta?.year?`&primary_release_year=${meta.year}`:'';
 let r=await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${encodeURIComponent(key)}&language=fr-FR&query=${q}&page=1&include_adult=false${y}`);
 if(!r.ok)throw new Error('TMDB '+r.status);let d=await r.json(),item=d.results?.[0],type='tv';
 if(!item){r=await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${encodeURIComponent(key)}&language=fr-FR&query=${q}&page=1&include_adult=false${py}`);if(r.ok){d=await r.json();item=d.results?.[0];type='movie';}}
 if(!item)return null;
 return{source:'TMDB',title:item.name||item.title||title,extract:item.overview||'',thumb:item.poster_path?`https://image.tmdb.org/t/p/w342${item.poster_path}`:null,url:`https://www.themoviedb.org/${type}/${item.id}`,date:item.first_air_date||item.release_date||'',rating:item.vote_average||0};}
function infoCardHtml(d){if(!d)return `<div class="info-empty">Aucune fiche fiable trouvée.</div>`;
 return `<div class="info-card">${d.thumb?`<img class="info-thumb" src="${escapeHtml(d.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<div class="info-thumb info-thumb-empty">📺</div>`}<div class="info-card-body"><div class="info-source">${escapeHtml(d.source)}</div><h4>${escapeHtml(d.title)}</h4>${d.date?`<div class="info-date">${escapeHtml(d.date)}${d.rating?` · ★ ${d.rating.toFixed(1)}`:''}</div>`:''}${d.extract?`<p class="info-extract">${escapeHtml(d.extract)}</p>`:`<p class="info-extract muted">Pas de synopsis.</p>`}<a class="info-link" href="${escapeHtml(d.url)}" target="_blank" rel="noopener noreferrer">Ouvrir la fiche ↗</a></div></div>`;}
async function openInfoPanel(programId,focus){
 const p=state.currentProgramMap.get(programId)||state.playlist.find(x=>x.id===programId);
 if(!p){showToast('❌ Programme introuvable');return;}
 const overlay=document.getElementById('info-overlay'),body=document.getElementById('info-body');
 const tEl=document.getElementById('info-title'),mEl=document.getElementById('info-meta'),slEl=document.getElementById('info-slot');
 const vb=document.getElementById('info-video-btn'),cb=document.getElementById('info-charts-btn'),eb=document.getElementById('info-elements-btn');
 if(!overlay||!body)return;
 if(tEl)tEl.textContent=p.title||'Programme';
 const meta=[];if(p.date)meta.push(formatShortDate(p.date));if(p.time)meta.push(p.time);if(p.channel)meta.push(p.channel);if(p.parentTitle)meta.push(`dans ${p.parentTitle}`);
 if(mEl)mEl.textContent=meta.join(' · ');
 if(slEl){if(p.slot){slEl.hidden=false;slEl.textContent=`🕒 Créneau retenu : ${p.slot} — seules les œuvres de cette plage sont listées`;}else slEl.hidden=true;}
 if(vb)vb.dataset.programId=p.id;
 if(cb){if(isChartShow(p.title)){cb.hidden=false;cb.dataset.chartsUrl=chartsUrl(p.date);}else cb.hidden=true;}
 if(eb){if((p.elements||[]).length){eb.hidden=false;eb.dataset.programId=p.id;eb.textContent=`🧩 Détailler (${p.elements.length})`;}else eb.hidden=true;}
 updatePodcastBadge();
 infoToken++;const token=infoToken;const query=infoSearchTitle(p),fm=parseFilmMeta(p);
 body.innerHTML=`<div class="info-section"><div class="info-section-title">🎧 Podcast — générique français</div><div id="info-podcast"></div></div>
  <div class="info-section"><div class="info-section-title">📚 Wikipédia</div><div id="info-wiki"><div class="info-loading"><span class="video-inline-spinner"></span> Recherche…</div></div></div>
  <div class="info-section"><div class="info-section-title">🎬 TMDB</div><div id="info-tmdb">${state.tmdbKey?`<div class="info-loading"><span class="video-inline-spinner"></span> Recherche…</div>`:`<div class="info-empty">Clé TMDB non configurée. <button class="tiny-btn" type="button" onclick="openTmdbSettings()">Ajouter une clé</button></div>`}</div></div>`;
 overlay.hidden=false;document.body.style.overflow='hidden';
 renderPodcastInto(document.getElementById('info-podcast'),query,token);
 fetchWikipediaInfo(query,fm).then(d=>{if(token!==infoToken)return;const el=document.getElementById('info-wiki');if(el)el.innerHTML=infoCardHtml(d);}).catch(()=>{if(token===infoToken){const el=document.getElementById('info-wiki');if(el)el.innerHTML=`<div class="info-empty">Wikipédia indisponible.</div>`;}});
 if(state.tmdbKey)fetchTmdbInfo(query,state.tmdbKey,fm).then(d=>{if(token!==infoToken)return;const el=document.getElementById('info-tmdb');if(el)el.innerHTML=infoCardHtml(d);}).catch(()=>{if(token===infoToken){const el=document.getElementById('info-tmdb');if(el)el.innerHTML=`<div class="info-empty">TMDB indisponible (clé invalide ?).</div>`;}});
 if(focus==='podcast')setTimeout(()=>document.getElementById('info-podcast')?.scrollIntoView({behavior:'smooth',block:'center'}),140);}
function closeInfoPanel(){const o=document.getElementById('info-overlay');if(o)o.hidden=true;if(document.getElementById('tmdb-overlay')?.hidden)document.body.style.overflow='';infoToken++;}
function openTmdbSettings(){const o=document.getElementById('tmdb-overlay'),i=document.getElementById('tmdb-key-input');if(i)i.value=state.tmdbKey;if(o){o.hidden=false;document.body.style.overflow='hidden';}}
function closeTmdbSettings(){const o=document.getElementById('tmdb-overlay');if(o)o.hidden=true;if(document.getElementById('info-overlay')?.hidden)document.body.style.overflow='';}
function saveTmdbKey(){const i=document.getElementById('tmdb-key-input'),k=(i?.value||'').trim();state.tmdbKey=k;try{localStorage.setItem('retroTmdbKey',k);}catch(e){}showToast(k?'✅ Clé TMDB enregistrée':'ℹ️ Clé effacée');closeTmdbSettings();}
function clearTmdbKey(){state.tmdbKey='';try{localStorage.removeItem('retroTmdbKey');}catch(e){}const i=document.getElementById('tmdb-key-input');if(i)i.value='';showToast('🗑️ Clé TMDB effacée');}
// ---------- video ----------
function buildVideoSearchQuery(p){return String(p.title||'').trim();}
function buildVideoLinks(p){const q=buildVideoSearchQuery(p),e=encodeURIComponent(q),y=p.date?p.date.split('-')[2]:'',ey=encodeURIComponent(y?`${q} ${y}`:q);
 return[{name:'INA',icon:'🎬',className:'ina',url:`https://www.ina.fr/recherche?q=${e}`,description:'Archives TV françaises'},{name:'YouTube',icon:'▶️',className:'youtube',url:`https://www.youtube.com/results?search_query=${ey}`,description:'Vidéos et extraits'},{name:'archive.org',icon:'🏛️',className:'archive',url:`https://archive.org/search?query=${e}`,description:'Archives libres'}];}
function videoSectionHeader(n,i){return `<div class="video-inline-header"><span>${i}</span><span>${escapeHtml(n)}</span></div>`;}
function videoLoadingHtml(){return `<div class="video-inline-loading"><span class="video-inline-spinner"></span> Recherche en cours…</div>`;}
function videoFallbackHtml(m,u){return `<div class="video-inline-fallback">${escapeHtml(m)} <a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">Ouvrir la recherche ↗</a></div>`;}
function videoResultCard(it){const t=escapeHtml(it.title||'Vidéo'),u=escapeHtml(it.url||'#'),pl=escapeHtml(it.platform||'');
 const th=it.thumb?`<img class="video-result-thumb" src="${escapeHtml(it.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('video-result-thumb-empty');this.removeAttribute('src');this.textContent='📼';">`:`<div class="video-result-thumb video-result-thumb-empty">📼</div>`;
 return `<a class="video-result-card ${pl}" href="${u}" target="_blank" rel="noopener noreferrer" title="${t}">${th}<span class="video-result-title">${t}</span></a>`;}
async function loadDailymotionResults(q,c,token){if(!c)return;const su=`https://www.dailymotion.com/search/${encodeURIComponent(q)}/videos`;c.innerHTML=videoSectionHeader('Dailymotion','📺')+videoLoadingHtml();
 try{const r=await fetch(`https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&fields=id,title,thumbnail_url&limit=6`);if(token!==videoPanelToken)return;if(!r.ok)throw new Error();const d=await r.json(),l=Array.isArray(d.list)?d.list:[];
  if(!l.length){c.innerHTML=videoSectionHeader('Dailymotion','📺')+videoFallbackHtml('Aucun résultat.',su);return;}
  c.innerHTML=videoSectionHeader('Dailymotion','📺')+`<div class="video-results-grid">${l.map(v=>videoResultCard({title:v.title,thumb:v.thumbnail_url,url:`https://www.dailymotion.com/video/${v.id}`,platform:'dailymotion'})).join('')}</div>`;
 }catch(e){if(token===videoPanelToken)c.innerHTML=videoSectionHeader('Dailymotion','📺')+videoFallbackHtml('Recherche directe indisponible.',su);}}
async function loadOdyseeResults(q,c,token){if(!c)return;const su=`https://odysee.com/$/search?q=${encodeURIComponent(q)}`;c.innerHTML=videoSectionHeader('Odysee','🌐')+videoLoadingHtml();
 try{const r=await fetch('https://api.na-backend.odysee.com/api/v1/proxy',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'claim_search',params:{text:q,claim_type:['stream'],stream_types:['video'],no_totals:true,page_size:6}})});
  if(token!==videoPanelToken)return;if(!r.ok)throw new Error();const d=await r.json(),items=d?.result?.items||[];
  if(!items.length){c.innerHTML=videoSectionHeader('Odysee','🌐')+videoFallbackHtml('Aucun résultat.',su);return;}
  c.innerHTML=videoSectionHeader('Odysee','🌐')+`<div class="video-results-grid">${items.map(it=>{const v=it.value||{};let u=it.canonical_url||it.permanent_url||'';u=String(u).replace('lbry://','https://odysee.com/').replace(/#/g,':');return videoResultCard({title:v.title||it.name,thumb:v.thumbnail?.url||'',url:u||su,platform:'odysee'});}).join('')}</div>`;
 }catch(e){if(token===videoPanelToken)c.innerHTML=videoSectionHeader('Odysee','🌐')+videoFallbackHtml('Recherche directe indisponible.',su);}}
function showVideoPanel(p){const o=document.getElementById('video-panel-overlay'),t=document.getElementById('video-panel-title'),m=document.getElementById('video-panel-meta'),lc=document.getElementById('video-panel-links');if(!o||!t||!m||!lc)return;
 t.textContent=p.title||'Programme';const mp=[];if(p.date)mp.push(formatShortDate(p.date));if(p.time)mp.push(p.time);if(p.channel)mp.push(p.channel);if(p.parentTitle)mp.push(`dans ${p.parentTitle}`);m.textContent=mp.join(' · ');
 lc.innerHTML=buildVideoLinks(p).map(l=>`<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer" class="video-link ${escapeHtml(l.className)}"><span class="video-link-icon">${l.icon}</span><span class="video-link-content"><span class="video-link-name">${escapeHtml(l.name)}</span><span class="video-link-desc">${escapeHtml(l.description)}</span></span><span class="video-link-arrow">↗</span></a>`).join('');
 const panel=o.querySelector('.video-panel');let re=document.getElementById('video-panel-results');
 if(!re&&panel){re=document.createElement('div');re.id='video-panel-results';re.className='video-panel-results';const note=panel.querySelector('.video-panel-note');if(note)panel.insertBefore(re,note);else panel.appendChild(re);}
 if(re)re.innerHTML=`<div class="video-inline-section" id="video-dailymotion-section"></div><div class="video-inline-section" id="video-odysee-section"></div>`;
 const q=buildVideoSearchQuery(p);videoPanelToken++;const token=videoPanelToken;
 loadDailymotionResults(q,document.getElementById('video-dailymotion-section'),token);loadOdyseeResults(q,document.getElementById('video-odysee-section'),token);
 o.hidden=false;document.body.style.overflow='hidden';}
function openVideoPanel(id){const p=state.currentProgramMap.get(id)||state.playlist.find(x=>x.id===id);if(!p){showToast('❌ Programme introuvable');return;}showVideoPanel(p);}
function closeVideoPanel(){const o=document.getElementById('video-panel-overlay');if(o)o.hidden=true;if(document.getElementById('info-overlay')?.hidden)document.body.style.overflow='';videoPanelToken++;}
function setupVideoPanelListeners(){const o=document.getElementById('video-panel-overlay');if(o)o.addEventListener('click',e=>{if(e.target===o)closeVideoPanel();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){const p=document.getElementById('video-panel-overlay');if(p&&!p.hidden)closeVideoPanel();}});}
// ---------- search ----------
function injectSearchUI(){const nav=document.querySelector('.nav');
 if(nav&&!nav.querySelector('[data-view="search"]')){const b=document.createElement('button');b.className='nav-btn';b.type='button';b.dataset.view='search';b.textContent='🔎 Recherche';const a=nav.querySelector('[data-view="about"]');if(a)nav.insertBefore(b,a);else nav.appendChild(b);}
 const cont=document.querySelector('main.container')||document.querySelector('.container');
 if(cont&&!document.getElementById('search-view')){const s=document.createElement('section');s.id='search-view';s.className='view';
  s.innerHTML=`<div class="search-panel"><h2 class="search-title">🔎 Recherche dans les archives</h2><p class="search-subtitle">Émission, série, film, présentateur… sur toutes les années ou une période.</p><div class="search-bar"><input type="search" id="search-input" placeholder="Ex. Club Dorothée, Denver, Columbo, jeu…" autocomplete="off"></div><div class="search-filters"><label>Période<select id="search-period"><option value="all">Toute la base</option></select></label><label>Année<select id="search-year"><option value="all">Toutes</option></select></label><label>Genre<select id="search-genre"><option value="all">Tous</option></select></label><label>Chaîne<select id="search-channel"><option value="all">Toutes</option></select></label><label class="checkbox-label search-evening"><input type="checkbox" id="search-evening"> Soirée (≥18h)</label><button type="button" id="search-reset" class="tiny-btn">Réinitialiser</button></div><div class="search-sortbar"><span id="search-status" class="search-status"></span><label class="search-sort-label">Tri<select id="search-sort"><option value="count">Nombre de diffusions</option><option value="alpha">Alphabétique</option></select></label></div><div id="search-results" class="search-results"></div></div>`;
  cont.appendChild(s);}}
function setupSearchListeners(){const bind=(id,ev,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener(ev,fn);};
 bind('search-input','input',e=>{state.search.query=e.target.value;scheduleSearch();});
 bind('search-period','change',e=>{state.search.period=e.target.value;state.search.year='all';populateSearchYears();runSearch();});
 bind('search-year','change',e=>{state.search.year=e.target.value;runSearch();});
 bind('search-genre','change',e=>{state.search.genre=e.target.value;runSearch();});
 bind('search-channel','change',e=>{state.search.channel=e.target.value;runSearch();});
 bind('search-evening','change',e=>{state.search.evening=e.target.checked;runSearch();});
 bind('search-sort','change',e=>{state.search.sort=e.target.value;renderSearchResults();});
 bind('search-reset','click',resetSearch);
 const r=document.getElementById('search-results');
 if(r)r.addEventListener('click',e=>{const h=e.target.closest('.search-group-header');if(h){toggleSearchGroup(h.dataset.groupKey);return;}const c=e.target.closest('[data-search-date]');if(c)openDay(c.dataset.searchDate,c.dataset.searchTime,c.dataset.searchChannel);});}
async function ensureSearchMeta(){if(state.search.metaLoaded)return state.search.meta;
 try{const base=document.baseURI||location.href;const r=await fetch(new URL('data/search_meta.json',base).href+`?t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error();state.search.meta=await r.json();state.search.metaLoaded=true;populateSearchFilters();return state.search.meta;
 }catch(e){const s=document.getElementById('search-status');if(s)s.textContent='❌ Index de recherche indisponible. Lance generate_index_only.';return null;}}
function populateSearchFilters(){if(state.search.filtersReady)return;const m=state.search.meta;if(!m)return;
 const dec=[...new Set((m.years||[]).map(y=>Math.floor(y/10)*10))].sort((a,b)=>a-b);
 const p=document.getElementById('search-period');if(p)p.innerHTML=`<option value="all">Toute la base</option>`+dec.map(d=>`<option value="${d}">Années ${String(d).slice(2)}</option>`).join('');
 const g=document.getElementById('search-genre');if(g)g.innerHTML=`<option value="all">Tous</option>`+(m.genres||[]).filter(x=>!HIDDEN_GENRES.includes(x)).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
 const c=document.getElementById('search-channel');if(c)c.innerHTML=`<option value="all">Toutes</option>`+[...(m.channels||[])].sort((a,b)=>channelRank(a)-channelRank(b)).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
 populateSearchYears();state.search.filtersReady=true;}
function populateSearchYears(){const m=state.search.meta,y=document.getElementById('search-year');if(!m||!y)return;let ys=m.years||[];if(state.search.period!=='all'){const d=+state.search.period;ys=ys.filter(x=>Math.floor(x/10)*10===d);}
 y.innerHTML=`<option value="all">Toutes</option>`+ys.map(x=>`<option value="${x}"${String(state.search.year)===String(x)?' selected':''}>${x}</option>`).join('');}
function getSearchYears(){const m=state.search.meta;if(!m)return[];if(state.search.year!=='all')return[+state.search.year];let ys=m.years||[];if(state.search.period!=='all'){const d=+state.search.period;ys=ys.filter(x=>Math.floor(x/10)*10===d);}return ys;}
function decodeSearchRows(d,m){const ch=m.channels||[],ge=m.genres||[];return(Array.isArray(d.programs)?d.programs:[]).map(r=>({title:r[0]||'',channel:ch[r[1]]||'Autres',date:r[2]||'',time:r[3]||'',genre:ge[r[4]]||'autre',people:r[5]||'',nt:normalizeText(r[0]),np:normalizeText(r[5])}));}
async function loadSearchData(ys){const m=state.search.meta;if(!m)return;const miss=ys.filter(y=>!state.search.loadedYears.has(y));if(!miss.length)return;
 state.search.loading=true;const st=document.getElementById('search-status');let done=0;const base=document.baseURI||location.href;
 await Promise.all(miss.map(async y=>{try{const r=await fetch(new URL(`data/search/${y}.json`,base).href+`?t=${Date.now()}`,{cache:'no-store'});state.search.cache[y]=r.ok?decodeSearchRows(await r.json(),m):[];}catch(e){state.search.cache[y]=[];}finally{state.search.loadedYears.add(y);done++;if(st)st.textContent=`⏳ Chargement des archives… ${done}/${miss.length}`;}}));
 state.search.loading=false;}
function resetSearch(){state.search={...state.search,query:'',genre:'all',channel:'all',period:'all',year:'all',evening:false,expanded:new Set()};
 ['search-input','search-genre','search-channel','search-period','search-year'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=id==='search-input'?'':'all';});
 const ev=document.getElementById('search-evening');if(ev)ev.checked=false;populateSearchYears();renderSearchPrompt();}
function scheduleSearch(){if(searchDebounce)clearTimeout(searchDebounce);searchDebounce=setTimeout(runSearch,250);}
async function runSearch(){await ensureSearchMeta();if(!state.search.meta)return;
 const q=normalizeText(state.search.query),words=q?q.split(' ').filter(Boolean):[];
 const hasF=state.search.genre!=='all'||state.search.channel!=='all'||state.search.evening;
 if(!words.length&&!hasF){renderSearchPrompt();return;}
 const ys=getSearchYears();searchRunToken++;const token=searchRunToken;await loadSearchData(ys);if(token!==searchRunToken)return;
 const groups=new Map();let total=0;
 for(const y of ys)for(const row of(state.search.cache[y]||[])){
  if(state.search.genre!=='all'&&row.genre!==state.search.genre)continue;
  if(state.search.channel!=='all'&&row.channel!==state.search.channel)continue;
  if(state.search.evening){const h=row.time?+row.time.split(':')[0]:-1;if(h<18)continue;}
  if(words.length){const hay=row.nt+' '+row.np;if(!words.every(w=>hay.includes(w)))continue;}
  total++;const k=row.nt+'|'+row.channel;let g=groups.get(k);
  if(!g){g={key:k,title:row.title,channel:row.channel,genre:row.genre,occ:[],count:0};groups.set(k,g);}
  g.count++;g.occ.push({date:row.date,time:row.time});}
 const arr=[...groups.values()];
 arr.forEach(g=>g.occ.sort((a,b)=>{const x=dateSortKey(a.date),y2=dateSortKey(b.date);for(let i=0;i<3;i++)if(x[i]!==y2[i])return x[i]-y2[i];return timeSortKey(a.time)-timeSortKey(b.time);}));
 state.search.groups=arr;state.search.totalMatches=total;state.search.expanded=new Set();renderSearchResults();}
function renderSearchPrompt(){const s=document.getElementById('search-status');if(s)s.textContent='';const r=document.getElementById('search-results');if(!r)return;
 const m=state.search.meta;let sug='';
 if(m?.top_shows){const picks=m.top_shows.filter(x=>x[0]).slice(0,12);
  sug=`<div class="search-suggestions"><p>Quelques émissions populaires :</p><div class="search-suggestion-chips">${picks.map(x=>`<button type="button" class="search-suggestion-chip" data-suggest="${escapeHtml(x[0])}">${escapeHtml(x[0])}</button>`).join('')}</div></div>`;}
 r.innerHTML=`<div class="empty-state compact"><h3>Que voulez-vous retrouver ?</h3><p>Un titre d'émission, une série, un film ou un présentateur — ou un filtre genre / chaîne.</p>${sug}</div>`;
 r.querySelectorAll('[data-suggest]').forEach(b=>b.addEventListener('click',()=>{const i=document.getElementById('search-input');if(i)i.value=b.dataset.suggest;state.search.query=b.dataset.suggest;runSearch();}));}
function renderSearchResults(){const r=document.getElementById('search-results'),s=document.getElementById('search-status');if(!r)return;
 const gs=state.search.groups||[],total=state.search.totalMatches||0;
 if(!gs.length){if(s)s.textContent='';r.innerHTML=`<div class="empty-state compact"><h3>Aucun résultat</h3><p>Élargissez la période ou retirez un filtre.</p></div>`;return;}
 const sorted=[...gs].sort((a,b)=>state.search.sort==='alpha'?a.title.localeCompare(b.title):b.count-a.count);
 const MAX=200,shown=sorted.slice(0,MAX);
 if(s)s.textContent=`${total} diffusion${total>1?'s':''} · ${gs.length} émission${gs.length>1?'s':''}${gs.length>MAX?` (${MAX} affichées)`:''}`;
 r.innerHTML=shown.map(g=>{const exp=state.search.expanded.has(g.key);
  const dates=exp?`<div class="search-group-dates">${g.occ.map(o=>`<button type="button" class="search-date-chip" data-search-date="${escapeHtml(o.date)}" data-search-time="${escapeHtml(o.time)}" data-search-channel="${escapeHtml(g.channel)}"><span class="search-date-day">${escapeHtml(formatShortDate(o.date))}</span><span class="search-date-time">${escapeHtml(o.time||'--:--')}</span></button>`).join('')}</div>`:'';
  return `<div class="search-group${exp?' expanded':''}"><button type="button" class="search-group-header" data-group-key="${escapeHtml(g.key)}"><span class="search-group-title">${escapeHtml(g.title)}</span><span class="search-group-badges"><span class="search-badge-channel">${escapeHtml(g.channel)}</span><span class="search-badge-genre">${escapeHtml(g.genre)}</span><span class="search-badge-count">${g.count}</span></span><span class="search-group-toggle">${exp?'−':'+'}</span></button>${dates}</div>`;}).join('');}
function toggleSearchGroup(k){if(state.search.expanded.has(k))state.search.expanded.delete(k);else state.search.expanded.add(k);renderSearchResults();}
// ---------- suggestions ----------
function getAllDates(){const out=[];if(!state.index?.years)return out;for(const y of Object.keys(state.index.years))for(const d of Object.keys(state.index.years[y].dates||{}))out.push(d);return out;}
function detectPeriod(t){const m=t.getMonth()+1,d=t.getDate();if((m===12&&d>=15)||(m===1&&d<=5))return'noel';if(m===7||m===8)return'ete';if(m===9&&d<=20)return'rentree';return null;}
function inPeriod(ds,p){const dt=dateToDate(ds);if(!dt)return false;const m=dt.getMonth()+1,d=dt.getDate();if(p==='noel')return(m===12&&d>=15)||(m===1&&d<=5);if(p==='ete')return m===7||m===8;if(p==='rentree')return m===9&&d<=20;return false;}
function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;}
function buildSuggestions(){const all=getAllDates();if(!all.length){state.suggestions=[];return;}
 const today=new Date(),wd=today.getDay(),cy=today.getFullYear(),per=detectPeriod(today),wn=today.toLocaleDateString('fr-FR',{weekday:'long'}),pool=[];
 all.forEach(d=>{const dt=dateToDate(d);if(!dt)return;if(dt.getMonth()===today.getMonth()&&Math.abs(dt.getDate()-today.getDate())<=2){const diff=cy-dt.getFullYear();if(diff>0)pool.push({date:d,reason:`Il y a ${diff} ans`,priority:3});}});
 if(per){const lab=per==='noel'?'Esprit Noël 🎄':per==='ete'?'Vacances d’été ☀️':'Esprit rentrée 🎒';all.forEach(d=>{if(inPeriod(d,per))pool.push({date:d,reason:lab,priority:2});});}
 const spec=wd===0||wd===3||wd===6;
 all.forEach(d=>{const dt=dateToDate(d);if(!dt)return;const dw=dt.getDay();
  if(spec){if(dw===wd)pool.push({date:d,reason:`Un ${wn} comme aujourd'hui`,priority:1});}
  else if(dw>=1&&dw<=5&&dw!==3)pool.push({date:d,reason:'Un jour de semaine',priority:1});});
 const picked=[],used=new Set();
 for(const pr of[3,2,1]){for(const c of shuffle(pool.filter(p=>p.priority===pr&&!used.has(p.date)))){if(picked.length>=4)break;picked.push(c);used.add(c.date);}if(picked.length>=4)break;}
 if(picked.length<4)for(const c of shuffle(pool)){if(picked.length>=4)break;if(!used.has(c.date)){picked.push(c);used.add(c.date);}}
 state.suggestions=picked.slice(0,4);}
function renderSuggestionsHTML(){if(!state.suggestions?.length)return'';
 return `<section class="suggest-box"><div class="suggest-head"><h3>📻 Ça s'est passé…</h3><button type="button" id="reshuffle-suggestions" class="tiny-btn">🎲 Autres</button></div><div class="suggest-grid">${state.suggestions.map(s=>`<button type="button" class="suggest-card" data-open-day="${escapeHtml(s.date)}"><span class="suggest-reason">${escapeHtml(s.reason)}</span><span class="suggest-date">${escapeHtml(formatDateLabel(s.date))}</span><span class="suggest-cta">Voir la grille →</span></button>`).join('')}</div></section>`;}
// ---------- playlist ----------
function snapshotElements(p){return (p.elements||[]).map(e=>({title:e.title||'',time:e.time||'',source:e.source||''})).filter(e=>e.title);}
function addToPlaylist(id){const p=state.currentProgramMap.get(id);if(!p){showToast('❌ Programme introuvable');return;}
 if(state.playlist.some(x=>x.id===id)){showToast('⚠️ Déjà dans la playlist');return;}
 state.playlist.push({...p,elements:snapshotElements(p),addedAt:new Date().toISOString()});
 savePlaylist();updatePlaylistDisplay();
 const n=(p.elements||[]).length;
 showToast(`✅ « ${p.title} » ajouté${n?` — ${n} œuvre(s) du créneau détaillables 🧩`:''}`);}
function addAllElements(id){const p=state.currentProgramMap.get(id)||state.playlist.find(x=>x.id===id);
 if(!p){showToast('❌ Programme introuvable');return;}
 const els=snapshotElements(p);if(!els.length){showToast('ℹ️ Aucune œuvre détaillée pour ce créneau');return;}
 const base=p.id.replace(/__s\d+$/,'');const added=[];
 els.forEach((e,i)=>{const eid=`${base}__el${i}__${cssSafeId(e.title).slice(0,40)}`;
  if(state.playlist.some(x=>x.id===eid))return;
  const item={id:eid,date:p.date,time:e.time||p.time||'',channel:p.channel||'',title:e.title,description:'',parentTitle:p.title,type:'element',elements:[],slot:p.slot||'',addedAt:new Date().toISOString()};
  state.playlist.push(item);added.push(item);});
 if(!added.length){showToast('⚠️ Ces œuvres sont déjà dans la playlist');return;}
 savePlaylist();updatePlaylistDisplay();
 showToast(`🧩 ${added.length} œuvre(s) du créneau ajoutée(s)`,{label:'Annuler',fn:()=>{const ids=new Set(added.map(a=>a.id));state.playlist=state.playlist.filter(x=>!ids.has(x.id));savePlaylist();updatePlaylistDisplay();}});}
function expandPlaylistItem(id){const i=state.playlist.findIndex(x=>x.id===id);if(i<0)return;
 const p=state.playlist[i],els=snapshotElements(p);
 if(!els.length){showToast('ℹ️ Rien à détailler');return;}
 const backup=[...state.playlist];
 const kids=els.map((e,k)=>({id:`${p.id}__el${k}__${cssSafeId(e.title).slice(0,40)}`,date:p.date,time:e.time||p.time||'',channel:p.channel||'',title:e.title,description:'',parentTitle:p.title,type:'element',elements:[],slot:p.slot||'',addedAt:new Date().toISOString()}))
  .filter(k=>!state.playlist.some(x=>x.id===k.id));
 state.playlist.splice(i,1,...kids);
 savePlaylist();updatePlaylistDisplay();
 showToast(`🧩 « ${p.title} » détaillé en ${kids.length} ligne(s)`,{label:'Annuler',fn:()=>{state.playlist=backup;savePlaylist();updatePlaylistDisplay();}});}
function removeFromPlaylist(id){const backup=[...state.playlist];state.playlist=state.playlist.filter(p=>p.id!==id);savePlaylist();updatePlaylistDisplay();
 showToast('🗑️ Élément retiré',{label:'Annuler',fn:()=>{state.playlist=backup;savePlaylist();updatePlaylistDisplay();}});}
function clearPlaylist(){if(!state.playlist.length){showToast('ℹ️ Playlist vide');return;}
 if(!confirm('Vider toute la playlist ?'))return;
 const backup=[...state.playlist];state.playlist=[];savePlaylist();updatePlaylistDisplay();
 showToast('🗑️ Playlist vidée',{label:'Annuler',fn:()=>{state.playlist=backup;savePlaylist();updatePlaylistDisplay();}});}
function setupPlaylistListeners(){const c=document.getElementById('playlist-container');if(!c)return;
 c.addEventListener('click',e=>{
  const ex=e.target.closest('.pl-expand');if(ex){expandPlaylistItem(ex.dataset.expandId);return;}
  const pd=e.target.closest('.podcast-btn');if(pd){openInfoPanel(pd.dataset.podId,'podcast');return;}
  const ch=e.target.closest('.charts-btn');if(ch){window.open(ch.dataset.chartsUrl,'_blank','noopener');return;}
  const inf=e.target.closest('.info-btn');if(inf){openInfoPanel(inf.dataset.infoId);return;}
  const v=e.target.closest('.video-search-btn');if(v){openVideoPanel(v.dataset.videoId);return;}
  const r=e.target.closest('[data-remove-id]');if(r)removeFromPlaylist(r.dataset.removeId);});}
function updatePlaylistDisplay(){const c=document.getElementById('playlist-container');if(!c)return;
 const counter=document.getElementById('playlist-count');if(counter)counter.textContent=String(state.playlist.length);
 if(!state.playlist.length){c.innerHTML=`<div class="empty-playlist"><p>📭 Playlist vide</p><small>Ajoutez une émission, puis 🧩 pour la détailler œuvre par œuvre</small></div>`;updatePlaylistReturnBar();return;}
 const sorted=[...state.playlist].sort((a,b)=>{const x=dateSortKey(a.date),y=dateSortKey(b.date);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];
  const pa=a.parentTitle||a.title,pb=b.parentTitle||b.title;if(pa!==pb)return normalizeText(pa).localeCompare(normalizeText(pb));
  return timeSortKey(a.time)-timeSortKey(b.time);});
 c.innerHTML=sorted.map(p=>{
  const isEl=p.type==='element'||p.type==='segment';const n=(p.elements||[]).length;
  const pod=state.podcast.loaded?podcastMatches(p.title).length:0;
  return `<div class="playlist-item${isEl?' is-element':''}">
   <div class="playlist-item-info">
    <div class="playlist-date">📅 ${escapeHtml(formatDateLabel(p.date))}${p.channel?` · 📺 ${escapeHtml(p.channel)}`:''}${p.slot?` · 🕒 ${escapeHtml(p.slot)}`:''}</div>
    ${isEl?`<div class="pl-parent">↳ dans <b>${escapeHtml(p.parentTitle||'—')}</b></div>`:''}
    <div class="program-title">${isEl?'🎞️':'🎬'} ${escapeHtml(p.title||'Titre inconnu')}${p.time?` <span class="pl-time">${escapeHtml(p.time)}</span>`:''}${pod?` <span class="pl-pod">🎧 ${pod}</span>`:''}${n?` <span class="el-count">${n} 🧩</span>`:''}</div>
    ${p.description?`<p class="program-description">${escapeHtml(truncateText(p.description,220))}</p>`:''}
    ${n?`<div class="pl-els-preview">${escapeHtml((p.elements||[]).slice(0,6).map(e=>e.title).join(' · '))}${n>6?' …':''}</div>`:''}
   </div>
   <div class="playlist-item-actions">
    ${n?`<button class="pl-expand" type="button" data-expand-id="${escapeHtml(p.id)}" title="Détailler en ${n} lignes séparées">🧩 Détailler</button>`:''}
    <button class="podcast-btn" type="button" data-pod-id="${escapeHtml(p.id)}" title="Podcast">🎧</button>
    ${isChartShow(p.title)?`<button class="charts-btn" type="button" data-charts-url="${escapeHtml(chartsUrl(p.date))}" title="Top de la semaine">📊</button>`:''}
    <button class="info-btn" type="button" data-info-id="${escapeHtml(p.id)}" title="Fiche">ℹ️</button>
    <button class="video-search-btn" type="button" data-video-id="${escapeHtml(p.id)}" title="Vidéos">▶️</button>
    <button class="remove-btn" type="button" data-remove-id="${escapeHtml(p.id)}">✕</button>
   </div></div>`;}).join('');
 updatePlaylistReturnBar();}
function updatePlaylistReturnBar(){const b=document.getElementById('playlist-day-return'),l=document.getElementById('playlist-day-label');if(!b)return;
 if(state.dayOpen&&state.selectedDate){b.hidden=false;if(l)l.textContent=formatDateLabel(state.selectedDate);}else b.hidden=true;}
function returnToDayFromPlaylist(){setActiveView('browse');if(!reopenDayView()){if(state.selectedYear&&state.yearData)displayDates(state.selectedYear);else displayYears();}}
// ---------- export ----------
function exportPlaylist(){if(!state.playlist.length){showToast('⚠️ Playlist vide');return;}
 const es=document.getElementById('export-section'),et=document.getElementById('export-text'),ef=document.getElementById('export-format'),ep=document.getElementById('export-parent');
 if(!es||!et)return;
 const format=ef?ef.value:'title_channel_date',inc=ep?ep.checked:true;
 const sorted=[...state.playlist].sort((a,b)=>{const x=dateSortKey(a.date),y=dateSortKey(b.date);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]-y[i];return timeSortKey(a.time)-timeSortKey(b.time);});
 et.value=sorted.map(p=>formatExportLine(p,format,inc)).join('\n');
 es.style.display='block';es.scrollIntoView({behavior:'smooth'});
 showToast(`✅ ${sorted.length} ligne(s) prête(s) à copier`);}
function formatExportLine(p,format,inc){let t=p.title||'Programme inconnu';
 if((p.type==='segment'||p.type==='element')&&inc&&p.parentTitle)t=`${p.parentTitle} : ${t}`;
 const c=p.channel||'',d=formatShortDate(p.date),time=p.time||'';
 switch(format){case'title':return t;case'title_channel':return c?`${t} (${c})`:t;case'title_date':return`${t} - ${d}`;
  case'title_channel_date':return c?`${t} (${c}) - ${d}`:`${t} - ${d}`;
  case'full':return c?`${t} (${c}) - ${time} - ${d}`:`${t} - ${time} - ${d}`;
  default:return c?`${t} (${c}) - ${d}`:`${t} - ${d}`;}}
async function copyToClipboard(){const et=document.getElementById('export-text');if(!et)return;const t=et.value;if(!t){showToast('⚠️ Rien à copier');return;}
 try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(t);showToast('📋 Copié !');return;}
  et.select();et.setSelectionRange(0,t.length);showToast(document.execCommand('copy')?'📋 Copié !':'❌ Copie impossible');
 }catch(e){showToast('❌ Copie impossible');}}
// ---------- navigation / ui ----------
function setupNavigation(){document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.addEventListener('click',()=>setActiveView(b.dataset.view)));}
function setActiveView(v){document.querySelectorAll('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
 document.querySelectorAll('.view').forEach(s=>s.classList.remove('active'));
 const t=document.getElementById(`${v}-view`);if(t)t.classList.add('active');state.currentView=v;
 if(v==='browse'){if(!state.index){loadIndex({display:false}).then(ok=>{if(ok&&!reopenDayView())displayYears();});}else if(!reopenDayView()){if(state.selectedYear&&state.yearData)displayDates(state.selectedYear);else displayYears();}}
 if(v==='playlist')updatePlaylistReturnBar();
 if(v==='search')ensureSearchMeta().then(()=>{if(state.search.groups.length)renderSearchResults();else if(state.search.query||state.search.genre!=='all'||state.search.channel!=='all')runSearch();else renderSearchPrompt();});}
function showLoading(s){const l=document.getElementById('loading');if(l)l.style.display=s?'block':'none';}
function showToast(msg,action){const t=document.getElementById('toast');if(!t){console.warn(msg);return;}
 t.innerHTML=`<span>${escapeHtml(msg)}</span>`;
 if(action){const b=document.createElement('button');b.type='button';b.className='toast-undo';b.textContent=action.label;b.onclick=()=>{action.fn();t.classList.remove('show');};t.appendChild(b);}
 t.classList.add('show');if(toastTimeout)clearTimeout(toastTimeout);
 toastTimeout=setTimeout(()=>t.classList.remove('show'),action?7000:3600);}
function registerServiceWorker(){if(!('serviceWorker'in navigator))return;window.addEventListener('load',()=>{navigator.serviceWorker.register('service-worker.js').then(r=>console.log('SW:',r.scope)).catch(e=>console.log('SW échec:',e));});}
// ---------- styles ----------
function injectStyles(){if(document.getElementById('retro-plus-css'))return;
 const s=document.createElement('style');s.id='retro-plus-css';
 s.textContent=`
 .elements-btn{background:transparent;color:#6b4f8c;border:1px solid #6b4f8c;border-radius:8px;padding:.45rem .6rem;font-size:.95rem;line-height:1;cursor:pointer;transition:all .2s}
 .elements-btn:hover{background:#6b4f8c;color:#fff}
 .elements-btn.inline{font-size:.7rem;padding:.14rem .45rem;margin-left:.4rem;vertical-align:middle}
 .podcast-btn{background:transparent;color:#b3651a;border:1px solid #b3651a;border-radius:8px;padding:.45rem .6rem;font-size:.95rem;line-height:1;cursor:pointer;transition:all .2s}
 .podcast-btn:hover{background:#b3651a;color:#fff}
 .el-count{display:inline-block;font-size:.68rem;font-weight:800;background:rgba(107,79,140,.14);color:#6b4f8c;border:1px solid rgba(107,79,140,.4);border-radius:99px;padding:.05rem .45rem;vertical-align:middle}
 .segments>summary{display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;cursor:pointer}
 .seg-count{font-weight:700}
 .seg-range{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;color:#1f3a5f;font-weight:700}
 .seg-slot{font-size:.66rem;font-weight:800;letter-spacing:.03em;background:rgba(31,58,95,.1);color:#1f3a5f;border:1px solid rgba(31,58,95,.3);border-radius:99px;padding:.08rem .45rem;cursor:help}
 .seg-time{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.78rem;color:#1f3a5f;font-weight:700}
 .seg-src{font-size:.6rem;font-weight:800;letter-spacing:.06em;background:rgba(47,107,79,.14);color:#2f6b4f;border-radius:99px;padding:.05rem .35rem}
 .info-slot{margin:.35rem 0 0;font-size:.74rem;font-weight:700;color:#1f3a5f;background:rgba(31,58,95,.08);border:1px solid rgba(31,58,95,.25);border-radius:8px;padding:.3rem .5rem}
 .pc-state{margin:.3rem 0 0;font-size:.72rem;color:#b3651a;font-weight:700}
 .pc-multi{margin:0 0 .5rem;font-size:.78rem;color:#6b4f8c;font-weight:700}
 .pc-card{background:#fff;border:1px solid var(--rule,#ddd5c6);border-left:3px solid #b3651a;border-radius:10px;padding:.6rem .7rem;margin-bottom:.5rem;transition:box-shadow .2s,border-color .2s}
 .pc-card.playing{border-color:#b3651a;box-shadow:0 0 0 3px rgba(179,101,26,.14)}
 .pc-top{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
 .pc-num{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;font-weight:800;color:#b3651a}
 .pc-v{background:#b3651a;color:#fff;border-radius:99px;padding:0 .35rem;font-size:.66rem}
 .pc-work{flex:1;min-width:120px;font-weight:700;font-size:.92rem;color:var(--ink,#231d16)}
 .pc-dur{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;color:var(--muted,#7d7466)}
 .pc-desc{margin:.4rem 0 .5rem;font-size:.82rem;line-height:1.45;color:var(--ink-soft,#4c453b)}
 .pc-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
 .pc-play{font:inherit;font-size:.8rem;font-weight:800;border:0;border-radius:99px;padding:.35rem .8rem;cursor:pointer;background:linear-gradient(120deg,#b3651a,#8c2f39);color:#fff}
 .pc-play:hover{filter:brightness(1.1)}
 .pc-link{font-size:.78rem;font-weight:700;color:#1f3a5f;text-decoration:none}
 .pc-link:hover{text-decoration:underline}
 .pc-date{font-size:.72rem;color:var(--muted,#7d7466);font-family:ui-monospace,Menlo,Consolas,monospace}
 .pc-noaudio{font-size:.75rem;color:var(--muted,#7d7466);font-style:italic}
 .pc-player{position:fixed;left:0;right:0;bottom:0;z-index:95;display:flex;align-items:center;gap:.6rem;padding:.55rem clamp(.7rem,2vw,1.4rem);background:linear-gradient(120deg,#2a1f16,#3d2a1c);color:#f6efe4;border-top:2px solid #b3651a;box-shadow:0 -8px 28px rgba(0,0,0,.3)}
 .pc-player button{font:inherit;font-weight:800;border:1px solid rgba(246,239,228,.3);background:rgba(246,239,228,.08);color:#f6efe4;border-radius:8px;cursor:pointer;padding:.3rem .55rem;font-size:.78rem}
 .pc-player button:hover{background:rgba(246,239,228,.2)}
 .pp-toggle{width:38px;height:38px;border-radius:50%!important;font-size:1rem!important;flex:0 0 auto;background:#b3651a!important;border-color:#b3651a!important}
 .pp-meta{min-width:0;flex:0 1 240px}
 .pp-title{font-weight:700;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .pp-sub{font-size:.68rem;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .pp-seek{flex:1;min-width:80px;accent-color:#e8c66a;height:4px}
 .pp-time{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;opacity:.85;white-space:nowrap}
 .pp-link{color:#e8c66a;text-decoration:none;font-weight:800}
 body.has-player{padding-bottom:74px}
 body.has-player .toast{bottom:84px}
 .playlist-item.is-element{border-left:3px solid #6b4f8c}
 .pl-parent{font-size:.74rem;color:var(--muted,#7d7466);margin:.1rem 0}
 .pl-parent b{color:#6b4f8c}
 .pl-time{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.72rem;color:#1f3a5f;font-weight:700}
 .pl-pod{font-size:.66rem;font-weight:800;background:rgba(179,101,26,.14);color:#b3651a;border:1px solid rgba(179,101,26,.4);border-radius:99px;padding:.05rem .4rem}
 .pl-els-preview{margin-top:.3rem;font-size:.76rem;color:#6b4f8c;font-style:italic}
 .pl-expand{font:inherit;font-size:.75rem;font-weight:800;border:1px solid #6b4f8c;background:transparent;color:#6b4f8c;border-radius:99px;padding:.3rem .65rem;cursor:pointer;white-space:nowrap}
 .pl-expand:hover{background:#6b4f8c;color:#fff}
 .toast-undo{margin-left:.7rem;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;border-radius:6px;padding:.2rem .55rem;font:inherit;font-size:.75rem;font-weight:800;cursor:pointer}
 .toast-undo:hover{background:rgba(255,255,255,.18)}
 @media(max-width:700px){.pp-meta{flex:0 1 130px}.pp-back,.pp-fwd{display:none}.pc-player{gap:.4rem}.seg-slot{display:none}}
 `;document.head.appendChild(s);}
// ---------- globals ----------
window.selectYear=selectYear;window.selectDate=selectDate;window.selectDecade=selectDecade;
window.displayYears=displayYears;window.displayDates=displayDates;window.closeDayView=closeDayView;window.openDay=openDay;
window.returnToDayFromPlaylist=returnToDayFromPlaylist;window.addToPlaylist=addToPlaylist;window.addAllElements=addAllElements;
window.expandPlaylistItem=expandPlaylistItem;window.removeFromPlaylist=removeFromPlaylist;window.clearPlaylist=clearPlaylist;
window.exportPlaylist=exportPlaylist;window.copyToClipboard=copyToClipboard;
window.openVideoPanel=openVideoPanel;window.closeVideoPanel=closeVideoPanel;
window.openInfoPanel=openInfoPanel;window.closeInfoPanel=closeInfoPanel;
window.openTmdbSettings=openTmdbSettings;window.closeTmdbSettings=closeTmdbSettings;
window.saveTmdbKey=saveTmdbKey;window.clearTmdbKey=clearTmdbKey;window.setTimelineZoom=setTimelineZoom;