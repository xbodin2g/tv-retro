#!/usr/bin/env python3
"""
Génère l'index des données TV rétro.

Fonctions :
- fusionne depot101 et archives80
- supprime les doublons sur date + chaîne + heure
- conserve les description_lines
- détecte les extraits / segments des émissions jeunesse
- regroupe par chaîne
- tri logique : les programmes 00:00-04:59 apparaissent après 23:59
- produit :
  - data/index.json
  - data/AAAA.json
"""

import json
import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set


# =====================================================
# Configuration
# =====================================================

SOURCES = ["depot101", "archives80"]

CHANNEL_ORDER = [
    "TF1",
    "Antenne 2",
    "France 2",
    "FR3",
    "France 3",
    "Canal+",
    "La Cinq",
    "TV6",
    "M6",
    "France 4",
    "France 5",
    "Arte",
]

CHANNEL_ALIASES = {
    "TF1": "TF1",
    "A2": "Antenne 2",
    "ANTENNE 2": "Antenne 2",
    "FRANCE 2": "France 2",
    "F2": "France 2",
    "FR3": "FR3",
    "FR 3": "FR3",
    "F3": "France 3",
    "FRANCE 3": "France 3",
    "C+": "Canal+",
    "CANAL+": "Canal+",
    "CANAL": "Canal+",
    "TV6": "TV6",
    "L5": "La Cinq",
    "LA5": "La Cinq",
    "LA 5": "La Cinq",
    "LA CINQ": "La Cinq",
    "LA CINQUIEME": "La Cinq",
    "CINQ": "La Cinq",
    "M6": "M6",
    "ARTE": "Arte",
    "F5": "France 5",
    "FRANCE 5": "France 5",
    "F4": "France 4",
    "FRANCE 4": "France 4",
}

CHANNEL_COMPACT_MAP = {
    "TF1": "TF1",
    "A2": "Antenne 2",
    "ANTENNE2": "Antenne 2",
    "FRANCE2": "France 2",
    "FR3": "FR3",
    "FRANCE3": "France 3",
    "C+": "Canal+",
    "CANAL+": "Canal+",
    "CANAL": "Canal+",
    "TV6": "TV6",
    "L5": "La Cinq",
    "LA5": "La Cinq",
    "LACINQ": "La Cinq",
    "LACINQUIEME": "La Cinq",
    "CINQ": "La Cinq",
    "M6": "M6",
    "ARTE": "Arte",
    "FRANCE5": "France 5",
}

CHANNEL_REGEX = [
    (re.compile(r"^C\s*\+$", re.IGNORECASE), "Canal+"),
    (re.compile(r"^TV\s*6$", re.IGNORECASE), "TV6"),
    (re.compile(r"^L\s*5$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^LA\s*CINQ$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^LA\s*CINQUIEME$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^CINQ$", re.IGNORECASE), "La Cinq"),
    (re.compile(r"^A\s*2$", re.IGNORECASE), "Antenne 2"),
    (re.compile(r"^FR\s*3$", re.IGNORECASE), "FR3"),
    (re.compile(r"^FRANCE\s*2$", re.IGNORECASE), "France 2"),
    (re.compile(r"^FRANCE\s*3$", re.IGNORECASE), "France 3"),
    (re.compile(r"^FRANCE\s*5$", re.IGNORECASE), "France 5"),
]

TIME_RE = re.compile(r"^\d{2}:\d{2}$")

# Seuil en dessous duquel une heure est considérée comme "après minuit"
# dans l'ordre d'affichage d'une journée TV.
NIGHT_CUTOFF_HOUR = 5


# =====================================================
# Émissions jeunesse connues
# =====================================================

