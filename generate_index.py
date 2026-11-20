#!/usr/bin/env python3
"""
Index TV rétro — fusion sources + routage chaînes + INA + overrides manuels.

ORDRE D'APPLICATION
  1. lecture des sources (depot101, archives80) — data/AAAA.json est RÉGÉNÉRÉ,
     ne jamais le remplacer à la main
  2. data/channel-routing.json : routes (libellé brut → chaîne), puis
     program_overrides (reassign / hide) par signature date|heure|titre|brut
  3. notices INA (sommaires)
  4. data/overrides/AAAA.json (tv-retro-edit)
  5. écriture data/AAAA.json, index.json, search/*.json

`raw_channel` est conservé sur chaque programme : l'outil de doublons peut donc
toujours relire le libellé d'origine, même après application du routage.
"""

import json, os, re, unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

SOURCES=["depot101","archives80"]
ROUTING_PATH=Path("data/channel-routing.json")
CHANNEL_ORDER=["ORTF 1","ORTF 2","ORTF 3","TF1","Antenne 2","France 2","FR3","France 3","Canal+","TV6","M6","La Cinq","La Sept","Arte","La Cinquième","France 5"]
CHANNEL_ALIASES={
 "OR1":"ORTF 1","OR2":"ORTF 2","OR3":"ORTF 3","ORTF 1":"ORTF 1","ORTF 2":"ORTF 2","ORTF 3":"ORTF 3","ORTF1":"ORTF 1","ORTF2":"ORTF 2","ORTF3":"ORTF 3",
 "PREMIÈRE CHAÎNE":"ORTF 1","PREMIERE CHAINE":"ORTF 1","DEUXIÈME CHAÎNE":"ORTF 2","DEUXIEME CHAINE":"ORTF 2","TROISIÈME CHAÎNE":"ORTF 3","TROISIEME CHAINE":"ORTF 3",
 "TF1":"TF1","A2":"Antenne 2","ANTENNE 2":"Antenne 2","F2":"France 2","FRANCE 2":"France 2","FR3":"FR3","FR 3":"FR3","F3":"France 3","FRANCE 3":"France 3",
 "C+":"Canal+","CANAL+":"Canal+","CANAL":"Canal+","TV6":"TV6","L5":"La Cinq","LA5":"La Cinq","LA 5":"La Cinq","LA CINQ":"La Cinq","CINQ":"La Cinq","5":"La Cinq",
 "LA CINQUIEME":"La Cinquième","LA CINQUIÈME":"La Cinquième","M6":"M6","6":"M6","LA SEPT":"La Sept","L7":"La Sept","LA7":"La Sept","LA 7":"La Sept","ARTE":"Arte","FRANCE 5":"France 5"}
CHANNEL_COMPACT={"OR1":"ORTF 1","OR2":"ORTF 2","OR3":"ORTF 3","ORTF1":"ORTF 1","ORTF2":"ORTF 2","ORTF3":"ORTF 3","TF1":"TF1","A2":"Antenne 2","ANTENNE2":"Antenne 2","F2":"France 2","FRANCE2":"France 2","FR3":"FR3","F3":"France 3","FRANCE3":"France 3","C+":"Canal+","CANAL+":"Canal+","CANAL":"Canal+","TV6":"TV6","L5":"La Cinq","LA5":"La Cinq","LACINQ":"La Cinq","CINQ":"La Cinq","5":"La Cinq","LACINQUIEME":"La Cinquième","M6":"M6","6":"M6","LASEPT":"La Sept","L7":"La Sept","LA7":"La Sept","ARTE":"Arte","FRANCE5":"France 5"}
CHANNEL_REGEX=[
 (re.compile(r"^OR\s*1$",re.I),"ORTF 1"),(re.compile(r"^OR\s*2$",re.I),"ORTF 2"),(re.compile(r"^OR\s*3$",re.I),"ORTF 3"),
 (re.compile(r"^ORTF\s*1$",re.I),"ORTF 1"),(re.compile(r"^ORTF\s*2$",re.I),"ORTF 2"),(re.compile(r"^ORTF\s*3$",re.I),"ORTF 3"),
 (re.compile(r"^C\s*\+$",re.I),"Canal+"),(re.compile(r"^TV\s*6$",re.I),"TV6"),(re.compile(r"^L\s*5$",re.I),"La Cinq"),
 (re.compile(r"^LA\s*CINQ$",re.I),"La Cinq"),(re.compile(r"^LA\s*CINQUIEME$",re.I),"La Cinquième"),(re.compile(r"^LA\s*CINQUIÈME$",re.I),"La Cinquième"),
 (re.compile(r"^CINQ$",re.I),"La Cinq"),(re.compile(r"^A\s*2$",re.I),"Antenne 2"),(re.compile(r"^FR\s*3$",re.I),"FR3"),
 (re.compile(r"^F\s*2$",re.I),"France 2"),(re.compile(r"^F\s*3$",re.I),"France 3"),(re.compile(r"^FRANCE\s*2$",re.I),"France 2"),
 (re.compile(r"^FRANCE\s*3$",re.I),"France 3"),(re.compile(r"^FRANCE\s*5$",re.I),"France 5"),(re.compile(r"^M\s*6$",re.I),"M6"),
 (re.compile(r"^LA\s*SEPT$",re.I),"La Sept"),(re.compile(r"^L\s*7$",re.I),"La Sept"),(re.compile(r"^LA\s*7$",re.I),"La Sept")]
