#!/usr/bin/env python3
"""
Moissonneur INA Catalogue — v10.

Union A ∪ B : le nom de l'émission est tantôt dans le titre propre, tantôt dans
la colonne Titre programme, tantôt les deux. On cumule, on ne substitue pas.

Triage : une ligne de résultat porte déjà date + collection + titre. Si l'œuvre
en est déductible, la fiche n'apporte rien → pas de téléchargement (--fetch auto).
La moisson est alors acquise dans data/ina/listings/<slug>.json.

« Résumé documentaire » a deux formes :
  liste : - Emilie / - Papivole / 1. Sailormoon  → œuvres du jour (scope=jour)
  prose : « Émission de jeunesse présentée par… » → description de l'émission,
          œuvres citées entre parenthèses extraites au niveau émission
          (scope=programme, champ programme_works)

Usage
  python scraper/ina_catalogue_scraper.py --rebuild --program Samdynamite
  python scraper/ina_catalogue_scraper.py --diagnose --program Samdynamite
  python scraper/ina_catalogue_scraper.py --program "Récré A2" --fetch auto
  python scraper/ina_catalogue_scraper.py --report-only
"""

import argparse, json, math, random, re, sys, time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

BASE="https://catalogue.ina.fr"; LIST_PATH="/docListe/TV-RADIO"
PARSER_VERSION=10; PAGE_SIZE=500
ROOT=Path("data/ina"); IDX_DIR=ROOT/"index"; NOT_DIR=ROOT/"notices"; LIS_DIR=ROOT/"listings"; TARGETS=ROOT/"targets.json"

NOTICE_RE=re.compile(r"/doc/TV-RADIO/([A-Za-z]{1,8}_[A-Za-z0-9]+(?:[-.][0-9]+)*)",re.I)
DATE_RE=re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
TIME_RE=re.compile(r"\b(\d{1,2}):(\d{2}):(\d{2})\b")
TOTAL_RE=re.compile(r"sur\s+([\d\s\u00a0]{1,12})\b")
ITEM_RE=re.compile(r"^\s*(\d+)\.\s*(.+?)\s*$",re.M)
BULLET_RE=re.compile(r"^\s*[-–—•*·▪]\s*")
TIMECODE_LINE_RE=re.compile(r"^\s*à\s*\d{2}:\d{2}:\d{2}",re.I)
INLINE_TIME_RE=re.compile(r"\s+à\s+\d{2}:\d{2}:\d{2}.*$",re.I)
PART_SUFFIX_RE=re.compile(r"\s*[:;]?\s*\[?\s*(?:\d+|i|1|2)\s*(?:ere|ère|er|e|eme|ème|iee|ee)\s*partie\s*\]?\s*$",re.I)
BRACKET_PART_RE=re.compile(r"\s*\[\s*(?:\d+|i|1|2)\s*(?:ere|ère|er|e|eme|ème|iee|ee)\s*partie\s*\]\s*$",re.I)
DATE_SUFFIX_RE=re.compile(r"\s*[:;]?\s*\[?\s*(?:[ée]mission|programme|diffusion)\s+(?:du|enregistr[ée]e? le)[^\]]*\]?\s*$",re.I)

PROSE_MARKERS=[r"pr[ée]sent[ée]e?s?\s+par",r"lanc[ée]e?s?\s+en",r"au\s+programme",
 r"en\s+remplacement\s+de",r"\bdiffus[ée]e?s?\b",r"\bchaque\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)",
 r"\bles\s+(mercredi|samedi|dimanche|lundi|mardi|jeudi|vendredi)\b",r"\bpuis\b",r"\bensuite\b",
 r"\bainsi\b",r"\bcontient\b",r"\bsucc[èe]de\b",r"\b[ée]mission\s+de\b",r"\bpersonnages?\b",
 r"\bpropos[ée]e?s?\b",r"\bconsacr[ée]e?s?\b",r"\bdestin[ée]e?s?\b"]
WORK_CTX=[r"dessins?\s+anim[ée]s?",r"s[ée]ries?",r"au\s+programme",r"programmes?",r"[ée]missions?",
 r"rubriques?",r"films?",r"contient",r"comprend",r"diffuse",r"propos[ée]e?s?"]
PAREN_RE=re.compile(r"\(([^)]{3,200})\)")
SPLIT_RE=re.compile(r"\s*(?:,|;|\bet\b|\bou\b|\bainsi que\b)\s*")
BAD_WORK=[r"\bpersonnages?\b",r"\bpr[ée]sent",r"\bquelques\b",r"\bautres\b",r"\betc\b",r"^\d+$",
 r"\bminute",r"\bheure",r"\bsaison",r"\b[ée]pisode",r"\bpartie\b"]

COL_ALIASES={"chaine":["chaîne de diffusion","chaine de diffusion","chaîne","chaine"],
 "date":["date de diffusion","date"],"start":["heure de diffusion","heure"],
 "duration":["durée","duree"],"title":["titre propre"],
 "collection":["titre collection","collection"],"programme":["titre programme"],"genre":["genre"]}
KNOWN_CHANNELS=["ORTF 1","ORTF 2","ORTF 3","TF1","Antenne 2","France 2","FR3","France 3",
 "Canal+","Canal Plus","TV6","M6","La Cinq","La Sept","Arte","La Cinquième","France 5"]
CH_VARIANTS={"fr3":["FR3","France 3"],"france 3":["France 3","FR3"],
 "antenne 2":["Antenne 2","France 2"],"france 2":["France 2","Antenne 2"],
 "tf1":["TF1"],"m6":["M6"],"tv6":["TV6","M6"],
 "canal+":["Canal+","Canal Plus"],"canal plus":["Canal+","Canal Plus"],
 "la cinq":["La Cinq","La 5"],"la 5":["La Cinq","La 5"],
 "la sept":["La Sept","Arte"],"arte":["Arte","La Sept"],
 "la cinquième":["La Cinquième","La Cinquieme"],"la cinquieme":["La Cinquième","La Cinquieme"],
 "france 5":["France 5","La Cinquième"],
 "ortf 1":["ORTF 1","1ère chaîne"],"ortf 2":["ORTF 2","2ème chaîne"],"ortf 3":["ORTF 3","3ème chaîne"]}
PAGE_PARAMS=["page","rang","debut","start","offset","premier","numPage","pageCourante","from","indice","noPage"]
TRI_FLIPS=["date2","date1","date_diffusion2","date_diffusion1","score2"]

EXCLUDE_PATTERNS=[r"^plateau\b",r"\bplateau\s*:",r"^animation\b",r"^pr[ée]sentation\b",
 r"interprogramme",r"publicit",r"^\s*pub\s*$",r"bande annonce",r"fin des [ée]missions",
 r"arr[êe]t des [ée]missions",r"fin des programmes",r"^m[ée]t[ée]o\b",r"tirage du loto",
 r"^tapis vert\b",r"^pr[ée]lude\b",r"^(?:\d+|i|1|2)\s*(?:ere|ère|eme|ème|e|iee|ee)\s*partie$",
 r"^seconde partie$",r"^suite$",r"^g[ée]n[ée]rique\b",r"^interm[èe]de\b",r"^annonce",
 r"^sommaire\b",r"^r[ée]sum[ée]\b",r"^teaser\b",r"^habillage\b",r"^jingle\b",r"^concours\b",
 r"^d[ée]dicaces\b",r"^courrier\b",r"^indicatif\b",r"^opening\b",r"^closing\b",r"^relais\b",
 r"^au programme$",r"^des dessins",r"^lanc[ée]e? en",r"^[ée]mission de"]

