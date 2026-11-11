#!/usr/bin/env python3
"""
Génère l'index des données TV rétro + index de recherche.

- fusionne depot101 et archives80 sans doublons
- corrige les noms de chaînes selon les dates historiques
- détecte les extraits / segments des émissions jeunesse
- tri logique : les programmes 00:00-04:59 après 23:59
- NOUVEAU : détecte le genre + les personnes, et génère :
    data/search_meta.json
    data/search/AAAA.json
"""

import json
import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


SOURCES = ["depot101", "archives80"]

CHANNEL_ORDER = [
    "ORTF 1", "ORTF 2", "ORTF 3",
    "TF1", "Antenne 2", "France 2", "FR3", "France 3",
    "Canal+", "TV6", "M6", "La Cinq", "La Sept", "Arte",
    "La Cinquième", "France 5",
]

CHANNEL_ALIASES = {
    "OR1": "ORTF 1", "OR2": "ORTF 2", "OR3": "ORTF 3",
    "ORTF 1": "ORTF 1", "ORTF 2": "ORTF 2", "ORTF 3": "ORTF 3",
    "ORTF1": "ORTF 1", "ORTF2": "ORTF 2", "ORTF3": "ORTF 3",
    "PREMIÈRE CHAÎNE": "ORTF 1", "PREMIERE CHAINE": "ORTF 1",
    "DEUXIÈME CHAÎNE": "ORTF 2", "DEUXIEME CHAINE": "ORTF 2",
    "TROISIÈME CHAÎNE": "ORTF 3", "TROISIEME CHAINE": "ORTF 3",
    "TF1": "TF1",
    "A2": "Antenne 2", "ANTENNE 2": "Antenne 2",
    "F2": "France 2", "FRANCE 2": "France 2",
    "FR3": "FR3", "FR 3": "FR3",
    "F3": "France 3", "FRANCE 3": "France 3",
    "C+": "Canal+", "CANAL+": "Canal+", "CANAL": "Canal+",
    "TV6": "TV6",
    "L5": "La Cinq", "LA5": "La Cinq", "LA 5": "La Cinq",
    "LA CINQ": "La Cinq", "CINQ": "La Cinq",
    "LA CINQUIEME": "La Cinquième", "LA CINQUIÈME": "La Cinquième",
    "M6": "M6",
    "LA SEPT": "La Sept", "L7": "La Sept", "LA7": "La Sept", "LA 7": "La Sept",
    "ARTE": "Arte", "FRANCE 5": "France 5",
}

CHANNEL_COMPACT_MAP = {
    "OR1": "ORTF 1", "OR2": "ORTF 2", "OR3": "ORTF 3",
    "ORTF1": "ORTF 1", "ORTF2": "ORTF 2", "ORTF3": "ORTF 3",
    "TF1": "TF1", "A2": "Antenne 2", "ANTENNE2": "Antenne 2",
    "F2": "France 2", "FRANCE2": "France 2",
    "FR3": "FR3", "F3": "France 3", "FRANCE3": "France 3",
    "C+": "Canal+", "CANAL+": "Canal+", "CANAL": "Canal+",
    "TV6": "TV6", "L5": "La Cinq", "LA5": "La Cinq",
    "LACINQ": "La Cinq", "CINQ": "La Cinq", "LACINQUIEME": "La Cinquième",
    "M6": "M6", "LASEPT": "La Sept", "L7": "La Sept", "LA7": "La Sept",
    "ARTE": "Arte", "FRANCE5": "France 5",
}