NIGHT_CUTOFF_HOUR=5; INA_TOLERANCE_MINUTES=60
DATE_A2_TO_F2=datetime(1992,9,7); DATE_FR3_TO_F3=datetime(1992,9,7); DATE_SEPT_TO_ARTE=datetime(1992,1,1)
GENRES=["jeunesse","jeu","feuilleton","série","film","téléfilm","documentaire","magazine","variétés","journal","sport","musique","humour","débat","religieux","téléachat","autre"]
YOUTH_PROGRAMS=("Les Visiteurs du mercredi","Les Visiteurs de Noël","Croque-Vacances","Le Village dans les nuages","Vitamine","Club Dorothée","Club Dorothee","Disney Parade","Disney Club","Club Mini","À tout Spip","A tout Spip","TF! Jeunesse","TF Jeunesse","Avant l'école","Récré A2","Recre A2","Discopuce","Bécébégé","Giga","Télévisator 2","Chalu Maureen","La Planète de Donkey Kong","Graffitis","FR3 Jeunesse","France 3 Jeunesse","Le Disney Channel","Disney Channel","Debout les enfants","Amuse 3","Samdynamite","Télétaz","Teletaz","Les Minikeums","Minikeums","C'est pas sorcier","Ça cartoon","Ca cartoon","Décode pas Bunny","Canaille Peluche","Cabou Cadin","Youpi","Cellulo","Les Zouzous","Zouzous","Graffi'6","M6 Kid","Multitop","Le réveil des babalous","Les Quat'z Amis","Sido et Rémi","Papivole","La Caverne d'Abracadabra","L'école buissonnière","Salut les Musclés","Premiers baisers","Les années fac")
META_STARTS=("emission","presentation","presente","presentee","avec","produit","film","telefilm","dessin anime","dessins anime","opera","jeu","debate","debats","magazine","reportage","documentaire","concert","journal","rubrique","page","pub","publicite","annonce","annonces","meteo","realisation","realise","mise en scene","diffusion","suite","rediffusion","prochainement","speakerine","musique","chanson","interview","document","anime","ecrit","interprete","distribution","un film","un telefilm","un dessin","un opera","un concert","un journal","une emission","un jeu","un magazine","un reportage","un documentaire","programme","programme jeunesse","jeunesse")
GENRE_RULES=[("téléachat",[r"\bteleachat\b",r"\bteleshopping\b"]),("religieux",[r"\breligieux\b",r"\breligieuse\b",r"\bmesse\b",r"jour du seigneur"]),("journal",[r"\bjournal\b",r"\bjt\b",r"\bflash infos?\b",r"\bsoir 3\b",r"\b19 20\b"]),("jeu",[r"\bjeu\b",r"\bjeux\b",r"\bquiz\b",r"\bloto\b"]),("sport",[r"\bsport\b",r"\bsports\b",r"\btierce\b",r"\bstade\b",r"\bfootball\b",r"\brugby\b",r"\btennis\b",r"\bcyclisme\b",r"\bcatch\b"]),("feuilleton",[r"\bfeuilleton\b"]),("série",[r"\bserie\b"]),("téléfilm",[r"\btelefilm\b"]),("film",[r"\bfilm\b"]),("documentaire",[r"\bdocumentaire\b"]),("variétés",[r"\bvarietes?\b"]),("musique",[r"\bmusique\b",r"\bconcert\b",r"\bclips?\b",r"\bchansons?\b",r"\bopera\b"]),("humour",[r"\bhumoristique\b",r"\bhumour\b"]),("débat",[r"\bdebats?\b"]),("magazine",[r"\bmagazine\b"])]
PEOPLE_PATTERNS=[r"pr[ée]sent\w*\s+par\s+([^.]+)",r"anim\w*\s+par\s+([^.]+)",r"pr[ée]sentation\s*:?\s*([^.]+)",r"\bavec\s+([^.]+)",r"\b[ée]mission\s+de\s+([^.]+)"]
PEOPLE_NOISE=("varietes","jeunesse","musique","decouverte","information","consommation","religieu","tele","histoire","region")


