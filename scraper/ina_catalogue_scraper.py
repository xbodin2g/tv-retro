#!/usr/bin/env python3
"""
Moissonneur INA Catalogue — œuvres diffusées dans une émission.

v5 — CACHE DÉFINITIF :
  * Une notice est en cache dès que son fichier existe. La version ne déclenche
    JAMAIS de re-téléchargement (c'était le bug des runs en boucle).
  * Les notices d'ancienne version sont re-normalisées LOCALEMENT en fin de run
    (0 requête) via titles_raw/elements.
  * --refresh-stale : seul moyen de forcer le re-téléchargement des anciennes versions.
  * --diagnose : explique l'état du cache, sans rien modifier ni télécharger.
  * coverage.json distingue cached / current / outdated / orphelines / remaining.

Usage :
  python scraper/ina_catalogue_scraper.py --program "Club Dorothée" --year 1989 --max-notices 400
  python scraper/ina_catalogue_scraper.py --diagnose --program "Club Dorothée" --year 1989
  python scraper/ina_catalogue_scraper.py --report-only
"""

import argparse, json, random, re, sys, time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

BASE="https://catalogue.ina.fr"; LIST_PATH="/docListe/TV-RADIO"
PAGE_SIZE=500; PARSER_VERSION=5
IDX_DIR=Path("data/ina/index"); NOT_DIR=Path("data/ina/notices")

NOTICE_RE=re.compile(r"/doc/TV-RADIO/([A-Za-z]{1,8}_[A-Za-z0-9]+(?:\.[0-9]+)?)",re.I)
DATE_RE=re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
TIME_RE=re.compile(r"\b(\d{2}:\d{2}:\d{2})(?::\d{2})?\b")
TOTAL_RE=re.compile(r"sur\s+([\d\s\u00a0]{1,12})\b")
ITEM_RE=re.compile(r"^\s*(\d+)\.\s*(.+?)\s*$",re.M)
BULLET_RE=re.compile(r"^\s*[-–—•*·▪]\s*")
TIMECODE_LINE_RE=re.compile(r"^\s*à\s*\d{2}:\d{2}:\d{2}",re.I)
INLINE_TIME_RE=re.compile(r"\s+à\s+\d{2}:\d{2}:\d{2}.*$",re.I)
PART_SUFFIX_RE=re.compile(r"\s*:\s*\[?\s*\d+\s*(?:ere|ère|er|e|eme|ème)\s+partie\s*\]?\s*$",re.I)
BRACKET_PART_RE=re.compile(r"\s*\[\s*\d+\s*(?:ere|ère|er|e|eme|ème)\s+partie\s*\]\s*$",re.I)
DATE_SUFFIX_RE=re.compile(r"\s*:?\s*\[?\s*(?:[ée]mission|programme|diffusion)\s+(?:du|enregistr[ée]e? le)[^\]]*\]?\s*$",re.I)

KNOWN_CHANNELS=["ORTF 1","ORTF 2","ORTF 3","TF1","Antenne 2","France 2","FR3","France 3",
 "Canal+","Canal Plus","TV6","M6","La Cinq","La Sept","Arte","La Cinquième","France 5"]

EXCLUDE_PATTERNS=[r"^plateau\b",r"\bplateau\s*:",r"^animation\b",r"^pr[ée]sentation\b",
 r"interprogramme",r"publicit",r"^\s*pub\s*$",r"bande annonce",r"fin des [ée]missions",
 r"arr[êe]t des [ée]missions",r"fin des programmes",r"^m[ée]t[ée]o\b",r"tirage du loto",
 r"^tapis vert\b",r"^pr[ée]lude\b",r"^\d+\s*(?:ere|ère|eme|ème|e)\s+partie$",r"^seconde partie$",
 r"^suite$",r"^g[ée]n[ée]rique\b",r"^interm[èe]de\b",r"^annonce",r"^sommaire\b",r"^r[ée]sum[ée]\b",
 r"^teaser\b",r"^habillage\b",r"^jingle\b",r"^concours\b",r"^jeu concours\b",r"^d[ée]dicaces\b",
 r"^courrier\b",r"^indicatif\b",r"^opening\b",r"^closing\b"]

