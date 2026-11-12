#!/usr/bin/env python3
"""
Génère l'index TV rétro + index de recherche + fusion des œuvres INA.

- fusionne depot101 et archives80 sans doublons
- corrige les noms de chaînes selon les dates historiques
- tri logique : 00:00-04:59 après 23:59
- détecte les extraits jeunesse
- ENRICHISSEMENT INA : ajoute les titres d'œuvres diffusées dans l'émission,
  SANS modifier l'horaire de programmation de l'émission.
"""

import json
import os
import re
import unicodedata
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

CHANNEL_COMPACT_MAP = {
    "OR1":"ORTF 1","OR2":"ORTF 2","OR3":"ORTF 3","ORTF1":"ORTF 1","ORTF2":"ORTF 2","ORTF3":"ORTF 3","TF1":"TF1","A2":"Antenne 2","ANTENNE2":"Antenne 2",
    "F2":"France 2","FRANCE2":"France 2","FR3":"FR3","F3":"France 3","FRANCE3":"France 3","C+":"Canal+","CANAL+":"Canal+","CANAL":"Canal+","TV6":"TV6",
    "L5":"La Cinq","LA5":"La Cinq","LACINQ":"La Cinq","CINQ":"La Cinq","LACINQUIEME":"La Cinquième","M6":"M6","LASEPT":"La Sept","L7":"La Sept","LA7":"La Sept","ARTE":"Arte","FRANCE5":"France 5",
}

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

TIME_RE = re.compile(r"^\d{2}:\d{2}$")
NIGHT_CUTOFF_HOUR = 5
INA_TOLERANCE_MINUTES = 60

DATE_A2_TO_F2 = datetime(1992, 9, 7)
DATE_FR3_TO_F3 = datetime(1992, 9, 7)
DATE_SEPT_TO_ARTE = datetime(1992, 1, 1)

GENRES = ["jeunesse","jeu","feuilleton","série","film","téléfilm","documentaire","magazine","variétés","journal","sport","musique","humour","débat","religieux","téléachat","autre"]

YOUTH_PROGRAMS = (
    "Les Visiteurs du mercredi","Les Visiteurs de Noël","Croque-Vacances","Le Village dans les nuages","Village dans les nuages","Vitamine",
    "Club Dorothée","Club Dorothee","Disney Parade","Disney Club","Club Mini","À tout Spip","A tout Spip","TF! Jeunesse","TF Jeunesse","TF1 Jeunesse",
    "Avant l'école","Avant l ecole","Récré A2","Recre A2","Discopuce","Chaud les glaçons","Chaud les glacons","Bécébégé","Becebege",
    "Eric et Noëlla","Eric et Noella","Eric et compagnie","Hanna-Barbera Dingue Dong","Hanna Barbera Dingue Dong","Giga","Télévisator 2","Televisator 2",
    "Chalu Maureen","La Planète de Donkey Kong","Planète de Donkey Kong","Graffitis 5-15","Graffitis 5 15","Graffitis","FR3 Jeunesse","France 3 Jeunesse",
    "Pour la jeunesse","Le Disney Channel","Disney Channel","Debout les enfants","Amuse 3","Samdynamite","Télétaz","Teletaz","Les Minikeums","Minikeums",
    "C'est pas sorcier","C est pas sorcier","Ça cartoon","Ca cartoon","Décode pas Bunny","Decode pas Bunny","Canaille Peluche","MDK","Micro Kids",
    "MDK Micro Kids","Le Cyberflash","Cyberflash","Cabou Cadin","Youpi !","Youpi!","Youpi","Youpi ! L'école est finie","Youpi L ecole est finie",
    "Youpi l'école est finie","Cellulo","Les Écrans du savoir","Les Ecrans du savoir","Ecrans du savoir","Les Zouzous","Zouzous","Graffi'6","Graffi 6","M6 Kid","Multitop",
    "Le réveil des babalous","Réveil des babalous",
)

META_STARTS = (
    "emission","presentation","presente","presentee","avec","produit","film","telefilm","dessin anime","dessins anime","opera","opera comique","jeu",
    "debate","debats","magazine","reportage","documentaire","concert","journal","rubrique","page","pub","publicite","annonce","annonces","meteo",
    "realisation","realise","mise en scene","diffusion","suite","rediffusion","prochainement","coming next","speakerine","musique","chanson","interview",
    "document","anime","anime par","ecrit","interprete","distribution","avec la participation","un film","un telefilm","un dessin","un opera","un concert",
    "un journal","une emission","un jeu","un magazine","un reportage","un documentaire","programme","programme jeunesse","jeunesse",
)

