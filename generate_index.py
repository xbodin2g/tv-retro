#!/usr/bin/env python3
"""
Index TV rétro : fusion sources + INA + OVERRIDES manuels (tv-retro-edit).
Les overrides (data/overrides/AAAA.json) sont appliqués en dernier et ne sont
jamais régénérés : les corrections manuelles sont donc permanentes.
"""

import json, os, re, unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

SOURCES = ["depot101", "archives80"]
CHANNEL_ORDER = ["ORTF 1","ORTF 2","ORTF 3","TF1","Antenne 2","France 2","FR3","France 3","Canal+","TV6","M6","La Cinq","La Sept","Arte","La Cinquième","France 5"]
CHANNEL_ALIASES = {
    "OR1":"ORTF 1","OR2":"ORTF 2","OR3":"ORTF 3","ORTF 1":"ORTF 1","ORTF 2":"ORTF 2","ORTF 3":"ORTF 3","ORTF1":"ORTF 1","ORTF2":"ORTF 2","ORTF3":"ORTF 3",
    "PREMIÈRE CHAÎNE":"ORTF 1","PREMIERE CHAINE":"ORTF 1","DEUXIÈME CHAÎNE":"ORTF 2","DEUXIEME CHAINE":"ORTF 2","TROISIÈME CHAÎNE":"ORTF 3","TROISIEME CHAINE":"ORTF 3",
    "TF1":"TF1","A2":"Antenne 2","ANTENNE 2":"Antenne 2","F2":"France 2","FRANCE 2":"France 2","FR3":"FR3","FR 3":"FR3","F3":"France 3","FRANCE 3":"France 3",
    "C+":"Canal+","CANAL+":"Canal+","CANAL":"Canal+","TV6":"TV6","L5":"La Cinq","LA5":"La Cinq","LA 5":"La Cinq","LA CINQ":"La Cinq","CINQ":"La Cinq",
    "LA CINQUIEME":"La Cinquième","LA CINQUIÈME":"La Cinquième","M6":"M6","LA SEPT":"La Sept","L7":"La Sept","LA7":"La Sept","LA 7":"La Sept","ARTE":"Arte","FRANCE 5":"France 5",
}
CHANNEL_COMPACT_MAP = {"OR1":"ORTF 1","OR2":"ORTF 2","OR3":"ORTF 3","ORTF1":"ORTF 1","ORTF2":"ORTF 2","ORTF3":"ORTF 3","TF1":"TF1","A2":"Antenne 2","ANTENNE2":"Antenne 2","F2":"France 2","FRANCE2":"France 2","FR3":"FR3","F3":"France 3","FRANCE3":"France 3","C+":"Canal+","CANAL+":"Canal+","CANAL":"Canal+","TV6":"TV6","L5":"La Cinq","LA5":"La Cinq","LACINQ":"La Cinq","CINQ":"La Cinq","LACINQUIEME":"La Cinquième","M6":"M6","LASEPT":"La Sept","L7":"La Sept","LA7":"La Sept","ARTE":"Arte","FRANCE5":"France 5"}
CHANNEL_REGEX = [
    (re.compile(r"^OR\s*1$", re.I),"ORTF 1"),(re.compile(r"^OR\s*2$", re.I),"ORTF 2"),(re.compile(r"^OR\s*3$", re.I),"ORTF 3"),
    (re.compile(r"^ORTF\s*1$", re.I),"ORTF 1"),(re.compile(r"^ORTF\s*2$", re.I),"ORTF 2"),(re.compile(r"^ORTF\s*3$", re.I),"ORTF 3"),
    (re.compile(r"^C\s*\+$", re.I),"Canal+"),(re.compile(r"^TV\s*6$", re.I),"TV6"),(re.compile(r"^L\s*5$", re.I),"La Cinq"),
    (re.compile(r"^LA\s*CINQ$", re.I),"La Cinq"),(re.compile(r"^LA\s*CINQUIEME$", re.I),"La Cinquième"),(re.compile(r"^LA\s*CINQUIÈME$", re.I),"La Cinquième"),
    (re.compile(r"^CINQ$", re.I),"La Cinq"),(re.compile(r"^A\s*2$", re.I),"Antenne 2"),(re.compile(r"^FR\s*3$", re.I),"FR3"),
    (re.compile(r"^F\s*2$", re.I),"France 2"),(re.compile(r"^F\s*3$", re.I),"France 3"),(re.compile(r"^FRANCE\s*2$", re.I),"France 2"),
    (re.compile(r"^FRANCE\s*3$", re.I),"France 3"),(re.compile(r"^FRANCE\s*5$", re.I),"France 5"),
    (re.compile(r"^LA\s*SEPT$", re.I),"La Sept"),(re.compile(r"^L\s*7$", re.I),"La Sept"),(re.compile(r"^LA\s*7$", re.I),"La Sept"),
]
NIGHT_CUTOFF_HOUR = 5
INA_TOLERANCE_MINUTES = 60
DATE_A2_TO_F2 = datetime(1992, 9, 7); DATE_FR3_TO_F3 = datetime(1992, 9, 7); DATE_SEPT_TO_ARTE = datetime(1992, 1, 1)
GENRES = ["jeunesse","jeu","feuilleton","série","film","téléfilm","documentaire","magazine","variétés","journal","sport","musique","humour","débat","religieux","téléachat","autre"]