CANON_EXACT={"mask":"Mask","ferdy":"Ferdy","popples":"Popples","conan":"Conan","cadichon":"Cadichon",
 "nick larson":"Nick Larson","nico larson":"Nick Larson","city hunter":"City Hunter",
 "sailormoon":"Sailor Moon","sailor moon":"Sailor Moon","power rangers":"Power Rangers",
 "dragon ball z":"Dragon Ball Z","dragon ball":"Dragon Ball","denver":"Denver, le dernier dinosaure",
 "les minipouss":"Les Minipouss","minipouss":"Les Minipouss","jeanne et serge":"Jeanne et Serge",
 "shera":"She-Ra","he man":"He-Man","mon petit poney":"Mon petit poney","pacman":"Pac-Man",
 "sophie et virginie":"Sophie et Virginie","denis la malice":"Denis la Malice","bumbo":"Bumbo",
 "inspecteur gadget":"Inspecteur Gadget","lucky luke":"Lucky Luke","les schtroumpfs":"Les Schtroumpfs",
 "tom et jerry":"Tom et Jerry","bugs bunny":"Bugs Bunny","scooby doo":"Scooby-Doo",
 "la panthere rose":"La Panthère rose","les flintstones":"Les Pierrafeu","les jetson":"Les Jetson",
 "quick et flupke":"Quick et Flupke","la pimpa":"La Pimpa","mimi cracra":"Mimi Cracra","bogus":"Bogus",
 "petit ours brun":"Petit Ours Brun","naturimages":"Naturimages","souris noire":"Souris noire",
 "les petits malins":"Les petits malins","galaxie express 99":"Galaxie Express 99",
 "visionaries":"Visionaries","tarzan":"Tarzan","winnie l ourson":"Winnie l'ourson",
 "les gummies":"Les Gummies","les gummi":"Les Gummies","superboy":"Superboy","super boy":"Superboy",
 "rick hunter":"Rick Hunter","columbo":"Columbo","starsky et hutch":"Starsky et Hutch",
 "k 2000":"K 2000","k2000":"K 2000","l agence tous risques":"L'Agence tous risques",
 "droles de dames":"Drôles de dames","hawai police d etat":"Hawaï, police d'État","magnum":"Magnum",
 "sherlock holmes":"Sherlock Holmes","emilie":"Émilie","les paladins de france":"Les Paladins de France",
 "papivole":"Papivole","discopuce":"Discopuce","sido et remi":"Sido et Rémi",
 "kaleidoscope":"Kaléidoscope","c est chouette":"C'est chouette","a2000":"A2000",
 "mes mains ont la parole":"Mes mains ont la parole","l ile aux enfants":"L'Île aux enfants",
 "casimir":"Casimir","albator":"Albator","goldorak":"Goldorak","capitaine flam":"Capitaine Flam",
 "candy":"Candy","heidi":"Heidi","vic le viking":"Vic le Viking","maya l abeille":"Maya l'abeille",
 "calimero":"Caliméro","ulysse 31":"Ulysse 31","tom sawyer":"Tom Sawyer",
 "denver le dernier dinosaure":"Denver, le dernier dinosaure","babar":"Babar",
 "operation mozart":"Opération Mozart","science cartoon":"Science cartoon",
 "genies en herbe":"Génies en herbe","les incollables":"Les incollables",
 "minimome":"Minimôme","graine d infos":"Graine d'infos","pas bete":"Pas bête",
 "paroles de betes":"Paroles de bêtes","auto velo bravo":"Auto Vélo Bravo",
 "les comptines du vieux continent":"Les comptines du vieux continent",
 "telechat":"Téléchat","latulu et lireli":"Latulu et Lireli","bibifoc":"Bibifoc",
 "les mondes engloutis":"Les mondes engloutis","les bubblies":"Les Bubblies",
 "la bande a bede":"La bande à BéDé","super doc":"Super doc","poochie":"Poochie",
 "tranin reporter":"Tranin reporter","lire lire lire":"Lire lire lire",
 "pic pic pic":"Pic pic pic","bouquin copain":"Bouquin copain","teletactica":"Télétactica",
 "image imagine":"Image imagine","trois deux un contact":"Trois deux un contact",
 "wattoo wattoo super bird":"Wattoo Wattoo super bird","je veux etre toi":"Je veux être toi",
 "le petit echo de la foret":"Le petit écho de la forêt","le monde selon georges":"Le monde selon Georges",
 "les devinettes d epinal":"Les devinettes d'Épinal","contes et legendes du monde":"Contes et légendes du monde",
 "la caverne d abracadabra":"La Caverne d'Abracadabra","entre les lignes":"Entre les lignes",
 "a2 mains":"Mes mains ont la parole","genies en herbe international":"Génies en herbe international",
 "tilion":"Tilion","le tour du monde en 80 jours":"Le Tour du monde en 80 jours",
 "les bisounours":"Les Bisounours","bisounours":"Les Bisounours"}
CANON_RULES=[(re.compile(r"^les?\s+bisounours$"),"Les Bisounours"),
 (re.compile(r"^les\s+chevaliers\s+du\s+zodiaque?s?$"),"Les Chevaliers du Zodiaque"),
 (re.compile(r"^les\s+amichain(?:e|ê)s?$"),"Les Amichaînes"),
 (re.compile(r"^la\s+croisi[èe]re\s+foll?\s*amour$"),"La Croisière Foll'Amour"),
 (re.compile(r"^les\s+ann[ée]es\s+fac$"),"Les Années fac"),
 (re.compile(r"^premiers\s+baisers$"),"Premiers baisers"),
 (re.compile(r"^salut\s+les\s+muscl[ée]s$"),"Salut les Musclés"),
 (re.compile(r"^cadichon.*$"),"Cadichon"),(re.compile(r"^b[ée]c[ée]\s*b[ée]g[ée]$"),"Bécébégé"),
 (re.compile(r"^les\s+quat\s*z\s*amis$"),"Les Quat'z Amis"),
 (re.compile(r"^r[ée]cr[ée]\s*a\s*2.*$"),"Récré A2"),(re.compile(r"^sam\s*dynamite$"),"Samdynamite"),
 (re.compile(r"^denver.*dinosaure$"),"Denver, le dernier dinosaure"),
 (re.compile(r"^graine\s+d\s*infos.*$"),"Graine d'infos"),
 (re.compile(r"^latulu.*lireli$"),"Latulu et Lireli"),
 (re.compile(r"^la\s+caverne\s+d\s*abracadabra$"),"La Caverne d'Abracadabra")]
HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
 "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
 "Accept-Language":"fr-FR,fr;q=0.9,en;q=0.7","Connection":"keep-alive","Upgrade-Insecure-Requests":"1"}