CHANNEL_REGEX = [
    (re.compile(r"^OR\s*1$", re.IGNORECASE), "ORTF 1"),
    (re.compile(r"^OR\s*2$", re.IGNORECASE), "ORTF 2"),
    (re.compile(r"^OR\s*3$", re.IGNORECASE), "ORTF 3"),
    (re.compile(r"^ORTF\s*1$", re.IGNORECASE), "ORTF 1"),
    (re.compile(r"^ORTF\s*2$", re.IGNORECASE), "ORTF 2"),
    (re.compile(r"^ORTF\s*3$", re.IGNORECASE), "ORTF 3"),
    (re.compile(r"^C\s*\+$", re.IGNORECASE), "Canal+"),
    (re.compile(r"^TV\s*6$", re.IGNORECASE), "TV6"),
    (re.compile(r"^L\s*5$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^LA\s*CINQ$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^LA\s*CINQUIEME$", re.IGNORECASE), "La Cinquième"),
    (re.compile(r"^LA\s*CINQUIÈME$", re.IGNORECASE), "La Cinquième"),
    (re.compile(r"^CINQ$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^A\s*2$", re.IGNORECASE), "Antenne 2"),
    (re.compile(r"^FR\s*3$", re.IGNORECASE), "FR3"),
    (re.compile(r"^F\s*2$", re.IGNORECASE), "France 2"),
    (re.compile(r"^F\s*3$", re.IGNORECASE), "France 3"),
    (re.compile(r"^FRANCE\s*2$", re.IGNORECASE), "France 2"),
    (re.compile(r"^FRANCE\s*3$", re.IGNORECASE), "France 3"),
    (re.compile(r"^FRANCE\s*5$", re.IGNORECASE), "France 5"),
    (re.compile(r"^LA\s*SEPT$", re.IGNORECASE), "La Sept"),
    (re.compile(r"^L\s*7$", re.IGNORECASE), "La Sept"),
    (re.compile(r"^LA\s*7$", re.IGNORECASE), "La Sept"),
]

TIME_RE = re.compile(r"^\d{2}:\d{2}$")
NIGHT_CUTOFF_HOUR = 5

DATE_ANTENNE2_TO_FRANCE2 = datetime(1992, 9, 7)
DATE_FR3_TO_FRANCE3 = datetime(1992, 9, 7)
DATE_LA_CINQUIEME_START = datetime(1994, 12, 13)
DATE_LA_SEPT_TO_ARTE = datetime(1992, 1, 1)

GENRES = [
    "jeunesse", "jeu", "feuilleton", "série", "film", "téléfilm",
    "documentaire", "magazine", "variétés", "journal", "sport",
    "musique", "météo", "humour", "débat", "religieux", "téléachat", "autre",
]

YOUTH_PROGRAMS = (
    "Les Visiteurs du mercredi", "Les Visiteurs de Noël", "Croque-Vacances",
    "Le Village dans les nuages", "Village dans les nuages", "Vitamine",
    "Club Dorothée", "Club Dorothee", "Disney Parade", "Disney Club",
    "Club Mini", "À tout Spip", "A tout Spip", "TF! Jeunesse", "TF Jeunesse",
    "TF1 Jeunesse", "Avant l'école", "Avant l ecole",
    "Récré A2", "Recre A2", "Discopuce", "Chaud les glaçons", "Chaud les glacons",
    "Bécébégé", "Becebege", "Eric et Noëlla", "Eric et Noella", "Eric et compagnie",
    "Hanna-Barbera Dingue Dong", "Hanna Barbera Dingue Dong", "Giga",
    "Télévisator 2", "Televisator 2", "Chalu Maureen",
    "La Planète de Donkey Kong", "Planète de Donkey Kong",
    "Graffitis 5-15", "Graffitis 5 15", "Graffitis",
    "FR3 Jeunesse", "France 3 Jeunesse", "Pour la jeunesse",
    "Le Disney Channel", "Disney Channel", "Debout les enfants", "Amuse 3",
    "Samdynamite", "Télétaz", "Teletaz", "Les Minikeums", "Minikeums",
    "C'est pas sorcier", "C est pas sorcier",
    "Ça cartoon", "Ca cartoon", "Décode pas Bunny", "Decode pas Bunny",
    "Canaille Peluche", "MDK", "Micro Kids", "MDK Micro Kids",
    "Le Cyberflash", "Cyberflash", "Cabou Cadin",
    "Youpi !", "Youpi!", "Youpi", "Youpi ! L'école est finie",
    "Youpi L ecole est finie", "Youpi l'école est finie",
    "Cellulo", "Les Écrans du savoir", "Les Ecrans du savoir", "Ecrans du savoir",
    "Les Zouzous", "Zouzous", "Graffi'6", "Graffi 6", "M6 Kid", "Multitop",
)

