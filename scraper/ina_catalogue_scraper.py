#!/usr/bin/env python3
"""
Moissonneur INA Catalogue — double stratégie de recherche.

Pour CHAQUE émission, deux méthodes sont tentées et leurs résultats fusionnés :
  A) LEGACY  : tiprog + ti=<année>            (l'ancienne, fragile selon les notices)
  B) CHANNEL : ch=<chaîne> + tiprog, sans ti  (moins de critères, bien plus large)
  C) HYBRID  : ch + tiprog + ti=<année>       (resserrage si >500 résultats)
  D) LOOSE   : tiprog seul, sans ch ni ti     (filet de sécurité)

La méthode B récupère Samdynamite (FR3) là où A ne renvoyait rien.
Pagination auto-détectée, taille de page auto-sondée.

Cache = présence du fichier notice. La version ne force jamais de re-téléchargement.

Usage :
  python scraper/ina_catalogue_scraper.py --program "Samdynamite" --channel FR3 --year 1989
  python scraper/ina_catalogue_scraper.py --program "Club Dorothée" --strategies both
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
PARSER_VERSION=5
ROOT=Path("data/ina"); IDX_DIR=ROOT/"index"; NOT_DIR=ROOT/"notices"; TARGETS=ROOT/"targets.json"

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

CH_VARIANTS={
 "fr3":["FR3","France 3"],"france 3":["France 3","FR3"],
 "antenne 2":["Antenne 2","France 2"],"france 2":["France 2","Antenne 2"],
 "tf1":["TF1"],"m6":["M6"],"tv6":["TV6","M6"],
 "canal+":["Canal+","Canal Plus"],"canal plus":["Canal+","Canal Plus"],
 "la cinq":["La Cinq","La 5"],"la 5":["La Cinq","La 5"],
 "la sept":["La Sept","Arte"],"arte":["Arte","La Sept"],
 "la cinquième":["La Cinquième","La Cinquieme"],"la cinquieme":["La Cinquième","La Cinquieme"],
 "france 5":["France 5","La Cinquième"],
 "ortf 1":["ORTF 1","1ère chaîne"],"ortf 2":["ORTF 2","2ème chaîne"],"ortf 3":["ORTF 3","3ème chaîne"],
}
PAGE_PARAM_CANDIDATES=["page","rang","debut","début","start","offset","premier","numPage","pageCourante","from","indice"]

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
 "ulysse 31":"Ulysse 31","tom sawyer":"Tom Sawyer"}
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
 (re.compile(r"^sam\s*dynamite$"),"Samdynamite"),
 (re.compile(r"^le\s+college\s+fou\s*fou\s*fou$"),"Le Collège fou fou fou"),
 (re.compile(r"^juliette\s+je\s+t\s+aime$"),"Juliette je t'aime")]
HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
 "Accept-Language":"fr-FR,fr;q=0.9,en;q=0.7","Connection":"keep-alive","Upgrade-Insecure-Requests":"1"}

DEFAULT_TARGETS=[
 ("Club Dorothée","TF1",1987,1997,1),("Récré A2","Antenne 2",1978,1987,1),("Amuse 3","FR3",1985,1997,1),
 ("Cabou Cadin","Canal+",1985,1993,2),("Vitamine","TF1",1983,1987,2),
 ("Youpi ! L'école est finie","La Cinq",1987,1992,2),("Les Visiteurs du mercredi","TF1",1975,1983,2),
 ("Croque-Vacances","TF1",1981,1987,3),("Le Village dans les nuages","TF1",1982,1986,3),
 ("Le réveil des babalous","FR3",1986,1991,3),("Discopuce","Antenne 2",1978,1987,3),
 ("Giga","Antenne 2",1987,1996,2),("Ça cartoon","Canal+",1986,1999,2),
 ("Canaille Peluche","Canal+",1986,1993,3),("Décode pas Bunny","Canal+",1990,1996,3),
 ("Le Disney Channel","FR3",1988,1996,2),("Debout les enfants","FR3",1987,1994,3),
 ("Samdynamite","FR3",1987,1993,2),("Télétaz","FR3",1988,1993,3),
 ("Les Minikeums","France 3",1993,1999,2),("Disney Parade","TF1",1989,1998,3),
 ("Disney Club","TF1",1990,1996,3),("Club Mini","TF1",1990,1996,4),("À tout Spip","TF1",1993,1996,4),
 ("TF! Jeunesse","TF1",1997,1999,3),("Télévisator 2","France 2",1993,1995,4),
 ("Chalu Maureen","France 2",1994,1996,4),("Graffi'6","M6",1987,1991,3),("M6 Kid","M6",1990,1999,3),
 ("Multitop","M6",1987,1996,3),("Salut les Musclés","TF1",1987,1997,4),
 ("Premiers baisers","TF1",1991,1997,4),("Les années fac","TF1",1995,1998,4),
 ("Cellulo","La Cinquième",1995,1999,4)]


def norm(v:str)->str:
    t=str(v or "").strip().lower()
    for a,b in (("é","e"),("è","e"),("ê","e"),("ë","e"),("à","a"),("â","a"),("ä","a"),("ù","u"),
                ("û","u"),("ü","u"),("ô","o"),("ö","o"),("î","i"),("ï","i"),("ì","i"),("ç","c"),("ñ","n")):
        t=t.replace(a,b)
    t=re.sub(r"['’]"," ",t)
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9\s]"," ",t)).strip()
def compact(v:str)->str: return re.sub(r"\s+","",norm(v))
def slugify(v:str)->str: return re.sub(r"[^a-z0-9]+","-",norm(v)).strip("-") or "programme"
def channel_variants(ch:str)->List[str]:
    if not ch: return []
    return CH_VARIANTS.get(norm(ch),[ch])
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


def load_targets()->Dict:
    t=read_json(TARGETS)
    if isinstance(t,dict) and t.get("programs"): return t
    return {"version":1,"updated_at":datetime.now().isoformat(),
            "note":"Registre des cibles de moisson INA. La chaîne pilote la recherche par canal.",
            "programs":[{"program":p,"slug":slugify(p),"channel":c,"from":a,"to":b,"priority":pr}
                        for p,c,a,b,pr in DEFAULT_TARGETS]}
def save_targets(t:Dict)->None:
    t["updated_at"]=datetime.now().isoformat()
    for p in t["programs"]: p.setdefault("slug",slugify(p["program"]))
    write_json(TARGETS,t)
def target_of(program:str)->Dict:
    t=load_targets(); slug=slugify(program)
    for p in t["programs"]:
        if (p.get("slug") or slugify(p["program"]))==slug: return p
    return {}
def register_target(program:str,rows:List[Dict],channel:str="")->None:
    t=load_targets(); slug=slugify(program)
    years=[int(r["date"].split("-")[2]) for r in rows if r.get("date")]
    ch=channel or next((r.get("channel") for r in rows if r.get("channel")),"")
    for p in t["programs"]:
        if (p.get("slug") or slugify(p["program"]))==slug:
            if not p.get("channel") and ch: p["channel"]=ch; save_targets(t); print(f"🎯 Chaîne renseignée : {program} → {ch}")
            return
    a,b=(min(years),max(years)) if years else (1970,1999)
    t["programs"].append({"program":program,"slug":slug,"channel":ch,"from":a,"to":b,"priority":3})
    save_targets(t); print(f"🎯 Cible ajoutée : {program} ({a}→{b}) {ch}")


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


# =====================================================
# Requêtes : les 4 méthodes
# =====================================================
def q_legacy(program:str,year:Optional[int],variant:int,nb:int)->str:
    p={"sujets_filter":"Sujet","bool_operator":"AND","nbLignes":str(nb)}
    if variant!=3: p["base_label"]="TVNAT"
    if variant==0: p["tiprog"]=program; p["ti"]=str(year) if year else program
    elif variant==1:
        p["tiprog"]=f'"{program}"'
        if year: p["ti"]=str(year)
    elif variant==2: p["ti"]=f"{program} {year}" if year else program
    else: p["tiprog"]=program; p["ti"]=str(year) if year else program
    return f"{BASE}{LIST_PATH}?{urlencode(p)}"

def q_channel(program:str,ch:str,year:Optional[int],variant:int,nb:int)->str:
    p={"base_label":"TVNAT","sujets_filter":"Sujet","ch":ch,
       "tiprog":program if variant==0 else f'"{program}"',
       "bool_operator":"AND","tri":"score1","nbLignes":str(nb)}
    if year: p["ti"]=str(year)
    return f"{BASE}{LIST_PATH}/?{urlencode(p)}"

def q_loose(program:str,year:Optional[int],nb:int)->str:
    p={"sujets_filter":"Sujet","tiprog":program,"bool_operator":"AND","tri":"score1","nbLignes":str(nb)}
    if year: p["ti"]=str(year)
    return f"{BASE}{LIST_PATH}/?{urlencode(p)}"


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


_PROBE:Dict[str,Any]={"nb":None,"page_param":None,"probed":False}

def probe_page_size(client:InaClient,program:str,ch:str)->int:
    if _PROBE["nb"]: return _PROBE["nb"]
    for nb in (2000,1000,500):
        url=q_channel(program,ch,None,0,nb) if ch else q_loose(program,None,nb)
        html=client.get(url)
        if not html: continue
        rows,total=parse_list_rows(html,program,True)
        if rows:
            got=len(rows)
            print(f"  🔬 Sonde taille de page : nbLignes={nb} → {got} ligne(s) lues"
                  + (f" / {total} annoncées" if total else ""))
            if total is None or got>=total or got>=nb:
                _PROBE["nb"]=nb; return nb
    _PROBE["nb"]=500; return 500

def probe_page_param(client:InaClient,base_url:str,first_ids:set)->Optional[str]:
    if _PROBE["probed"]: return _PROBE["page_param"]
    _PROBE["probed"]=True
    print("  🔬 Sonde du paramètre de pagination…")
    for param in PAGE_PARAM_CANDIDATES:
        sep="&" if "?" in base_url else "?"
        val="2" if param.lower() in ("page","numpage","pagecourante") else "501"
        html=client.get(f"{base_url}{sep}{param}={val}")
        if not html: continue
        rows,_=parse_list_rows(html,"",True)
        ids={r["notice_id"] for r in rows}
        if ids and not ids.issubset(first_ids):
            _PROBE["page_param"]=param
            print(f"     ✓ pagination via « {param} »")
            return param
    print("     ✗ aucun paramètre de pagination trouvé — repli sur le découpage par année")
    return None


def fetch_query(client:InaClient,url:str,program:str,sub:bool,label:str,
                log:List[Dict],paginate:bool=True)->List[Dict]:
    html=client.get(url)
    if not html:
        log.append({"method":label,"url":url,"found":0,"total":None,"note":"échec HTTP"}); return []
    rows,total=parse_list_rows(html,program,sub)
    note=""
    if rows and total and len(rows)<total and paginate:
        param=probe_page_param(client,url,{r["notice_id"] for r in rows})
        if param:
            acc={r["notice_id"]:r for r in rows}
            page=2; guard=0
            while len(acc)<total and guard<40:
                guard+=1
                val=str(page) if param.lower() in ("page","numpage","pagecourante") else str((page-1)*len(rows)+1)
                sep="&" if "?" in url else "?"
                h=client.get(f"{url}{sep}{param}={val}")
                if not h: break
                rr,_=parse_list_rows(h,program,sub)
                if not rr: break
                before=len(acc)
                for r in rr: acc.setdefault(r["notice_id"],r)
                if len(acc)==before: break
                page+=1
            rows=list(acc.values()); note=f"paginé via {param}"
        else: note="TRONQUÉ"
    elif rows and total and len(rows)>=total: note="complet"
    log.append({"method":label,"url":url,"found":len(rows),"total":total,"note":note})
    mark="✓" if rows else "·"
    print(f"  {mark} [{label}] {len(rows)} notice(s)"
          + (f" / {total}" if total else "") + (f" — {note}" if note else ""))
    return rows


def harvest_index(client:InaClient,program:str,channel:str,year:Optional[int],
                  y0:int,y1:int,sub:bool,strategies:str)->Tuple[List[Dict],List[Dict]]:
    acc:Dict[str,Dict]={}; log:List[Dict]=[]
    def absorb(rows):
        n=0
        for r in rows:
            if r["notice_id"] not in acc: acc[r["notice_id"]]=r; n+=1
        return n
    chans=channel_variants(channel)
    nb=probe_page_size(client,program,chans[0] if chans else "")

    want_channel=strategies in ("both","channel","hybrid")
    want_legacy=strategies in ("both","legacy")
    want_hybrid=strategies in ("both","hybrid")

    # ---- B) CHANNEL : moins de critères, sans ti ----
    if want_channel and chans:
        print(f"\n── Méthode B · canal + tiprog (sans ti) — {', '.join(chans)}")
        for ch in chans:
            for variant in (0,1):
                rows=fetch_query(client,q_channel(program,ch,None,variant,nb),program,sub,
                                 f"B/ch={ch}{'/quotes' if variant else ''}",log)
                absorb(rows)
                if rows: break
            if acc: break
    elif want_channel and not chans:
        print("\n── Méthode B ignorée : aucune chaîne renseignée pour cette émission")

    # ---- D) LOOSE : tiprog seul ----
    if not acc:
        print("\n── Méthode D · tiprog seul (filet de sécurité)")
        absorb(fetch_query(client,q_loose(program,None,nb),program,sub,"D/loose",log))

    # ---- A) LEGACY : tiprog + ti ----
    if want_legacy:
        print("\n── Méthode A · tiprog + ti (ancienne)")
        if year:
            for variant in range(4):
                rows=fetch_query(client,q_legacy(program,year,variant,nb),program,sub,
                                 f"A/{year}/v{variant}",log)
                if absorb(rows): break
        else:
            for variant in range(4):
                rows=fetch_query(client,q_legacy(program,None,variant,nb),program,sub,
                                 f"A/global/v{variant}",log)
                if absorb(rows): break
            covered={int(r["date"].split("-")[2]) for r in acc.values() if r.get("date")}
            gaps=[y for y in range(y0,y1+1) if y not in covered]
            if gaps:
                print(f"   années non couvertes par A/global : {len(gaps)} → sonde par année")
                for y in gaps:
                    for variant in (0,2):
                        rows=fetch_query(client,q_legacy(program,y,variant,nb),program,sub,
                                         f"A/{y}/v{variant}",log)
                        if absorb(rows): break

    # ---- C) HYBRID : ch + tiprog + ti, pour les années manquantes ----
    if want_hybrid and chans:
        target_years=[year] if year else list(range(y0,y1+1))
        covered={int(r["date"].split("-")[2]) for r in acc.values() if r.get("date")}
        gaps=[y for y in target_years if y not in covered]
        if gaps:
            print(f"\n── Méthode C · canal + tiprog + ti — {len(gaps)} année(s) à resserrer")
            for y in gaps:
                for ch in chans:
                    rows=fetch_query(client,q_channel(program,ch,y,0,nb),program,sub,
                                     f"C/{ch}/{y}",log)
                    if absorb(rows): break

    rows=sorted(acc.values(),key=lambda r:(r["date"].split("-")[2],r["date"].split("-")[1],r["date"].split("-")[0],r["start"]))
    return rows,log


# =====================================================
# Notice
# =====================================================
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
# Couverture
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
    notices=load_notices(); targets=load_targets(); indexed_ids=set(); raw={}
    for p in sorted(IDX_DIR.glob("*.json")) if IDX_DIR.exists() else []:
        idx=read_json(p) or {}
        program=idx.get("program") or p.stem; slug=idx.get("slug") or slugify(program)
        by={}
        for r in idx.get("notices") or []:
            parts=(r.get("date") or "").split("-")
            if len(parts)!=3: continue
            nid=(r.get("notice_id") or "").upper(); indexed_ids.add(nid)
            e=by.setdefault(int(parts[2]),{"year":int(parts[2]),**{k:0 for k in KEYS},"_days":set(),"_sample":[]})
            e["indexed"]+=1
            n=notices.get(nid)
            if n:
                e["cached"]+=1
                if n["v"]==PARSER_VERSION: e["current"]+=1
                else: e["outdated"]+=1
                if n["els"]: e["with_elements"]+=1; e["elements"]+=n["els"]; e["_days"].add(r.get("date"))
                else: e["empty"]+=1
            else:
                e["remaining"]+=1
                if len(e["_sample"])<12: e["_sample"].append(nid)
        for y,e in by.items():
            e["days"]=len(e.pop("_days")); e["sample"]=e.pop("_sample")
            e["coverage"]=round(100*e["cached"]/e["indexed"],1) if e["indexed"] else 0.0
        raw[slug]={"program":program,"years":by,"harvested_at":idx.get("harvested_at",""),
                   "channel_query":idx.get("channel",""),"methods":idx.get("discovery",[])}

    known=[e["indexed"] for r in raw.values() for e in r["years"].values() if e["indexed"]]
    global_avg=int(sum(known)/len(known)) if known else 150
    programs=[]; used=set()
    for t in targets["programs"]:
        slug=t.get("slug") or slugify(t["program"]); used.add(slug)
        r=raw.get(slug,{"program":t["program"],"years":{},"methods":[],"channel_query":""})
        ky=[e["indexed"] for e in r["years"].values() if e["indexed"]]
        avg=int(sum(ky)/len(ky)) if ky else global_avg
        years=[]
        lo,hi=int(t.get("from",1970)),int(t.get("to",1999))
        for y in range(lo,hi+1):
            if y in r["years"]: years.append(dict(r["years"][y],virgin=False,estimate=0))
            else: years.append({"year":y,**{k:0 for k in KEYS},"coverage":0.0,"sample":[],"virgin":True,"estimate":avg})
        for y,e in r["years"].items():
            if not (lo<=y<=hi): years.append(dict(e,virgin=False,estimate=0))
        years.sort(key=lambda e:e["year"])
        tot={k:sum(e[k] for e in years) for k in KEYS}
        tot["coverage"]=round(100*tot["cached"]/tot["indexed"],1) if tot["indexed"] else 0.0
        tot["virgin"]=sum(1 for e in years if e.get("virgin"))
        tot["estimate"]=sum(e.get("estimate",0) for e in years)
        methods=sorted({m["method"].split("/")[0] for m in r.get("methods",[]) if m.get("found")})
        programs.append({"program":t["program"],"slug":slug,"channel":t.get("channel",""),
                         "priority":t.get("priority",9),"from":t.get("from"),"to":t.get("to"),
                         "harvested_at":r.get("harvested_at",""),"methods":methods,
                         "discovery":r.get("methods",[]),"years":years,"totals":tot})
    for slug,r in raw.items():
        if slug in used: continue
        years=[dict(e,virgin=False,estimate=0) for _,e in sorted(r["years"].items())]
        tot={k:sum(e[k] for e in years) for k in KEYS}
        tot["coverage"]=round(100*tot["cached"]/tot["indexed"],1) if tot["indexed"] else 0.0
        tot["virgin"]=0; tot["estimate"]=0
        programs.append({"program":r["program"],"slug":slug,"channel":r.get("channel_query",""),
                         "priority":9,"from":None,"to":None,"years":years,"totals":tot,
                         "methods":sorted({m["method"].split("/")[0] for m in r.get("methods",[]) if m.get("found")}),
                         "discovery":r.get("methods",[])})

    orph={}
    for nid,n in notices.items():
        if nid in indexed_ids: continue
        k=n["slug"] or "inconnu"
        o=orph.setdefault(k,{"slug":k,"program":n["program"] or k,"count":0,"with_elements":0})
        o["count"]+=1
        if n["els"]: o["with_elements"]+=1
    orphans=sorted(orph.values(),key=lambda x:-x["count"])
    grand={k:sum(p["totals"][k] for p in programs) for k in KEYS}
    grand["coverage"]=round(100*grand["cached"]/grand["indexed"],1) if grand["indexed"] else 0.0
    grand["virgin"]=sum(p["totals"]["virgin"] for p in programs)
    grand["estimate"]=sum(p["totals"]["estimate"] for p in programs)
    queue=sorted([{"program":p["program"],"year":e["year"],"remaining":e["remaining"],"virgin":False}
                  for p in programs for e in p["years"] if not e.get("virgin") and e["remaining"]>0],
                 key=lambda x:-x["remaining"])
    frontier=sorted([{"program":p["program"],"year":e["year"],"remaining":e["estimate"] or global_avg,
                      "virgin":True,"priority":p["priority"]}
                     for p in programs for e in p["years"] if e.get("virgin")],
                    key=lambda x:(x["priority"],x["year"]))
    advice=[]
    if grand["virgin"]: advice.append(f"{grand['virgin']} couple(s) jamais indexés — volume estimé {grand['estimate']} notices.")
    if grand["outdated"]: advice.append(f"{grand['outdated']} notice(s) d'ancienne version : déjà en cache, re-normalisation locale automatique.")
    if orphans: advice.append(f"{sum(o['count'] for o in orphans)} notice(s) en cache hors index : lance index-only pour les rattacher.")
    noch=[p["program"] for p in programs if not p.get("channel")]
    if noch: advice.append(f"{len(noch)} émission(s) sans chaîne renseignée : la méthode B (canal) est désactivée pour elles. Renseigne la chaîne dans 🎯 Cibles.")
    return {"generated_at":datetime.now().isoformat(),"parser_version":PARSER_VERSION,
            "global_avg":global_avg,"programs":programs,"orphans":orphans,"totals":grand,
            "queue":queue,"frontier":frontier,
            "health":{"outdated":grand["outdated"],"virgin":grand["virgin"],
                      "orphans":sum(o['count'] for o in orphans),"advice":advice}}

def write_coverage(cov:Dict)->None:
    write_json(ROOT/"coverage.json",cov); g=cov["totals"]
    L=["# 🏛️ Couverture de la moisson INA","",
       f"_Généré le {cov['generated_at'][:19].replace('T',' à ')} — parser v{cov['parser_version']}_","",
       "> Deux méthodes de recherche sont fusionnées : **A** `tiprog+ti` (ancienne) et **B** `ch+tiprog` (sans ti).",
       "> **C** `ch+tiprog+ti` resserre les années manquantes, **D** `tiprog` seul sert de filet.",
       "> En cache = le fichier notice existe. `?` = jamais indexé, volume estimé.","",
       "## Total","",
       f"- Jamais indexés : **{g['virgin']}** (≈ {g['estimate']} notices)",
       f"- Indexées : **{g['indexed']}** · En cache : **{g['cached']}** ({g['coverage']} %)",
       f"- Avec œuvres : **{g['with_elements']}** · sans œuvre : {g['empty']}",
       f"- Œuvres : **{g['elements']}** · reste connu : **{g['remaining']}**","",
       "## Par émission","",
       "| Émission | Chaîne | Plage | Méthodes | Jamais indexé | Indexées | Cache | Œuvrées | Reste | % |",
       "|---|---|---|---|---:|---:|---:|---:|---:|---:|"]
    for p in sorted(cov["programs"],key=lambda x:(x["priority"],x["program"].lower())):
        t=p["totals"]; pl=f"{p.get('from') or '?'}→{p.get('to') or '?'}"
        L.append(f"| {p['program']} | {p.get('channel') or '—'} | {pl} | {','.join(p.get('methods') or []) or '—'} | {t['virgin']} | {t['indexed']} | {t['cached']} | {t['with_elements']} | {t['remaining']} | {t['coverage']} % |")
    L+=["","## Détail par année",""]
    for p in sorted(cov["programs"],key=lambda x:x["program"].lower()):
        L+=[f"### {p['program']}"+(f" · {p['channel']}" if p.get("channel") else ""),"",
            "| Année | État | Indexées | Cache | Œuvrées | Reste | Estimation |","|---|---|---:|---:|---:|---:|---:|"]
        for e in p["years"]:
            stt="jamais indexé" if e.get("virgin") else ("complet" if e["remaining"]==0 else "en cours")
            L.append(f"| {e['year']} | {stt} | {e['indexed']} | {e['cached']} | {e['with_elements']} | {e['remaining']} | {e.get('estimate',0) or '—'} |")
        if p.get("discovery"):
            L+=["","<details><summary>Requêtes tentées</summary>","",
                "| Méthode | Trouvées | Annoncées | Note |","|---|---:|---:|---|"]
            for m in p["discovery"]:
                L.append(f"| `{m['method']}` | {m['found']} | {m['total'] if m['total'] is not None else '—'} | {m.get('note','')} |")
            L+=["","</details>"]
        L.append("")
    if cov["frontier"]:
        L+=["## Démarrages conseillés","","| Émission | Année | Volume estimé |","|---|---|---:|"]
        for q in cov["frontier"][:30]: L.append(f"| {q['program']} | {q['year']} | {q['remaining']} |")
    if cov["queue"]:
        L+=["","## Complétions conseillées","","| Émission | Année | Reste | Runs à 400 |","|---|---|---:|---:|"]
        for q in cov["queue"][:30]: L.append(f"| {q['program']} | {q['year']} | {q['remaining']} | {(q['remaining']+399)//400} |")
    (ROOT/"COVERAGE.md").write_text("\n".join(L)+"\n",encoding="utf-8")

def print_coverage(cov:Dict,program:Optional[str]=None)->None:
    print("\n"+"="*100); print("📊 COUVERTURE — méthodes A (tiprog+ti) + B (ch+tiprog) fusionnées"); print("="*100)
    rows=[p for p in cov["programs"] if not program or norm(p["program"])==norm(program)]
    print(f"{'Émission':<30}{'Chaîne':<13}{'Méth.':>7}{'Vierge':>8}{'Index':>7}{'Cache':>7}{'Œuvr':>7}{'Reste':>7}{'%':>7}")
    print("-"*100)
    for p in sorted(rows,key=lambda x:(x["priority"],-x["totals"]["remaining"])):
        t=p["totals"]
        print(f"{p['program'][:29]:<30}{(p.get('channel') or '—')[:12]:<13}{','.join(p.get('methods') or []) or '—':>7}"
              f"{t['virgin']:>8}{t['indexed']:>7}{t['cached']:>7}{t['with_elements']:>7}{t['remaining']:>7}{t['coverage']:>6.1f}%")
    print("-"*100); g=cov["totals"]
    print(f"{'TOTAL':<30}{'':<13}{'':>7}{g['virgin']:>8}{g['indexed']:>7}{g['cached']:>7}{g['with_elements']:>7}{g['remaining']:>7}{g['coverage']:>6.1f}%")
    for a in cov["health"]["advice"]: print("💡 "+a)
    if cov["frontier"]:
        q=cov["frontier"][0]; print(f"\n🌱 Démarrer : --program \"{q['program']}\" --year {q['year']} (≈{q['remaining']})")
    if cov["queue"]:
        q=cov["queue"][0]; print(f"⚡ Compléter : --program \"{q['program']}\" --year {q['year']} (reste {q['remaining']})")
    print("📄 data/ina/COVERAGE.md · coverage.json · targets.json · tableau de bord : ina/")

def diagnose(program:Optional[str],year:Optional[int])->None:
    print("="*100); print("🔬 DIAGNOSTIC (lecture seule, 0 requête)"); print("="*100)
    notices=load_notices(); print(f"Fichiers notices : {len(notices)}")
    vers={}
    for n in notices.values(): vers[n["v"]]=vers.get(n["v"],0)+1
    for v in sorted(vers): print(f"  parser_version {v or 'absente'} : {vers[v]}")
    t=load_targets()
    for p in t["programs"]:
        if program and norm(p["program"])!=norm(program): continue
        idx=read_json(IDX_DIR/f"{p.get('slug') or slugify(p['program'])}.json") or {}
        rows=idx.get("notices") or []
        print(f"\n▶ {p['program']} · chaîne « {p.get('channel') or 'NON RENSEIGNÉE'} » · {p['from']}→{p['to']} · {len(rows)} indexées")
        for m in idx.get("discovery",[]):
            print(f"   [{m['method']}] {m['found']} trouvées"
                  + (f" / {m['total']}" if m.get('total') else "") + (f" — {m['note']}" if m.get('note') else ""))
        yrs={}
        for r in rows:
            y=(r.get("date") or "").split("-")[-1]
            if not y.isdigit(): continue
            if year and int(y)!=year: continue
            e=yrs.setdefault(int(y),{"i":0,"f":0}); e["i"]+=1
            if (r.get("notice_id") or "").upper() in notices: e["f"]+=1
        virgin=[y for y in range(p["from"],p["to"]+1) if y not in yrs and (not year or y==year)]
        print(f"   jamais indexées : {', '.join(map(str,virgin)) if virgin else 'aucune'}")
        for y in sorted(yrs): print(f"   {y} : {yrs[y]['f']}/{yrs[y]['i']} en cache")
    print("\n💡 Sans chaîne renseignée, la méthode B est inactive : renseigne-la dans 🎯 Cibles.")


def run(args)->None:
    if args.diagnose: diagnose(args.program,args.year); return
    if args.targets_only:
        t=load_targets(); save_targets(t); cov=build_coverage(); write_coverage(cov)
        print(f"🎯 Registre : {len(t['programs'])} émissions → {TARGETS}"); print_coverage(cov,args.program); return
    if args.report_only:
        cov=build_coverage(); write_coverage(cov); print_coverage(cov,args.program); return
    if args.rebuild:
        normalize_cache(args.program); cov=build_coverage(); write_coverage(cov); print_coverage(cov,args.program); return
    if not args.program:
        print("❌ --program requis (sauf --report-only / --rebuild / --diagnose / --targets-only)"); sys.exit(1)

    program=args.program; slug=slugify(program)
    tg=target_of(program)
    channel=args.channel or tg.get("channel","")
    y0=args.year_start if args.year_start!=1970 else int(tg.get("from",1970))
    y1=args.year_end if args.year_end!=1999 else int(tg.get("to",1999))
    index_path=IDX_DIR/f"{slug}.json"; ensure_dir(NOT_DIR)
    client=InaClient(delay=args.delay)

    print("="*100)
    print(f"🏛️ INA — {program} · chaîne « {channel or 'non renseignée'} » · "
          +(str(args.year) if args.year else f"{y0}-{y1}")+f" · stratégies={args.strategies}")
    print("="*100)

    if args.notices_only:
        cached=read_json(index_path)
        if not cached: print(f"❌ Index absent : {index_path}"); sys.exit(1)
        rows=cached.get("notices",[]); discovery=cached.get("discovery",[])
        print(f"📂 Index en cache : {len(rows)} notices")
    else:
        rows,discovery=harvest_index(client,program,channel,args.year,y0,y1,
                                     args.include_subnotices,args.strategies)
        prev=read_json(index_path) or {}
        merged={r["notice_id"]:r for r in prev.get("notices",[])}
        new=0
        for r in rows:
            if r["notice_id"] not in merged: new+=1
            merged[r["notice_id"]]=r
        rows=sorted(merged.values(),key=lambda r:(r["date"].split("-")[2],r["date"].split("-")[1],r["date"].split("-")[0],r["start"]))
        write_json(index_path,{"program":program,"slug":slug,"channel":channel,
                               "harvested_at":datetime.now().isoformat(),"count":len(rows),
                               "discovery":discovery,"notices":rows})
        print(f"\n✅ Index : {index_path} — {len(rows)} notices cumulées (+{new} nouvelles)")
        by_year={}
        for r in rows: by_year[r["date"].split("-")[2]]=by_year.get(r["date"].split("-")[2],0)+1
        print("   répartition : "+", ".join(f"{y}:{n}" for y,n in sorted(by_year.items())))
        register_target(program,rows,channel)

    if args.index_only or not rows:
        normalize_cache(None,verbose=False); cov=build_coverage(); write_coverage(cov); print_coverage(cov,program); return

    if args.year:
        rows=[r for r in rows if r["date"].endswith(f"-{args.year}")]
        print(f"\n🎯 Année {args.year} : {len(rows)} notices indexées")

    pending=[]; old_n=empty_n=missing_n=0
    for r in rows:
        ex=read_json(NOT_DIR/f"{r['notice_id']}.json")
        if ex is None: missing_n+=1; pending.append(r); continue
        v=ex.get("parser_version",0)
        if v!=PARSER_VERSION: old_n+=1
        has=bool(ex.get("elements"))
        if not has: empty_n+=1
        if args.force or (args.refresh_stale and v!=PARSER_VERSION) or (args.retry_empty and not has):
            pending.append(r)

    total_pending=len(pending)
    print(f"♻️ En cache : {len(rows)-missing_n} · ancienne version : {old_n} · sans œuvre : {empty_n}")
    print(f"📥 Absentes du disque : {missing_n} · file : {total_pending}")
    if args.max_notices>0: pending=pending[:args.max_notices]
    print(f"▶️ Ce run : {len(pending)} · resteront {total_pending-len(pending)}")
    if not pending:
        print("✅ Rien à télécharger : tout est en cache.")
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

    normalize_cache(None); cov=build_coverage(); write_coverage(cov)
    print("\n"+"="*100); print("🎉 RUN TERMINÉ"); print("="*100)
    print(f"Téléchargées : {ok} · avec œuvres : {withe} · œuvres : {els}")
    left=[q for q in cov["queue"] if norm(q["program"])==norm(program) and (not args.year or q["year"]==args.year)]
    if left: print(f"\n⏭️ Reste {left[0]['remaining']} notices. Relance la même commande : la file avancera.")
    else: print(f"\n✅ Périmètre complet pour {program}"+(f" {args.year}" if args.year else "")+".")
    print_coverage(cov,program)


def main()->None:
    p=argparse.ArgumentParser(description="Moissonneur INA — double stratégie de recherche")
    p.add_argument("--program"); p.add_argument("--channel",default="")
    p.add_argument("--year",type=int)
    p.add_argument("--year-start",type=int,default=1970); p.add_argument("--year-end",type=int,default=1999)
    p.add_argument("--strategies",choices=["both","legacy","channel","hybrid"],default="both")
    p.add_argument("--max-notices",type=int,default=400); p.add_argument("--max-pages",type=int,default=40)
    p.add_argument("--index-only",action="store_true"); p.add_argument("--notices-only",action="store_true")
    p.add_argument("--include-subnotices",action="store_true"); p.add_argument("--force",action="store_true")
    p.add_argument("--retry-empty",action="store_true"); p.add_argument("--refresh-stale",action="store_true")
    p.add_argument("--report-only",action="store_true"); p.add_argument("--rebuild",action="store_true")
    p.add_argument("--targets-only",action="store_true"); p.add_argument("--diagnose",action="store_true")
    p.add_argument("--delay",type=float,default=3.0)
    run(p.parse_args())

if __name__=="__main__": main()