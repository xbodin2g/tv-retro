#!/usr/bin/env python3
"""
Génère l'index des données TV rétro.

- Fusionne depot101 et archives80
- Supprime les doublons
- Regroupe par chaîne
- Produit :
  - data/index.json
  - data/AAAA.json
"""

import json
import os
import re
import unicodedata
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# =====================================================
# Configuration
# =====================================================

SOURCES = ["depot101", "archives80"]

CHANNEL_ORDER = [
    "TF1",
    "Antenne 2",
    "FR3",
    "Canal+",
    "La Cinq",
    "M6",
    "Arte",
    "France 2",
    "France 3",
    "France 5",
]

CHANNEL_ALIASES = {
    "TF1": "TF1",
    "A2": "Antenne 2",
    "ANTENNE 2": "Antenne 2",
    "FR3": "FR3",
    "FR 3": "FR3",
    "CANAL+": "Canal+",
    "CANAL": "Canal+",
    "LA CINQ": "La Cinq",
    "M6": "M6",
    "ARTE": "Arte",
    "FRANCE 2": "France 2",
    "FRANCE 3": "France 3",
    "FRANCE 5": "France 5",
}


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
    Exemple : A2 -> Antenne 2
    """
    raw = str(value or "").strip()

    if not raw:
        return "Autres"

    upper = raw.upper()
    if upper in CHANNEL_ALIASES:
        return CHANNEL_ALIASES[upper]

    normalized_upper = normalize_text(raw).upper()
    if normalized_upper in CHANNEL_ALIASES:
        return CHANNEL_ALIASES[normalized_upper]

    return raw


def channel_rank(channel: str) -> int:
    """
    Ordre d'affichage des chaînes.
    Les chaînes inconnues passent après.
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
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"⚠️ Erreur lecture {filepath}: {e}")
        return None


# =====================================================
# Déduplication / fusion
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
        }
        return

    existing = target[key]

    # Garder le titre le plus complet
    if len(title) > len(existing.get("title", "")):
        existing["title"] = title

    # Garder la description la plus complète
    if len(description) > len(existing.get("description", "")):
        existing["description"] = description

    # Si l'heure manquait mais qu'une nouvelle arrivée a une heure, on la prend
    if not existing.get("time") and time:
        existing["time"] = time


def sort_programs(programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        programs,
        key=lambda p: (
            channel_rank(p.get("channel", "")),
            p.get("time") or "99:99",
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
            key=lambda p: (p.get("time") or "99:99", normalize_text(p.get("title", ""))),
        )

    return ordered


# =====================================================
# Génération principale
# =====================================================

def generate_index() -> None:
    print("=" * 70)
    print("📊 GÉNÉRATION DE L'INDEX TV RÉTRO - VERSION MAGAZINE")
    print("=" * 70)

    all_dates: Dict[str, Dict[str, Any]] = {}

    # Nettoyage optionnel des anciens fichiers date à la racine de data/
    # Exemple : data/01-01-1980.json
    data_root = Path("data")
    if data_root.exists():
        for stray in data_root.glob("??-??-????.json"):
            try:
                stray.unlink()
                print(f"🧹 Ancien fichier supprimé : {stray}")
            except Exception as e:
                print(f"⚠️ Impossible de supprimer {stray}: {e}")

    for source in SOURCES:
        source_dir = Path(f"data/{source}")

        if not source_dir.exists():
            print(f"⚠️ Dossier absent : {source_dir}")
            continue

        json_files = sorted(source_dir.glob("*.json"))
        print(f"📂 Source {source} : {len(json_files)} fichiers trouvés")

        for filepath in json_files:
            data = load_json_file(filepath)

            if not data:
                continue

            raw_date = data.get("date") or filepath.stem
            date = normalize_date(raw_date)

            if not date:
                print(f"⚠️ Date invalide ignorée : {filepath}")
                continue

            programs = data.get("programs", [])

            if not isinstance(programs, list):
                continue

            if date not in all_dates:
                all_dates[date] = {
                    "date": date,
                    "sources": set(),
                    "programs": {},
                }

            all_dates[date]["sources"].add(source)

            for program in programs:
                if not isinstance(program, dict):
                    continue
                merge_program(all_dates[date]["programs"], program)

    print("")
    print(f"✅ Dates uniques retenues : {len(all_dates)}")

    # Regrouper par année
    years: Dict[str, Dict[str, Any]] = {}

    for date_str, entry in all_dates.items():
        year = date_str.split("-")[2]

        programs_list = sort_programs(list(entry["programs"].values()))
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


if __name__ == "__main__":
    generate_index()