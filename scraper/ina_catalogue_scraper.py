#!/usr/bin/env python3
"""
Moissonneur INA Catalogue — récupère uniquement les ŒUVRES diffusées dans une émission.

On ne conserve PAS les timecodes, durées, plateaux, génériques ni la structure
des notices. On conserve seulement : chaîne, date, heure de début (pour le
rapprochement interne) et la liste des titres d'œuvres.

Usage :
  python scraper/ina_catalogue_scraper.py --program "Club Dorothée" --year 1996 --max-notices 150
  python scraper/ina_catalogue_scraper.py --program "Récré A2" --index-only
  python scraper/ina_catalogue_scraper.py --program "Club Dorothée" --year 1996 --notices-only

Sorties :
  data/ina/index/<slug>.json
  data/ina/notices/<NOTICE_ID>.json   -> { programme, channel, date, start, elements[] }
"""

import argparse
import json
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

BASE = "https://catalogue.ina.fr"
LIST_PATH = "/docListe/TV-RADIO"

NOTICE_RE = re.compile(r"/doc/TV-RADIO/(TV_[0-9]+\.[0-9]+)", re.IGNORECASE)
DATE_RE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
TIME_RE = re.compile(r"\b(\d{2}:\d{2}:\d{2})(?::\d{2})?\b")
ITEM_RE = re.compile(r"^\s*(\d+)\.\s*(.+?)\s*$", re.MULTILINE)
TIMECODE_LINE_RE = re.compile(r"^\s*à\s*\d{2}:\d{2}:\d{2}", re.IGNORECASE)
INLINE_TIME_RE = re.compile(r"\s+à\s+\d{2}:\d{2}:\d{2}.*$", re.IGNORECASE)

KNOWN_CHANNELS = [
    "ORTF 1", "ORTF 2", "ORTF 3", "TF1", "Antenne 2", "France 2",
    "FR3", "France 3", "Canal+", "Canal Plus", "TV6", "M6",
    "La Cinq", "La Sept", "Arte", "La Cinquième", "France 5",
]

# Éléments sans intérêt pour retrouver un média : on les écarte.
EXCLUDE_PATTERNS = [
    r"^plateau\b", r"\bplateau\s*:", r"^animation\b", r"^pr[ée]sentation\b",
    r"interprogramme", r"publicit", r"^\s*pub\s*$", r"bande annonce",
    r"fin des [ée]missions", r"arr[êe]t des [ée]missions", r"fin des programmes",
    r"^m[ée]t[ée]o\b", r"tirage du loto", r"^tapis vert\b", r"^pr[ée]lude\b",
    r"^\d+\s*(?:ere|ère|eme|ème|e)\s+partie$", r"^seconde partie$", r"^suite$",
    r"^g[ée]n[ée]rique\b", r"^interm[èe]de\b", r"^annonce", r"^sommaire\b",
    r"^r[ée]sum[ée]\b", r"^teaser\b", r"^habillage\b", r"^jingle\b",
    r"^concours\b", r"^jeu concours\b", r"^d[ée]dicaces\b", r"^courrier\b",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


# =====================================================
# Utils
# =====================================================

def norm(value: str) -> str:
    text = str(value or "").strip().lower()
    for src, dst in (("é","e"),("è","e"),("ê","e"),("ë","e"),("à","a"),("â","a"),
                     ("ù","u"),("û","u"),("ô","o"),("î","i"),("ï","i"),("ç","c")):
        text = text.replace(src, dst)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text)).strip()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(value)).strip("-") or "programme"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    ensure_dir(path.parent)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def read_json(path: Path) -> Optional[Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def clean_title(raw: str) -> str:
    title = INLINE_TIME_RE.sub("", raw.strip())
    title = re.sub(r"\s*:\s*\[\s*(?:[ée]mission|programme|diffusion)[^\]]*\]\s*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s*\[\s*(?:[ée]mission|programme) du[^\]]*\]\s*$", "", title, flags=re.IGNORECASE)
    if title.startswith("[") and title.endswith("]"):
        title = title[1:-1].strip()
    title = re.sub(r"\s+", " ", title).strip(" .;:-–—")
    return title


def is_useful(title: str, program_norm: str) -> bool:
    if not title or len(title) < 3 or len(title) > 120:
        return False
    low = title.lower()
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, low):
            return False
    key = norm(title)
    if not key or key == program_norm:
        return False
    if re.fullmatch(r"[\d\s]+", title):
        return False
    return True