CANON_EXACT={
 "mask":"Mask","ferdy":"Ferdy","popples":"Popples","conan":"Conan","cadichon":"Cadichon",
 "nick larson":"Nick Larson","nico larson":"Nick Larson","city hunter":"City Hunter",
 "sailormoon":"Sailor Moon","sailor moon":"Sailor Moon","power rangers":"Power Rangers",
 "power rangers zeo":"Power Rangers Zeo","dragon ball z":"Dragon Ball Z","dragon ball":"Dragon Ball",
 "les minipouss":"Les Minipouss","minipouss":"Les Minipouss","jeanne et serge":"Jeanne et Serge",
 "shera":"She-Ra","he man":"He-Man","mon petit poney":"Mon petit poney","my little pony":"Mon petit poney",
 "sophie et virginie":"Sophie et Virginie","denis la malice":"Denis la Malice",
 "inspecteur gadget":"Inspecteur Gadget","lucky luke":"Lucky Luke","les schtroumpfs":"Les Schtroumpfs",
 "schtroumpfs":"Les Schtroumpfs","tom et jerry":"Tom et Jerry","titi et gros minet":"Titi et Grosminet",
 "bugs bunny":"Bugs Bunny","daffy duck":"Daffy Duck","scooby doo":"Scooby-Doo",
 "la panthere rose":"La Panthère rose","les flintstones":"Les Pierrafeu","les jetson":"Les Jetson",
 "quick et flupke":"Quick et Flupke","la pimpa":"La Pimpa","mimi cracra":"Mimi Cracra","bogus":"Bogus",
 "les fables d esope":"Les Fables d'Ésope","petit ours brun":"Petit Ours Brun","naturimages":"Naturimages",
 "les enfants des terrasses":"Les enfants des terrasses","souris noire":"Souris noire",
 "les petits malins":"Les petits malins","galaxie express 99":"Galaxie Express 99",
 "visionaries":"Visionaries","tarzan":"Tarzan","winnie l ourson":"Winnie l'ourson",
 "les gummies":"Les Gummies","les gummi":"Les Gummies","superboy":"Superboy","super boy":"Superboy",
 "rick hunter":"Rick Hunter","columbo":"Columbo","starsky et hutch":"Starsky et Hutch",
 "starsky hutch":"Starsky et Hutch","k 2000":"K 2000","k2000":"K 2000",
 "l agence tous risques":"L'Agence tous risques","droles de dames":"Drôles de dames",
 "hawai police d etat":"Hawaï, police d'État","magnum":"Magnum",
 "l homme qui tombe a pic":"L'Homme qui tombe à pic","sherlock holmes":"Sherlock Holmes",
 "les aventures de sherlock holmes":"Sherlock Holmes","emilie":"Émilie",
 "les paladins de france":"Les Paladins de France","papivole":"Papivole","discopuce":"Discopuce",
 "sido et remi":"Sido et Rémi","kaleidoscope":"Kaléidoscope","c est chouette":"C'est chouette",
 "a2000":"A2000","mes mains ont la parole":"Mes mains ont la parole",
 "la caverne d abracadabra":"La Caverne d'Abracadabra","l ile aux enfants":"L'Île aux enfants",
 "casimir":"Casimir","les animaux du monde":"Les Animaux du monde","albator":"Albator",
 "goldorak":"Goldorak","capitaine flam":"Capitaine Flam","candy":"Candy","heidi":"Heidi",
 "vic le viking":"Vic le Viking","maya l abeille":"Maya l'abeille","calimero":"Caliméro",
 "ulysse 31":"Ulysse 31","tom sawyer":"Tom Sawyer",
}
CANON_RULES=[
 (re.compile(r"^les?\s+bisounours$"),"Les Bisounours"),(re.compile(r"^bisounours$"),"Les Bisounours"),
 (re.compile(r"^les\s+chevaliers\s+du\s+zodiaque?s?$"),"Les Chevaliers du Zodiaque"),
 (re.compile(r"^les\s+amichain(?:e|ê)s?$"),"Les Amichaînes"),
 (re.compile(r"^la\s+croisi[èe]re\s+foll?\s*amour$"),"La Croisière Foll'Amour"),
 (re.compile(r"^les\s+ann[ée]es\s+fac$"),"Les Années fac"),
 (re.compile(r"^premiers\s+baisers$"),"Premiers baisers"),
 (re.compile(r"^salut\s+les\s+muscl[ée]s$"),"Salut les Musclés"),
 (re.compile(r"^cadichon.*$"),"Cadichon"),(re.compile(r"^b[ée]c[ée]\s*b[ée]g[ée]$"),"Bécébégé"),
 (re.compile(r"^tico\s+et\s+ses\s+amis$"),"Tico et ses amis"),
 (re.compile(r"^l\s*[ée]cole\s+des\s+champions$"),"L'école des champions"),
 (re.compile(r"^les\s+quat\s*z\s*amis$"),"Les Quat'z Amis"),
 (re.compile(r"^la\s+caverne\s+d\s*abracadabra$"),"La Caverne d'Abracadabra"),
 (re.compile(r"^r[ée]cr[ée]\s*a\s*2.*$"),"Récré A2"),
 (re.compile(r"^le\s+college\s+fou\s*fou\s*fou$"),"Le Collège fou fou fou"),
 (re.compile(r"^juliette\s+je\s+t\s+aime$"),"Juliette je t'aime"),
]
HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
 "Accept-Language":"fr-FR,fr;q=0.9,en;q=0.7","Connection":"keep-alive","Upgrade-Insecure-Requests":"1"}


