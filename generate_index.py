#!/usr/bin/env python3
"""
Génère l'index des données TV rétro.

Fonctions :
- fusionne depot101 et archives80
- supprime les doublons sur date effective + chaîne + heure
- corrige les programmes de nuit passés après minuit
- crée des journées synthétiques si nécessaire
- conserve les description_lines
- détecte les extraits / segments des émissions jeunesse
- regroupe par chaîne
- produit :
  - data/index.json
  - data/AAAA.json
"""

import json
import os
import re
import unicodedata
from datetime import datetime, timedelta
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
    "Arte",
    "France 5",
]

CHANNEL_ALIASES = {
    "TF1": "TF1",
    "A2": "Antenne 2",
    "ANTENNE 2": "Antenne 2",
    "FRANCE 2": "France 2",
    "FR3": "FR3",
    "FR 3": "FR3",
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
    "FRANCE 5": "France 5",
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
    """
    Normalise un texte pour comparaison :
    - minuscules
    - sans accents
    - sans ponctuation
    - espaces réduits
    """
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
    """
    Normalise une date au format JJ-MM-AAAA.
    Accepte aussi AAAA-MM-DD, JJ/MM/AAAA, AAAA/MM/DD.
    """
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
    """
    Normalise une heure au format HH:MM.
    """
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


def canonical_channel(value: Any) -> str:
    """
    Retourne un nom de chaîne canonique.
    """
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
    """
    Ordre d'affichage des chaînes.
    """
    try:
        return CHANNEL_ORDER.index(channel)
    except ValueError:
        return len(CHANNEL_ORDER) + 1


def clean_title(value: Any) -> str:
    """
    Nettoie un titre.
    Si le titre est dupliqué sous la forme :
    'Journal de 13 heures - Journal de 13 heures'
    on garde seulement la première partie.
    """
    title = str(value or "").strip()
    title = re.sub(r"\s+", " ", title)

    parts = re.split(r"\s+[-–—]\s+", title)

    if len(parts) == 2:
        if normalize_text(parts[0]) == normalize_text(parts[1]):
            return parts[0].strip()

    return title


def load_json_file(filepath: Path) -> Optional[Dict[str, Any]]:
    """
    Charge un fichier JSON proprement.
    """
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Erreur lecture {filepath}: {e}")
        return None


# =====================================================
# Correction des programmes de nuit / passage de minuit
# =====================================================

def _date_to_datetime(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%d-%m-%Y")


def _assign_effective_dates(
    programs: List[Dict[str, Any]],
    source_date: str
) -> List[Dict[str, Any]]:
    """
    Réaffecte la date effective des programmes qui passent après minuit.

    Exemple :
      page du 29-12-1986
      TF1 20:30 ...
      TF1 03:05 ...

    Le programme 03:05 devient effectivement du 30-12-1986.
    """
    base_dt = _date_to_datetime(source_date)
    last_dt_by_channel: Dict[str, datetime] = {}
    enriched: List[Dict[str, Any]] = []

    for raw_program in programs:
        if not isinstance(raw_program, dict):
            continue

        program = dict(raw_program)

        time = normalize_time(program.get("time"))
        channel = canonical_channel(program.get("channel"))

        program["time"] = time
        program["channel"] = channel
        program["original_date"] = source_date

        if not time:
            program["effective_date"] = source_date
            enriched.append(program)
            continue

        hour, minute = map(int, time.split(":"))
        candidate_dt = base_dt.replace(hour=hour, minute=minute)

        last_dt = last_dt_by_channel.get(channel)

        if last_dt is not None and candidate_dt + timedelta(hours=4) < last_dt:
            should_shift = False

            # Si on est déjà dans une nuit commencée la veille,
            # on continue à basculer les heures matinales.
            if last_dt.date() > base_dt.date():
                if hour < 12:
                    should_shift = True

            # Cas classique : 20:30 puis 03:05 sur la même page.
            elif last_dt.hour >= 18 and hour < 8:
                should_shift = True

            if should_shift:
                while candidate_dt + timedelta(hours=4) < last_dt:
                    candidate_dt += timedelta(days=1)

        effective_date = candidate_dt.strftime("%d-%m-%Y")
        program["effective_date"] = effective_date

        last_dt_by_channel[channel] = candidate_dt
        enriched.append(program)

    return enriched


# =====================================================
# Segments / extraits
# =====================================================

def dedupe_adjacent_lines(lines: List[str]) -> List[str]:
    """
    Supprime les lignes identiques adjacentes.
    """
    cleaned = []

    for line in lines:
        line = str(line or "").strip()
        if not line:
            continue

        if not cleaned or line != cleaned[-1]:
            cleaned.append(line)

    return cleaned


def merge_unique_lines(existing: List[str], new_lines: List[str]) -> List[str]:
    """
    Fusionne deux listes de lignes sans doublons, en conservant l'ordre.
    """
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
    """
    Détecte si un titre correspond à une émission jeunesse connue.
    """
    norm = normalize_text(title)

    if not norm:
        return False

    return any(keyword in norm for keyword in YOUTH_NORMALIZED)


def is_youth_program(program: Dict[str, Any]) -> bool:
    """
    Détecte une émission jeunesse soit par son titre,
    soit par la présence d'une ligne du type "Programme jeunesse".
    """
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
    """
    Détecte les lignes descriptives/méta qui ne sont pas des extraits.
    """
    norm = normalize_text(line)

    if not norm:
        return True

    return any(norm.startswith(prefix) for prefix in META_STARTS)


def looks_like_item_line(line: str) -> bool:
    """
    Détecte si une ligne ressemble à un élément interne d'une émission.
    """
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
    """
    Construit la liste des extraits / segments d'un programme.

    Règle :
    - pour une émission jeunesse reconnue, on extrait toutes les lignes utiles
    - pour un programme non jeunesse, on extrait seulement les lignes de type
      "Série - Épisode" ou "Personnage - Élément"
    """
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

        # Pour les émissions jeunesse reconnues, on accepte toutes les lignes utiles.
        # Sinon, on reste prudent : seulement les lignes avec séparateur.
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
    """
    Clé de déduplication.

    Règle principale :
    - même heure + même chaîne = même programme

    Si l'heure manque, on tombe en secours sur :
    - titre normalisé + chaîne
    """
    if time:
        return f"{time}|{channel}"

    return f"{normalize_text(title)}|{channel}"


def merge_program(target: Dict[str, Dict[str, Any]], program: Dict[str, Any]) -> None:
    """
    Fusionne un programme dans le dictionnaire target.
    Si un programme existe déjà sur le même créneau/chaîne,
    on garde les informations les plus complètes.
    """
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

    # Garder le titre le plus complet
    if len(title) > len(existing.get("title", "")):
        existing["title"] = title

    # Garder la description la plus complète
    if len(description) > len(existing.get("description", "")):
        existing["description"] = description

    # Fusionner les lignes de description sans doublons
    existing["description_lines"] = merge_unique_lines(
        existing.get("description_lines", []),
        description_lines
    )

    # Si l'heure manquait mais qu'une nouvelle arrivée a une heure, on la prend
    if not existing.get("time") and time:
        existing["time"] = time


def sort_programs(programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Trie les programmes par chaîne puis par heure.
    """
    return sorted(
        programs,
        key=lambda p: (
            channel_rank(p.get("channel", "")),
            p.get("time") or "99:99",
            normalize_text(p.get("title", "")),
        ),
    )


def group_by_channel(programs: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Regroupe les programmes par chaîne, dans l'ordre magazine TV.
    """
    grouped: Dict[str, List[Dict[str, Any]]] = {}

    for program in programs:
        channel = program.get("channel") or "Autres"
        grouped.setdefault(channel, []).append(program)

    ordered: Dict[str, List[Dict[str, Any]]] = {}

    for channel in sorted(grouped.keys(), key=channel_rank):
        ordered[channel] = sorted(
            grouped[channel],
            key=lambda p: (p.get("time") or "99:99", normalize_text(p.get("title", ""))),
        )

    return ordered


# =====================================================
# Génération principale
# =====================================================

def generate_index() -> None:
    print("=" * 70)
    print("📊 GÉNÉRATION DE L'INDEX TV RÉTRO - VERSION NUIT + JEUNESSE")
    print("=" * 70)

    all_dates: Dict[str, Dict[str, Any]] = {}

    # Nettoyage optionnel des anciens fichiers date à la racine de data/
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
    total_overnight_shifted = 0

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

            # Important : on traite d'abord dans l'ordre d'origine de la page
            # pour détecter les programmes passés après minuit.
            enriched_programs = _assign_effective_dates(programs, source_date)

            for program in enriched_programs:
                if not isinstance(program, dict):
                    continue

                if "description_lines" not in program:
                    total_missing_description_lines += 1

                effective_date = program.get("effective_date") or source_date

                if effective_date != source_date:
                    total_overnight_shifted += 1

                if effective_date not in all_dates:
                    all_dates[effective_date] = {
                        "date": effective_date,
                        "sources": set(),
                        "programs": {},
                        "origin_dates": set(),
                    }

                all_dates[effective_date]["sources"].add(source)
                all_dates[effective_date]["origin_dates"].add(source_date)

                merge_program(all_dates[effective_date]["programs"], program)
                total_loaded_programs += 1

    print("")
    print(f"✅ Fichiers sources lus : {total_source_files}")
    print(f"✅ Programmes bruts chargés : {total_loaded_programs}")
    print(f"✅ Programmes réaffectés au jour suivant : {total_overnight_shifted}")
    print(f"✅ Dates uniques retenues : {len(all_dates)}")

    if total_missing_description_lines:
        print(
            f"⚠️ {total_missing_description_lines} programmes anciens sans description_lines. "
            "Pour détecter les extraits jeunesse, relance le scraping concerné."
        )

    # Regrouper par année
    years: Dict[str, Dict[str, Any]] = {}
    total_segments = 0

    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]

        programs_list = list(entry["programs"].values())

        # Enrichissement avec segments
        for program in programs_list:
            program["description_lines"] = dedupe_adjacent_lines(
                program.get("description_lines", [])
            )
            program["segments"] = build_segments(program)
            total_segments += len(program["segments"])

        programs_list = sort_programs(programs_list)
        channels = group_by_channel(programs_list)

        source_label = "+".join(sorted(entry["sources"]))
        origin_dates = sorted(entry.get("origin_dates", []))
        night_extension = any(origin_date != date_str for origin_date in origin_dates)

        date_payload = {
            "date": date_str,
            "source": source_label,
            "programs_count": len(programs_list),
            "night_extension": night_extension,
            "origin_dates": origin_dates,
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
        "total_overnight_shifted": total_overnight_shifted,
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
                    "night_extension": date_data.get("night_extension", False),
                    "origin_dates": date_data.get("origin_dates", []),
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
    print(f"Programmes de nuit réaffectés : {index['total_overnight_shifted']}")


if __name__ == "__main__":
    generate_index()