# =====================================================
# HTTP
# =====================================================

class InaClient:
    def __init__(self, delay: float = 3.0):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update(HEADERS)
        self._cloudscraper = None
        self._count = 0

    def _pause(self) -> None:
        time.sleep(random.uniform(self.delay * 0.8, self.delay * 1.4))
        self._count += 1
        if self._count % 40 == 0:
            extra = random.uniform(15.0, 30.0)
            print(f"  ⏸️ Pause longue ({extra:.0f}s) après {self._count} requêtes")
            time.sleep(extra)

    def get(self, url: str, max_retries: int = 4) -> Optional[str]:
        last_error = None
        for attempt in range(max_retries):
            self._pause()
            try:
                response = self.session.get(url, timeout=40)
                if response.status_code == 404:
                    return None
                if response.status_code in (403, 429, 503):
                    last_error = f"HTTP {response.status_code}"
                    wait = random.uniform(10.0, 20.0) * (attempt + 1)
                    print(f"  ⚠️ {last_error} — attente {wait:.0f}s")
                    time.sleep(wait)
                    if attempt >= 1 and self._cloudscraper is None:
                        try:
                            import cloudscraper
                            self._cloudscraper = cloudscraper.create_scraper()
                            self._cloudscraper.headers.update(HEADERS)
                        except Exception:
                            self._cloudscraper = False
                    continue
                response.raise_for_status()
                return response.text
            except Exception as error:
                last_error = str(error)
                if attempt < max_retries - 1:
                    time.sleep(random.uniform(6.0, 12.0) * (attempt + 1))

        if self._cloudscraper and self._cloudscraper is not False:
            try:
                self._pause()
                response = self._cloudscraper.get(url, timeout=40)
                if response.status_code == 200:
                    return response.text
            except Exception as error:
                last_error = str(error)

        print(f"  ❌ Échec définitif {url} : {last_error}")
        return None


# =====================================================
# Phase A — index des notices
# =====================================================

def build_list_url(program: str, variant: int) -> str:
    if variant == 0:
        params = {"base_label":"TVNAT","sujets_filter":"Sujet","tiprog":program,"ti":program,"bool_operator":"AND","nbLignes":"500"}
    elif variant == 1:
        params = {"base_label":"TVNAT","sujets_filter":"Sujet","tiprog":f'"{program}"',"bool_operator":"AND","nbLignes":"500"}
    elif variant == 2:
        params = {"base_label":"TVNAT","sujets_filter":"Sujet","tiprog":program,"bool_operator":"AND","nbLignes":"500"}
    else:
        params = {"base_label":"TVNAT","sujets_filter":"Sujet","ti":program,"bool_operator":"AND","nbLignes":"500"}
    return f"{BASE}{LIST_PATH}?{urlencode(params)}"


def parse_list_rows(html: str) -> List[Dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    rows: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    for link in soup.find_all("a", href=True):
        match = NOTICE_RE.search(link["href"])
        if not match:
            continue
        notice_id = match.group(1).upper()
        if notice_id in seen:
            continue

        row = link.find_parent("tr")
        cells = [c.get_text(" ", strip=True) for c in row.find_all("td")] if row else []
        blob = " | ".join(cells) if cells else link.get_text(" ", strip=True)

        date_match = DATE_RE.search(blob)
        if not date_match:
            continue

        times = TIME_RE.findall(blob)
        channel = ""
        for candidate in KNOWN_CHANNELS:
            if re.search(rf"\b{re.escape(candidate)}\b", blob, re.IGNORECASE):
                channel = candidate
                break

        seen.add(notice_id)
        rows.append({
            "notice_id": notice_id,
            "url": urljoin(BASE, link["href"]),
            "channel": channel,
            "date": f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}",
            "start": times[0] if times else "",
        })

    return rows