YOUTH_PROGRAMS = ("Les Visiteurs du mercredi","Les Visiteurs de Noël","Croque-Vacances","Le Village dans les nuages","Village dans les nuages","Vitamine","Club Dorothée","Club Dorothee","Disney Parade","Disney Club","Club Mini","À tout Spip","A tout Spip","TF! Jeunesse","TF Jeunesse","TF1 Jeunesse","Avant l'école","Avant l ecole","Récré A2","Recre A2","Discopuce","Chaud les glaçons","Chaud les glacons","Bécébégé","Becebege","Eric et Noëlla","Eric et Noella","Eric et compagnie","Hanna-Barbera Dingue Dong","Hanna Barbera Dingue Dong","Giga","Télévisator 2","Televisator 2","Chalu Maureen","La Planète de Donkey Kong","Planète de Donkey Kong","Graffitis 5-15","Graffitis 5 15","Graffitis","FR3 Jeunesse","France 3 Jeunesse","Pour la jeunesse","Le Disney Channel","Disney Channel","Debout les enfants","Amuse 3","Samdynamite","Télétaz","Teletaz","Les Minikeums","Minikeums","C'est pas sorcier","C est pas sorcier","Ça cartoon","Ca cartoon","Décode pas Bunny","Decode pas Bunny","Canaille Peluche","MDK","Micro Kids","MDK Micro Kids","Le Cyberflash","Cyberflash","Cabou Cadin","Youpi !","Youpi!","Youpi","Youpi ! L'école est finie","Youpi L ecole est finie","Youpi l'école est finie","Cellulo","Les Écrans du savoir","Les Ecrans du savoir","Ecrans du savoir","Les Zouzous","Zouzous","Graffi'6","Graffi 6","M6 Kid","Multitop","Le réveil des babalous","Réveil des babalous","Les Quat'z Amis","Sido et Rémi","Papivole","La Caverne d'Abracadabra")

META_STARTS = ("emission","presentation","presente","presentee","avec","produit","film","telefilm","dessin anime","dessins anime","opera","opera comique","jeu","debate","debats","magazine","reportage","documentaire","concert","journal","rubrique","page","pub","publicite","annonce","annonces","meteo","realisation","realise","mise en scene","diffusion","suite","rediffusion","prochainement","coming next","speakerine","musique","chanson","interview","document","anime","anime par","ecrit","interprete","distribution","avec la participation","un film","un telefilm","un dessin","un opera","un concert","un journal","une emission","un jeu","un magazine","un reportage","un documentaire","programme","programme jeunesse","jeunesse")