def norm(v:Any)->str:
    if v is None: return ""
    t=unicodedata.normalize("NFD",str(v).strip())
    t="".join(c for c in t if unicodedata.category(c)!="Mn").lower()
    t=re.sub(r"['’]"," ",t)
    return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9\s]"," ",t)).strip()
def compact(v:Any)->str: return re.sub(r"\s+","",norm(v))
def rawkey(v:Any)->str: return compact(v).upper()
def slug_channel(c:str)->str: return re.sub(r"\s+","-",norm(c)).strip("-") or "autre"
YOUTH_N=tuple(norm(x) for x in YOUTH_PROGRAMS)

def ndate(v:Any)->Optional[str]:
    if not v: return None
    s=str(v).strip(); p=s.split("-") if "-" in s else s.split("/") if "/" in s else []
    if len(p)!=3: return None
    try:
        if len(p[0])==4: y,m,d=int(p[0]),int(p[1]),int(p[2])
        else: d,m,y=int(p[0]),int(p[1]),int(p[2])
        datetime(y,m,d); return f"{d:02d}-{m:02d}-{y}"
    except Exception: return None
def ntime(v:Any)->str:
    if not v: return ""
    m=re.match(r"^(\d{1,2})[:h.](\d{2})",str(v).strip(),re.I)
    if not m: return ""
    h,mi=int(m.group(1)),int(m.group(2))
    return "" if h>23 or mi>59 else f"{h:02d}:{mi:02d}"
def tkey(t:str)->int:
    if not t or ":" not in t: return 9999
    try: h,m=map(int,t.split(":"))
    except Exception: return 9999
    return (h-NIGHT_CUTOFF_HOUR)*60+m if h>=NIGHT_CUTOFF_HOUR else (h+24-NIGHT_CUTOFF_HOUR)*60+m
def canonical(v:Any,ds:Optional[str]=None)->str:
    raw=str(v or "").strip()
    if not raw: return "Autres"
    up=raw.upper(); cp=re.sub(r"\s+","",up)
    c=CHANNEL_ALIASES.get(up) or CHANNEL_COMPACT.get(cp)
    if not c:
        c=raw
        for rx,name in CHANNEL_REGEX:
            if rx.match(raw): c=name; break
    if not ds: return c
    try: dt=datetime.strptime(ds,"%d-%m-%Y")
    except Exception: return c
    n=norm(c)
    if n in ("f2","france 2","antenne 2","a2"): return "Antenne 2" if dt<DATE_A2_TO_F2 else "France 2"
    if n in ("f3","france 3","fr3"): return "FR3" if dt<DATE_FR3_TO_F3 else "France 3"
    if n in ("la cinq","l5","la5","cinq","5"): return "La Cinq"
    if n=="la cinquieme": return "La Cinquième"
    if n in ("m6","6"): return "M6"
    if n in ("la sept","l7","la7"): return "Arte" if dt>=DATE_SEPT_TO_ARTE else "La Sept"
    return c
def crank(c:str)->int:
    try: return CHANNEL_ORDER.index(c)
    except ValueError: return len(CHANNEL_ORDER)+1
def ctitle(v:Any)->str:
    t=re.sub(r"\s+"," ",str(v or "").strip())
    p=re.split(r"\s+[-–—]\s+",t)
    if len(p)==2 and norm(p[0])==norm(p[1]): return p[0].strip()
    return t