def find_next_page(html: str, current_url: str) -> Optional[str]:
    soup = BeautifulSoup(html, "html.parser")
    for link in soup.find_all("a", href=True):
        if "suivant" in link.get_text(" ", strip=True).lower():
            href = link["href"].strip()
            if href and not href.startswith("#") and "javascript" not in href.lower():
                return urljoin(current_url, href)
    return None


def harvest_index(client: InaClient, program: str, max_pages: int) -> List[Dict[str, Any]]:
    start_url = None
    for variant in range(4):
        candidate = build_list_url(program, variant)
        print(f"🔎 Test requête : {candidate}")
        html = client.get(candidate)
        if not html:
            continue
        if parse_list_rows(html):
            start_url = candidate
            print("✓ Requête retenue")
            break
        print("  · aucune notice liée sur cette variante")

    if not start_url:
        print(f"⚠️ Aucune notice liée trouvée pour « {program} »")
        return []

    all_rows: Dict[str, Dict[str, Any]] = {}
    url = start_url
    page = 0
    visited: Set[str] = set()

    while url and page < max_pages:
        if url in visited:
            break
        visited.add(url)
        page += 1
        html = client.get(url)
        if not html:
            break
        rows = parse_list_rows(html)
        new_count = 0
        for row in rows:
            if row["notice_id"] not in all_rows:
                all_rows[row["notice_id"]] = row
                new_count += 1
        print(f"  📄 Page {page} : {len(rows)} lignes, {new_count} nouvelles (total {len(all_rows)})")
        if not rows:
            break
        url = find_next_page(html, url)

    return sorted(all_rows.values(), key=lambda r: (
        r["date"].split("-")[2], r["date"].split("-")[1], r["date"].split("-")[0], r["start"]
    ))


# =====================================================
# Phase B — uniquement les titres d'œuvres
# =====================================================