GENRE_RULES = [("téléachat",[r"\bteleachat\b",r"\bteleshopping\b"]),("religieux",[r"\breligieux\b",r"\breligieuse\b",r"\bmesse\b",r"jour du seigneur"]),("journal",[r"\bjournal\b",r"\bjt\b",r"\bflash infos\b",r"\bsoir 3\b",r"\bedition de la nuit\b",r"\b19 20\b",r"\beurojournal\b"]),("jeu",[r"\bjeu\b",r"\bjeux\b",r"\bquiz\b",r"\bloto\b"]),("sport",[r"\bsport\b",r"\bsports\b",r"\bsportif\b",r"\btierce\b",r"\bstade\b",r"\bfootball\b",r"\brugby\b",r"\btennis\b",r"\bcyclisme\b",r"paris dakar",r"\brallye\b",r"\bcatch\b"]),("feuilleton",[r"\bfeuilleton\b"]),("série",[r"\bserie\b"]),("téléfilm",[r"\btelefilm\b"]),("film",[r"\bfilm\b"]),("documentaire",[r"\bdocumentaire\b"]),("variétés",[r"\bvarietes?\b"]),("musique",[r"\bmusique\b",r"\bconcert\b",r"\bclips?\b",r"\bchansons?\b",r"\bopera\b"]),("humour",[r"\bhumoristique\b",r"\bhumour\b"]),("débat",[r"\bdebats?\b"]),("magazine",[r"\bmagazine\b"])]
PEOPLE_PATTERNS = [r"pr[ée]sent\w*\s+par\s+([^.]+)",r"anim\w*\s+par\s+([^.]+)",r"pr[ée]sentation\s*:?\s*([^.]+)",r"\bavec\s+([^.]+)",r"\b[ée]mission\s+de\s+([^.]+)"]
PEOPLE_NOISE = ("varietes","jeunesse","musique","decouverte","information","consommation","religieu","tele","histoire","region")


def normalize_text(v: Any) -> str:
    if v is None: return ""
    t = unicodedata.normalize("NFD", str(v).strip())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", t)).strip()


YOUTH_NORMALIZED = tuple(normalize_text(x) for x in YOUTH_PROGRAMS)


def slug_channel(c: str) -> str:
    return re.sub(r"\s+", "-", normalize_text(c)).strip("-") or "autre"


def make_program_id(date_str: str, time: str, channel: str) -> str:
    """DOIT rester identique à makeProgramId() de app.js / edit.js."""
    d = normalize_date(date_str) or str(date_str or "")
    t = str(time or "sans-heure").replace(":", "h")
    return f"{d}__{t}__{slug_channel(channel)}__p"


def normalize_date(v: Any) -> Optional[str]:
    if not v: return None
    s = str(v).strip()
    p = s.split("-") if "-" in s else s.split("/") if "/" in s else []
    if len(p) != 3: return None
    try:
        if len(p[0]) == 4: y, m, d = int(p[0]), int(p[1]), int(p[2])
        else: d, m, y = int(p[0]), int(p[1]), int(p[2])
        datetime(y, m, d); return f"{d:02d}-{m:02d}-{y}"
    except Exception: return None


def normalize_time(v: Any) -> str:
    if not v: return ""
    m = re.match(r"^(\d{1,2})[:h.](\d{2})", str(v).strip(), re.I)
    if not m: return ""
    h, mi = int(m.group(1)), int(m.group(2))
    return "" if h > 23 or mi > 59 else f"{h:02d}:{mi:02d}"


def time_sort_key(t: str) -> int:
    if not t or ":" not in t: return 9999
    try: h, m = map(int, t.split(":"))
    except Exception: return 9999
    return (h - NIGHT_CUTOFF_HOUR) * 60 + m if h >= NIGHT_CUTOFF_HOUR else (h + 24 - NIGHT_CUTOFF_HOUR) * 60 + m


