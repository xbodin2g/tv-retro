#!/usr/bin/env python3
"""
Moissonneur INA Catalogue — œuvres diffusées dans une émission.

Corrections v3 :
  - identifiants de notice génériques (TV_307986.001 ET DA_CPB90014379, etc.)
  - titres INA collés acceptés ("RécréA2" == "Récré A2")
  - lecture de "Résumé documentaire" (Archives TV Pro) en plus de "Sommaire"
  - puces "- Titre" acceptées en plus de "1. Titre"
  - plus de filtre base_label (couvre TV Nationale + Archives TV Pro)

On ne conserve que : chaîne, date, heure de début (rapprochement interne) et
les titres d'œuvres canonicalisés. Aucun timecode de segment, aucune durée.

Usage :
  python scraper/ina_catalogue_scraper.py --program "Récré A2" --year 1980 --max-notices 400
  python scraper/ina_catalogue_scraper.py --program "Club Dorothée" --rebuild
"""

import argparse
import json
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup

BASE = "https://catalogue.ina.fr"
LIST_PATH = "/docListe/TV-RADIO"
PAGE_SIZE = 500
PARSER_VERSION = 3

# Accepte TV_307986.001, DA_CPB90014379, et tout préfixe de base INA.
NOTICE_RE = re.compile(r"/doc/TV-RADIO/([A-Za-z]{1,8}_[A-Za-z0-9]+(?:\.[0-9]+)?)", re.IGNORECASE)
DATE_RE = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
TIME_RE = re.compile(r"\b(\d{2}:\d{2}:\d{2})(?::\d{2})?\b")
TOTAL_RE = re.compile(r"sur\s+([\d\s\u00a0]{1,12})\b")
ITEM_RE = re.compile(r"^\s*(\d+)\.\s*(.+?)\s*$", re.MULTILINE)
BULLET_RE = re.compile(r"^\s*[-–—•*·▪]\s*")
TIMECODE_LINE_RE = re.compile(r"^\s*à\s*\d{2}:\d{2}:\d{2}", re.IGNORECASE)
INLINE_TIME_RE = re.compile(r"\s+à\s+\d{2}:\d{2}:\d{2}.*$", re.IGNORECASE)
PART_SUFFIX_RE = re.compile(r"\s*:\s*\[?\s*\d+\s*(?:ere|ère|er|e|eme|ème)\s+partie\s*\]?\s*$", re.IGNORECASE)
BRACKET_PART_RE = re.compile(r"\s*\[\s*\d+\s*(?:ere|ère|er|e|eme|ème)\s+partie\s*\]\s*$", re.IGNORECASE)
DATE_SUFFIX_RE = re.compile(r"\s*:?\s*\[?\s*(?:[ée]mission|programme|diffusion)\s+(?:du|enregistr[ée]e? le)[^\]]*\]?\s*$", re.IGNORECASE)

KNOWN_CHANNELS = ["ORTF 1","ORTF 2","ORTF 3","TF1","Antenne 2","France 2","FR3","France 3",
                  "Canal+","Canal Plus","TV6","M6","La Cinq","La Sept","Arte","La Cinquième","France 5"]

EXCLUDE_PATTERNS = [
    r"^plateau\b", r"\bplateau\s*:", r"^animation\b", r"^pr[ée]sentation\b",
    r"interprogramme", r"publicit", r"^\s*pub\s*$", r"bande annonce",
    r"fin des [ée]missions", r"arr[êe]t des [ée]missions", r"fin des programmes",
    r"^m[ée]t[ée]o\b", r"tirage du loto", r"^tapis vert\b", r"^pr[ée]lude\b",
    r"^\d+\s*(?:ere|ère|eme|ème|e)\s+partie$", r"^seconde partie$", r"^suite$",
    r"^g[ée]n[ée]rique\b", r"^interm[èe]de\b", r"^annonce", r"^sommaire\b",
    r"^r[ée]sum[ée]\b", r"^teaser\b", r"^habillage\b", r"^jingle\b",
    r"^concours\b", r"^jeu concours\b", r"^d[ée]dicaces\b", r"^courrier\b",
    r"^ plateau", r"^indicatif\b", r"^opening\b", r"^closing\b",
]