GENRE_RULES = [
    ("téléachat",[r"\bteleachat\b",r"\bteleshopping\b",r"\btele shopping\b"]),
    ("religieux",[r"\breligieux\b",r"\breligieuse\b",r"\breligieuses\b",r"\bmesse\b",r"jour du seigneur"]),
    ("journal",[r"\bjournal\b",r"\bjt\b",r"\bflash infos\b",r"\bsoir 3\b",r"\bedition de la nuit\b",r"\b19 20\b",r"\beurojournal\b",r"\b24 heures d info\b",r"\btitres de l actualite\b"]),
    ("jeu",[r"\bjeu\b",r"\bjeux\b",r"\bquiz\b",r"\bloto\b",r"\bdes chiffres et des lettres\b"]),
    ("sport",[r"\bsport\b",r"\bsports\b",r"\bsportif\b",r"\btierce\b",r"\bstade\b",r"\bfootball\b",r"\brugby\b",r"\btennis\b",r"\bcyclisme\b",r"paris dakar",r"\bjeux olympiques\b",r"\brallye\b",r"\bcatch\b"]),
    ("feuilleton",[r"\bfeuilleton\b"]),("série",[r"\bserie\b"]),("téléfilm",[r"\btelefilm\b"]),("film",[r"\bfilm\b"]),
    ("documentaire",[r"\bdocumentaire\b"]),("variétés",[r"\bvarietes\b",r"\bvariete\b"]),
    ("musique",[r"\bmusique\b",r"\bconcert\b",r"\bclips?\b",r"\bchansons?\b",r"\bopera\b"]),
    ("humour",[r"\bhumoristique\b",r"\bhumour\b"]),("débat",[r"\bdebats?\b"]),("magazine",[r"\bmagazine\b"]),
]

PEOPLE_PATTERNS = [r"pr[ée]sent\w*\s+par\s+([^.]+)",r"anim\w*\s+par\s+([^.]+)",r"pr[ée]sentation\s*:?\s*([^.]+)",r"\bavec\s+([^.]+)",r"\b[ée]mission\s+de\s+([^.]+)"]
PEOPLE_NOISE = ("varietes","variété","jeunesse","musique","decouverte","decouvertes","information","consommation","religieu","tele","la journee","histoire","l histoire","la region","votre region","outre mer")


def normalize_text(value: Any) -> str:
    if value is None: return ""
    text = unicodedata.normalize("NFD", str(value).strip())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text)).strip()


YOUTH_NORMALIZED = tuple(normalize_text(x) for x in YOUTH_PROGRAMS)


def normalize_date(value: Any) -> Optional[str]:
    if not value: return None
    v = str(value).strip()
    parts = v.split("-") if "-" in v else v.split("/") if "/" in v else []
    if len(parts) != 3: return None
    try:
        if len(parts[0]) == 4: y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        else: d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
        datetime(y, m, d)
        return f"{d:02d}-{m:02d}-{y}"
    except Exception:
        return None


def normalize_time(value: Any) -> str:
    if not value: return ""
    m = re.match(r"^(\d{1,2})[:h.](\d{2})", str(value).strip(), re.I)
    if not m: return ""
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59: return ""
    return f"{h:02d}:{mi:02d}"


def time_sort_key(t: str) -> int:
    if not t or ":" not in t: return 9999
    try: h, m = map(int, t.split(":"))
    except Exception: return 9999
    return (h - NIGHT_CUTOFF_HOUR) * 60 + m if h >= NIGHT_CUTOFF_HOUR else (h + 24 - NIGHT_CUTOFF_HOUR) * 60 + m


def canonical_channel(value: Any, date_str: Optional[str] = None) -> str:
    raw = str(value or "").strip()
    if not raw: return "Autres"
    upper = raw.upper()
    compact = re.sub(r"\s+", "", upper)
    if upper in CHANNEL_ALIASES: canon = CHANNEL_ALIASES[upper]
    elif compact in CHANNEL_COMPACT_MAP: canon = CHANNEL_COMPACT_MAP[compact]
    else:
        canon = raw
        for regex, c in CHANNEL_REGEX:
            if regex.match(raw): canon = c; break
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


def clean_title(value: Any) -> str:
    t = re.sub(r"\s+", " ", str(value or "").strip())
    p = re.split(r"\s+[-–—]\s+", t)
    if len(p) == 2 and normalize_text(p[0]) == normalize_text(p[1]): return p[0].strip()
    return t


def load_json(path: Path) -> Optional[Any]:
    try:
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except Exception as e:
        print(f"⚠️ Lecture {path}: {e}")
        return None