def canonical_channel(v: Any, date_str: Optional[str] = None) -> str:
    raw = str(v or "").strip()
    if not raw: return "Autres"
    up = raw.upper(); cp = re.sub(r"\s+", "", up)
    canon = CHANNEL_ALIASES.get(up) or CHANNEL_COMPACT_MAP.get(cp)
    if not canon:
        canon = raw
        for rx, c in CHANNEL_REGEX:
            if rx.match(raw): canon = c; break
    if not date_str: return canon
    try: dt = datetime.strptime(date_str, "%d-%m-%Y")
    except Exception: return canon
    n = normalize_text(canon)
    if n in ("f2","france 2","antenne 2","a2"): return "Antenne 2" if dt < DATE_A2_TO_F2 else "France 2"
    if n in ("f3","france 3","fr3"): return "FR3" if dt < DATE_FR3_TO_F3 else "France 3"
    if n in ("la cinq","l5","la5","cinq"): return "La Cinq"
    if n == "la cinquieme": return "La Cinquième"
    if n in ("la sept","l7","la7"): return "Arte" if dt >= DATE_SEPT_TO_ARTE else "La Sept"
    return canon


def channel_rank(c: str) -> int:
    try: return CHANNEL_ORDER.index(c)
    except ValueError: return len(CHANNEL_ORDER) + 1


def clean_title(v: Any) -> str:
    t = re.sub(r"\s+", " ", str(v or "").strip())
    p = re.split(r"\s+[-–—]\s+", t)
    if len(p) == 2 and normalize_text(p[0]) == normalize_text(p[1]): return p[0].strip()
    return t


def load_json(path: Path) -> Optional[Any]:
    try:
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except Exception: return None


def dedupe_adjacent_lines(lines: List[str]) -> List[str]:
    out = []
    for l in lines:
        l = str(l or "").strip()
        if l and (not out or l != out[-1]): out.append(l)
    return out


def merge_unique_lines(a: List[str], b: List[str]) -> List[str]:
    seen = {normalize_text(x) for x in a}; out = list(a)
    for l in b:
        l = str(l or "").strip(); k = normalize_text(l)
        if l and k and k not in seen: out.append(l); seen.add(k)
    return out


def is_youth_title(t: str) -> bool:
    n = normalize_text(t)
    return bool(n) and any(k in n for k in YOUTH_NORMALIZED)


def is_youth_program(p: Dict[str, Any]) -> bool:
    if is_youth_title(p.get("title", "")): return True
    for l in p.get("description_lines") or []:
        n = normalize_text(l)
        if n in ("jeunesse","programme jeunesse") or n.startswith("programme jeunesse"): return True
    return False


def is_meta_line(l: str) -> bool:
    n = normalize_text(l)
    return not n or any(n.startswith(x) for x in META_STARTS)


def looks_like_item_line(l: str) -> bool:
    t = str(l or "").strip()
    if len(t) < 3 or len(t) > 160 or is_meta_line(t): return False
    if re.match(r"^\d{1,2}[:h.]\d{2}$", t, re.I) or t.startswith(("©","http","www.")): return False
    return normalize_text(t) not in ("","-","—","–")


def build_segments(p: Dict[str, Any]) -> List[Dict[str, Any]]:
    lines = dedupe_adjacent_lines([str(x).strip() for x in (p.get("description_lines") or []) if str(x).strip()])
    np_ = normalize_text(clean_title(p.get("title", ""))); youth = is_youth_program(p); out = []
    for i, l in enumerate(lines):
        if normalize_text(l) == np_ or not looks_like_item_line(l): continue
        if not youth and not re.search(r"\s[-–—]\s", l): continue
        t = clean_title(l)
        if t and normalize_text(t) != np_: out.append({"index": i, "title": t, "raw": l})
    return out


