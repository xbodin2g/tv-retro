#!/usr/bin/env python3
"""
Génère l'index des données TV rétro.

Format de date supporté :
- JJ-MM-AAAA
- AAAA-MM-DD
- JJ/MM/AAAA
- AAAA/MM/DD

Sortie :
- data/index.json
- data/AAAA.json
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any


def normalize_date(date_str: str) -> Optional[str]:
    """
    Normalise une date au format JJ-MM-AAAA.
    Retourne None si la date est invalide.
    """
    if not date_str:
        return None

    date_str = str(date_str).strip()

    if "-" in date_str:
        parts = date_str.split("-")
    elif "/" in date_str:
        parts = date_str.split("/")
    else:
        return None

    if len(parts) != 3:
        return None

    try:
        # Format AAAA-MM-DD
        if len(parts[0]) == 4:
            year = int(parts[0])
            month = int(parts[1])
            day = int(parts[2])
        # Format JJ-MM-AAAA
        else:
            day = int(parts[0])
            month = int(parts[1])
            year = int(parts[2])

        # Validation basique
        datetime(year, month, day)

        return f"{day:02d}-{month:02d}-{year}"

    except Exception:
        return None


def date_sort_key(date_str: str):
    """
    Clé de tri chronologique pour JJ-MM-AAAA.
    """
    try:
        day, month, year = date_str.split("-")
        return int(year), int(month), int(day)
    except Exception:
        return 9999, 9999, 9999


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


def merge_programs(existing: List[Dict[str, Any]], new_programs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Fusionne des programmes en évitant les doublons simples.
    """
    seen = set()

    for p in existing:
        key = (
            p.get("time", ""),
            p.get("title", ""),
            p.get("channel", "")
        )
        seen.add(key)

    for p in new_programs:
        key = (
            p.get("time", ""),
            p.get("title", ""),
            p.get("channel", "")
        )

        if key not in seen:
            existing.append(p)
            seen.add(key)

    # Tri par heure
    existing.sort(key=lambda x: x.get("time", ""))

    return existing


def generate_index():
    print("=" * 70)
    print("📊 GÉNÉRATION DE L'INDEX TV RÉTRO")
    print("=" * 70)

    sources = ["depot101", "archives80"]

    # Toutes les dates fusionnées : date_normalisée -> données
    all_dates: Dict[str, Dict[str, Any]] = {}

    for source in sources:
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
            normalized_date = normalize_date(raw_date)

            if not normalized_date:
                print(f"⚠️ Date invalide ignorée : {filepath}")
                continue

            programs = data.get("programs", [])

            if not programs:
                continue

            if normalized_date not in all_dates:
                all_dates[normalized_date] = {
                    "date": normalized_date,
                    "source": source,
                    "programs": [],
                    "scraped_at": data.get("scraped_at", datetime.now().isoformat())
                }

            entry = all_dates[normalized_date]

            # Si plusieurs sources pour la même date, on combine les sources
            if source not in entry["source"]:
                entry["source"] = f"{entry['source']}+{source}"

            entry["programs"] = merge_programs(entry["programs"], programs)

    print("")
    print(f"✅ Dates uniques retenues : {len(all_dates)}")

    # Regrouper par année
    years: Dict[str, Dict[str, Any]] = {}

    for date_str, date_data in all_dates.items():
        year = date_str.split("-")[2]

        if year not in years:
            years[year] = {
                "dates": {},
                "total_programs": 0
            }

        program_count = len(date_data.get("programs", []))

        years[year]["dates"][date_str] = {
            "source": date_data.get("source", "unknown"),
            "programs_count": program_count
        }

        years[year]["total_programs"] += program_count

    # Trier les années
    sorted_years = dict(sorted(years.items(), key=lambda item: int(item[0])))

    index = {
        "generated_at": datetime.now().isoformat(),
        "total_dates": len(all_dates),
        "total_programs": sum(y["total_programs"] for y in sorted_years.values()),
        "years": {}
    }

    for year, year_data in sorted_years.items():
        sorted_dates = dict(
            sorted(
                year_data["dates"].items(),
                key=lambda item: date_sort_key(item[0])
            )
        )

        index["years"][year] = {
            "total_programs": year_data["total_programs"],
            "dates": sorted_dates
        }

    # Sauvegarder index global
    os.makedirs("data", exist_ok=True)

    index_path = "data/index.json"

    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    print(f"✅ Index global écrit : {index_path}")

    # Sauvegarder fichiers par année
    for year, year_data in index["years"].items():
        year_payload = {
            "year": year,
            "dates": {}
        }

        for date_str in year_data["dates"].keys():
            if date_str in all_dates:
                year_payload["dates"][date_str] = all_dates[date_str]

        year_path = f"data/{year}.json"

        with open(year_path, "w", encoding="utf-8") as f:
            json.dump(year_payload, f, ensure_ascii=False, indent=2)

        print(f"✅ Année écrite : {year_path} ({len(year_payload['dates'])} dates)")

    print("")
    print("=" * 70)
    print("🎉 INDEX GÉNÉRÉ")
    print("=" * 70)
    print(f"Années : {len(index['years'])}")
    print(f"Dates totales : {index['total_dates']}")
    print(f"Programmes totaux : {index['total_programs']}")


if __name__ == "__main__":
    generate_index()