META_STARTS = (
    "emission", "presentation", "presente", "presentee", "avec", "produit",
    "film", "telefilm", "dessin anime", "dessins anime", "opera", "opera comique",
    "jeu", "debate", "debats", "magazine", "reportage", "documentaire", "concert",
    "journal", "rubrique", "page", "pub", "publicite", "annonce", "annonces",
    "meteo", "realisation", "realise", "mise en scene", "diffusion", "suite",
    "rediffusion", "prochainement", "coming next", "speakerine", "musique",
    "chanson", "interview", "document", "anime", "anime par", "ecrit",
    "interprete", "distribution", "avec la participation", "un film", "un telefilm",
    "un dessin", "un opera", "un concert", "un journal", "une emission", "un jeu",
    "un magazine", "un reportage", "un documentaire", "programme",
    "programme jeunesse", "jeunesse",
)


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


YOUTH_NORMALIZED = tuple(normalize_text(item) for item in YOUTH_PROGRAMS)


def normalize_date(date_str: Any) -> Optional[str]:
    if not date_str:
        return None
    value = str(date_str).strip()
    if "-" in value:
        parts = value.split("-")
    elif "/" in value:
        parts = value.split("/")
    else:
        return None
    if len(parts) != 3:
        return None
    try:
        if len(parts[0]) == 4:
            year = int(parts[0]); month = int(parts[1]); day = int(parts[2])
        else:
            day = int(parts[0]); month = int(parts[1]); year = int(parts[2])
        datetime(year, month, day)
        return f"{day:02d}-{month:02d}-{year}"
    except Exception:
        return None


def normalize_time(value: Any) -> str:
    if not value:
        return ""
    text = str(value).strip()
    match = re.match(r"^(\d{1,2})[:h.](\d{2})$", text, flags=re.IGNORECASE)
    if not match:
        return ""
    hour = int(match.group(1)); minute = int(match.group(2))
    if hour > 23 or minute > 59:
        return ""
    return f"{hour:02d}:{minute:02d}"


def time_sort_key(time_str: str) -> int:
    if not time_str or ":" not in time_str:
        return 9999
    try:
        hour, minute = map(int, time_str.split(":"))
    except (ValueError, AttributeError):
        return 9999
    if hour >= NIGHT_CUTOFF_HOUR:
        return (hour - NIGHT_CUTOFF_HOUR) * 60 + minute
    return (hour + 24 - NIGHT_CUTOFF_HOUR) * 60 + minute