def norm(v:str)->str:
    t=str(v or "").strip().lower()
    for a,b in (("é","e"),("è","e"),("ê","e"),("ë","e"),("à","a"),("â","a"),("ä","a"),("ù","u"),
                ("û","u"),("ü","u"),("ô","o"),("ö","o"),("î","i"),("ï","i"),("ì","i"),("ç","c"),("ñ","n")):
        t=t.replace(a,b)
    t=re.sub(r"['’]"," ",t)
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9\s]"," ",t)).strip()
def compact(v:str)->str: return re.sub(r"\s+","",norm(v))
def slugify(v:str)->str: return re.sub(r"[^a-z0-9]+","-",norm(v)).strip("-") or "programme"
def canon_title(t:str)->str:
    k=norm(t)
    if not k: return t
    if k in CANON_EXACT: return CANON_EXACT[k]
    for rx,c in CANON_RULES:
        if rx.match(k): return c
    return t
def clean_title(raw:str)->str:
    t=BULLET_RE.sub("",str(raw or "").strip())
    t=INLINE_TIME_RE.sub("",t); t=DATE_SUFFIX_RE.sub("",t)
    t=PART_SUFFIX_RE.sub("",t); t=BRACKET_PART_RE.sub("",t)
    if t.startswith("[") and t.endswith("]"): t=t[1:-1].strip()
    t=re.sub(r"\s+"," ",t).strip(" .;:-–—")
    p=t.split(":",1)
    if len(p)==2 and p[0].strip() and norm(p[0])==norm(p[1]): t=p[0].strip()
    return PART_SUFFIX_RE.sub("",t).strip(" .;:-–—")
def is_useful(t:str,pn:str,pc:str)->bool:
    if not t or len(t)<3 or len(t)>140: return False
    low=t.lower()
    for p in EXCLUDE_PATTERNS:
        if re.search(p,low): return False
    k=norm(t)
    return bool(k) and k!=pn and compact(t)!=pc and not re.fullmatch(r"[\d\s]+",t)
def build_elements(raw:List[str],program:str)->List[str]:
    pn,pc=norm(program),compact(program); out=[]; seen=set()
    for r in raw:
        t=canon_title(clean_title(r))
        if not is_useful(t,pn,pc): continue
        k=norm(t)
        if k in seen: continue
        seen.add(k); out.append(t)
    return out
def ensure_dir(p:Path)->None: p.mkdir(parents=True,exist_ok=True)
def write_json(p:Path,d:Any)->None:
    ensure_dir(p.parent)
    with open(p,"w",encoding="utf-8") as f: json.dump(d,f,ensure_ascii=False,indent=2)
def read_json(p:Path)->Optional[Any]:
    try:
        with open(p,"r",encoding="utf-8") as f: return json.load(f)
    except Exception: return None


class InaClient:
    def __init__(self,delay:float=3.0):
        self.delay=delay; self.session=requests.Session(); self.session.headers.update(HEADERS)
        self._cs=None; self._n=0
    def _pause(self):
        time.sleep(random.uniform(self.delay*.8,self.delay*1.4)); self._n+=1
        if self._n%40==0:
            e=random.uniform(15.,30.); print(f"  ⏸️ Pause longue ({e:.0f}s) après {self._n} requêtes"); time.sleep(e)
    def get(self,url:str,max_retries:int=4)->Optional[str]:
        err=None
        for a in range(max_retries):
            self._pause()
            try:
                r=self.session.get(url,timeout=40)
                if r.status_code==404: return None
                if r.status_code in (403,429,503):
                    err=f"HTTP {r.status_code}"; w=random.uniform(10.,20.)*(a+1)
                    print(f"  ⚠️ {err} — attente {w:.0f}s"); time.sleep(w)
                    if a>=1 and self._cs is None:
                        try:
                            import cloudscraper
                            self._cs=cloudscraper.create_scraper(); self._cs.headers.update(HEADERS)
                        except Exception: self._cs=False
                    continue
                r.raise_for_status(); return r.text
            except Exception as ex:
                err=str(ex)
                if a<max_retries-1: time.sleep(random.uniform(6.,12.)*(a+1))
        if self._cs and self._cs is not False:
            try:
                self._pause(); r=self._cs.get(url,timeout=40)
                if r.status_code==200: return r.text
            except Exception as ex: err=str(ex)
        print(f"  ❌ Échec définitif {url} : {err}"); return None