def load_json(p:Path)->Optional[Any]:
    try:
        with open(p,"r",encoding="utf-8") as f: return json.load(f)
    except Exception: return None
def dedupe_lines(ls:List[str])->List[str]:
    out=[]
    for l in ls:
        l=str(l or "").strip()
        if l and (not out or l!=out[-1]): out.append(l)
    return out
def merge_lines(a:List[str],b:List[str])->List[str]:
    seen={norm(x) for x in a}; out=list(a)
    for l in b:
        l=str(l or "").strip(); k=norm(l)
        if l and k and k not in seen: out.append(l); seen.add(k)
    return out
def is_youth_title(t:str)->bool:
    n=norm(t); return bool(n) and any(k in n for k in YOUTH_N)
def is_youth(p:Dict)->bool:
    if is_youth_title(p.get("title","")): return True
    for l in p.get("description_lines") or []:
        n=norm(l)
        if n in ("jeunesse","programme jeunesse") or n.startswith("programme jeunesse"): return True
    return False
def is_meta(l:str)->bool:
    n=norm(l); return not n or any(n.startswith(x) for x in META_STARTS)
def item_like(l:str)->bool:
    t=str(l or "").strip()
    if len(t)<3 or len(t)>160 or is_meta(t): return False
    if re.match(r"^\d{1,2}[:h.]\d{2}$",t,re.I) or t.startswith(("©","http","www.")): return False
    return norm(t) not in ("","-","—","–")
def build_segments(p:Dict)->List[Dict]:
    ls=dedupe_lines([str(x).strip() for x in (p.get("description_lines") or []) if str(x).strip()])
    nt=norm(ctitle(p.get("title",""))); youth=is_youth(p); out=[]
    for i,l in enumerate(ls):
        if norm(l)==nt or not item_like(l): continue
        if not youth and not re.search(r"\s[-–—]\s",l): continue
        t=ctitle(l)
        if t and norm(t)!=nt: out.append({"index":i,"title":t,"raw":l})
    return out
def genre_of(p:Dict)->str:
    if is_youth(p): return "jeunesse"
    txt=norm(f"{p.get('title','')} {p.get('description','')}")
    for g,pats in GENRE_RULES:
        for pat in pats:
            if re.search(pat,txt): return g
    return "autre"
def people_of(p:Dict)->str:
    d=str(p.get("description","") or "")
    if not d: return ""
    found=[]
    for pat in PEOPLE_PATTERNS:
        for m in re.finditer(pat,d,re.I):
            s=re.split(r"\b(présenté|présentée|animé|animée|émission|film|série|feuilleton|rediffusion|produit)\b",m.group(1).strip(),flags=re.I)[0].strip(" ,;:-")
            if s and not any(norm(s).startswith(n) for n in PEOPLE_NOISE): found.append(s[:120])
    seen=set(); out=[]
    for s in found:
        k=norm(s)
        if k and k not in seen: seen.add(k); out.append(s)
    return ", ".join(out)
def split_people(s:str)->List[str]:
    return [x.strip() for x in re.split(r",| et ",s or "") if len(x.strip())>=3 and not re.search(r"\d",x)]
def pkey(t:str,c:str,title:str)->str: return f"{t}|{c}" if t else f"{norm(title)}|{c}"
def sort_programs(ps:List[Dict])->List[Dict]:
    return sorted(ps,key=lambda p:(crank(p.get("channel","")),tkey(p.get("time","")),norm(p.get("title",""))))
def group_channel(ps:List[Dict])->Dict[str,List[Dict]]:
    g:Dict[str,List]={}
    for p in ps: g.setdefault(p.get("channel") or "Autres",[]).append(p)
    return {c:sorted(g[c],key=lambda p:(tkey(p.get("time","")),norm(p.get("title","")))) for c in sorted(g,key=crank)}
def signature(ds:str,t:str,title:str,raw:str)->str:
    return f"{ds}|{t or ''}|{norm(title)}|{rawkey(raw)}"