def canonical_channel(value: Any, date_str: Optional[str] = None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "Autres"
    upper = raw.upper()
    compact = re.sub(r"\s+", "", upper)
    if upper in CHANNEL_ALIASES:
        canonical = CHANNEL_ALIASES[upper]
    elif compact in CHANNEL_COMPACT_MAP:
        canonical = CHANNEL_COMPACT_MAP[compact]
    else:
        canonical = raw
        for regex, canon in CHANNEL_REGEX:
            if regex.match(raw):
                canonical = canon
                break
    if not date_str:
        return canonical
    try:
        date_obj = datetime.strptime(date_str, "%d-%m-%Y")
    except Exception:
        return canonical
    norm = normalize_text(canonical)
    if norm in ("f2", "france 2", "antenne 2", "a2"):
        return "Antenne 2" if date_obj < DATE_ANTENNE2_TO_FRANCE2 else "France 2"
    if norm in ("f3", "france 3", "fr3"):
        return "FR3" if date_obj < DATE_FR3_TO_FRANCE3 else "France 3"
    if norm in ("la cinq", "l5", "la5", "cinq"):
        return "La Cinq"
    if norm in ("la cinquieme",):
        return "La Cinquième"
    if norm in ("la sept", "l7", "la7"):
        return "Arte" if date_obj >= DATE_LA_SEPT_TO_ARTE else "La Sept"
    return canonical


def channel_rank(channel: str) -> int:
    try:
        return CHANNEL_ORDER.index(channel)
    except ValueError:
        return len(CHANNEL_ORDER) + 1


def clean_title(value: Any) -> str:
    title = str(value or "").strip()
    title = re.sub(r"\s+", " ", title)
    parts = re.split(r"\s+[-–—]\s+", title)
    if len(parts) == 2 and normalize_text(parts[0]) == normalize_text(parts[1]):
        return parts[0].strip()
    return title


def load_json_file(filepath: Path) -> Optional[Dict[str, Any]]:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Erreur lecture {filepath}: {e}")
        return None


def dedupe_adjacent_lines(lines: List[str]) -> List[str]:
    cleaned = []
    for line in lines:
        line = str(line or "").strip()
        if line and (not cleaned or line != cleaned[-1]):
            cleaned.append(line)
    return cleaned


def merge_unique_lines(existing: List[str], new_lines: List[str]) -> List[str]:
    seen: Set[str] = {normalize_text(line) for line in existing}
    merged = list(existing)
    for line in new_lines:
        line = str(line or "").strip()
        if not line:
            continue
        norm = normalize_text(line)
        if norm and norm not in seen:
            merged.append(line)
            seen.add(norm)
    return merged


def is_youth_title(title: str) -> bool:
    norm = normalize_text(title)
    if not norm:
        return False
    return any(keyword in norm for keyword in YOUTH_NORMALIZED)


def is_youth_program(program: Dict[str, Any]) -> bool:
    if is_youth_title(program.get("title", "")):
        return True
    for line in program.get("description_lines") or []:
        norm = normalize_text(line)
        if norm in ("jeunesse", "programme jeunesse") or norm.startswith("programme jeunesse"):
            return True
    return False


def is_meta_line(line: str) -> bool:
    norm = normalize_text(line)
    if not norm:
        return True
    return any(norm.startswith(prefix) for prefix in META_STARTS)


def looks_like_item_line(line: str) -> bool:
    text = str(line or "").strip()
    if len(text) < 3 or len(text) > 160:
        return False
    if is_meta_line(text):
        return False
    if re.match(r"^\d{1,2}[:h.]\d{2}$", text, flags=re.IGNORECASE):
        return False
    if text.startswith(("©", "http", "www.")):
        return False
    if normalize_text(text) in ("", "-", "—", "–"):
        return False
    return True


def build_segments(program: Dict[str, Any]) -> List[Dict[str, Any]]:
    lines = program.get("description_lines") or []
    lines = dedupe_adjacent_lines([str(x).strip() for x in lines if str(x).strip()])
    parent_title = clean_title(program.get("title", ""))
    norm_parent = normalize_text(parent_title)
    youth = is_youth_program(program)
    item_lines = []
    for idx, line in enumerate(lines):
        line = str(line or "").strip()
        if not line or normalize_text(line) == norm_parent or not looks_like_item_line(line):
            continue
        item_lines.append((idx, line))
    segments: List[Dict[str, Any]] = []
    for idx, line in item_lines:
        has_hyphen = bool(re.search(r"\s[-–—]\s", line))
        if not youth and not has_hyphen:
            continue
        segment_title = clean_title(line)
        if not segment_title or normalize_text(segment_title) == norm_parent:
            continue
        segments.append({"index": idx, "title": segment_title, "raw": line})
    return segments


# =====================================================
# NOUVEAU : genre + personnes
# =====================================================

GENRE_RULES = [
    ("téléachat", [r"\bteleachat\b", r"\bteleshopping\b", r"\btele shopping\b"]),
    ("météo", [r"\bmeteo\b"]),
    ("religieux", [r"\breligieux\b", r"\breligieuse\b", r"\breligieuses\b", r"\bmesse\b", r"jour du seigneur"]),
    ("journal", [r"\bjournal\b", r"\bjt\b", r"\bflash infos\b", r"\bsoir 3\b",
                 r"\bedition de la nuit\b", r"\b19 20\b", r"\beurojournal\b",
                 r"\b24 heures d info\b", r"\btitres de l actualite\b"]),
    ("jeu", [r"\bjeu\b", r"\bjeux\b", r"\bquiz\b", r"\bloto\b", r"\bdes chiffres et des lettres\b"]),
    ("sport", [r"\bsport\b", r"\bsports\b", r"\bsportif\b", r"\btierce\b", r"\bstade\b",
               r"\bfootball\b", r"\brugby\b", r"\btennis\b", r"\bcyclisme\b",
               r"paris dakar", r"\bjeux olympiques\b", r"\brallye\b", r"\bcatch\b"]),
    ("feuilleton", [r"\bfeuilleton\b"]),
    ("série", [r"\bserie\b"]),
    ("téléfilm", [r"\btelefilm\b"]),
    ("film", [r"\bfilm\b"]),
    ("documentaire", [r"\bdocumentaire\b"]),
    ("variétés", [r"\bvarietes\b", r"\bvariete\b"]),
    ("musique", [r"\bmusique\b", r"\bconcert\b", r"\bclips?\b", r"\bchansons?\b", r"\bopera\b"]),
    ("humour", [r"\bhumoristique\b", r"\bhumour\b"]),
    ("débat", [r"\bdebats?\b"]),
    ("magazine", [r"\bmagazine\b"]),
]


def detect_genre(program: Dict[str, Any]) -> str:
    if is_youth_program(program):
        return "jeunesse"
    text = normalize_text(str(program.get("title", "")) + " " + str(program.get("description", "")))
    for genre, patterns in GENRE_RULES:
        for pat in patterns:
            if re.search(pat, text):
                return genre
    return "autre"


PEOPLE_PATTERNS = [
    r"pr[ée]sent\w*\s+par\s+([^.]+)",
    r"anim\w*\s+par\s+([^.]+)",
    r"pr[ée]sentation\s*:?\s*([^.]+)",
    r"\bavec\s+([^.]+)",
    r"\b[ée]mission\s+de\s+([^.]+)",
]

PEOPLE_NOISE = (
    "varietes", "variété", "jeunesse", "musique", "decouverte", "decouvertes",
    "information", "consommation", "religieu", "tele", "la journee", "histoire",
    "l histoire", "la region", "votre region", "outre mer",
)


def extract_people(program: Dict[str, Any]) -> str:
    desc = str(program.get("description", "") or "")
    if not desc:
        return ""
    found = []
    for pat in PEOPLE_PATTERNS:
        for m in re.finditer(pat, desc, flags=re.IGNORECASE):
            seg = m.group(1).strip()
            seg = re.split(
                r"\b(présenté|présentée|animé|animée|émission|film|série|feuilleton|rediffusion|produit)\b",
                seg, flags=re.IGNORECASE
            )[0].strip(" ,;:-")
            if not seg:
                continue
            low = normalize_text(seg)
            if any(low.startswith(n) for n in PEOPLE_NOISE):
                continue
            if len(seg) > 120:
                seg = seg[:120]
            found.append(seg)
    seen = set()
    out = []
    for s in found:
        k = normalize_text(s)
        if k and k not in seen:
            seen.add(k)
            out.append(s)
    return ", ".join(out)


def split_people(people_str: str) -> List[str]:
    if not people_str:
        return []
    parts = re.split(r",| et ", people_str)
    out = []
    for p in parts:
        p = p.strip()
        if len(p) >= 3 and not re.search(r"\d", p):
            out.append(p)
    return out


# =====================================================
# Fusion / dédoublonnage
# =====================================================

def program_key(time: str, channel: str, title: str) -> str:
    if time:
        return f"{time}|{channel}"
    return f"{normalize_text(title)}|{channel}"


def merge_program(target: Dict[str, Dict[str, Any]], program: Dict[str, Any], date_str: str) -> None:
    time = normalize_time(program.get("time", ""))
    channel = canonical_channel(program.get("channel", ""), date_str)
    title = clean_title(program.get("title", ""))
    description = re.sub(r"\s+", " ", str(program.get("description", "") or "").strip())
    description_lines = program.get("description_lines") or []
    if not isinstance(description_lines, list):
        description_lines = []
    description_lines = dedupe_adjacent_lines(
        [str(x).strip() for x in description_lines if str(x).strip()]
    )
    if not channel:
        channel = "Autres"
    if not title:
        title = "Programme non identifié"
    key = program_key(time, channel, title)
    if key not in target:
        target[key] = {
            "time": time, "channel": channel, "title": title,
            "description": description, "description_lines": description_lines,
        }
        return
    existing = target[key]
    if len(title) > len(existing.get("title", "")):
        existing["title"] = title
    if len(description) > len(existing.get("description", "")):
        existing["description"] = description
    existing["description_lines"] = merge_unique_lines(
        existing.get("description_lines", []), description_lines
    )
    if not existing.get("time") and time:
        existing["time"] = time


def sort_programs(programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(programs, key=lambda p: (
        channel_rank(p.get("channel", "")),
        time_sort_key(p.get("time", "")),
        normalize_text(p.get("title", "")),
    ))


def group_by_channel(programs: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for program in programs:
        grouped.setdefault(program.get("channel") or "Autres", []).append(program)
    ordered: Dict[str, List[Dict[str, Any]]] = {}
    for channel in sorted(grouped.keys(), key=channel_rank):
        ordered[channel] = sorted(grouped[channel], key=lambda p: (
            time_sort_key(p.get("time", "")), normalize_text(p.get("title", "")),
        ))
    return ordered


# =====================================================
# Génération principale
# =====================================================

def generate_index() -> None:
    print("=" * 70)
    print("📊 GÉNÉRATION INDEX + RECHERCHE")
    print("=" * 70)

    all_dates: Dict[str, Dict[str, Any]] = {}

    data_root = Path("data")
    if data_root.exists():
        for stray in data_root.glob("??-??-????.json"):
            try:
                stray.unlink()
            except Exception:
                pass

    total_source_files = 0
    total_loaded_programs = 0

    for source in SOURCES:
        source_dir = Path(f"data/{source}")
        if not source_dir.exists():
            print(f"⚠️ Dossier absent : {source_dir}")
            continue
        json_files = sorted(source_dir.glob("*.json"))
        total_source_files += len(json_files)
        print(f"📂 Source {source} : {len(json_files)} fichiers")
        for filepath in json_files:
            data = load_json_file(filepath)
            if not data:
                continue
            source_date = normalize_date(data.get("date") or filepath.stem)
            if not source_date:
                continue
            programs = data.get("programs", [])
            if not isinstance(programs, list):
                continue
            if source_date not in all_dates:
                all_dates[source_date] = {"date": source_date, "sources": set(), "programs": {}}
            all_dates[source_date]["sources"].add(source)
            for program in programs:
                if isinstance(program, dict):
                    merge_program(all_dates[source_date]["programs"], program, source_date)
                    total_loaded_programs += 1

    print(f"\n✅ Fichiers lus : {total_source_files}")
    print(f"✅ Programmes chargés : {total_loaded_programs}")
    print(f"✅ Dates uniques : {len(all_dates)}")

    # --- Index par année (affichage) ---
    years: Dict[str, Dict[str, Any]] = {}
    total_segments = 0
    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]
        programs_list = list(entry["programs"].values())
        for program in programs_list:
            program["description_lines"] = dedupe_adjacent_lines(program.get("description_lines", []))
            program["segments"] = build_segments(program)
            total_segments += len(program["segments"])
        programs_list = sort_programs(programs_list)
        channels = group_by_channel(programs_list)
        date_payload = {
            "date": date_str,
            "source": "+".join(sorted(entry["sources"])),
            "programs_count": len(programs_list),
            "programs": programs_list,
            "channels": channels,
        }
        years.setdefault(year, {"dates": {}, "total_programs": 0})
        years[year]["dates"][date_str] = date_payload
        years[year]["total_programs"] += len(programs_list)

    sorted_years = dict(sorted(years.items(), key=lambda item: int(item[0])))

    index = {
        "generated_at": datetime.now().isoformat(),
        "total_dates": len(all_dates),
        "total_programs": sum(y["total_programs"] for y in sorted_years.values()),
        "total_segments": total_segments,
        "years": {},
    }
    for year, year_data in sorted_years.items():
        sorted_dates = dict(sorted(year_data["dates"].items(), key=lambda item: (
            int(item[0].split("-")[2]), int(item[0].split("-")[1]), int(item[0].split("-")[0]),
        )))
        index["years"][year] = {
            "total_programs": year_data["total_programs"],
            "dates": {
                d: {"source": dd["source"], "programs_count": dd["programs_count"]}
                for d, dd in sorted_dates.items()
            },
        }

    os.makedirs("data", exist_ok=True)
    with open("data/index.json", "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print("✅ data/index.json écrit")

    for year, year_data in sorted_years.items():
        with open(f"data/{year}.json", "w", encoding="utf-8") as f:
            json.dump({"year": year, "dates": year_data["dates"]}, f, ensure_ascii=False, indent=2)
    print(f"✅ {len(sorted_years)} fichiers année écrits")

    # --- NOUVEAU : index de recherche ---
    print("\n🔎 Construction de l'index de recherche...")

    all_channels = sorted(
        {p["channel"] for e in all_dates.values() for p in e["programs"].values()},
        key=channel_rank,
    )
    channel_index = {c: i for i, c in enumerate(all_channels)}
    genre_index = {g: i for i, g in enumerate(GENRES)}

    search_by_year: Dict[str, List[List[Any]]] = {}
    show_counts: Dict[str, int] = {}
    show_display: Dict[str, str] = {}
    people_counts: Dict[str, int] = {}
    total_search = 0

    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]
        plist = sort_programs(list(entry["programs"].values()))
        bucket = search_by_year.setdefault(year, [])
        for program in plist:
            title = program.get("title", "")
            channel = program.get("channel", "Autres")
            time = program.get("time", "")
            genre = detect_genre(program)
            people = extract_people(program)
            bucket.append([
                title,
                channel_index.get(channel, 0),
                date_str,
                time,
                genre_index.get(genre, genre_index["autre"]),
                people,
            ])
            total_search += 1
            k = normalize_text(title)
            if k:
                show_counts[k] = show_counts.get(k, 0) + 1
                show_display.setdefault(k, title)
            for name in split_people(people):
                nk = normalize_text(name)
                if nk:
                    people_counts[nk] = people_counts.get(nk, 0) + 1

    os.makedirs("data/search", exist_ok=True)
    for year, rows in sorted(search_by_year.items(), key=lambda kv: int(kv[0])):
        with open(f"data/search/{year}.json", "w", encoding="utf-8") as f:
            json.dump({"year": int(year), "programs": rows}, f, ensure_ascii=False, separators=(",", ":"))

    top_shows = sorted(show_counts.items(), key=lambda kv: kv[1], reverse=True)[:200]
    top_people = sorted(people_counts.items(), key=lambda kv: kv[1], reverse=True)[:200]

    search_meta = {
        "generated_at": datetime.now().isoformat(),
        "channels": all_channels,
        "genres": GENRES,
        "years": [int(y) for y in sorted(search_by_year.keys(), key=int)],
        "total_programs": total_search,
        "top_shows": [[show_display[k], c] for k, c in top_shows],
        "top_people": [[k, c] for k, c in top_people],
    }
    with open("data/search_meta.json", "w", encoding="utf-8") as f:
        json.dump(search_meta, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ data/search_meta.json écrit ({len(all_channels)} chaînes, {len(GENRES)} genres)")
    print(f"✅ {len(search_by_year)} fichiers data/search/AAAA.json écrits")
    print(f"✅ {total_search} programmes indexés pour la recherche")

    print("\n" + "=" * 70)
    print("🎉 TERMINÉ")
    print("=" * 70)
    print(f"Années : {len(index['years'])} · Dates : {index['total_dates']}")
    print(f"Programmes : {index['total_programs']} · Extraits : {index['total_segments']}")
    print(f"Recherche : {total_search} entrées · {len(top_shows)} émissions · {len(top_people)} personnes")


if __name__ == "__main__":
    generate_index()