def parse_notice(html: str, notice_id: str, url: str, program_query: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    fields: Dict[str, str] = {}

    for row in soup.find_all("tr"):
        cells = row.find_all(["td", "th"])
        if len(cells) != 2:
            continue
        label = cells[0].get_text(" ", strip=True).rstrip(":").strip()
        if not label or len(label) > 60:
            continue
        for br in cells[1].find_all("br"):
            br.replace_with("\n")
        value = "\n".join(l.strip() for l in cells[1].get_text("\n", strip=False).split("\n") if l.strip())
        if value:
            fields[label] = value

    def field(*names: str) -> str:
        for name in names:
            for key, value in fields.items():
                if key.lower() == name.lower():
                    return value
        return ""

    date_str = ""
    date_match = DATE_RE.search(field("Date de diffusion"))
    if date_match:
        date_str = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"

    start_match = TIME_RE.search(field("Heure de diffusion"))
    start = start_match.group(1)[:5] if start_match else ""

    programme = field("Titre programme") or program_query
    program_norm = norm(programme)

    elements: List[str] = []
    seen: Set[str] = set()

    sommaire = field("Sommaire")
    if sommaire:
        for line in sommaire.split("\n"):
            if TIMECODE_LINE_RE.match(line):
                continue
            item = ITEM_RE.match(line)
            raw = item.group(2) if item else line
            title = clean_title(raw)
            if not is_useful(title, program_norm):
                continue
            key = norm(title)
            if key in seen:
                continue
            seen.add(key)
            elements.append(title)

    return {
        "notice_id": notice_id,
        "url": url,
        "source": "ina",
        "scraped_at": datetime.now().isoformat(),
        "program_query": program_query,
        "programme": programme,
        "channel": field("Chaîne de diffusion", "Chaine de diffusion"),
        "date": date_str,
        "start": start,
        "elements": elements,
    }


# =====================================================
# Orchestration
# =====================================================

def run(program: str, year: Optional[int], max_notices: int, index_only: bool,
        notices_only: bool, force: bool, delay: float, max_pages: int) -> None:
    slug = slugify(program)
    index_path = Path("data/ina/index") / f"{slug}.json"
    notices_dir = Path("data/ina/notices")
    ensure_dir(notices_dir)

    client = InaClient(delay=delay)

    print("=" * 70)
    print(f"🏛️ INA — {program}" + (f" · {year}" if year else ""))
    print("=" * 70)

    if notices_only:
        cached = read_json(index_path)
        if not cached:
            print(f"❌ Index absent : {index_path}")
            sys.exit(1)
        rows = cached.get("notices", [])
        print(f"📂 Index en cache : {len(rows)} notices")
    else:
        rows = harvest_index(client, program, max_pages)
        write_json(index_path, {
            "program": program, "slug": slug,
            "harvested_at": datetime.now().isoformat(),
            "count": len(rows), "notices": rows,
        })
        print(f"✅ Index écrit : {index_path} ({len(rows)} notices)")

    if index_only or not rows:
        return

    if year:
        rows = [r for r in rows if r["date"].endswith(f"-{year}")]
        print(f"🎯 Filtre année {year} : {len(rows)} notices")

    pending, already = [], 0
    for row in rows:
        if (notices_dir / f"{row['notice_id']}.json").exists() and not force:
            already += 1
        else:
            pending.append(row)

    print(f"♻️ En cache : {already} · à télécharger : {len(pending)}")
    if max_notices > 0:
        pending = pending[:max_notices]
    print(f"▶️ {len(pending)} notices (délai ~{delay}s)\n")

    ok = with_elements = total_elements = failures = 0

    for position, row in enumerate(pending, start=1):
        notice_id = row["notice_id"]
        print(f"[{position}/{len(pending)}] {notice_id} · {row['date']} {row['start'][:5]} ...", end=" ", flush=True)

        html = client.get(row["url"])
        if not html:
            failures += 1
            print("✗")
            if failures >= 8:
                print("\n🛑 Trop d'échecs — arrêt propre (relance plus tard).")
                break
            continue

        try:
            notice = parse_notice(html, notice_id, row["url"], program)
        except Exception as error:
            failures += 1
            print(f"✗ parsing: {error}")
            continue

        notice["date"] = notice.get("date") or row["date"]
        notice["channel"] = notice.get("channel") or row["channel"]
        notice["start"] = notice.get("start") or row["start"][:5]

        write_json(notices_dir / f"{notice_id}.json", notice)
        ok += 1
        failures = 0

        count = len(notice["elements"])
        if count:
            with_elements += 1
            total_elements += count
            preview = " · ".join(notice["elements"][:4])
            print(f"✓ {count} œuvres — {preview}")
        else:
            print("✓ notice sans sommaire exploitable")

    print("\n" + "=" * 70)
    print("🎉 TERMINÉ")
    print("=" * 70)
    print(f"Notices téléchargées : {ok}")
    print(f"Avec œuvres          : {with_elements}")
    print(f"Œuvres relevées      : {total_elements}")
    print(f"Cache total          : {len(list(notices_dir.glob('*.json')))} notices")
    print("\n💡 Relance la même commande pour continuer (le cache évite les re-téléchargements).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Moissonneur INA — œuvres diffusées")
    parser.add_argument("--program", required=True)
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--max-notices", type=int, default=150)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--notices-only", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--delay", type=float, default=3.0)
    args = parser.parse_args()
    run(args.program, args.year, args.max_notices, args.index_only,
        args.notices_only, args.force, args.delay, args.max_pages)


if __name__ == "__main__":
    main()