# ---------- routage chaînes ----------
def load_routing()->Dict:
    d=load_json(ROUTING_PATH) or {}
    routes={}
    for k,v in (d.get("routes") or {}).items():
        kk=rawkey(k)
        if kk and v: routes[kk]=str(v)
    ov={}; unmatched=[]
    for k,v in (d.get("program_overrides") or {}).items():
        if not isinstance(v,dict): continue
        ds=ndate(v.get("date")) or str(v.get("date") or "")
        t=ntime(v.get("time")); ti=norm(v.get("title")); rk=rawkey(v.get("raw_channel") or v.get("raw") or "")
        s=v.get("sig") or (k if "|" in k else signature(ds,t,v.get("title",""),v.get("raw_channel","")))
        act=v.get("action") or v.get("act") or "reassign"
        ch=v.get("channel") or v.get("ch") or ""
        if not ds: unmatched.append(k); continue
        rec={"action":act,"channel":ch,"date":ds,"time":t,"title":ti,"raw":rk}
        ov[s]=rec
        if rk: ov[f"{ds}|{t}|{ti}|{rk}"]=rec
        ov[f"{ds}|{t}|{ti}|{rawkey(ch)}"]=rec
    order=[c for c in (d.get("channel_order") or []) if c in CHANNEL_ORDER]
    for c in CHANNEL_ORDER:
        if c not in order: order.append(c)
    legit=set(d.get("legit_duplicates") or [])
    if routes or ov:
        print(f"🧭 Routage chaînes : {len(routes)} route(s) · {len(d.get('program_overrides') or {})} décision(s) · {len(legit)} diffusion(s) légitime(s)")
    else:
        print("🧭 Routage chaînes : aucun fichier data/channel-routing.json (ou vide)")
    return {"routes":routes,"ov":ov,"order":order,"legit":legit,"raw":d,"unmatched":unmatched}

def routed_channel(raw:Any,ds:str,R:Dict)->Tuple[str,str]:
    s=str(raw or "").strip()
    hit=R["routes"].get(rawkey(s))
    return (hit or s),("route" if hit else "")

def merge_program(target:Dict,p:Dict,ds:str,R:Dict)->None:
    t=ntime(p.get("time","")); raw=str(p.get("channel","") or "").strip()
    lab,how=routed_channel(raw,ds,R)
    c=canonical(lab,ds) or "Autres"
    title=ctitle(p.get("title","")) or "Programme non identifié"
    desc=re.sub(r"\s+"," ",str(p.get("description","") or "").strip())
    ls=p.get("description_lines") or []
    if not isinstance(ls,list): ls=[]
    ls=dedupe_lines([str(x).strip() for x in ls if str(x).strip()])
    k=pkey(t,c,title)
    if k not in target:
        target[k]={"time":t,"channel":c,"raw_channel":raw,"title":title,"description":desc,"description_lines":ls}
        if how: target[k]["routed"]=True
        return
    e=target[k]
    if len(title)>len(e.get("title","")): e["title"]=title
    if len(desc)>len(e.get("description","")): e["description"]=desc
    e["description_lines"]=merge_lines(e.get("description_lines",[]),ls)
    if not e.get("time") and t: e["time"]=t
    if not e.get("raw_channel") and raw: e["raw_channel"]=raw

def apply_routing(ds:str,entry:Dict,R:Dict)->Dict[str,int]:
    st={"hidden":0,"reassigned":0,"matched":0}
    if not R["ov"]: return st
    out={}
    for _,p in list(entry["programs"].items()):
        raw=p.get("raw_channel","") or p.get("channel","")
        s=signature(ds,p.get("time",""),p.get("title",""),raw)
        o=R["ov"].get(s) or R["ov"].get(f"{ds}|{p.get('time','')}|{norm(p.get('title',''))}|{rawkey(p.get('channel',''))}")
        if o:
            st["matched"]+=1
            if o["action"]=="hide": st["hidden"]+=1; continue
            if o["action"]=="reassign" and o["channel"]:
                p["channel"]=canonical(o["channel"],ds); p["reassigned"]=True; st["reassigned"]+=1
        k=pkey(p.get("time",""),p.get("channel",""),p.get("title",""))
        if k in out:
            e=out[k]
            if len(p.get("title",""))>len(e.get("title","")): e["title"]=p["title"]
            if len(p.get("description",""))>len(e.get("description","")): e["description"]=p["description"]
            e["description_lines"]=merge_lines(e.get("description_lines",[]),p.get("description_lines",[]))
            st["hidden"]+=1
        else: out[k]=p
    entry["programs"]=out
    return st