CANON_EXACT = {
    # années 90
    "mask": "Mask", "ferdy": "Ferdy", "popples": "Popples", "conan": "Conan",
    "cadichon": "Cadichon", "nick larson": "Nick Larson", "nico larson": "Nick Larson",
    "city hunter": "City Hunter", "sailormoon": "Sailor Moon", "sailor moon": "Sailor Moon",
    "power rangers": "Power Rangers", "power rangers zeo": "Power Rangers Zeo",
    "dragon ball z": "Dragon Ball Z", "dragon ball": "Dragon Ball",
    "les minipouss": "Les Minipouss", "minipouss": "Les Minipouss",
    "jeanne et serge": "Jeanne et Serge", "shera": "She-Ra", "he man": "He-Man",
    "mon petit poney": "Mon petit poney", "my little pony": "Mon petit poney",
    "sophie et virginie": "Sophie et Virginie", "denis la malice": "Denis la Malice",
    "inspecteur gadget": "Inspecteur Gadget", "lucky luke": "Lucky Luke",
    "les schtroumpfs": "Les Schtroumpfs", "schtroumpfs": "Les Schtroumpfs",
    "tom et jerry": "Tom et Jerry", "titi et gros minet": "Titi et Grosminet",
    "bugs bunny": "Bugs Bunny", "daffy duck": "Daffy Duck", "scooby doo": "Scooby-Doo",
    "la panthere rose": "La Panthère rose", "les flintstones": "Les Pierrafeu",
    "les jetson": "Les Jetson", "quick et flupke": "Quick et Flupke",
    "la pimpa": "La Pimpa", "mimi cracra": "Mimi Cracra", "bogus": "Bogus",
    "les fables d esope": "Les Fables d'Ésope", "petit ours brun": "Petit Ours Brun",
    "naturimages": "Naturimages", "les enfants des terrasses": "Les enfants des terrasses",
    "souris noire": "Souris noire", "les petits malins": "Les petits malins",
    "galaxie express 99": "Galaxie Express 99", "visionaries": "Visionaries", "tarzan": "Tarzan",
    "winnie l ourson": "Winnie l'ourson", "les gummies": "Les Gummies", "les gummi": "Les Gummies",
    "superboy": "Superboy", "super boy": "Superboy", "rick hunter": "Rick Hunter",
    "columbo": "Columbo", "starsky et hutch": "Starsky et Hutch", "starsky hutch": "Starsky et Hutch",
    "k 2000": "K 2000", "k2000": "K 2000", "l agence tous risques": "L'Agence tous risques",
    "droles de dames": "Drôles de dames", "hawai police d etat": "Hawaï, police d'État",
    "magnum": "Magnum", "l homme qui tombe a pic": "L'Homme qui tombe à pic",
    "sherlock holmes": "Sherlock Holmes", "les aventures de sherlock holmes": "Sherlock Holmes",
    # années 80 — Récré A2 & compagnie
    "emilie": "Émilie", "les paladins de france": "Les Paladins de France",
    "papivole": "Papivole", "discopuce": "Discopuce",
    "sido et remi": "Sido et Rémi", "kaleidoscope": "Kaléidoscope",
    "c est chouette": "C'est chouette", "a2000": "A2000",
    "mes mains ont la parole": "Mes mains ont la parole",
    "la caverne d abracadabra": "La Caverne d'Abracadabra",
    "les croquignoles": "Les Croquignoles", "l ile aux enfants": "L'Île aux enfants",
    "casimir": "Casimir", "les animaux du monde": "Les Animaux du monde",
    "inspecteur derby": "Inspecteur Derby", "albator": "Albator",
    "goldorak": "Goldorak", "capitaine flam": "Capitaine Flam",
    "candy": "Candy", "heidi": "Heidi", "vic le viking": "Vic le Viking",
    "maya l abeille": "Maya l'abeille", "calimero": "Caliméro",
    "les mysterieuses cites d or": "Les Mystérieuses Cités d'or",
    "les mysterieuses cites d or": "Les Mystérieuses Cités d'or",
    "ulysse 31": "Ulysse 31", "tom sawyer": "Tom Sawyer",
    "le tour du monde en 80 jours": "Le Tour du monde en 80 jours",
}