def build_year_url(program:str,year:Optional[int],variant:int)->str:
    p={"sujets_filter":"Sujet","bool_operator":"AND","nbLignes":str(PAGE_SIZE)}
    if variant==0: p["tiprog"]=program; p["ti"]=str(year) if year else program
    elif variant==1:
        p["tiprog"]=f'"{program}"'
        if year: p["ti"]=str(year)
    elif variant==2: p["ti"]=f"{program} {year}" if year else program
    else:
        p["base_label"]="TVNAT"; p["tiprog"]=program; p["ti"]=str(year) if year else program
    return f"{BASE}{LIST_PATH}?{urlencode(p)}"
def declared_total(soup)->Optional[int]:
    m=TOTAL_RE.search(re.sub(r"\s+"," ",soup.get_text(" ",strip=True)))
    if not m: return None
    d=re.sub(r"[^\d]","",m.group(1)); return int(d) if d else None
def parse_list_rows(html:str,program:str,sub:bool)->Tuple[List[Dict],Optional[int]]:
    soup=BeautifulSoup(html,"html.parser"); pn,pc=norm(program),compact(program)
    rows=[]; seen=set()
    for a in soup.find_all("a",href=True):
        m=NOTICE_RE.search(a["href"])
        if not m: continue
        nid=m.group(1).upper()
        if nid in seen: continue
        label=a.get_text(" ",strip=True)
        if not sub and pc and pn not in norm(label) and pc not in compact(label): continue
        tr=a.find_parent("tr")
        cells=[c.get_text(" ",strip=True) for c in tr.find_all("td")] if tr else []
        blob=" | ".join(cells) if cells else label
        dm=DATE_RE.search(blob)
        if not dm: continue
        times=TIME_RE.findall(blob); ch=""
        for c in KNOWN_CHANNELS:
            if re.search(rf"\b{re.escape(c)}\b",blob,re.I): ch=c; break
        seen.add(nid)
        rows.append({"notice_id":nid,"url":urljoin(BASE,a["href"]),"channel":ch,
                     "date":f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}","start":times[0] if times else ""})
    return rows,declared_total(soup)
def harvest_year(client,program,year,sub)->List[Dict]:
    lab=str(year) if year else "global"
    for v in range(4):
        html=client.get(build_year_url(program,year,v))
        if not html: continue
        rows,total=parse_list_rows(html,program,sub)
        if rows:
            msg=f"  📅 {lab} : {len(rows)} notices mères"
            if total is not None:
                msg+=f" (annoncés : {total})"
                if total>PAGE_SIZE: msg+=" ⚠️ TRONQUÉ"
            print(msg); return rows
        if total==0: print(f"  📅 {lab} : 0"); return []
    print(f"  📅 {lab} : aucune notice mère liée"); return []
def harvest_index(client,program,year,y0,y1,sub)->List[Dict]:
    acc={}
    def absorb(rows):
        for r in rows: acc.setdefault(r["notice_id"],r)
    if year: absorb(harvest_year(client,program,year,sub))
    else:
        for y in range(y0,y1+1): absorb(harvest_year(client,program,y,sub))
        absorb(harvest_year(client,program,None,sub))
    return sorted(acc.values(),key=lambda r:(r["date"].split("-")[2],r["date"].split("-")[1],r["date"].split("-")[0],r["start"]))


def parse_notice(html:str,nid:str,url:str,program:str)->Dict:
    soup=BeautifulSoup(html,"html.parser"); fields={}
    for tr in soup.find_all("tr"):
        cells=tr.find_all(["td","th"])
        if len(cells)!=2: continue
        lab=cells[0].get_text(" ",strip=True).rstrip(":").strip()
        if not lab or len(lab)>60: continue
        for br in cells[1].find_all("br"): br.replace_with("\n")
        val="\n".join(l.strip() for l in cells[1].get_text("\n",strip=False).split("\n") if l.strip())
        if val: fields[lab]=val
    def field(*names):
        for n in names:
            for k,v in fields.items():
                if norm(k)==norm(n): return v
        return ""
    ds=""; dm=DATE_RE.search(field("Date de diffusion"))
    if dm: ds=f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}"
    sm=TIME_RE.search(field("Heure de diffusion"))
    prog=field("Titre programme") or program
    content=field("Sommaire"); src="Sommaire"
    if not content:
        content=field("Résumé documentaire","Resume documentaire","Résumé","Resume"); src="Résumé documentaire"
    raw=[]
    if content:
        for line in content.split("\n"):
            if TIMECODE_LINE_RE.match(line): continue
            it=ITEM_RE.match(line)
            r=(it.group(2) if it else BULLET_RE.sub("",line)).strip()
            if r: raw.append(r)
    return {"notice_id":nid,"url":url,"source":"ina","parser_version":PARSER_VERSION,
            "scraped_at":datetime.now().isoformat(),"program_query":program,"programme":prog,
            "base":field("Base"),"channel":field("Chaîne de diffusion","Chaine de diffusion"),
            "date":ds,"start":sm.group(1)[:5] if sm else "",
            "elements_field":src if raw else "","titles_raw":raw,"elements":build_elements(raw,prog)}