# ---------- INA ----------
def load_ina()->Dict[Tuple[str,str],List[Dict]]:
    d=Path("data/ina/notices"); idx:Dict[Tuple[str,str],List]=[]if False else {}
    if not d.exists(): return idx
    n=0
    for path in sorted(d.glob("*.json")):
        no=load_json(path)
        if not no or not no.get("date") or not no.get("elements"): continue
        ds=ndate(no["date"])
        if not ds: continue
        idx.setdefault((ds,canonical(no.get("channel",""),ds)),[]).append(no); n+=1
    if n: print(f"🏛️ INA : {n} notices exploitables")
    return idx
def sim(a:str,b:str)->float:
    na,nb=norm(a),norm(b)
    if not na or not nb: return 0.0
    if na==nb: return 1.0
    if na in nb or nb in na: return 0.9
    sa,sb=set(na.split()),set(nb.split())
    return len(sa&sb)/min(len(sa),len(sb)) if sa and sb else 0.0
def find_ina(p:Dict,ds:str,idx)->Optional[Dict]:
    cands=idx.get((ds,p.get("channel","")))
    if not cands: return None
    best=None; score=None
    for no in cands:
        s=sim(p.get("title",""),no.get("programme",""))
        if s<0.6: continue
        dist=abs(tkey(p.get("time",""))-tkey(ntime(no.get("start",""))))
        if dist>INA_TOLERANCE_MINUTES: continue
        k=(dist,-s)
        if score is None or k<score: best,score=no,k
    return best
def apply_ina(p:Dict,no:Dict)->int:
    merged=[]; seen={norm(p.get("title",""))}
    for i,t in enumerate(no.get("elements") or []):
        k=norm(t)
        if k and k not in seen: seen.add(k); merged.append({"index":i,"title":t,"raw":t,"source":"ina"})
    added=len(merged)
    for seg in p.get("segments") or []:
        k=norm(seg.get("title",""))
        if k and k not in seen: seen.add(k); merged.append(seg)
    p["segments"]=merged; p["ina_notice"]=no.get("notice_id",""); p["ina_url"]=no.get("url","")
    return added


# ---------- overrides tv-retro-edit ----------
def make_pid(ds:str,t:str,c:str)->str:
    return f"{ndate(ds) or ds}__{str(t or 'sans-heure').replace(':','h')}__{slug_channel(c)}__p"
def load_overrides()->Dict[str,Dict]:
    d=Path("data/overrides"); out={}; total=0
    if not d.exists(): return out
    for path in sorted(d.glob("*.json")):
        data=load_json(path) or {}
        y=str(data.get("year") or path.stem); pr=data.get("programs") or {}
        if isinstance(pr,dict) and pr: out[y]=pr; total+=len(pr)
    if total: print(f"✏️ Overrides : {total} corrections ({len(out)} années)")
    return out
def els_to_segs(titles:List[str])->List[Dict]:
    out=[]; seen=set()
    for i,t in enumerate(titles):
        t=str(t or "").strip(); k=norm(t)
        if t and k and k not in seen: seen.add(k); out.append({"index":i,"title":t,"raw":t,"source":"manual"})
    return out
def apply_ov_fields(p:Dict,ov:Dict)->None:
    for f in ("title","description","time","channel"):
        if ov.get(f) not in (None,""):
            v=ov[f]
            if f=="time": v=ntime(v)
            if f=="channel": v=canonical(v,ov.get("date"))
            if f=="title": v=ctitle(v)
            p[f]=v
    els=ov.get("elements")
    if isinstance(els,list):
        man=els_to_segs(els)
        if ov.get("elements_mode")=="replace": p["segments"]=man
        else:
            seen={norm(s["title"]) for s in man}; seen.add(norm(p.get("title","")))
            for seg in p.get("segments") or []:
                k=norm(seg.get("title",""))
                if k and k not in seen: seen.add(k); man.append(seg)
            p["segments"]=man
    if ov.get("note"): p["note"]=str(ov["note"])
    if ov.get("locked"): p["locked"]=True
    p["edited"]=True