CANON_RULES: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"^les?\s+bisounours$"), "Les Bisounours"),
    (re.compile(r"^bisounours$"), "Les Bisounours"),
    (re.compile(r"^les\s+chevaliers\s+du\s+zodiaque?s?$"), "Les Chevaliers du Zodiaque"),
    (re.compile(r"^les\s+amichain(?:e|ê)s?$"), "Les Amichaînes"),
    (re.compile(r"^la\s+croisi[èe]re\s+foll?\s*amour$"), "La Croisière Foll'Amour"),
    (re.compile(r"^les\s+ann[ée]es\s+fac$"), "Les Années fac"),
    (re.compile(r"^premiers\s+baisers$"), "Premiers baisers"),
    (re.compile(r"^salut\s+les\s+muscl[ée]s$"), "Salut les Musclés"),
    (re.compile(r"^cadichon.*$"), "Cadichon"),
    (re.compile(r"^b[ée]c[ée]\s*b[ée]g[ée]$"), "Bécébégé"),
    (re.compile(r"^tico\s+et\s+ses\s+amis$"), "Tico et ses amis"),
    (re.compile(r"^l\s*[ée]cole\s+des\s+champions$"), "L'école des champions"),
    (re.compile(r"^les\s+quat\s*z\s*amis$"), "Les Quat'z Amis"),
    (re.compile(r"^la\s+caverne\s+d\s*abracadabra$"), "La Caverne d'Abracadabra"),
    (re.compile(r"^r[ée]cr[ée]\s*a\s*2.*$"), "Récré A2"),
    (re.compile(r"^le\s+college\s+fou\s*fou\s*fou$"), "Le Collège fou fou fou"),
    (re.compile(r"^juliette\s+je\s+t\s+aime$"), "Juliette je t'aime"),
    (re.compile(r"^cynthia\s+ou\s+le\s+rythme\s+de\s+la\s+vie$"), "Cynthia ou le rythme de la vie"),
]

HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


# =====================================================
# Normalisation
# =====================================================

def norm(value: str) -> str:
    text = str(value or "").strip().lower()
    for a, b in (("é","e"),("è","e"),("ê","e"),("ë","e"),("à","a"),("â","a"),("ä","a"),
                 ("ù","u"),("û","u"),("ü","u"),("ô","o"),("ö","o"),("î","i"),("ï","i"),
                 ("ì","i"),("ç","c"),("ñ","n")):
        text = text.replace(a, b)
    text = re.sub(r"['’]", " ", text)
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text)).strip()


def compact(value: str) -> str:
    return re.sub(r"\s+", "", norm(value))


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(value)).strip("-") or "programme"


def canon_title(title: str) -> str:
    key = norm(title)
    if not key:
        return title
    if key in CANON_EXACT:
        return CANON_EXACT[key]
    for pattern, canonical in CANON_RULES:
        if pattern.match(key):
            return canonical
    return title


def clean_title(raw: str) -> str:
    title = BULLET_RE.sub("", str(raw or "").strip())
    title = INLINE_TIME_RE.sub("", title)
    title = DATE_SUFFIX_RE.sub("", title)
    title = PART_SUFFIX_RE.sub("", title)
    title = BRACKET_PART_RE.sub("", title)
    if title.startswith("[") and title.endswith("]"):
        title = title[1:-1].strip()
    title = re.sub(r"\s+", " ", title).strip(" .;:-–—")
    parts = title.split(":", 1)
    if len(parts) == 2:
        left, right = parts[0].strip(), parts[1].strip()
        if left and norm(left) == norm(right):
            title = left
    return PART_SUFFIX_RE.sub("", title).strip(" .;:-–—")


def is_useful(title: str, program_norm: str, program_compact: str) -> bool:
    if not title or len(title) < 3 or len(title) > 140:
        return False
    low = title.lower()
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, low):
            return False
    key = norm(title)
    if not key or key == program_norm or compact(title) == program_compact:
        return False
    if re.fullmatch(r"[\d\s]+", title):
        return False
    return True


def build_elements(raw_titles: List[str], program: str) -> List[str]:
    pn, pc = norm(program), compact(program)
    out: List[str] = []
    seen: Set[str] = set()
    for raw in raw_titles:
        title = canon_title(clean_title(raw))
        if not is_useful(title, pn, pc):
            continue
        key = norm(title)
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
    return out


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
# Phase A — index par année, toutes bases
# =====================================================

def build_year_url(program: str, year: Optional[int], variant: int) -> str:
    params = {"sujets_filter": "Sujet", "bool_operator": "AND", "nbLignes": str(PAGE_SIZE)}
    if variant == 0:
        params["tiprog"] = program
        params["ti"] = str(year) if year else program
    elif variant == 1:
        params["tiprog"] = f'"{program}"'
        if year:
            params["ti"] = str(year)
    elif variant == 2:
        params["ti"] = f"{program} {year}" if year else program
    else:
        params["base_label"] = "TVNAT"
        params["tiprog"] = program
        params["ti"] = str(year) if year else program
    return f"{BASE}{LIST_PATH}?{urlencode(params)}"