DEFAULT_TARGETS=[("Club Dorothée","TF1",1987,1997,1),("Récré A2","Antenne 2",1978,1987,1),
 ("Amuse 3","FR3",1985,1997,1),("Cabou Cadin","Canal+",1985,1993,2),("Vitamine","TF1",1983,1987,2),
 ("Youpi ! L'école est finie","La Cinq",1987,1992,2),("Les Visiteurs du mercredi","TF1",1975,1983,2),
 ("Croque-Vacances","TF1",1981,1987,3),("Le Village dans les nuages","TF1",1982,1986,3),
 ("Le réveil des babalous","FR3",1986,1991,3),("Discopuce","Antenne 2",1978,1987,3),
 ("Giga","Antenne 2",1987,1996,2),("Ça cartoon","Canal+",1986,1999,2),
 ("Canaille Peluche","Canal+",1986,1993,3),("Décode pas Bunny","Canal+",1990,1996,3),
 ("Le Disney Channel","FR3",1988,1996,2),("Debout les enfants","FR3",1987,1994,3),
 ("Samdynamite","FR3",1989,1996,1),("Télétaz","FR3",1988,1993,3),
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
def channel_variants(ch:str)->List[str]: return CH_VARIANTS.get(norm(ch),[ch]) if ch else []
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
    while t.startswith("[") and t.endswith("]"): t=t[1:-1].strip()
    t=re.sub(r"\s+"," ",t).strip(" .;:-–—")
    p=t.split(":",1)
    if len(p)==2 and p[0].strip() and norm(p[0])==norm(p[1]): t=p[0].strip()
    return PART_SUFFIX_RE.sub("",t).strip(" .;:-–—")
def is_useful(t:str,pn:str,pc:str)->bool:
    if not t or len(t)<2 or len(t)>90: return False
    low=t.lower()
    for p in EXCLUDE_PATTERNS:
        if re.search(p,low): return False
    for p in BAD_WORK:
        if re.search(p,low): return False
    if len(t.split())>8: return False
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
def norm_time(raw:str)->Tuple[str,str]:
    m=TIME_RE.search(raw or "")
    if not m: return "",""
    h,mi,se=m.group(1).zfill(2),m.group(2),m.group(3)
    return f"{h}:{mi}:{se}",(f"{h}:{mi}" if int(h)<24 else "")
def entry_key(e:Dict)->str:
    return e.get("notice_id") or f"L|{e.get('date','')}|{e.get('start_raw','')}|{compact(e.get('title',''))}|{compact(e.get('collection',''))}"
def has_link(e:Dict)->bool: return bool(e.get("notice_id") and e.get("url"))
def needs_fetch(e:Dict,mode:str)->bool:
    if mode=="none": return False
    if not has_link(e): return False
    if mode=="all": return True
    if mode=="mothers": return bool(e.get("mother"))
    return not e.get("work")


def is_prose(lines:List[str],raw:str)->bool:
    if not lines: return False
    low=norm(raw)
    hits=sum(1 for p in PROSE_MARKERS if re.search(p,low))
    longs=sum(1 for l in lines if len(l)>70)
    verby=sum(1 for l in lines if len(l.split())>9)
    bulleted=sum(1 for l in lines if BULLET_RE.match(l) or ITEM_RE.match(l))
    if hits>=2: return True
    if longs>=max(1,len(lines)//2): return True
    if verby>=max(1,len(lines)//2) and bulleted==0: return True
    if hits>=1 and longs>=1: return True
    return False
def mine_prose_works(raw:str,program:str)->List[str]:
    pn,pc=norm(program),compact(program); out=[]; seen=set()
    for m in PAREN_RE.finditer(raw):
        pre=norm(raw[max(0,m.start()-60):m.start()])
        if not any(re.search(k,pre) for k in WORK_CTX): continue
        if re.search(r"personnage|pr[ée]sent|animateur|avec la voix",pre): continue
        for part in SPLIT_RE.split(m.group(1)):
            t=canon_title(clean_title(part))
            if not is_useful(t,pn,pc): continue
            k=norm(t)
            if k in seen: continue
            seen.add(k); out.append(t)
    return out


def load_targets()->Dict:
    t=read_json(TARGETS)
    if isinstance(t,dict) and t.get("programs"): return t
    return {"version":1,"updated_at":datetime.now().isoformat(),
            "note":"Registre des cibles INA. La chaîne active B ; A tourne toujours. from/to borne la moisson.",
            "programs":[{"program":p,"slug":slugify(p),"channel":c,"from":a,"to":b,"priority":pr}
                        for p,c,a,b,pr in DEFAULT_TARGETS]}
def save_targets(t:Dict)->None:
    t["updated_at"]=datetime.now().isoformat()
    for p in t["programs"]: p.setdefault("slug",slugify(p["program"]))
    write_json(TARGETS,t)
def target_of(program:str)->Dict:
    slug=slugify(program)
    for p in load_targets()["programs"]:
        if (p.get("slug") or slugify(p["program"]))==slug: return p
    return {}
def register_target(program:str,entries:List[Dict],channel:str="")->None:
    t=load_targets(); slug=slugify(program)
    years=[int(e["date"].split("-")[2]) for e in entries if e.get("date")]
    ch=channel or next((e.get("channel") for e in entries if e.get("channel")),"")
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
                r=self.session.get(url,timeout=45)
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
                self._pause(); r=self._cs.get(url,timeout=45)
                if r.status_code==200: return r.text
            except Exception as ex: err=str(ex)
        print(f"  ❌ Échec définitif {url} : {err}"); return None


def q_legacy(program,year,variant,nb)->str:
    p={"sujets_filter":"Sujet","bool_operator":"AND","nbLignes":str(nb)}
    if variant!=3: p["base_label"]="TVNAT"
    if variant==0: p["tiprog"]=program; p["ti"]=str(year) if year else program
    elif variant==1:
        p["tiprog"]=f'"{program}"'
        if year: p["ti"]=str(year)
    elif variant==2: p["ti"]=f"{program} {year}" if year else program
    else: p["tiprog"]=program; p["ti"]=str(year) if year else program
    return f"{BASE}{LIST_PATH}?{urlencode(p)}"
def q_channel(program,ch,year,variant,nb,tri="score1")->str:
    p={"base_label":"TVNAT","sujets_filter":"Sujet","ch":ch,
       "tiprog":program if variant==0 else f'"{program}"',
       "bool_operator":"AND","tri":tri,"nbLignes":str(nb)}
    if year: p["ti"]=str(year)
    return f"{BASE}{LIST_PATH}/?{urlencode(p)}"
def q_loose(program,year,nb)->str:
    p={"sujets_filter":"Sujet","tiprog":program,"bool_operator":"AND","tri":"score1","nbLignes":str(nb)}
    if year: p["ti"]=str(year)
    return f"{BASE}{LIST_PATH}/?{urlencode(p)}"
def with_param(url,param,val)->str: return url+("&" if "?" in url else "?")+urlencode({param:val})
def set_param(url,param,val)->str:
    if re.search(rf"[?&]{re.escape(param)}=",url):
        return re.sub(rf"([?&]{re.escape(param)}=)[^&]*",lambda m:m.group(1)+str(val),url)
    return with_param(url,param,val)


def declared_total(soup)->Optional[int]:
    m=TOTAL_RE.search(re.sub(r"\s+"," ",soup.get_text(" ",strip=True)))
    if not m: return None
    d=re.sub(r"[^\d]","",m.group(1)); return int(d) if d else None
def column_map(table)->Dict[str,int]:
    head=None
    for tr in table.find_all("tr"):
        ths=tr.find_all("th")
        if ths: head=ths; break
    if head is None:
        for tr in table.find_all("tr"):
            tds=tr.find_all("td")
            if tds and any("titre" in norm(td.get_text()) for td in tds): head=tds; break
    mapping={}
    if head:
        labels=[norm(re.sub(r"\btri\b","",h.get_text(" ",strip=True),flags=re.I)) for h in head]
        for key,aliases in COL_ALIASES.items():
            for i,lab in enumerate(labels):
                if any(lab==a or lab.startswith(a) for a in aliases): mapping[key]=i; break
    return mapping
def result_tables(soup)->List[Any]:
    return [t for t in soup.find_all("table")
            if t.find("a",href=NOTICE_RE) or any("titre propre" in norm(th.get_text()) for th in t.find_all(["th","td"]))]
def belongs(mode,hp,ht)->Tuple[bool,str]:
    if mode=="programme": return hp,"programme" if hp else ""
    if mode=="title": return ht,"title" if ht else ""
    if mode=="both": return (hp and ht),"both" if (hp and ht) else ""
    if hp and ht: return True,"both"
    if hp: return True,"programme"
    if ht: return True,"title"
    return False,""

def parse_list(html:str,program:str,mode:str="any",allow_all:bool=False)->Tuple[List[Dict],Optional[int],Dict]:
    soup=BeautifulSoup(html,"html.parser"); total=declared_total(soup)
    pc=compact(program); pn=norm(program)
    entries=[]; seen=set(); headers={}
    for table in result_tables(soup):
        cmap=column_map(table)
        if cmap: headers.update(cmap)
        for tr in table.find_all("tr"):
            tds=tr.find_all("td")
            if len(tds)<4: continue
            texts=[td.get_text(" ",strip=True) for td in tds]
            def cell(k):
                i=cmap.get(k); return texts[i] if i is not None and i<len(texts) else ""
            a=tr.find("a",href=NOTICE_RE); nid=""; url=""
            if a:
                m=NOTICE_RE.search(a["href"])
                if m: nid=m.group(1).upper(); url=urljoin(BASE,a["href"])
            title=cell("title") or (a.get_text(" ",strip=True) if a else "")
            collection=cell("collection"); prog=cell("programme")
            date_raw=cell("date"); start_raw=cell("start"); dur=cell("duration")
            genre=cell("genre"); ch=cell("chaine")
            blob=" | ".join(texts)
            if not date_raw:
                dm=DATE_RE.search(blob); date_raw=dm.group(0) if dm else ""
            dm=DATE_RE.search(date_raw)
            if not dm: continue
            date=f"{dm.group(1)}-{dm.group(2)}-{dm.group(3)}"
            if not ch:
                for c in KNOWN_CHANNELS:
                    if re.search(rf"\b{re.escape(c)}\b",blob,re.I): ch=c; break
            if not start_raw:
                tm=TIME_RE.search(blob); start_raw=tm.group(0) if tm else ""
            cp=compact(prog); ct=compact(title)
            hp=bool(pc and cp and (cp==pc or pc in cp))
            ht=bool(pc and ct and pc in ct)
            ok,mb=(True,"all") if allow_all else belongs(mode,hp,ht)
            if not ok: continue
            sfull,shhmm=norm_time(start_raw)
            clean=clean_title(title)
            coll=canon_title(clean_title(collection)) if collection else ""
            work=""
            if coll and is_useful(coll,pn,pc): work=coll
            elif clean and is_useful(clean,pn,pc): work=canon_title(clean)
            mother=bool(pc and (ct.startswith(pc) or (not coll and pc in ct)))
            e={"notice_id":nid,"url":url,"kind":"notice" if nid else "listing",
               "channel":ch,"date":date,"start":shhmm,"start_raw":sfull or start_raw,
               "duration":dur,"title":clean,"title_raw":title,"collection":coll,
               "programme":prog,"genre":genre,"work":work,"mother":mother,"match_by":mb}
            k=entry_key(e)
            if k in seen: continue
            seen.add(k); entries.append(e)
    return entries,total,headers


_PAGE:Dict[str,Any]={"param":None,"probed":False}
def probe_page_param(client,url,first_keys)->Optional[str]:
    if _PAGE["probed"]: return _PAGE["param"]
    _PAGE["probed"]=True
    print("  🔬 Sonde pagination…")
    for param in PAGE_PARAMS:
        val="2" if param.lower() in ("page","numpage","pagecourante","nopage") else "501"
        html=client.get(with_param(url,param,val))
        if not html: continue
        rows,_,_=parse_list(html,"","any",True)
        keys={entry_key(r) for r in rows}
        if keys and not keys.issubset(first_keys):
            _PAGE["param"]=param; print(f"     ✓ pagination via « {param} »"); return param
    print("     ✗ aucun paramètre → inversion de tri")
    return None

def fetch_query(client,url,program,mode,label,letter,log,allow_all=False,deep=True,nb=PAGE_SIZE)->List[Dict]:
    html=client.get(url)
    if not html:
        log.append({"method":label,"letter":letter,"url":url,"found":0,"total":None,"note":"échec HTTP"}); return []
    rows,total,hdr=parse_list(html,program,mode,allow_all)
    note=""
    if deep and rows and total and len(rows)<total:
        acc={entry_key(r):r for r in rows}
        param=probe_page_param(client,url,{entry_key(r) for r in rows})
        if param:
            numeric=param.lower() in ("page","numpage","pagecourante","nopage")
            last=int(math.ceil(total/max(1,len(rows)))); seen_pages=set(); page=2; guard=0
            while len(acc)<total and guard<80:
                guard+=1
                if page in seen_pages: page+=1; continue
                seen_pages.add(page)
                val=str(page) if numeric else str((page-1)*nb+1)
                h=client.get(with_param(url,param,val))
                if not h: break
                rr,_,_=parse_list(h,program,mode,allow_all)
                if not rr:
                    if page>=last: break
                    page+=1; continue
                before=len(acc)
                for r in rr: acc.setdefault(entry_key(r),r)
                if len(acc)==before and page>=last: break
                page+=1
            if len(acc)<total:
                h=client.get(with_param(url,param,str(last) if numeric else str((last-1)*nb+1)))
                if h:
                    rr,_,_=parse_list(h,program,mode,allow_all)
                    for r in rr: acc.setdefault(entry_key(r),r)
            rows=list(acc.values()); note=f"paginé via {param}"+("" if len(acc)>=total else f" · {len(acc)}/{total}")
        else:
            for tri in TRI_FLIPS:
                h=client.get(set_param(url,"tri",tri))
                if not h: continue
                rr,_,_=parse_list(h,program,mode,allow_all)
                if not rr: continue
                before=len(acc)
                for r in rr: acc.setdefault(entry_key(r),r)
                if len(acc)>before: note=f"union tri={tri}"
                if len(acc)>=total: break
            rows=list(acc.values())
            if len(acc)<total: note=(note+" · " if note else "")+f"PARTIEL {len(acc)}/{total}"
    elif rows and total and len(rows)>=total: note="complet"
    for r in rows: r["via"]=letter
    bp=sum(1 for r in rows if r["match_by"]=="programme"); bt=sum(1 for r in rows if r["match_by"]=="title")
    bb=sum(1 for r in rows if r["match_by"]=="both"); wk=sum(1 for r in rows if r.get("work"))
    log.append({"method":label,"letter":letter,"url":url,"found":len(rows),"total":total,"note":note,
                "by_programme":bp,"by_title":bt,"by_both":bb,"works_known":wk,
                "listings":sum(1 for r in rows if r["kind"]=="listing"),
                "mothers":sum(1 for r in rows if r["mother"]),"columns":hdr})
    print(f"  {'✓' if rows else '·'} [{label}] {len(rows)}"+(f"/{total}" if total else "")
          +(f" · colonne {bp} · libellé {bt} · les deux {bb} · œuvre connue {wk}" if rows else "")
          +(f" — {note}" if note else ""))
    return rows


def harvest(client,program,channel,year,y0,y1,strategies,mode,allow_all,nb)->Tuple[List[Dict],List[Dict]]:
    acc:Dict[str,Dict]={}; log:List[Dict]=[]
    def absorb(rows,letter)->int:
        n=0
        for r in rows:
            k=entry_key(r)
            if k in acc:
                cur=acc[k].get("via","")
                acc[k]["via"]="".join(sorted(set(cur+letter)))
                if not acc[k].get("work") and r.get("work"): acc[k]["work"]=r["work"]
                if acc[k].get("match_by")!="both" and r.get("match_by")=="both": acc[k]["match_by"]="both"
                if r.get("mother"): acc[k]["mother"]=True
            else:
                r["via"]=letter; acc[k]=r; n+=1
        return n
    chans=channel_variants(channel)
    do_b=strategies in ("both","channel","hybrid"); do_a=strategies in ("both","legacy")
    do_c=strategies in ("both","hybrid")
    if do_b and chans:
        print(f"\n── B · ch + tiprog (sans ti) — alias cumulés : {', '.join(chans)}")
        for ch in chans:
            for variant in (0,1):
                rows=fetch_query(client,q_channel(program,ch,None,variant,nb),program,mode,
                                 f"B/ch={ch}{'/q' if variant else ''}","B",log,allow_all,nb=nb)
                if absorb(rows,"B"): break
    if do_b and not chans: print("\n── B inactive : aucune chaîne renseignée")
    if do_a:
        print("\n── A · tiprog + ti (ancienne) — toujours tentée")
        if year:
            for v in range(4):
                rows=fetch_query(client,q_legacy(program,year,v,nb),program,mode,f"A/{year}/v{v}","A",log,allow_all,nb=nb)
                if absorb(rows,"A"): break
        else:
            for v in range(4):
                rows=fetch_query(client,q_legacy(program,None,v,nb),program,mode,f"A/global/v{v}","A",log,allow_all,nb=nb)
                if absorb(rows,"A"): break
            covered={int(r["date"].split("-")[2]) for r in acc.values()}
            gaps=[y for y in range(y0,y1+1) if y not in covered]
            if gaps:
                print(f"   {len(gaps)} année(s) non couverte(s) → sonde par année")
                for y in gaps:
                    for v in (0,2):
                        rows=fetch_query(client,q_legacy(program,y,v,nb),program,mode,f"A/{y}/v{v}","A",log,allow_all,nb=nb)
                        if absorb(rows,"A"): break
    if not acc:
        print("\n── D · tiprog seul (filet)")
        absorb(fetch_query(client,q_loose(program,None,nb),program,mode,"D/loose","D",log,allow_all,nb=nb),"D")
    if do_c and chans:
        covered={int(r["date"].split("-")[2]) for r in acc.values()}
        gaps=[y for y in ([year] if year else list(range(y0,y1+1))) if y not in covered]
        if gaps:
            print(f"\n── C · ch + tiprog + ti — {len(gaps)} année(s)")
            for y in gaps:
                for ch in chans:
                    rows=fetch_query(client,q_channel(program,ch,y,0,nb),program,mode,f"C/{ch}/{y}","C",log,allow_all,nb=nb)
                    if absorb(rows,"C"): break
    rows=sorted(acc.values(),key=lambda r:(r["date"].split("-")[2],r["date"].split("-")[1],r["date"].split("-")[0],r.get("start_raw","")))
    return rows,log

def year_profile(entries:List[Dict],fetch_mode:str)->Dict[str,Dict]:
    out={}
    for e in entries:
        y=e["date"].split("-")[2]
        g=out.setdefault(y,{"total":0,"via":{},"match":{},"works":set(),"known":0,"need":0,"mothers":0})
        g["total"]+=1
        for l in e.get("via",""): g["via"][l]=g["via"].get(l,0)+1
        mb=e.get("match_by","?"); g["match"][mb]=g["match"].get(mb,0)+1
        if e.get("work"): g["works"].add(e["work"]); g["known"]+=1
        if needs_fetch(e,fetch_mode): g["need"]+=1
        if e.get("mother"): g["mothers"]+=1
    for y,g in out.items(): g["works"]=len(g["works"])
    return out


def parse_notice(html,nid,url,program)->Dict:
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
    sfull,shhmm=norm_time(field("Heure de diffusion"))
    prog=field("Titre programme") or program
    content=field("Sommaire"); src="Sommaire"
    if not content:
        content=field("Résumé documentaire","Resume documentaire","Résumé","Resume"); src="Résumé documentaire"
    lines=[]
    if content:
        for line in content.split("\n"):
            if TIMECODE_LINE_RE.match(line): continue
            it=ITEM_RE.match(line)
            r=(it.group(2) if it else BULLET_RE.sub("",line)).strip()
            if r: lines.append(r)
    coll=field("Titre collection")
    prose=is_prose(lines,content) if content else False
    description=""; programme_works=[]; els=[]
    if prose:
        description=re.sub(r"\s+"," ",content).strip()
        programme_works=mine_prose_works(content,prog)
        src+=" (prose)"
    else:
        els=build_elements(lines,prog)
        if lines: src+=" (liste)"
    if not els and not prose and coll:
        c=canon_title(clean_title(coll))
        if is_useful(c,norm(prog),compact(prog)): els=[c]; src="Titre collection"
    return {"notice_id":nid,"url":url,"source":"ina","parser_version":PARSER_VERSION,
            "scraped_at":datetime.now().isoformat(),"program_query":program,"programme":prog,
            "base":field("Base"),"channel":field("Chaîne de diffusion","Chaine de diffusion"),
            "collection":canon_title(clean_title(coll)) if coll else "",
            "date":ds,"start":shhmm,"start_raw":sfull,"duration":field("Durée","Duree"),
            "elements_field":src if content or coll else "",
            "scope":"programme" if prose else "jour",
            "description":description,"programme_works":programme_works,
            "summary_raw":content,"titles_raw":lines,"elements":els}

def renotice(n:Dict)->Dict:
    prog=n.get("programme") or n.get("program_query") or ""
    content=n.get("summary_raw") or ""
    lines=n.get("titles_raw") or []
    if content and not lines:
        for line in content.split("\n"):
            if TIMECODE_LINE_RE.match(line): continue
            it=ITEM_RE.match(line)
            r=(it.group(2) if it else BULLET_RE.sub("",line)).strip()
            if r: lines.append(r)
    prose=is_prose(lines,content) if content else False
    desc=""; pw=[]; els=[]
    if prose:
        desc=re.sub(r"\s+"," ",content).strip(); pw=mine_prose_works(content,prog)
    else:
        els=build_elements(lines,prog)
    if not els and not prose and n.get("collection"):
        c=canon_title(clean_title(n["collection"]))
        if is_useful(c,norm(prog),compact(prog)): els=[c]
    n["elements"]=els; n["titles_raw"]=lines
    n["scope"]="programme" if prose else "jour"
    n["description"]=desc; n["programme_works"]=pw
    n["parser_version"]=PARSER_VERSION; n["normalized_at"]=datetime.now().isoformat()
    return n

def normalize_cache(program=None,verbose=True)->int:
    if not NOT_DIR.exists(): return 0
    changed=total=0
    for p in sorted(NOT_DIR.glob("*.json")):
        n=read_json(p)
        if not n: continue
        if program and norm(n.get("program_query",""))!=norm(program): continue
        total+=1
        before=(n.get("elements"),n.get("scope"),n.get("description"),n.get("parser_version"))
        m=renotice(n)
        if (m.get("elements"),m.get("scope"),m.get("description"),m.get("parser_version"))!=before:
            write_json(p,m); changed+=1
    if verbose: print(f"🧹 Re-normalisation locale (0 requête) : {changed}/{total} notices")
    return changed


KEYS=("indexed","cached","current","outdated","with_elements","empty","remaining","elements","days","known","need")

def load_notices()->Dict[str,Dict]:
    out={}
    if not NOT_DIR.exists(): return out
    for p in NOT_DIR.glob("*.json"):
        n=read_json(p)
        if not n: continue
        out[(n.get("notice_id") or p.stem).upper()]={"els":len(n.get("elements") or []),
            "pw":len(n.get("programme_works") or []),"scope":n.get("scope","jour"),
            "v":n.get("parser_version",0),"slug":slugify(n.get("program_query") or n.get("programme") or ""),
            "program":n.get("program_query") or n.get("programme") or ""}
    return out

def programme_works_by_slug(notices:Dict[str,Dict])->Dict[str,List[str]]:
    """Œuvres citées au niveau émission, regroupées par slug. Un seul passage disque."""
    acc:Dict[str,set]={}
    for nid,n in notices.items():
        if not n.get("pw"): continue
        full=read_json(NOT_DIR/f"{nid}.json") or {}
        for w in full.get("programme_works") or []:
            if w: acc.setdefault(n["slug"],set()).add(w)
    return {k:sorted(v) for k,v in acc.items()}

def build_coverage(fetch_mode="auto")->Dict:
    notices=load_notices(); targets=load_targets(); raw={}; indexed_ids=set()
    pw_map=programme_works_by_slug(notices)
    for d,fld in ((LIS_DIR,"entries"),(IDX_DIR,"notices")):
        if not d.exists(): continue
        for p in sorted(d.glob("*.json")):
            data=read_json(p) or {}
            slug=data.get("slug") or slugify(data.get("program") or p.stem)
            if slug in raw and fld=="notices":
                raw[slug]["discovery"]=data.get("discovery",raw[slug]["discovery"])
                raw[slug]["methods"]=sorted({m.get("letter","?") for m in data.get("discovery",[]) if m.get("found")})
                continue
            fm=data.get("fetch_mode",fetch_mode); by={}
            for e in data.get(fld) or []:
                parts=(e.get("date") or "").split("-")
                if len(parts)!=3: continue
                y=int(parts[2]); nid=(e.get("notice_id") or "").upper()
                g=by.setdefault(y,{"year":y,**{k:0 for k in KEYS},"_days":set(),"_sample":[],"_works":set(),"via":{},"match":{}})
                g["indexed"]+=1
                if nid: indexed_ids.add(nid)
                for l in e.get("via",""): g["via"][l]=g["via"].get(l,0)+1
                mb=e.get("match_by","?"); g["match"][mb]=g["match"].get(mb,0)+1
                need=needs_fetch(e,fm)
                if need: g["need"]+=1
                ex=notices.get(nid) if nid else None
                if not need:
                    g["cached"]+=1; g["current"]+=1
                    if e.get("work"): g["known"]+=1
                elif ex:
                    g["cached"]+=1
                    if ex["v"]==PARSER_VERSION: g["current"]+=1
                    else: g["outdated"]+=1
                else:
                    g["remaining"]+=1
                    if nid and len(g["_sample"])<12: g["_sample"].append(nid)
                w=e.get("work") or ""
                if w:
                    g["with_elements"]+=1; g["elements"]+=1; g["_works"].add(w); g["_days"].add(e.get("date"))
                elif ex and ex["els"]:
                    g["with_elements"]+=1; g["elements"]+=ex["els"]; g["_days"].add(e.get("date"))
                else: g["empty"]+=1
            for y,g in by.items():
                g["days"]=len(g.pop("_days")); g["sample"]=g.pop("_sample"); g["works"]=len(g.pop("_works"))
                g["coverage"]=round(100*g["cached"]/g["indexed"],1) if g["indexed"] else 0.0
            raw[slug]={"program":data.get("program") or slug,"years":by,"channel":data.get("channel",""),
                       "methods":data.get("methods",[]) or sorted({m.get("letter","?") for m in data.get("discovery",[]) if m.get("found")}),
                       "discovery":data.get("discovery",[]),"fetch_mode":fm,
                       "harvested_at":data.get("updated_at") or data.get("harvested_at",""),
                       "year_profile":data.get("year_profile",{})}
    known=[g["indexed"] for r in raw.values() for g in r["years"].values() if g["indexed"]]
    gavg=int(sum(known)/len(known)) if known else 150
    def totals(years):
        t={k:sum(g.get(k,0) for g in years) for k in KEYS}
        t["coverage"]=round(100*t["cached"]/t["indexed"],1) if t["indexed"] else 0.0
        t["works"]=sum(g.get("works",0) for g in years)
        t["virgin"]=sum(1 for g in years if g.get("virgin")); t["estimate"]=sum(g.get("estimate",0) for g in years)
        return t
    programs=[]; used=set()
    for t in targets["programs"]:
        slug=t.get("slug") or slugify(t["program"]); used.add(slug)
        r=raw.get(slug,{"program":t["program"],"years":{},"methods":[],"discovery":[],"channel":"","year_profile":{},"fetch_mode":fetch_mode})
        ky=[g["indexed"] for g in r["years"].values() if g["indexed"]]
        avg=int(sum(ky)/len(ky)) if ky else gavg
        lo,hi=int(t.get("from",1970)),int(t.get("to",1999)); years=[]
        for y in range(lo,hi+1):
            if y in r["years"]: years.append(dict(r["years"][y],virgin=False,estimate=0))
            else: years.append({"year":y,**{k:0 for k in KEYS},"works":0,"via":{},"match":{},"coverage":0.0,"sample":[],"virgin":True,"estimate":avg})
        for y,g in r["years"].items():
            if not (lo<=y<=hi): years.append(dict(g,virgin=False,estimate=0,out_of_range=True))
        years.sort(key=lambda g:g["year"])
        programs.append({"program":t["program"],"slug":slug,"channel":t.get("channel") or r.get("channel",""),
                         "priority":t.get("priority",9),"from":t.get("from"),"to":t.get("to"),
                         "harvested_at":r.get("harvested_at",""),"methods":r.get("methods",[]),
                         "discovery":r.get("discovery",[]),"year_profile":r.get("year_profile",{}),
                         "fetch_mode":r.get("fetch_mode",fetch_mode),
                         "programme_works":pw_map.get(slug,[]),
                         "years":years,"totals":totals(years)})
    for slug,r in raw.items():
        if slug in used: continue
        years=[dict(g,virgin=False,estimate=0) for _,g in sorted(r["years"].items())]
        programs.append({"program":r["program"],"slug":slug,"channel":r.get("channel",""),"priority":9,
                         "from":None,"to":None,"methods":r.get("methods",[]),"discovery":r.get("discovery",[]),
                         "year_profile":r.get("year_profile",{}),"fetch_mode":r.get("fetch_mode",fetch_mode),
                         "programme_works":pw_map.get(slug,[]),"years":years,"totals":totals(years)})
    orph={}
    for nid,n in notices.items():
        if nid in indexed_ids: continue
        k=n["slug"] or "inconnu"
        o=orph.setdefault(k,{"slug":k,"program":n["program"] or k,"count":0,"with_elements":0})
        o["count"]+=1
        if n["els"]: o["with_elements"]+=1
    orphans=sorted(orph.values(),key=lambda x:-x["count"])
    grand={k:sum(p["totals"].get(k,0) for p in programs) for k in KEYS}
    grand["coverage"]=round(100*grand["cached"]/grand["indexed"],1) if grand["indexed"] else 0.0
    grand["works"]=sum(p["totals"].get("works",0) for p in programs)
    grand["virgin"]=sum(p["totals"]["virgin"] for p in programs)
    grand["estimate"]=sum(p["totals"]["estimate"] for p in programs)
    queue=sorted([{"program":p["program"],"year":g["year"],"remaining":g["remaining"],"virgin":False}
                  for p in programs for g in p["years"] if not g.get("virgin") and g["remaining"]>0],key=lambda x:-x["remaining"])
    frontier=sorted([{"program":p["program"],"year":g["year"],"remaining":g["estimate"] or gavg,"virgin":True,"priority":p["priority"]}
                     for p in programs for g in p["years"] if g.get("virgin")],key=lambda x:(x["priority"],x["year"]))
    advice=[]
    noch=[p["program"] for p in programs if not p.get("channel")]
    if noch: advice.append(f"{len(noch)} émission(s) sans chaîne : méthode B inactive. Renseigne-la dans 🎯 Cibles.")
    if grand["known"]: advice.append(f"{grand['known']} entrée(s) portent déjà leur œuvre depuis la liste : aucune fiche à télécharger. La moisson est acquise dans data/ina/listings/.")
    prose_n=sum(1 for n in notices.values() if n["scope"]=="programme")
    if prose_n: advice.append(f"{prose_n} notice(s) en prose : œuvres citées extraites au niveau émission, pas au niveau jour.")
    if grand["virgin"]: advice.append(f"{grand['virgin']} couple(s) jamais indexés — ≈ {grand['estimate']} entrées estimées.")
    if grand["outdated"]: advice.append(f"{grand['outdated']} notice(s) d'ancienne version : lance --rebuild (0 requête).")
    return {"generated_at":datetime.now().isoformat(),"parser_version":PARSER_VERSION,"global_avg":gavg,
            "fetch_mode":fetch_mode,"programs":programs,"orphans":orphans,"totals":grand,
            "queue":queue,"frontier":frontier,
            "health":{"advice":advice,"outdated":grand["outdated"],"virgin":grand["virgin"],
                      "known":grand["known"],"prose":prose_n,"orphans":sum(o['count'] for o in orphans)}}

def write_coverage(cov)->None:
    write_json(ROOT/"coverage.json",cov); g=cov["totals"]
    L=["# 🏛️ Couverture de la moisson INA","",
       f"_Généré le {cov['generated_at'][:19].replace('T',' à ')} — parser v{cov['parser_version']} · fetch={cov.get('fetch_mode')}_","",
       "> **A ∪ B** : le nom de l'émission est tantôt dans le titre propre, tantôt dans la colonne",
       "> Titre programme, tantôt les deux. On cumule ; l'appartenance est acceptée si l'un ou l'autre correspond.","",
       "> **Économie** : une ligne porte déjà date + collection + titre. Si l'œuvre en est déductible,",
       "> la fiche n'apporte rien (`Connues`) — la moisson est acquise dans `data/ina/listings/`.","",
       "> **Prose** : certains « Résumé documentaire » décrivent l'émission en phrases. Les œuvres citées",
       "> sont extraites au niveau **émission**, pas au niveau jour.","",
       "## Total","",
       f"- Jamais indexés : **{g['virgin']}** (≈ {g['estimate']})",
       f"- Entrées : **{g['indexed']}** · Connues sans téléchargement : **{g['known']}**",
       f"- À télécharger : **{g['need']}** · En cache : **{g['cached']}** ({g['coverage']} %)",
       f"- Œuvres distinctes : **{g['works']}** · Reste : **{g['remaining']}**","",
       "## Par émission","",
       "| Émission | Chaîne | Plage | Méth. | Vierge | Entrées | Connues | À fetch | Cache | Reste | % |",
       "|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for p in sorted(cov["programs"],key=lambda x:(x["priority"],x["program"].lower())):
        t=p["totals"]
        L.append(f"| {p['program']} | {p.get('channel') or '—'} | {p.get('from') or '?'}→{p.get('to') or '?'} | {','.join(p.get('methods') or []) or '—'} | {t['virgin']} | {t['indexed']} | {t['known']} | {t['need']} | {t['cached']} | {t['remaining']} | {t['coverage']} % |")
    L+=["","## Détail par année",""]
    for p in sorted(cov["programs"],key=lambda x:x["program"].lower()):
        L+=[f"### {p['program']}"+(f" · {p['channel']}" if p.get("channel") else ""),""]
        if p.get("programme_works"):
            L+=[f"**Œuvres citées au niveau émission** : {', '.join(p['programme_works'])}",""]
        L+=["| Année | État | Entrées | Via | Connues | À fetch | Cache | Œuvres | Reste |",
            "|---|---|---:|---|---:|---:|---:|---:|---:|"]
        for e in p["years"]:
            s="jamais indexé" if e.get("virgin") else ("complet" if e["remaining"]==0 else "en cours")
            if e.get("out_of_range"): s+=" (hors plage)"
            via=", ".join(f"{k}:{v}" for k,v in sorted((e.get("via") or {}).items())) or "—"
            L.append(f"| {e['year']} | {s} | {e['indexed']} | {via} | {e.get('known',0)} | {e.get('need',0)} | {e['cached']} | {e.get('works',0)} | {e['remaining']} |")
        L.append("")
    if cov["queue"]:
        L+=["## Complétions conseillées","","| Émission | Année | Reste |","|---|---|---:|"]
        for q in cov["queue"][:30]: L.append(f"| {q['program']} | {q['year']} | {q['remaining']} |")
    (ROOT/"COVERAGE.md").write_text("\n".join(L)+"\n",encoding="utf-8")

def print_coverage(cov,program=None)->None:
    print("\n"+"="*112); print("📊 COUVERTURE — A ∪ B · œuvre déductible = pas de téléchargement"); print("="*112)
    rows=[p for p in cov["programs"] if not program or norm(p["program"])==norm(program)]
    print(f"{'Émission':<28}{'Chaîne':<11}{'Méth':>5}{'Vierge':>7}{'Entrées':>8}{'Connues':>8}{'Àfetch':>7}{'Cache':>7}{'Reste':>7}{'%':>7}")
    print("-"*112)
    for p in sorted(rows,key=lambda x:(x["priority"],-x["totals"]["remaining"])):
        t=p["totals"]
        print(f"{p['program'][:27]:<28}{(p.get('channel') or '—')[:10]:<11}{','.join(p.get('methods') or []) or '—':>5}"
              f"{t['virgin']:>7}{t['indexed']:>8}{t['known']:>8}{t['need']:>7}{t['cached']:>7}{t['remaining']:>7}{t['coverage']:>6.1f}%")
    print("-"*112); g=cov["totals"]
    print(f"{'TOTAL':<28}{'':<11}{'':>5}{g['virgin']:>7}{g['indexed']:>8}{g['known']:>8}{g['need']:>7}{g['cached']:>7}{g['remaining']:>7}{g['coverage']:>6.1f}%")
    for a in cov["health"]["advice"]: print("💡 "+a)
    print("📄 COVERAGE.md · coverage.json · listings/ · explorateur : ina/collections.html")

def do_probe(client,program,channel,year,y0,y1,strategies,mode,fetch_mode,nb)->None:
    print("="*112); print(f"🔬 PROBE — {program} · {channel or 'chaîne non renseignée'} · match={mode} · fetch={fetch_mode}"); print("="*112)
    rows,log=harvest(client,program,channel,year,y0,y1,strategies,mode,False,nb)
    inr=[r for r in rows if y0<=int(r["date"].split("-")[2])<=y1]
    print(f"\n── {len(rows)} entrée(s) · {len(inr)} dans la plage {y0}-{y1} · {len(rows)-len(inr)} hors plage")
    print(f"── mères {sum(1 for r in inr if r['mother'])} · œuvre connue {sum(1 for r in inr if r.get('work'))} · à télécharger {sum(1 for r in inr if needs_fetch(r,fetch_mode))}")
    prof=year_profile(inr,fetch_mode)
    for y,g in sorted(prof.items()):
        via="".join(sorted(g["via"])); mt=", ".join(f"{k}:{v}" for k,v in sorted(g["match"].items()))
        print(f"   {y} · {g['total']:>5} entrée(s) · via {via:<4} · {mt:<36} · connues {g['known']:>5} · à fetch {g['need']:>5} · {g['works']} œuvre(s)")
    works={}
    for r in inr:
        if r["work"]: works[r["work"]]=works.get(r["work"],0)+1
    print(f"\n── {len(works)} œuvre(s) distincte(s)")
    for w,n in sorted(works.items(),key=lambda kv:-kv[1])[:30]: print(f"   {n:>5} × {w}")
    print("\n💡 Aucune écriture, aucune notice téléchargée.")

def diagnose(program,year)->None:
    print("="*112); print("🔬 DIAGNOSTIC (0 requête)"); print("="*112)
    notices=load_notices()
    print(f"Fichiers notices : {len(notices)} · prose {sum(1 for n in notices.values() if n['scope']=='programme')}")
    pw_map=programme_works_by_slug(notices)
    for p in load_targets()["programs"]:
        if program and norm(p["program"])!=norm(program): continue
        slug=p.get("slug") or slugify(p["program"])
        lis=read_json(LIS_DIR/f"{slug}.json") or {}; idx=read_json(IDX_DIR/f"{slug}.json") or {}
        ents=lis.get("entries") or []; fm=lis.get("fetch_mode","auto")
        print(f"\n▶ {p['program']} · « {p.get('channel') or 'NON RENSEIGNÉE'} » · {p['from']}→{p['to']} · {len(ents)} entrée(s) · fetch={fm}")
        if pw_map.get(slug): print(f"   📝 œuvres citées au niveau émission : {', '.join(pw_map[slug])}")
        for m in idx.get("discovery",[]):
            print(f"   [{m['method']}] {m['found']}/{m['total']} · colonne {m.get('by_programme',0)} · libellé {m.get('by_title',0)} · connues {m.get('works_known',0)} {m.get('note','')}")
        prof=lis.get("year_profile") or year_profile(ents,fm)
        for y,g in sorted(prof.items()):
            if year and int(y)!=year: continue
            print(f"   {y} · {g['total']} entrée(s) · via {''.join(sorted(g['via']))} · connues {g.get('known',0)} · à fetch {g.get('need',0)} · {g['works']} œuvre(s)")
        for nid,n in notices.items():
            if n["slug"]!=slug or n["scope"]!="programme": continue
            full=read_json(NOT_DIR/f"{nid}.json") or {}
            if full.get("description"): print(f"   📄 {nid} — {full['description'][:200]}…")


def run(args)->None:
    if args.diagnose: diagnose(args.program,args.year); return
    if args.targets_only:
        t=load_targets(); save_targets(t); cov=build_coverage(args.fetch); write_coverage(cov)
        print(f"🎯 Registre : {len(t['programs'])} émissions"); print_coverage(cov,args.program); return
    if args.report_only:
        cov=build_coverage(args.fetch); write_coverage(cov); print_coverage(cov,args.program); return
    if args.rebuild:
        normalize_cache(args.program); cov=build_coverage(args.fetch); write_coverage(cov); print_coverage(cov,args.program); return
    if not args.program:
        print("❌ --program requis (sauf --report-only / --rebuild / --diagnose / --targets-only)"); sys.exit(1)

    program=args.program; slug=slugify(program); tg=target_of(program)
    channel=args.channel or tg.get("channel","")
    y0=args.year_start if args.year_start!=1970 else int(tg.get("from",1970))
    y1=args.year_end if args.year_end!=1999 else int(tg.get("to",1999))
    nb=args.page_size; client=InaClient(delay=args.delay)

    if args.probe: do_probe(client,program,channel,args.year,y0,y1,args.strategies,args.match,args.fetch,nb); return

    print("="*112)
    print(f"🏛️ INA — {program} · « {channel or 'non renseignée'} » · "
          +(str(args.year) if args.year else f"{y0}-{y1}")
          +f" · {args.strategies} · match={args.match} · fetch={args.fetch} · nbLignes={nb}")
    print("="*112)

    if args.notices_only:
        cached=read_json(IDX_DIR/f"{slug}.json")
        if not cached: print(f"❌ Index absent : {IDX_DIR/f'{slug}.json'}"); sys.exit(1)
        lis=read_json(LIS_DIR/f"{slug}.json") or {}
        entries=lis.get("entries") or cached.get("notices",[])
        discovery=cached.get("discovery",[]); print(f"📂 Index en cache : {len(entries)} entrée(s)")
    else:
        entries,discovery=harvest(client,program,channel,args.year,y0,y1,args.strategies,args.match,args.allow_all,nb)
        prev=read_json(LIS_DIR/f"{slug}.json") or {}
        merged={entry_key(e):e for e in (prev.get("entries") or [])}
        for e in entries:
            k=entry_key(e)
            if k in merged:
                cur=merged[k].get("via","")
                merged[k]["via"]="".join(sorted(set(cur+e.get("via",""))))
                if not merged[k].get("work") and e.get("work"): merged[k]["work"]=e["work"]
                if merged[k].get("match_by")!="both" and e.get("match_by")=="both": merged[k]["match_by"]="both"
                if e.get("mother"): merged[k]["mother"]=True
            else: merged[k]=e
        allrows=sorted(merged.values(),key=lambda r:(r["date"].split("-")[2],r["date"].split("-")[1],r["date"].split("-")[0],r.get("start_raw","")))
        if args.all_years: entries=allrows; dropped=0
        else:
            entries=[e for e in allrows if y0<=int(e["date"].split("-")[2])<=y1]
            dropped=len(allrows)-len(entries)
        methods=sorted({m.get("letter","?") for m in discovery if m.get("found")})
        prof=year_profile(entries,args.fetch)
        write_json(LIS_DIR/f"{slug}.json",{"program":program,"slug":slug,"channel":channel,
            "updated_at":datetime.now().isoformat(),"parser_version":PARSER_VERSION,
            "match_mode":args.match,"fetch_mode":args.fetch,"range":[y0,y1],"dropped_out_of_range":dropped,
            "methods":methods,"discovery":discovery,"year_profile":prof,"count":len(entries),"entries":entries})
        dl=[e for e in entries if has_link(e)]
        write_json(IDX_DIR/f"{slug}.json",{"program":program,"slug":slug,"channel":channel,
            "harvested_at":datetime.now().isoformat(),"count":len(dl),"fetch_mode":args.fetch,
            "listings_count":len(entries)-len(dl),"discovery":discovery,"notices":dl})
        need=[e for e in entries if needs_fetch(e,args.fetch)]
        print(f"\n✅ MOISSON ACQUISE : {len(entries)} diffusion(s) datée(s) → data/ina/listings/{slug}.json"
              +(f" · {dropped} hors plage écartée(s)" if dropped else ""))
        print(f"   œuvre déjà connue : {sum(1 for e in entries if e.get('work'))} · fiches à télécharger : {len(need)} · mères : {sum(1 for e in entries if e.get('mother'))}")
        print("   par année : "+", ".join(f"{y}:{g['total']}" for y,g in sorted(prof.items())))
        works=sorted({e["work"] for e in entries if e.get("work")})
        print(f"   {len(works)} œuvre(s) : "+", ".join(works[:12])+(" …" if len(works)>12 else ""))
        register_target(program,entries,channel)

    if args.index_only or not entries:
        normalize_cache(None,verbose=False); cov=build_coverage(args.fetch); write_coverage(cov); print_coverage(cov,program); return
    if args.year:
        entries=[e for e in entries if e["date"].endswith(f"-{args.year}")]
        print(f"\n🎯 Année {args.year} : {len(entries)} entrée(s)")

    pending=[]; known_n=old_n=empty_n=missing_n=nolink_n=0
    for e in entries:
        if not has_link(e): nolink_n+=1; continue
        if not needs_fetch(e,args.fetch): known_n+=1; continue
        nid=e["notice_id"].upper()
        ex=read_json(NOT_DIR/f"{nid}.json")
        if ex is None: missing_n+=1; pending.append(e); continue
        v=ex.get("parser_version",0)
        if v!=PARSER_VERSION: old_n+=1
        has=bool(ex.get("elements")) or bool(ex.get("programme_works"))
        if not has: empty_n+=1
        if args.force or (args.refresh_stale and v!=PARSER_VERSION) or (args.retry_empty and not has): pending.append(e)
    tp=len(pending)
    print(f"♻️ Sans lien {nolink_n} · œuvre connue (fiche inutile) {known_n} · notices en cache {len(entries)-nolink_n-known_n-missing_n}")
    print(f"   ancienne version {old_n} · sans œuvre {empty_n} · absentes {missing_n} · file {tp}")
    if args.max_notices>0: pending=pending[:args.max_notices]
    print(f"▶️ Ce run : {len(pending)} fiche(s) · resteront {tp-len(pending)}")
    if not pending:
        print("✅ Aucune fiche à télécharger : la liste suffit, la moisson est complète.")
        normalize_cache(None); cov=build_coverage(args.fetch); write_coverage(cov); print_coverage(cov,program); return
    print(f"   (délai ~{args.delay}s)\n")
    ok=withe=els=fails=proses=0
    for i,e in enumerate(pending,1):
        nid=e["notice_id"].upper()
        print(f"[{i}/{len(pending)}] {nid} · {e['date']} {e.get('start_raw','')[:8]} ...",end=" ",flush=True)
        html=client.get(e["url"])
        if not html:
            fails+=1; print("✗")
            if fails>=8: print("\n🛑 Trop d'échecs — arrêt propre."); break
            continue
        try: n=parse_notice(html,nid,e["url"],program)
        except Exception as ex: fails+=1; print(f"✗ parsing: {ex}"); continue
        n["date"]=n.get("date") or e["date"]; n["channel"]=n.get("channel") or e.get("channel","")
        n["start"]=n.get("start") or e.get("start",""); n["start_raw"]=n.get("start_raw") or e.get("start_raw","")
        if not n.get("collection") and e.get("collection"): n["collection"]=e["collection"]
        if not n["elements"] and not n["programme_works"] and e.get("work"): n["elements"]=[e["work"]]
        write_json(NOT_DIR/f"{nid}.json",n); ok+=1; fails=0
        if n["scope"]=="programme":
            proses+=1
            print(f"📝 prose — description de l'émission + {len(n['programme_works'])} œuvre(s) citée(s) : {', '.join(n['programme_works'][:6]) or 'aucune'}")
        else:
            c=len(n["elements"])
            if c: withe+=1; els+=c; print(f"✓ {c} [{n['elements_field']}] — {' · '.join(n['elements'][:4])}")
            else: print("✓ parsée, sans œuvre (mise en cache)")
    normalize_cache(None); cov=build_coverage(args.fetch); write_coverage(cov)
    print("\n"+"="*112); print("🎉 RUN TERMINÉ"); print("="*112)
    print(f"Fiches : {ok} · sommaires : {withe} ({els} œuvres) · descriptions d'émission : {proses}")
    print_coverage(cov,program)


def main()->None:
    p=argparse.ArgumentParser(description="Moissonneur INA — A ∪ B, triage, prose vs liste")
    p.add_argument("--program"); p.add_argument("--channel",default="")
    p.add_argument("--year",type=int)
    p.add_argument("--year-start",type=int,default=1970); p.add_argument("--year-end",type=int,default=1999)
    p.add_argument("--strategies",choices=["both","legacy","channel","hybrid"],default="both")
    p.add_argument("--match",choices=["any","programme","title","both"],default="any")
    p.add_argument("--fetch",choices=["auto","mothers","all","none"],default="auto")
    p.add_argument("--page-size",type=int,default=PAGE_SIZE)
    p.add_argument("--max-notices",type=int,default=400)
    p.add_argument("--all-years",action="store_true")
    p.add_argument("--index-only",action="store_true"); p.add_argument("--notices-only",action="store_true")
    p.add_argument("--allow-all",action="store_true"); p.add_argument("--force",action="store_true")
    p.add_argument("--retry-empty",action="store_true"); p.add_argument("--refresh-stale",action="store_true")
    p.add_argument("--report-only",action="store_true"); p.add_argument("--rebuild",action="store_true")
    p.add_argument("--targets-only",action="store_true"); p.add_argument("--diagnose",action="store_true")
    p.add_argument("--probe",action="store_true"); p.add_argument("--delay",type=float,default=3.0)
    run(p.parse_args())

if __name__=="__main__": main()