def dedupe_adjacent_lines(lines: List[str]) -> List[str]:
    out = []
    for line in lines:
        line = str(line or "").strip()
        if line and (not out or line != out[-1]): out.append(line)
    return out


def merge_unique_lines(existing: List[str], new: List[str]) -> List[str]:
    seen = {normalize_text(x) for x in existing}
    out = list(existing)
    for line in new:
        line = str(line or "").strip()
        k = normalize_text(line)
        if line and k and k not in seen: out.append(line); seen.add(k)
    return out


def is_youth_title(title: str) -> bool:
    n = normalize_text(title)
    return bool(n) and any(k in n for k in YOUTH_NORMALIZED)


def is_youth_program(p: Dict[str, Any]) -> bool:
    if is_youth_title(p.get("title", "")): return True
    for line in p.get("description_lines") or []:
        n = normalize_text(line)
        if n in ("jeunesse","programme jeunesse") or n.startswith("programme jeunesse"): return True
    return False


def is_meta_line(line: str) -> bool:
    n = normalize_text(line)
    return not n or any(n.startswith(p) for p in META_STARTS)


def looks_like_item_line(line: str) -> bool:
    t = str(line or "").strip()
    if len(t) < 3 or len(t) > 160: return False
    if is_meta_line(t): return False
    if re.match(r"^\d{1,2}[:h.]\d{2}$", t, re.I): return False
    if t.startswith(("©","http","www.")): return False
    return normalize_text(t) not in ("","-","—","–")


def build_segments(p: Dict[str, Any]) -> List[Dict[str, Any]]:
    lines = dedupe_adjacent_lines([str(x).strip() for x in (p.get("description_lines") or []) if str(x).strip()])
    parent = clean_title(p.get("title", ""))
    np_ = normalize_text(parent)
    youth = is_youth_program(p)
    out = []
    for idx, line in enumerate(lines):
        if normalize_text(line) == np_ or not looks_like_item_line(line): continue
        if not youth and not re.search(r"\s[-–—]\s", line): continue
        title = clean_title(line)
        if not title or normalize_text(title) == np_: continue
        out.append({"index": idx, "title": title, "raw": line})
    return out


def detect_genre(p: Dict[str, Any]) -> str:
    if is_youth_program(p): return "jeunesse"
    text = normalize_text(f"{p.get('title','')} {p.get('description','')}")
    for genre, patterns in GENRE_RULES:
        for pat in patterns:
            if re.search(pat, text): return genre
    return "autre"


def extract_people(p: Dict[str, Any]) -> str:
    desc = str(p.get("description", "") or "")
    if not desc: return ""
    found = []
    for pat in PEOPLE_PATTERNS:
        for m in re.finditer(pat, desc, re.I):
            seg = re.split(r"\b(présenté|présentée|animé|animée|émission|film|série|feuilleton|rediffusion|produit)\b", m.group(1).strip(), flags=re.I)[0].strip(" ,;:-")
            if not seg: continue
            if any(normalize_text(seg).startswith(n) for n in PEOPLE_NOISE): continue
            found.append(seg[:120])
    seen, out = set(), []
    for s in found:
        k = normalize_text(s)
        if k and k not in seen: seen.add(k); out.append(s)
    return ", ".join(out)


def split_people(s: str) -> List[str]:
    if not s: return []
    return [p.strip() for p in re.split(r",| et ", s) if len(p.strip()) >= 3 and not re.search(r"\d", p)]


def program_key(time: str, channel: str, title: str) -> str:
    return f"{time}|{channel}" if time else f"{normalize_text(title)}|{channel}"


def merge_program(target: Dict[str, Dict[str, Any]], p: Dict[str, Any], date_str: str) -> None:
    time = normalize_time(p.get("time", ""))
    channel = canonical_channel(p.get("channel", ""), date_str) or "Autres"
    title = clean_title(p.get("title", "")) or "Programme non identifié"
    description = re.sub(r"\s+", " ", str(p.get("description", "") or "").strip())
    lines = p.get("description_lines") or []
    if not isinstance(lines, list): lines = []
    lines = dedupe_adjacent_lines([str(x).strip() for x in lines if str(x).strip()])
    key = program_key(time, channel, title)
    if key not in target:
        target[key] = {"time": time, "channel": channel, "title": title, "description": description, "description_lines": lines}
        return
    ex = target[key]
    if len(title) > len(ex.get("title", "")): ex["title"] = title
    if len(description) > len(ex.get("description", "")): ex["description"] = description
    ex["description_lines"] = merge_unique_lines(ex.get("description_lines", []), lines)
    if not ex.get("time") and time: ex["time"] = time