def declared_total(soup: BeautifulSoup) -> Optional[int]:
    text = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
    match = TOTAL_RE.search(text)
    if not match:
        return None
    digits = re.sub(r"[^\d]", "", match.group(1))
    return int(digits) if digits else None


def parse_list_rows(html: str, program: str, include_subnotices: bool) -> Tuple[List[Dict[str, Any]], Optional[int]]:
    soup = BeautifulSoup(html, "html.parser")
    pn, pc = norm(program), compact(program)
    rows: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    for link in soup.find_all("a", href=True):
        match = NOTICE_RE.search(link["href"])
        if not match:
            continue
        notice_id = match.group(1).upper()
        if notice_id in seen:
            continue

        label = link.get_text(" ", strip=True)
        if not include_subnotices and pc:
            if pn not in norm(label) and pc not in compact(label):
                continue

        row = link.find_parent("tr")
        cells = [c.get_text(" ", strip=True) for c in row.find_all("td")] if row else []
        blob = " | ".join(cells) if cells else label

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

    return rows, declared_total(soup)


def harvest_year(client: InaClient, program: str, year: Optional[int],
                 include_subnotices: bool) -> List[Dict[str, Any]]:
    label = str(year) if year else "global"
    for variant in range(4):
        url = build_year_url(program, year, variant)
        html = client.get(url)
        if not html:
            continue
        rows, total = parse_list_rows(html, program, include_subnotices)
        if rows:
            message = f"  📅 {label} : {len(rows)} notices mères"
            if total is not None:
                message += f" (annoncés : {total})"
                if total > PAGE_SIZE:
                    message += " ⚠️ TRONQUÉ"
            print(message)
            return rows
        if total == 0:
            print(f"  📅 {label} : 0")
            return []
    print(f"  📅 {label} : aucune notice mère liée")
    return []


def harvest_index(client: InaClient, program: str, year: Optional[int],
                  year_start: int, year_end: int, include_subnotices: bool) -> List[Dict[str, Any]]:
    all_rows: Dict[str, Dict[str, Any]] = {}

    def absorb(rows: List[Dict[str, Any]]) -> None:
        for row in rows:
            all_rows.setdefault(row["notice_id"], row)

    if year:
        absorb(harvest_year(client, program, year, include_subnotices))
    else:
        for y in range(year_start, year_end + 1):
            absorb(harvest_year(client, program, y, include_subnotices))
        absorb(harvest_year(client, program, None, include_subnotices))

    return sorted(all_rows.values(), key=lambda r: (
        r["date"].split("-")[2], r["date"].split("-")[1], r["date"].split("-")[0], r["start"]))


# =====================================================
# Phase B — Sommaire OU Résumé documentaire
# =====================================================

def parse_notice(html: str, notice_id: str, url: str, program: str) -> Dict[str, Any]:
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
                if norm(key) == norm(name):
                    return value
        return ""

    date_str = ""
    date_match = DATE_RE.search(field("Date de diffusion"))
    if date_match:
        date_str = f"{date_match.group(1)}-{date_match.group(2)}-{date_match.group(3)}"

    start_match = TIME_RE.search(field("Heure de diffusion"))
    start = start_match.group(1)[:5] if start_match else ""

    programme = field("Titre programme") or program

    content = field("Sommaire")
    elements_field = "Sommaire"
    if not content:
        content = field("Résumé documentaire", "Resume documentaire", "Résumé", "Resume")
        elements_field = "Résumé documentaire"

    titles_raw: List[str] = []
    if content:
        for line in content.split("\n"):
            if TIMECODE_LINE_RE.match(line):
                continue
            item = ITEM_RE.match(line)
            raw = (item.group(2) if item else BULLET_RE.sub("", line)).strip()
            if raw:
                titles_raw.append(raw)

    return {
        "notice_id": notice_id,
        "url": url,
        "source": "ina",
        "parser_version": PARSER_VERSION,
        "scraped_at": datetime.now().isoformat(),
        "program_query": program,
        "programme": programme,
        "base": field("Base"),
        "channel": field("Chaîne de diffusion", "Chaine de diffusion"),
        "date": date_str,
        "start": start,
        "elements_field": elements_field if titles_raw else "",
        "titles_raw": titles_raw,
        "elements": build_elements(titles_raw, programme),
    }