YOUTH_PROGRAMS = (
    # TF1
    "Les Visiteurs du mercredi",
    "Les Visiteurs de Noël",
    "Croque-Vacances",
    "Le Village dans les nuages",
    "Village dans les nuages",
    "Vitamine",
    "Club Dorothée",
    "Club Dorothee",
    "Disney Parade",
    "Disney Club",
    "Club Mini",
    "À tout Spip",
    "A tout Spip",
    "TF! Jeunesse",
    "TF Jeunesse",
    "TF1 Jeunesse",

    # Antenne 2 / France 2
    "Récré A2",
    "Recre A2",
    "Discopuce",
    "Chaud les glaçons",
    "Chaud les glacons",
    "Bécébégé",
    "Becebege",
    "Eric et Noëlla",
    "Eric et Noella",
    "Hanna-Barbera Dingue Dong",
    "Hanna Barbera Dingue Dong",
    "Giga",
    "Télévisator 2",
    "Televisator 2",
    "Chalu Maureen",
    "La Planète de Donkey Kong",
    "Planète de Donkey Kong",

    # FR3 / France 3
    "FR3 Jeunesse",
    "France 3 Jeunesse",
    "Pour la jeunesse",
    "Le Disney Channel",
    "Disney Channel",
    "Debout les enfants",
    "Amuse 3",
    "Samdynamite",
    "Télétaz",
    "Teletaz",
    "Les Minikeums",
    "Minikeums",
    "C'est pas sorcier",
    "C est pas sorcier",

    # Canal+
    "Ça cartoon",
    "Ca cartoon",
    "Décode pas Bunny",
    "Decode pas Bunny",
    "Canaille Peluche",
    "MDK",
    "Micro Kids",
    "MDK Micro Kids",
    "Le Cyberflash",
    "Cyberflash",
    "Cabou Cadin",

    # La Cinq / La Cinquième
    "Youpi ! L'école est finie",
    "Youpi L ecole est finie",
    "Youpi l'école est finie",
    "Cellulo",
    "Les Écrans du savoir",
    "Les Ecrans du savoir",
    "Ecrans du savoir",
    "Les Zouzous",
    "Zouzous",

    # M6
    "Graffi'6",
    "Graffi 6",
    "M6 Kid",
    "Multitop",
)

META_STARTS = (
    "emission",
    "presentation",
    "presente",
    "presentee",
    "avec",
    "produit",
    "film",
    "telefilm",
    "dessin anime",
    "dessins anime",
    "opera",
    "opera comique",
    "jeu",
    "debate",
    "debats",
    "magazine",
    "reportage",
    "documentaire",
    "concert",
    "journal",
    "rubrique",
    "page",
    "pub",
    "publicite",
    "annonce",
    "annonces",
    "meteo",
    "realisation",
    "realise",
    "mise en scene",
    "diffusion",
    "suite",
    "rediffusion",
    "prochainement",
    "coming next",
    "speakerine",
    "musique",
    "chanson",
    "interview",
    "document",
    "anime",
    "anime par",
    "ecrit",
    "interprete",
    "distribution",
    "avec la participation",
    "un film",
    "un telefilm",
    "un dessin",
    "un opera",
    "un concert",
    "un journal",
    "une emission",
    "un jeu",
    "un magazine",
    "un reportage",
    "un documentaire",
    "programme",
    "programme jeunesse",
    "jeunesse",
)


# =====================================================
# Helpers texte / date / heure / chaîne
# =====================================================

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
            year = int(parts[0])
            month = int(parts[1])
            day = int(parts[2])
        else:
            day = int(parts[0])
            month = int(parts[1])
            year = int(parts[2])

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

    hour = int(match.group(1))
    minute = int(match.group(2))

    if hour > 23 or minute > 59:
        return ""

    return f"{hour:02d}:{minute:02d}"


def time_sort_key(time_str: str) -> int:
    """
    Retourne une clé de tri logique pour une heure.

    Les heures 00:00-04:59 sont considérées comme "après minuit"
    et triées après 23:59, comme dans un magazine TV.

    Exemple :
      05:00 -> 0
      12:00 -> 420
      20:30 -> 930
      23:59 -> 1139
      00:10 -> 1150
      03:05 -> 1325
      04:59 -> 1439
    """
    if not time_str or ":" not in time_str:
        return 9999

    try:
        hour, minute = map(int, time_str.split(":"))
    except (ValueError, AttributeError):
        return 9999

    if hour >= NIGHT_CUTOFF_HOUR:
        return (hour - NIGHT_CUTOFF_HOUR) * 60 + minute
    else:
        return (hour + 24 - NIGHT_CUTOFF_HOUR) * 60 + minute


def canonical_channel(value: Any) -> str:
    raw = str(value or "").strip()

    if not raw:
        return "Autres"

    upper = raw.upper()
    if upper in CHANNEL_ALIASES:
        return CHANNEL_ALIASES[upper]

    compact = re.sub(r"\s+", "", upper)
    if compact in CHANNEL_COMPACT_MAP:
        return CHANNEL_COMPACT_MAP[compact]

    for regex, canonical in CHANNEL_REGEX:
        if regex.match(raw):
            return canonical

    normalized_upper = normalize_text(raw).upper()
    if normalized_upper in CHANNEL_ALIASES:
        return CHANNEL_ALIASES[normalized_upper]

    return raw