def sort_programs(ps: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(ps, key=lambda p: (channel_rank(p.get("channel","")), time_sort_key(p.get("time","")), normalize_text(p.get("title",""))))


def group_by_channel(ps: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for p in ps: grouped.setdefault(p.get("channel") or "Autres", []).append(p)
    return {c: sorted(grouped[c], key=lambda p: (time_sort_key(p.get("time","")), normalize_text(p.get("title",""))))
            for c in sorted(grouped.keys(), key=channel_rank)}


# =====================================================
# INA : œuvres diffusées (sans toucher aux horaires)
# =====================================================

def load_ina_index() -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
    directory = Path("data/ina/notices")
    index: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    if not directory.exists():
        return index
    count = 0
    for path in sorted(directory.glob("*.json")):
        notice = load_json(path)
        if not notice or not notice.get("date") or not notice.get("elements"):
            continue
        date_str = normalize_date(notice["date"])
        if not date_str: continue
        channel = canonical_channel(notice.get("channel", ""), date_str)
        index.setdefault((date_str, channel), []).append(notice)
        count += 1
    if count:
        print(f"🏛️ INA : {count} notices exploitables chargées")
    return index


def title_similarity(a: str, b: str) -> float:
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb: return 0.0
    if na == nb: return 1.0
    if na in nb or nb in na: return 0.9
    sa, sb = set(na.split()), set(nb.split())
    if not sa or not sb: return 0.0
    return len(sa & sb) / min(len(sa), len(sb))


def find_ina_notice(p: Dict[str, Any], date_str: str,
                    index: Dict[Tuple[str, str], List[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    candidates = index.get((date_str, p.get("channel", "")))
    if not candidates: return None
    best, best_score = None, None
    for notice in candidates:
        sim = title_similarity(p.get("title", ""), notice.get("programme", ""))
        if sim < 0.6: continue
        distance = abs(time_sort_key(p.get("time", "")) - time_sort_key(normalize_time(notice.get("start", ""))))
        if distance > INA_TOLERANCE_MINUTES: continue
        score = (distance, -sim)
        if best_score is None or score < best_score:
            best, best_score = notice, score
    return best


def apply_ina_elements(p: Dict[str, Any], notice: Dict[str, Any]) -> int:
    """Ajoute les titres d'œuvres INA comme extraits. L'horaire du programme ne bouge pas."""
    merged: List[Dict[str, Any]] = []
    seen: Set[str] = {normalize_text(p.get("title", ""))}
    for i, title in enumerate(notice.get("elements") or []):
        key = normalize_text(title)
        if not key or key in seen: continue
        seen.add(key)
        merged.append({"index": i, "title": title, "raw": title, "source": "ina"})
    added = len(merged)
    for seg in p.get("segments") or []:
        key = normalize_text(seg.get("title", ""))
        if key and key not in seen:
            seen.add(key)
            merged.append(seg)
    p["segments"] = merged
    p["ina_notice"] = notice.get("notice_id", "")
    p["ina_url"] = notice.get("url", "")
    return added


# =====================================================
# Génération
# =====================================================

def generate_index() -> None:
    print("=" * 70)
    print("📊 GÉNÉRATION INDEX + RECHERCHE + FUSION INA")
    print("=" * 70)

    all_dates: Dict[str, Dict[str, Any]] = {}
    root = Path("data")
    if root.exists():
        for stray in root.glob("??-??-????.json"):
            try: stray.unlink()
            except Exception: pass

    total_files = total_loaded = 0
    for source in SOURCES:
        directory = Path(f"data/{source}")
        if not directory.exists():
            print(f"⚠️ Dossier absent : {directory}")
            continue
        files = sorted(directory.glob("*.json"))
        total_files += len(files)
        print(f"📂 {source} : {len(files)} fichiers")
        for path in files:
            data = load_json(path)
            if not data: continue
            date_str = normalize_date(data.get("date") or path.stem)
            if not date_str: continue
            programs = data.get("programs", [])
            if not isinstance(programs, list): continue
            entry = all_dates.setdefault(date_str, {"date": date_str, "sources": set(), "programs": {}})
            entry["sources"].add(source)
            for p in programs:
                if isinstance(p, dict):
                    merge_program(entry["programs"], p, date_str)
                    total_loaded += 1

    print(f"\n✅ Fichiers : {total_files} · Programmes : {total_loaded} · Dates : {len(all_dates)}")

    ina_index = load_ina_index()

    years: Dict[str, Dict[str, Any]] = {}
    total_segments = ina_matched = ina_added = 0

    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]
        programs = list(entry["programs"].values())
        for p in programs:
            p["description_lines"] = dedupe_adjacent_lines(p.get("description_lines", []))
            p["segments"] = build_segments(p)
            notice = find_ina_notice(p, date_str, ina_index) if ina_index else None
            if notice:
                ina_added += apply_ina_elements(p, notice)
                ina_matched += 1
            total_segments += len(p["segments"])
        programs = sort_programs(programs)
        payload = {
            "date": date_str,
            "source": "+".join(sorted(entry["sources"])),
            "programs_count": len(programs),
            "programs": programs,
            "channels": group_by_channel(programs),
        }
        y = years.setdefault(year, {"dates": {}, "total_programs": 0})
        y["dates"][date_str] = payload
        y["total_programs"] += len(programs)

    sorted_years = dict(sorted(years.items(), key=lambda kv: int(kv[0])))

    index = {
        "generated_at": datetime.now().isoformat(),
        "total_dates": len(all_dates),
        "total_programs": sum(y["total_programs"] for y in sorted_years.values()),
        "total_segments": total_segments,
        "ina_enriched": ina_matched,
        "years": {},
    }
    for year, y in sorted_years.items():
        ordered = dict(sorted(y["dates"].items(), key=lambda kv: (
            int(kv[0].split("-")[2]), int(kv[0].split("-")[1]), int(kv[0].split("-")[0]))))
        index["years"][year] = {
            "total_programs": y["total_programs"],
            "dates": {d: {"source": dd["source"], "programs_count": dd["programs_count"]} for d, dd in ordered.items()},
        }

    os.makedirs("data", exist_ok=True)
    with open("data/index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print("✅ data/index.json")

    for year, y in sorted_years.items():
        with open(f"data/{year}.json", "w", encoding="utf-8") as f:
            json.dump({"year": year, "dates": y["dates"]}, f, ensure_ascii=False, indent=2)
    print(f"✅ {len(sorted_years)} fichiers année")

    # --- index de recherche ---
    print("\n🔎 Index de recherche…")
    all_channels = sorted({p["channel"] for e in all_dates.values() for p in e["programs"].values()}, key=channel_rank)
    channel_index = {c: i for i, c in enumerate(all_channels)}
    genre_index = {g: i for i, g in enumerate(GENRES)}

    search_by_year: Dict[str, List[List[Any]]] = {}
    show_counts: Dict[str, int] = {}
    show_display: Dict[str, str] = {}
    people_counts: Dict[str, int] = {}
    total_search = 0

    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]
        bucket = search_by_year.setdefault(year, [])
        for p in sort_programs(list(entry["programs"].values())):
            title = p.get("title", "")
            genre = detect_genre(p)
            people = extract_people(p)
            bucket.append([title, channel_index.get(p.get("channel", "Autres"), 0), date_str,
                           p.get("time", ""), genre_index.get(genre, genre_index["autre"]), people])
            total_search += 1
            k = normalize_text(title)
            if k:
                show_counts[k] = show_counts.get(k, 0) + 1
                show_display.setdefault(k, title)
            for name in split_people(people):
                nk = normalize_text(name)
                if nk: people_counts[nk] = people_counts.get(nk, 0) + 1

    os.makedirs("data/search", exist_ok=True)
    for year, rows in sorted(search_by_year.items(), key=lambda kv: int(kv[0])):
        with open(f"data/search/{year}.json", "w", encoding="utf-8") as f:
            json.dump({"year": int(year), "programs": rows}, f, ensure_ascii=False, separators=(",", ":"))

    top_shows = sorted(show_counts.items(), key=lambda kv: kv[1], reverse=True)[:200]
    top_people = sorted(people_counts.items(), key=lambda kv: kv[1], reverse=True)[:200]

    with open("data/search_meta.json", "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": datetime.now().isoformat(),
            "channels": all_channels, "genres": GENRES,
            "years": [int(y) for y in sorted(search_by_year.keys(), key=int)],
            "total_programs": total_search,
            "top_shows": [[show_display[k], c] for k, c in top_shows],
            "top_people": [[k, c] for k, c in top_people],
        }, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ search_meta.json + {len(search_by_year)} fichiers search/")
    print("\n" + "=" * 70)
    print("🎉 TERMINÉ")
    print("=" * 70)
    print(f"Années {len(index['years'])} · Dates {index['total_dates']} · Programmes {index['total_programs']}")
    print(f"Extraits {total_segments}")
    print(f"🏛️ INA : {ina_matched} émissions enrichies · {ina_added} œuvres ajoutées")


if __name__ == "__main__":
    generate_index()