def detect_genre(p: Dict[str, Any]) -> str:
    if is_youth_program(p): return "jeunesse"
    txt = normalize_text(f"{p.get('title','')} {p.get('description','')}")
    for g, pats in GENRE_RULES:
        for pat in pats:
            if re.search(pat, txt): return g
    return "autre"


def extract_people(p: Dict[str, Any]) -> str:
    d = str(p.get("description", "") or "")
    if not d: return ""
    found = []
    for pat in PEOPLE_PATTERNS:
        for m in re.finditer(pat, d, re.I):
            s = re.split(r"\b(présenté|présentée|animé|animée|émission|film|série|feuilleton|rediffusion|produit)\b", m.group(1).strip(), flags=re.I)[0].strip(" ,;:-")
            if s and not any(normalize_text(s).startswith(n) for n in PEOPLE_NOISE): found.append(s[:120])
    seen, out = set(), []
    for s in found:
        k = normalize_text(s)
        if k and k not in seen: seen.add(k); out.append(s)
    return ", ".join(out)


def split_people(s: str) -> List[str]:
    return [x.strip() for x in re.split(r",| et ", s or "") if len(x.strip()) >= 3 and not re.search(r"\d", x)]


def program_key(t: str, c: str, title: str) -> str:
    return f"{t}|{c}" if t else f"{normalize_text(title)}|{c}"


def merge_program(target: Dict[str, Any], p: Dict[str, Any], date_str: str) -> None:
    t = normalize_time(p.get("time", "")); c = canonical_channel(p.get("channel", ""), date_str) or "Autres"
    title = clean_title(p.get("title", "")) or "Programme non identifié"
    desc = re.sub(r"\s+", " ", str(p.get("description", "") or "").strip())
    lines = p.get("description_lines") or []
    if not isinstance(lines, list): lines = []
    lines = dedupe_adjacent_lines([str(x).strip() for x in lines if str(x).strip()])
    k = program_key(t, c, title)
    if k not in target:
        target[k] = {"time": t, "channel": c, "title": title, "description": desc, "description_lines": lines}; return
    ex = target[k]
    if len(title) > len(ex.get("title", "")): ex["title"] = title
    if len(desc) > len(ex.get("description", "")): ex["description"] = desc
    ex["description_lines"] = merge_unique_lines(ex.get("description_lines", []), lines)
    if not ex.get("time") and t: ex["time"] = t