def normalize_cache(program:Optional[str]=None,verbose:bool=True)->int:
    """Re-normalisation LOCALE (0 requête). Met à jour parser_version."""
    if not NOT_DIR.exists(): return 0
    changed=total=0
    for p in sorted(NOT_DIR.glob("*.json")):
        n=read_json(p)
        if not n: continue
        if program and norm(n.get("program_query",""))!=norm(program): continue
        total+=1
        src=n.get("titles_raw") or n.get("elements") or []
        els=build_elements(src,n.get("programme") or n.get("program_query") or "")
        if els!=n.get("elements") or n.get("parser_version")!=PARSER_VERSION or "titles_raw" not in n:
            n["elements"]=els; n.setdefault("titles_raw",src)
            n["parser_version"]=PARSER_VERSION; n["normalized_at"]=datetime.now().isoformat()
            write_json(p,n); changed+=1
    if verbose: print(f"🧹 Re-normalisation locale (0 requête) : {changed}/{total} notices")
    return changed


# =====================================================
# Couverture — le cache = présence du fichier, pas la version
# =====================================================
KEYS=("indexed","cached","current","outdated","with_elements","empty","remaining","elements","days")

def load_notices()->Dict[str,Dict]:
    out={}
    if not NOT_DIR.exists(): return out
    for p in NOT_DIR.glob("*.json"):
        n=read_json(p)
        if not n: continue
        out[(n.get("notice_id") or p.stem).upper()]={
            "els":len(n.get("elements") or []),"v":n.get("parser_version",0),
            "date":n.get("date",""),"slug":slugify(n.get("program_query") or n.get("programme") or ""),
            "program":n.get("program_query") or n.get("programme") or ""}
    return out

def build_coverage()->Dict:
    notices=load_notices(); programs=[]; indexed_ids=set()
    for p in sorted(IDX_DIR.glob("*.json")) if IDX_DIR.exists() else []:
        idx=read_json(p) or {}
        program=idx.get("program") or p.stem; slug=idx.get("slug") or slugify(program)
        by={}
        for r in idx.get("notices") or []:
            parts=(r.get("date") or "").split("-")
            if len(parts)!=3: continue
            nid=(r.get("notice_id") or "").upper(); indexed_ids.add(nid)
            e=by.setdefault(parts[2],{"year":int(parts[2]),**{k:0 for k in KEYS},"_days":set(),"_sample":[]})
            e["indexed"]+=1
            n=notices.get(nid)
            if n:                                   # ← fichier présent = EN CACHE
                e["cached"]+=1
                if n["v"]==PARSER_VERSION: e["current"]+=1
                else: e["outdated"]+=1
                if n["els"]:
                    e["with_elements"]+=1; e["elements"]+=n["els"]; e["_days"].add(r.get("date"))
                else: e["empty"]+=1
            else:
                e["remaining"]+=1
                if len(e["_sample"])<12: e["_sample"].append(nid)
        years=[]
        for y in sorted(by):
            e=by[y]; e["days"]=len(e.pop("_days")); e["sample"]=e.pop("_sample")
            e["coverage"]=round(100*e["cached"]/e["indexed"],1) if e["indexed"] else 0.0
            years.append(e)
        tot={k:sum(e[k] for e in years) for k in KEYS}
        tot["coverage"]=round(100*tot["cached"]/tot["indexed"],1) if tot["indexed"] else 0.0
        programs.append({"program":program,"slug":slug,"harvested_at":idx.get("harvested_at",""),
                         "years":years,"totals":tot})
    orph={}
    for nid,n in notices.items():
        if nid in indexed_ids: continue
        k=n["slug"] or "inconnu"
        o=orph.setdefault(k,{"slug":k,"program":n["program"] or k,"count":0,"with_elements":0,"years":{}})
        o["count"]+=1
        if n["els"]: o["with_elements"]+=1
        y=(n["date"] or "").split("-")[-1]
        if y.isdigit(): o["years"][y]=o["years"].get(y,0)+1
    orphans=sorted(orph.values(),key=lambda x:-x["count"])
    grand={k:sum(p["totals"][k] for p in programs) for k in KEYS}
    grand["coverage"]=round(100*grand["cached"]/grand["indexed"],1) if grand["indexed"] else 0.0
    queue=sorted([{"program":p["program"],"year":e["year"],"remaining":e["remaining"]}
                  for p in programs for e in p["years"] if e["remaining"]>0],key=lambda x:-x["remaining"])
    advice=[]
    if grand["outdated"]: advice.append(f"{grand['outdated']} notice(s) d'ancienne version : elles sont DÉJÀ en cache. Un rebuild local suffit (0 requête).")
    if orphans: advice.append(f"{sum(o['count'] for o in orphans)} notice(s) en cache hors index : lance index-only pour les rattacher.")
    return {"generated_at":datetime.now().isoformat(),"parser_version":PARSER_VERSION,
            "programs":programs,"orphans":orphans,"totals":grand,"queue":queue,
            "health":{"outdated":grand["outdated"],"orphans":sum(o["count"] for o in orphans),"advice":advice}}