def apply_ovs(ds:str,entry:Dict,ovm:Dict)->Dict[str,int]:
    st={"patched":0,"hidden":0,"added":0}
    progs=entry["programs"]
    if not ovm: return st
    for k,p in list(progs.items()):
        ov=ovm.get(make_pid(ds,p.get("time",""),p.get("channel","")))
        if not ov: continue
        if ov.get("action")=="hide": progs.pop(k,None); st["hidden"]+=1; continue
        if ov.get("action")=="add": continue
        apply_ov_fields(p,ov); st["patched"]+=1
    for pid,ov in ovm.items():
        if ov.get("action")!="add" or ov.get("date")!=ds: continue
        p={"time":ntime(ov.get("time","")),"channel":canonical(ov.get("channel",""),ds),
           "raw_channel":ov.get("channel",""),"title":ctitle(ov.get("title","")) or "Programme",
           "description":"","description_lines":[],"segments":[]}
        apply_ov_fields(p,ov); progs[pkey(p["time"],p["channel"],p["title"])]=p; st["added"]+=1
    return st


def generate_index()->None:
    print("="*78); print("📊 INDEX TV RÉTRO — sources → routage → INA → overrides"); print("="*78)
    R=load_routing()
    all_dates:Dict[str,Dict]={}; root=Path("data")
    if root.exists():
        for stray in root.glob("??-??-????.json"):
            try: stray.unlink()
            except Exception: pass
    files=loaded=0
    for src in SOURCES:
        d=Path(f"data/{src}")
        if not d.exists(): print(f"⚠️ Absent : {d}"); continue
        fs=sorted(d.glob("*.json")); files+=len(fs); print(f"📂 {src} : {len(fs)} fichiers")
        for path in fs:
            data=load_json(path)
            if not data: continue
            ds=ndate(data.get("date") or path.stem)
            if not ds: continue
            ps=data.get("programs",[])
            if not isinstance(ps,list): continue
            e=all_dates.setdefault(ds,{"date":ds,"sources":set(),"programs":{}})
            e["sources"].add(src)
            for p in ps:
                if isinstance(p,dict): merge_program(e["programs"],p,ds,R); loaded+=1
    print(f"\n✅ {files} fichiers · {loaded} programmes sources · {len(all_dates)} dates")
    ina=load_ina(); ovs=load_overrides()
    years:Dict[str,Dict]={}; segs=ina_n=ina_e=0
    rt={"hidden":0,"reassigned":0,"matched":0}; os_={"patched":0,"hidden":0,"added":0}
    for ds,entry in all_dates.items():
        y=ds.split("-")[2]; ovm=ovs.get(y,{})
        s=apply_routing(ds,entry,R)
        for k in rt: rt[k]+=s[k]
        for p in entry["programs"].values():
            p["description_lines"]=dedupe_lines(p.get("description_lines",[]))
            p["segments"]=build_segments(p)
            ov=ovm.get(make_pid(ds,p.get("time",""),p.get("channel","")))
            if ov and ov.get("locked"): continue
            no=find_ina(p,ds,ina) if ina else None
            if no: ina_e+=apply_ina(p,no); ina_n+=1
        s2=apply_ovs(ds,entry,ovm)
        for k in os_: os_[k]+=s2[k]
        plist=sort_programs(list(entry["programs"].values()))
        for p in plist: segs+=len(p.get("segments") or [])
        payload={"date":ds,"source":"+".join(sorted(entry["sources"])),"programs_count":len(plist),
                 "programs":plist,"channels":group_channel(plist)}
        yy=years.setdefault(y,{"dates":{},"total_programs":0})
        yy["dates"][ds]=payload; yy["total_programs"]+=len(plist)
    for y,ovm in ovs.items():
        for pid,ov in ovm.items():
            if ov.get("action")!="add": continue
            ds=ov.get("date")
            if not ds or ds in all_dates: continue
            entry={"date":ds,"sources":{"edit"},"programs":{}}
            apply_ovs(ds,entry,ovm); all_dates[ds]=entry
            plist=sort_programs(list(entry["programs"].values()))
            for p in plist: segs+=len(p.get("segments") or [])
            yy=years.setdefault(y,{"dates":{},"total_programs":0})
            yy["dates"][ds]={"date":ds,"source":"edit","programs_count":len(plist),"programs":plist,"channels":group_channel(plist)}
            yy["total_programs"]+=len(plist)
    sy=dict(sorted(years.items(),key=lambda kv:int(kv[0])))
    routing_stats={"routes":len(R["routes"]),"decisions":len(R["raw"].get("program_overrides") or {}),
                   "matched":rt["matched"],"hidden":rt["hidden"],"reassigned":rt["reassigned"],
                   "legit":len(R["legit"]),"present":bool(R["routes"] or R["ov"]),
                   "applied_at":datetime.now().isoformat()}
    index={"generated_at":datetime.now().isoformat(),
           "total_dates":sum(len(y["dates"]) for y in sy.values()),
           "total_programs":sum(y["total_programs"] for y in sy.values()),
           "total_segments":segs,"ina_enriched":ina_n,"overrides":os_,
           "channel_routing":routing_stats,"years":{}}
    for y,yy in sy.items():
        ordered=dict(sorted(yy["dates"].items(),key=lambda kv:(int(kv[0].split("-")[2]),int(kv[0].split("-")[1]),int(kv[0].split("-")[0]))))
        index["years"][y]={"total_programs":yy["total_programs"],
            "dates":{d:{"source":dd["source"],"programs_count":dd["programs_count"]} for d,dd in ordered.items()}}
    os.makedirs("data",exist_ok=True)
    with open("data/index.json","w",encoding="utf-8") as f: json.dump(index,f,ensure_ascii=False,indent=2)
    for y,yy in sy.items():
        with open(f"data/{y}.json","w",encoding="utf-8") as f: json.dump({"year":y,"dates":yy["dates"]},f,ensure_ascii=False,indent=2)
    print(f"✅ index.json + {len(sy)} fichiers année (régénérés depuis les sources)")
    print("\n🔎 Index de recherche…")
    chans=sorted({p["channel"] for e in all_dates.values() for p in e["programs"].values()},key=crank)
    ci={c:i for i,c in enumerate(chans)}; gi={g:i for i,g in enumerate(GENRES)}
    by:Dict[str,List[List]]=[]if False else {}; shows={}; disp={}; ppl={}
    total=0
    for ds,e in all_dates.items():
        bucket=by.setdefault(ds.split("-")[2],[])
        for p in sort_programs(list(e["programs"].values())):
            t=p.get("title",""); g=genre_of(p); pe=people_of(p)
            bucket.append([t,ci.get(p.get("channel","Autres"),0),ds,p.get("time",""),gi.get(g,gi["autre"]),pe])
            total+=1
            k=norm(t)
            if k: shows[k]=shows.get(k,0)+1; disp.setdefault(k,t)
            for n in split_people(pe):
                nk=norm(n)
                if nk: ppl[nk]=ppl.get(nk,0)+1
    os.makedirs("data/search",exist_ok=True)
    for y,rows in sorted(by.items(),key=lambda kv:int(kv[0])):
        with open(f"data/search/{y}.json","w",encoding="utf-8") as f:
            json.dump({"year":int(y),"programs":rows},f,ensure_ascii=False,separators=(",",":"))
    ts=sorted(shows.items(),key=lambda kv:kv[1],reverse=True)[:200]
    tp=sorted(ppl.items(),key=lambda kv:kv[1],reverse=True)[:200]
    with open("data/search_meta.json","w",encoding="utf-8") as f:
        json.dump({"generated_at":datetime.now().isoformat(),"channels":chans,"genres":GENRES,
                   "years":[int(y) for y in sorted(by,key=int)],"total_programs":total,
                   "top_shows":[[disp[k],c] for k,c in ts],"top_people":[[k,c] for k,c in tp]},f,ensure_ascii=False,separators=(",",":"))
    print("\n"+"="*78); print("🎉 TERMINÉ"); print("="*78)
    print(f"Programmes {index['total_programs']} · Extraits {segs}")
    print(f"🧭 Routage : {rt['matched']} décision(s) appliquée(s) · {rt['hidden']} ligne(s) masquée(s) · {rt['reassigned']} réassignée(s)")
    if routing_stats["present"] and rt["matched"]==0 and routing_stats["decisions"]>0:
        print("⚠️ Des décisions existent mais aucune n'a matché : ouvre l'outil channels/ et ré-exporte")
        print("   (les signatures date|heure|titre|libellé brut doivent correspondre aux sources).")
    if not routing_stats["present"]:
        print("ℹ️ Aucun data/channel-routing.json : les doublons ne sont pas corrigés.")
    print(f"🏛️ INA : {ina_n} émissions · {ina_e} œuvres")
    print(f"✏️ Overrides : {os_['patched']} corrigés · {os_['added']} ajoutés · {os_['hidden']} masqués")


if __name__=="__main__":
    generate_index()