def channel_rank(channel: str) -> int:
    try:
        return CHANNEL_ORDER.index(channel)
    except ValueError:
        return len(CHANNEL_ORDER) + 1


def clean_title(value: Any) -> str:
    title = str(value or "").strip()
    title = re.sub(r"\s+", " ", title)

    parts = re.split(r"\s+[-–—]\s+", title)

    if len(parts) == 2:
        if normalize_text(parts[0]) == normalize_text(parts[1]):
            return parts[0].strip()

    return title


def load_json_file(filepath: Path) -> Optional[Dict[str, Any]]:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Erreur lecture {filepath}: {e}")
        return None


# =====================================================
# Segments / extraits
# =====================================================

def dedupe_adjacent_lines(lines: List[str]) -> List[str]:
    cleaned = []

    for line in lines:
        line = str(line or "").strip()
        if not line:
            continue

        if not cleaned or line != cleaned[-1]:
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

        if not norm:
            continue

        if norm in ("jeunesse", "programme jeunesse"):
            return True

        if norm.startswith("programme jeunesse"):
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
    lines = dedupe_adjacent_lines(
        [str(line).strip() for line in lines if str(line).strip()]
    )

    parent_title = clean_title(program.get("title", ""))
    norm_parent = normalize_text(parent_title)
    youth = is_youth_program(program)

    item_lines = []

    for idx, line in enumerate(lines):
        line = str(line or "").strip()

        if not line:
            continue

        if normalize_text(line) == norm_parent:
            continue

        if not looks_like_item_line(line):
            continue

        item_lines.append((idx, line))

    segments: List[Dict[str, Any]] = []

    for idx, line in item_lines:
        has_hyphen = bool(re.search(r"\s[-–—]\s", line))

        if not youth and not has_hyphen:
            continue

        segment_title = clean_title(line)

        if not segment_title:
            continue

        if normalize_text(segment_title) == norm_parent:
            continue

        segments.append({
            "index": idx,
            "title": segment_title,
            "raw": line
        })

    return segments


# =====================================================
# Déduplication / fusion des programmes
# =====================================================

def program_key(time: str, channel: str, title: str) -> str:
    if time:
        return f"{time}|{channel}"

    return f"{normalize_text(title)}|{channel}"


def merge_program(target: Dict[str, Dict[str, Any]], program: Dict[str, Any]) -> None:
    time = normalize_time(program.get("time", ""))
    channel = canonical_channel(program.get("channel", ""))
    title = clean_title(program.get("title", ""))
    description = str(program.get("description", "") or "").strip()
    description = re.sub(r"\s+", " ", description)

    description_lines = program.get("description_lines") or []

    if not isinstance(description_lines, list):
        description_lines = []

    description_lines = dedupe_adjacent_lines(
        [str(line).strip() for line in description_lines if str(line).strip()]
    )

    if not channel:
        channel = "Autres"

    if not title:
        title = "Programme non identifié"

    key = program_key(time, channel, title)

    if key not in target:
        target[key] = {
            "time": time,
            "channel": channel,
            "title": title,
            "description": description,
            "description_lines": description_lines,
        }
        return

    existing = target[key]

    if len(title) > len(existing.get("title", "")):
        existing["title"] = title

    if len(description) > len(existing.get("description", "")):
        existing["description"] = description

    existing["description_lines"] = merge_unique_lines(
        existing.get("description_lines", []),
        description_lines
    )

    if not existing.get("time") and time:
        existing["time"] = time