def rebuild_cache(program: Optional[str]) -> None:
    directory = Path("data/ina/notices")
    if not directory.exists():
        print("❌ Aucun cache data/ina/notices")
        return
    changed = total = 0
    for path in sorted(directory.glob("*.json")):
        notice = read_json(path)
        if not notice:
            continue
        if program and norm(notice.get("program_query", "")) != norm(program):
            continue
        total += 1
        source_titles = notice.get("titles_raw") or notice.get("elements") or []
        programme = notice.get("programme") or notice.get("program_query") or ""
        elements = build_elements(source_titles, programme)
        if elements != notice.get("elements") or notice.get("parser_version") != PARSER_VERSION:
            notice["elements"] = elements
            notice.setdefault("titles_raw", source_titles)
            notice["parser_version"] = PARSER_VERSION
            notice["rebuilt_at"] = datetime.now().isoformat()
            write_json(path, notice)
            changed += 1
    print(f"✅ Rebuild sans requête : {changed}/{total} notices mises à jour")


# =====================================================
# Orchestration
# =====================================================

def run(args: argparse.Namespace) -> None:
    if args.rebuild:
        rebuild_cache(args.program)
        return

    program = args.program
    slug = slugify(program)
    index_path = Path("data/ina/index") / f"{slug}.json"
    notices_dir = Path("data/ina/notices")
    ensure_dir(notices_dir)
    client = InaClient(delay=args.delay)

    print("=" * 70)
    print(f"🏛️ INA — {program}" + (f" · {args.year}" if args.year else f" · {args.year_start}-{args.year_end}"))
    print("=" * 70)

    if args.notices_only:
        cached = read_json(index_path)
        if not cached:
            print(f"❌ Index absent : {index_path}")
            sys.exit(1)
        rows = cached.get("notices", [])
        print(f"📂 Index en cache : {len(rows)} notices")
    else:
        rows = harvest_index(client, program, args.year, args.year_start, args.year_end, args.include_subnotices)
        previous = read_json(index_path) or {}
        merged = {r["notice_id"]: r for r in previous.get("notices", [])}
        for row in rows:
            merged[row["notice_id"]] = row
        rows = sorted(merged.values(), key=lambda r: (
            r["date"].split("-")[2], r["date"].split("-")[1], r["date"].split("-")[0], r["start"]))
        write_json(index_path, {
            "program": program, "slug": slug,
            "harvested_at": datetime.now().isoformat(),
            "count": len(rows), "notices": rows,
        })
        print(f"✅ Index : {index_path} ({len(rows)} notices cumulées)")

    if args.index_only or not rows:
        return

    if args.year:
        rows = [r for r in rows if r["date"].endswith(f"-{args.year}")]
        print(f"🎯 Année {args.year} : {len(rows)} notices")

    pending, already = [], 0
    for row in rows:
        existing = read_json(notices_dir / f"{row['notice_id']}.json")
        if existing and not args.force and existing.get("elements"):
            already += 1
        else:
            pending.append(row)

    print(f"♻️ Déjà enrichies : {already} · à télécharger : {len(pending)}")
    if args.max_notices > 0:
        pending = pending[:args.max_notices]
    print(f"▶️ {len(pending)} notices (délai ~{args.delay}s)\n")

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
            print(f"✓ {count} [{notice['elements_field']}] — {' · '.join(notice['elements'][:4])}")
        else:
            print("✓ sans liste d'œuvres")

    print("\n" + "=" * 70)
    print("🎉 TERMINÉ")
    print("=" * 70)
    print(f"Téléchargées : {ok} · Avec œuvres : {with_elements} · Œuvres : {total_elements}")
    print(f"Cache total  : {len(list(notices_dir.glob('*.json')))} notices")
    print("\n💡 Relance la même commande pour continuer.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Moissonneur INA — œuvres diffusées")
    parser.add_argument("--program", required=True)
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--year-start", type=int, default=1970)
    parser.add_argument("--year-end", type=int, default=1999)
    parser.add_argument("--max-notices", type=int, default=400)
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--notices-only", action="store_true")
    parser.add_argument("--include-subnotices", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--rebuild", action="store_true")
    parser.add_argument("--delay", type=float, default=3.0)
    args = parser.parse_args()
    run(args)


if __name__ == "__main__":
    main()