def sort_programs(ps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(ps, key=lambda p: (channel_rank(p.get("channel","")), time_sort_key(p.get("time","")), normalize_text(p.get("title",""))))


def group_by_channel(ps: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    g: Dict[str, List] = {}
    for p in ps: g.setdefault(p.get("channel") or "Autres", []).append(p)
    return {c: sorted(g[c], key=lambda p: (time_sort_key(p.get("time","")), normalize_text(p.get("title","")))) for c in sorted(g, key=channel_rank)}


# ---------- INA ----------
def load_ina_index() -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
    d = Path("data/ina/notices"); idx: Dict[Tuple[str, str], List] = {}
    if not d.exists(): return idx
    n = 0
    for path in sorted(d.glob("*.json")):
        no = load_json(path)
        if not no or not no.get("date") or not no.get("elements"): continue
        ds = normalize_date(no["date"])
        if not ds: continue
        idx.setdefault((ds, canonical_channel(no.get("channel",""), ds)), []).append(no); n += 1
    if n: print(f"🏛️ INA : {n} notices exploitables")
    return idx


def title_similarity(a: str, b: str) -> float:
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb: return 0.0
    if na == nb: return 1.0
    if na in nb or nb in na: return 0.9
    sa, sb = set(na.split()), set(nb.split())
    return len(sa & sb) / min(len(sa), len(sb)) if sa and sb else 0.0


def find_ina_notice(p: Dict[str, Any], ds: str, idx) -> Optional[Dict[str, Any]]:
    cands = idx.get((ds, p.get("channel", "")))
    if not cands: return None
    best, score = None, None
    for no in cands:
        sim = title_similarity(p.get("title",""), no.get("programme",""))
        if sim < 0.6: continue
        dist = abs(time_sort_key(p.get("time","")) - time_sort_key(normalize_time(no.get("start",""))))
        if dist > INA_TOLERANCE_MINUTES: continue
        s = (dist, -sim)
        if score is None or s < score: best, score = no, s
    return best


def apply_ina_elements(p: Dict[str, Any], no: Dict[str, Any]) -> int:
    """UNION : INA d'abord, puis les détails existants non redondants. Rien n'est effacé."""
    merged, seen = [], {normalize_text(p.get("title",""))}
    for i, t in enumerate(no.get("elements") or []):
        k = normalize_text(t)
        if k and k not in seen: seen.add(k); merged.append({"index": i, "title": t, "raw": t, "source": "ina"})
    added = len(merged)
    for seg in p.get("segments") or []:
        k = normalize_text(seg.get("title",""))
        if k and k not in seen: seen.add(k); merged.append(seg)
    p["segments"] = merged; p["ina_notice"] = no.get("notice_id",""); p["ina_url"] = no.get("url","")
    return added


# ---------- OVERRIDES (tv-retro-edit) ----------
def load_overrides() -> Dict[str, Dict[str, Any]]:
    d = Path("data/overrides"); out: Dict[str, Dict[str, Any]] = {}
    if not d.exists(): return out
    total = 0
    for path in sorted(d.glob("*.json")):
        data = load_json(path) or {}
        year = str(data.get("year") or path.stem)
        progs = data.get("programs") or {}
        if isinstance(progs, dict) and progs:
            out[year] = progs; total += len(progs)
    if total: print(f"✏️ Overrides : {total} corrections manuelles ({len(out)} années)")
    return out


def elements_to_segments(titles: List[str], source: str = "manual") -> List[Dict[str, Any]]:
    out, seen = [], set()
    for i, t in enumerate(titles):
        t = str(t or "").strip(); k = normalize_text(t)
        if t and k and k not in seen:
            seen.add(k); out.append({"index": i, "title": t, "raw": t, "source": source})
    return out


def apply_override_fields(p: Dict[str, Any], ov: Dict[str, Any]) -> None:
    for field in ("title", "description", "time", "channel"):
        if ov.get(field) not in (None, ""):
            v = ov[field]
            if field == "time": v = normalize_time(v)
            if field == "channel": v = canonical_channel(v, ov.get("date"))
            if field == "title": v = clean_title(v)
            p[field] = v
    els = ov.get("elements")
    if isinstance(els, list):
        manual = elements_to_segments(els)
        if ov.get("elements_mode") == "replace":
            p["segments"] = manual
        else:
            seen = {normalize_text(s["title"]) for s in manual}
            seen.add(normalize_text(p.get("title","")))
            for seg in p.get("segments") or []:
                k = normalize_text(seg.get("title",""))
                if k and k not in seen: seen.add(k); manual.append(seg)
            p["segments"] = manual
    if ov.get("note"): p["note"] = str(ov["note"])
    if ov.get("locked"): p["locked"] = True
    p["edited"] = True


def apply_overrides_to_date(ds: str, entry: Dict[str, Any], ov_map: Dict[str, Any]) -> Dict[str, int]:
    stats = {"patched": 0, "hidden": 0, "added": 0}
    programs = entry["programs"]
    if not ov_map: return stats
    for k, p in list(programs.items()):
        ov = ov_map.get(make_program_id(ds, p.get("time",""), p.get("channel","")))
        if not ov: continue
        if ov.get("action") == "hide":
            programs.pop(k, None); stats["hidden"] += 1; continue
        if ov.get("action") == "add": continue
        apply_override_fields(p, ov); stats["patched"] += 1
    for pid, ov in ov_map.items():
        if ov.get("action") != "add" or ov.get("date") != ds: continue
        p = {"time": normalize_time(ov.get("time","")), "channel": canonical_channel(ov.get("channel",""), ds),
             "title": clean_title(ov.get("title","")) or "Programme", "description": "", "description_lines": [], "segments": []}
        apply_override_fields(p, ov)
        programs[program_key(p["time"], p["channel"], p["title"])] = p
        stats["added"] += 1
    return stats


# ---------- Génération ----------
def generate_index() -> None:
    print("=" * 70); print("📊 INDEX + RECHERCHE + INA + OVERRIDES"); print("=" * 70)
    all_dates: Dict[str, Dict[str, Any]] = {}
    root = Path("data")
    if root.exists():
        for stray in root.glob("??-??-????.json"):
            try: stray.unlink()
            except Exception: pass

    total_files = total_loaded = 0
    for source in SOURCES:
        d = Path(f"data/{source}")
        if not d.exists(): print(f"⚠️ Absent : {d}"); continue
        files = sorted(d.glob("*.json")); total_files += len(files)
        print(f"📂 {source} : {len(files)} fichiers")
        for path in files:
            data = load_json(path)
            if not data: continue
            ds = normalize_date(data.get("date") or path.stem)
            if not ds: continue
            progs = data.get("programs", [])
            if not isinstance(progs, list): continue
            e = all_dates.setdefault(ds, {"date": ds, "sources": set(), "programs": {}})
            e["sources"].add(source)
            for p in progs:
                if isinstance(p, dict): merge_program(e["programs"], p, ds); total_loaded += 1

    print(f"\n✅ Fichiers {total_files} · Programmes {total_loaded} · Dates {len(all_dates)}")
    ina_index = load_ina_index()
    overrides = load_overrides()

    years: Dict[str, Dict[str, Any]] = {}
    total_segments = ina_matched = ina_added = 0
    ov_stats = {"patched": 0, "hidden": 0, "added": 0}

    for ds, entry in all_dates.items():
        year = ds.split("-")[2]
        ov_map = overrides.get(year, {})
        for p in entry["programs"].values():
            p["description_lines"] = dedupe_adjacent_lines(p.get("description_lines", []))
            p["segments"] = build_segments(p)
            ov = ov_map.get(make_program_id(ds, p.get("time",""), p.get("channel","")))
            if ov and ov.get("locked"): continue
            no = find_ina_notice(p, ds, ina_index) if ina_index else None
            if no: ina_added += apply_ina_elements(p, no); ina_matched += 1
        st = apply_overrides_to_date(ds, entry, ov_map)
        for k in ov_stats: ov_stats[k] += st[k]
        plist = sort_programs(list(entry["programs"].values()))
        for p in plist: total_segments += len(p.get("segments") or [])
        payload = {"date": ds, "source": "+".join(sorted(entry["sources"])), "programs_count": len(plist),
                   "programs": plist, "channels": group_by_channel(plist)}
        y = years.setdefault(year, {"dates": {}, "total_programs": 0})
        y["dates"][ds] = payload; y["total_programs"] += len(plist)

    # dates créées uniquement par override
    for year, ov_map in overrides.items():
        for pid, ov in ov_map.items():
            if ov.get("action") != "add": continue
            ds = ov.get("date")
            if not ds or ds in all_dates: continue
            entry = {"date": ds, "sources": {"edit"}, "programs": {}}
            apply_overrides_to_date(ds, entry, ov_map)
            all_dates[ds] = entry
            plist = sort_programs(list(entry["programs"].values()))
            for p in plist: total_segments += len(p.get("segments") or [])
            payload = {"date": ds, "source": "edit", "programs_count": len(plist), "programs": plist, "channels": group_by_channel(plist)}
            y = years.setdefault(year, {"dates": {}, "total_programs": 0})
            y["dates"][ds] = payload; y["total_programs"] += len(plist)

    sorted_years = dict(sorted(years.items(), key=lambda kv: int(kv[0])))
    index = {"generated_at": datetime.now().isoformat(), "total_dates": len(years and sorted_years or {}) and sum(len(y["dates"]) for y in sorted_years.values()),
             "total_programs": sum(y["total_programs"] for y in sorted_years.values()), "total_segments": total_segments,
             "ina_enriched": ina_matched, "overrides": ov_stats, "years": {}}
    for year, y in sorted_years.items():
        ordered = dict(sorted(y["dates"].items(), key=lambda kv: (int(kv[0].split("-")[2]), int(kv[0].split("-")[1]), int(kv[0].split("-")[0]))))
        index["years"][year] = {"total_programs": y["total_programs"],
            "dates": {d: {"source": dd["source"], "programs_count": dd["programs_count"]} for d, dd in ordered.items()}}

    os.makedirs("data", exist_ok=True)
    with open("data/index.json", "w", encoding="utf-8") as f: json.dump(index, f, ensure_ascii=False, indent=2)
    for year, y in sorted_years.items():
        with open(f"data/{year}.json", "w", encoding="utf-8") as f: json.dump({"year": year, "dates": y["dates"]}, f, ensure_ascii=False, indent=2)
    print(f"✅ index.json + {len(sorted_years)} fichiers année")

    print("\n🔎 Index de recherche…")
    chans = sorted({p["channel"] for e in all_dates.values() for p in e["programs"].values()}, key=channel_rank)
    ci = {c: i for i, c in enumerate(chans)}; gi = {g: i for i, g in enumerate(GENRES)}
    by_year: Dict[str, List[List[Any]]] = {}; shows: Dict[str, int] = {}; disp: Dict[str, str] = {}; ppl: Dict[str, int] = {}
    total_search = 0
    for ds, e in all_dates.items():
        bucket = by_year.setdefault(ds.split("-")[2], [])
        for p in sort_programs(list(e["programs"].values())):
            title = p.get("title",""); g = detect_genre(p); people = extract_people(p)
            bucket.append([title, ci.get(p.get("channel","Autres"), 0), ds, p.get("time",""), gi.get(g, gi["autre"]), people])
            total_search += 1
            k = normalize_text(title)
            if k: shows[k] = shows.get(k, 0) + 1; disp.setdefault(k, title)
            for n in split_people(people):
                nk = normalize_text(n)
                if nk: ppl[nk] = ppl.get(nk, 0) + 1
    os.makedirs("data/search", exist_ok=True)
    for year, rows in sorted(by_year.items(), key=lambda kv: int(kv[0])):
        with open(f"data/search/{year}.json", "w", encoding="utf-8") as f:
            json.dump({"year": int(year), "programs": rows}, f, ensure_ascii=False, separators=(",", ":"))
    ts = sorted(shows.items(), key=lambda kv: kv[1], reverse=True)[:200]
    tp = sorted(ppl.items(), key=lambda kv: kv[1], reverse=True)[:200]
    with open("data/search_meta.json", "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now().isoformat(), "channels": chans, "genres": GENRES,
                   "years": [int(y) for y in sorted(by_year, key=int)], "total_programs": total_search,
                   "top_shows": [[disp[k], c] for k, c in ts], "top_people": [[k, c] for k, c in tp]}, f, ensure_ascii=False, separators=(",", ":"))

    print("\n" + "=" * 70); print("🎉 TERMINÉ"); print("=" * 70)
    print(f"Programmes {index['total_programs']} · Extraits {total_segments}")
    print(f"🏛️ INA : {ina_matched} émissions · {ina_added} œuvres")
    print(f"✏️ Overrides : {ov_stats['patched']} corrigés · {ov_stats['added']} ajoutés · {ov_stats['hidden']} masqués")


if __name__ == "__main__":
    generate_index()