def write_coverage(cov:Dict)->None:
    write_json(Path("data/ina/coverage.json"),cov)
    g=cov["totals"]
    L=["# 🏛️ Couverture de la moisson INA","",
       f"_Généré le {cov['generated_at'][:19].replace('T',' à ')} — parser v{cov['parser_version']}_","",
       "> **En cache = le fichier de la notice existe.** La version ne force jamais de re-téléchargement ;",
       "> les notices d'ancienne version sont re-normalisées localement (0 requête).","",
       "## Total","",
       f"- Indexées : **{g['indexed']}** · En cache : **{g['cached']}** ({g['coverage']} %)",
       f"- Version courante : {g['current']} · à re-normaliser : {g['outdated']}",
       f"- Avec œuvres : **{g['with_elements']}** · sans œuvre : {g['empty']}",
       f"- Œuvres relevées : **{g['elements']}** · jours couverts : {g['days']}",
       f"- **Reste à télécharger : {g['remaining']}**","",
       "## Par émission","",
       "| Émission | Indexées | Cache | Œuvrées | Reste | % |","|---|---:|---:|---:|---:|---:|"]
    for p in sorted(cov["programs"],key=lambda x:-x["totals"]["remaining"]):
        t=p["totals"]
        L.append(f"| {p['program']} | {t['indexed']} | {t['cached']} | {t['with_elements']} | {t['remaining']} | {t['coverage']} % |")
    L+=["","## Détail par année",""]
    for p in sorted(cov["programs"],key=lambda x:x["program"].lower()):
        L+=[f"### {p['program']}","",
            "| Année | Indexées | Cache | v courante | Ancienne | Œuvrées | Sans œuvre | Reste | Œuvres | Jours |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
        for e in p["years"]:
            L.append(f"| {e['year']} | {e['indexed']} | {e['cached']} | {e['current']} | {e['outdated']} | {e['with_elements']} | {e['empty']} | {e['remaining']} | {e['elements']} | {e['days']} |")
        L.append("")
    if cov["orphans"]:
        L+=["## Notices en cache hors index","","| Programme | Notices | Œuvrées |","|---|---:|---:|"]
        for o in cov["orphans"]: L.append(f"| {o['program']} | {o['count']} | {o['with_elements']} |")
        L.append("")
    if cov["queue"]:
        L+=["## Prochains runs conseillés","","| Émission | Année | Reste | Runs à 400 |","|---|---|---:|---:|"]
        for q in cov["queue"][:25]: L.append(f"| {q['program']} | {q['year']} | {q['remaining']} | {(q['remaining']+399)//400} |")
    Path("data/ina/COVERAGE.md").write_text("\n".join(L)+"\n",encoding="utf-8")

def print_coverage(cov:Dict,program:Optional[str]=None)->None:
    print("\n"+"="*84); print("📊 COUVERTURE (cache = fichier présent)"); print("="*84)
    rows=[p for p in cov["programs"] if not program or norm(p["program"])==norm(program)]
    print(f"{'Émission':<32}{'Index':>7}{'Cache':>7}{'v.ok':>7}{'ancien':>7}{'Œuvr':>7}{'Reste':>7}{'%':>7}")
    print("-"*84)
    for p in sorted(rows,key=lambda x:-x["totals"]["remaining"]):
        t=p["totals"]
        print(f"{p['program'][:31]:<32}{t['indexed']:>7}{t['cached']:>7}{t['current']:>7}{t['outdated']:>7}{t['with_elements']:>7}{t['remaining']:>7}{t['coverage']:>6.1f}%")
    print("-"*84); g=cov["totals"]
    print(f"{'TOTAL':<32}{g['indexed']:>7}{g['cached']:>7}{g['current']:>7}{g['outdated']:>7}{g['with_elements']:>7}{g['remaining']:>7}{g['coverage']:>6.1f}%")
    for a in cov["health"]["advice"]: print("💡 "+a)
    if cov["queue"]:
        q=cov["queue"][0]; print(f"\n▶️ Priorité : --program \"{q['program']}\" --year {q['year']} (reste {q['remaining']})")
    print("📄 data/ina/COVERAGE.md · coverage.json · tableau de bord : ina/")

def diagnose(program:Optional[str],year:Optional[int])->None:
    print("="*84); print("🔬 DIAGNOSTIC (lecture seule, 0 requête)"); print("="*84)
    notices=load_notices()
    print(f"Fichiers notices sur disque : {len(notices)}")
    vers={}
    for n in notices.values(): vers[n["v"]]=vers.get(n["v"],0)+1
    for v in sorted(vers): print(f"  parser_version {v or 'absente'} : {vers[v]}")
    print(f"Version courante attendue : {PARSER_VERSION}")
    if not IDX_DIR.exists(): print("❌ Aucun dossier index."); return
    for p in sorted(IDX_DIR.glob("*.json")):
        idx=read_json(p) or {}
        prog=idx.get("program") or p.stem
        if program and norm(prog)!=norm(program): continue
        rows=idx.get("notices") or []
        by={}
        for r in rows:
            y=(r.get("date") or "").split("-")[-1]
            if not y.isdigit(): continue
            if year and int(y)!=year: continue
            e=by.setdefault(y,{"idx":0,"file":0,"cur":0,"old":0,"els":0,"miss":[]})
            e["idx"]+=1
            n=notices.get((r.get("notice_id") or "").upper())
            if n:
                e["file"]+=1
                if n["v"]==PARSER_VERSION: e["cur"]+=1
                else: e["old"]+=1
                if n["els"]: e["els"]+=1
            elif len(e["miss"])<5: e["miss"].append(r.get("notice_id"))
        print(f"\n▶ {prog} — {len(rows)} notices dans l'index")
        if not by: print("   (aucune notice pour ce filtre)"); continue
        print(f"   {'Année':<8}{'Index':>7}{'Fichier':>9}{'v.ok':>7}{'ancien':>8}{'Œuvr':>7}{'Manque':>8}")
        for y in sorted(by):
            e=by[y]
            print(f"   {y:<8}{e['idx']:>7}{e['file']:>9}{e['cur']:>7}{e['old']:>8}{e['els']:>7}{e['idx']-e['file']:>8}")
            if e["miss"]: print(f"      exemples manquants : {', '.join(e['miss'])}")
    print("\n💡 Un fichier présent = en cache, quelle que soit sa version. Rien n'est retéléchargé par défaut.")


def run(args)->None:
    if args.diagnose: diagnose(args.program,args.year); return
    if args.report_only:
        cov=build_coverage(); write_coverage(cov); print_coverage(cov,args.program); return
    if args.rebuild:
        normalize_cache(args.program); cov=build_coverage(); write_coverage(cov); print_coverage(cov,args.program); return
    if not args.program:
        print("❌ --program requis (sauf --report-only / --rebuild / --diagnose)"); sys.exit(1)

    program=args.program; slug=slugify(program)
    index_path=IDX_DIR/f"{slug}.json"; ensure_dir(NOT_DIR)
    client=InaClient(delay=args.delay)
    print("="*84); print(f"🏛️ INA — {program}"+(f" · {args.year}" if args.year else f" · {args.year_start}-{args.year_end}")); print("="*84)

    if args.notices_only:
        cached=read_json(index_path)
        if not cached: print(f"❌ Index absent : {index_path}"); sys.exit(1)
        rows=cached.get("notices",[]); print(f"📂 Index en cache : {len(rows)} notices")
    else:
        rows=harvest_index(client,program,args.year,args.year_start,args.year_end,args.include_subnotices)
        prev=read_json(index_path) or {}
        merged={r["notice_id"]:r for r in prev.get("notices",[])}
        for r in rows: merged[r["notice_id"]]=r
        rows=sorted(merged.values(),key=lambda r:(r["date"].split("-")[2],r["date"].split("-")[1],r["date"].split("-")[0],r["start"]))
        write_json(index_path,{"program":program,"slug":slug,"harvested_at":datetime.now().isoformat(),"count":len(rows),"notices":rows})
        print(f"✅ Index : {index_path} ({len(rows)} notices cumulées)")

    if args.index_only or not rows:
        normalize_cache(None,verbose=False)
        cov=build_coverage(); write_coverage(cov); print_coverage(cov,program); return

    if args.year:
        rows=[r for r in rows if r["date"].endswith(f"-{args.year}")]
        print(f"🎯 Année {args.year} : {len(rows)} notices indexées")

    pending=[]; cached_n=old_n=empty_n=missing_n=0
    for r in rows:
        ex=read_json(NOT_DIR/f"{r['notice_id']}.json")
        if ex is None:
            missing_n+=1; pending.append(r); continue
        v=ex.get("parser_version",0)
        if v!=PARSER_VERSION: old_n+=1
        has=bool(ex.get("elements"))
        if not has: empty_n+=1
        need=args.force or (args.refresh_stale and v!=PARSER_VERSION) or (args.retry_empty and not has)
        if need: pending.append(r)
        else: cached_n+=1

    total_pending=len(pending)
    print(f"♻️ En cache (fichier présent) : {cached_n+old_n+empty_n if False else len(rows)-missing_n} "
          f"· dont ancienne version : {old_n} · sans œuvre : {empty_n}")
    print(f"📥 Absentes du disque : {missing_n}")
    print(f"📋 File d'attente : {total_pending}")
    if args.max_notices>0: pending=pending[:args.max_notices]
    print(f"▶️ Ce run : {len(pending)} · resteront {total_pending-len(pending)} après ce run")
    if not pending:
        print("✅ Rien à télécharger : tout est déjà en cache.")
        normalize_cache(None); cov=build_coverage(); write_coverage(cov); print_coverage(cov,program); return
    print(f"   (délai ~{args.delay}s)\n")

    ok=withe=els=fails=0
    for i,r in enumerate(pending,1):
        nid=r["notice_id"]
        print(f"[{i}/{len(pending)}] {nid} · {r['date']} {r['start'][:5]} ...",end=" ",flush=True)
        html=client.get(r["url"])
        if not html:
            fails+=1; print("✗")
            if fails>=8: print("\n🛑 Trop d'échecs — arrêt propre."); break
            continue
        try: n=parse_notice(html,nid,r["url"],program)
        except Exception as ex: fails+=1; print(f"✗ parsing: {ex}"); continue
        n["date"]=n.get("date") or r["date"]; n["channel"]=n.get("channel") or r["channel"]
        n["start"]=n.get("start") or r["start"][:5]
        write_json(NOT_DIR/f"{nid}.json",n); ok+=1; fails=0
        c=len(n["elements"])
        if c: withe+=1; els+=c; print(f"✓ {c} [{n['elements_field']}] — {' · '.join(n['elements'][:4])}")
        else: print("✓ parsée, sans œuvre (mise en cache)")

    normalize_cache(None)
    cov=build_coverage(); write_coverage(cov)
    print("\n"+"="*84); print("🎉 RUN TERMINÉ"); print("="*84)
    print(f"Téléchargées : {ok} · avec œuvres : {withe} · œuvres : {els}")
    left=[q for q in cov["queue"] if norm(q["program"])==norm(program) and (not args.year or q["year"]==args.year)]
    if left:
        q=left[0]
        print(f"\n⏭️ Reste {q['remaining']} notices pour {program} {q['year']}.")
        print("   Relance la même commande : les fichiers présents seront sautés, la file avancera.")
    else:
        print(f"\n✅ Périmètre complet pour {program}"+(f" {args.year}" if args.year else "")+".")
    print_coverage(cov,program)


def main()->None:
    p=argparse.ArgumentParser(description="Moissonneur INA — œuvres diffusées")
    p.add_argument("--program"); p.add_argument("--year",type=int)
    p.add_argument("--year-start",type=int,default=1970); p.add_argument("--year-end",type=int,default=1999)
    p.add_argument("--max-notices",type=int,default=400); p.add_argument("--max-pages",type=int,default=20)
    p.add_argument("--index-only",action="store_true"); p.add_argument("--notices-only",action="store_true")
    p.add_argument("--include-subnotices",action="store_true"); p.add_argument("--force",action="store_true")
    p.add_argument("--retry-empty",action="store_true"); p.add_argument("--refresh-stale",action="store_true")
    p.add_argument("--report-only",action="store_true"); p.add_argument("--rebuild",action="store_true")
    p.add_argument("--diagnose",action="store_true"); p.add_argument("--delay",type=float,default=3.0)
    run(p.parse_args())

if __name__=="__main__": main()