def sort_programs(programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Trie les programmes par chaîne puis par heure logique.
    Les heures 00:00-04:59 apparaissent après 23:59.
    """
    return sorted(
        programs,
        key=lambda p: (
            channel_rank(p.get("channel", "")),
            time_sort_key(p.get("time", "")),
            normalize_text(p.get("title", "")),
        ),
    )


def group_by_channel(programs: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}

    for program in programs:
        channel = program.get("channel") or "Autres"
        grouped.setdefault(channel, []).append(program)

    ordered: Dict[str, List[Dict[str, Any]]] = {}

    for channel in sorted(grouped.keys(), key=channel_rank):
        ordered[channel] = sorted(
            grouped[channel],
            key=lambda p: (
                time_sort_key(p.get("time", "")),
                normalize_text(p.get("title", "")),
            ),
        )

    return ordered


# =====================================================
# Génération principale
# =====================================================

def generate_index() -> None:
    print("=" * 70)
    print("📊 GÉNÉRATION DE L'INDEX TV RÉTRO - VERSION SIMPLE")
    print("=" * 70)

    all_dates: Dict[str, Dict[str, Any]] = {}

    data_root = Path("data")
    if data_root.exists():
        for stray in data_root.glob("??-??-????.json"):
            try:
                stray.unlink()
                print(f"🧹 Ancien fichier supprimé : {stray}")
            except Exception as e:
                print(f"⚠️ Impossible de supprimer {stray}: {e}")

    total_source_files = 0
    total_loaded_programs = 0
    total_missing_description_lines = 0

    for source in SOURCES:
        source_dir = Path(f"data/{source}")

        if not source_dir.exists():
            print(f"⚠️ Dossier absent : {source_dir}")
            continue

        json_files = sorted(source_dir.glob("*.json"))
        total_source_files += len(json_files)

        print(f"📂 Source {source} : {len(json_files)} fichiers trouvés")

        for filepath in json_files:
            data = load_json_file(filepath)

            if not data:
                continue

            raw_date = data.get("date") or filepath.stem
            source_date = normalize_date(raw_date)

            if not source_date:
                print(f"⚠️ Date invalide ignorée : {filepath}")
                continue

            programs = data.get("programs", [])

            if not isinstance(programs, list):
                continue

            if source_date not in all_dates:
                all_dates[source_date] = {
                    "date": source_date,
                    "sources": set(),
                    "programs": {},
                }

            all_dates[source_date]["sources"].add(source)

            for program in programs:
                if not isinstance(program, dict):
                    continue

                if "description_lines" not in program:
                    total_missing_description_lines += 1

                merge_program(all_dates[source_date]["programs"], program)
                total_loaded_programs += 1

    print("")
    print(f"✅ Fichiers sources lus : {total_source_files}")
    print(f"✅ Programmes bruts chargés : {total_loaded_programs}")
    print(f"✅ Dates uniques retenues : {len(all_dates)}")

    if total_missing_description_lines:
        print(
            f"⚠️ {total_missing_description_lines} programmes anciens sans description_lines. "
            "Pour détecter les extraits jeunesse, relance le scraping concerné."
        )

    years: Dict[str, Dict[str, Any]] = {}
    total_segments = 0

    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]

        programs_list = list(entry["programs"].values())

        for program in programs_list:
            program["description_lines"] = dedupe_adjacent_lines(
                program.get("description_lines", [])
            )
            program["segments"] = build_segments(program)
            total_segments += len(program["segments"])

        programs_list = sort_programs(programs_list)
        channels = group_by_channel(programs_list)

        source_label = "+".join(sorted(entry["sources"]))

        date_payload = {
            "date": date_str,
            "source": source_label,
            "programs_count": len(programs_list),
            "programs": programs_list,
            "channels": channels,
        }

        if year not in years:
            years[year] = {
                "dates": {},
                "total_programs": 0,
            }

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
        sorted_dates = dict(
            sorted(
                year_data["dates"].items(),
                key=lambda item: (
                    int(item[0].split("-")[2]),
                    int(item[0].split("-")[1]),
                    int(item[0].split("-")[0]),
                ),
            )
        )

        index["years"][year] = {
            "total_programs": year_data["total_programs"],
            "dates": {
                date_str: {
                    "source": date_data["source"],
                    "programs_count": date_data["programs_count"],
                }
                for date_str, date_data in sorted_dates.items()
            },
        }

    os.makedirs("data", exist_ok=True)

    index_path = "data/index.json"
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"✅ Index global écrit : {index_path}")

    for year, year_data in sorted_years.items():
        year_payload = {
            "year": year,
            "dates": year_data["dates"],
        }

        year_path = f"data/{year}.json"

        with open(year_path, "w", encoding="utf-8") as f:
            json.dump(year_payload, f, ensure_ascii=False, indent=2)

        print(f"✅ Année écrite : {year_path} ({len(year_data['dates'])} dates)")

    print("")
    print("=" * 70)
    print("🎉 INDEX GÉNÉRÉ")
    print("=" * 70)
    print(f"Années : {len(index['years'])}")
    print(f"Dates totales : {index['total_dates']}")
    print(f"Programmes totaux : {index['total_programs']}")
    print(f"Extraits / segments détectés : {index['total_segments']}")


if __name__ == "__main__":
    generate_index()