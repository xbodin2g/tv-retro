#!/usr/bin/env python3
"""
Scraper Depot101 - version corrigée.

Corrections :
- détection des noms courts de chaînes : A2, C+, L5, FR3, M6, etc.
- navigation simulée : accueil -> décennie -> année
- gestion plus robuste des 403
- pauses plus longues pour limiter les blocages
- conservation des description_lines pour les extraits jeunesse
"""

import cloudscraper
from bs4 import BeautifulSoup
import json
import time
import re
import os
import random
from datetime import datetime
from typing import Dict, List, Optional, Set


class Depot101Scraper:
    HOME_URL = "https://www.depot101.com"
    GRILLES_URL = "https://www.depot101.com/tele/grilles"
    BASE_URL = "https://www.depot101.com/tele/grille"

    TIME_RE = re.compile(r"^\d{2}:\d{2}$")

    MONTHS = {
        "janvier": 1,
        "février": 2,
        "fevrier": 2,
        "mars": 3,
        "avril": 4,
        "mai": 5,
        "juin": 6,
        "juillet": 7,
        "août": 8,
        "aout": 8,
        "septembre": 9,
        "octobre": 10,
        "novembre": 11,
        "décembre": 12,
        "decembre": 12,
    }

    # Alias de chaînes utilisés par Depot101
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
        "L5": "La Cinq",
        "LA5": "La Cinq",
        "LA CINQ": "La Cinq",
        "CINQ": "La Cinq",
        "M6": "M6",
        "ARTE": "Arte",
        "FRANCE 5": "France 5",
    }

    # Compact map sans espaces
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
        "L5": "La Cinq",
        "LA5": "La Cinq",
        "LACINQ": "La Cinq",
        "CINQ": "La Cinq",
        "M6": "M6",
        "ARTE": "Arte",
        "FRANCE5": "France 5",
    }

    CHANNEL_REGEX = [
        (re.compile(r"^C\s*\+$", re.IGNORECASE), "Canal+"),
        (re.compile(r"^L\s*5$", re.IGNORECASE), "La Cinq"),
        (re.compile(r"^A\s*2$", re.IGNORECASE), "Antenne 2"),
        (re.compile(r"^FR\s*3$", re.IGNORECASE), "FR3"),
        (re.compile(r"^FRANCE\s*2$", re.IGNORECASE), "France 2"),
        (re.compile(r"^FRANCE\s*3$", re.IGNORECASE), "France 3"),
        (re.compile(r"^FRANCE\s*5$", re.IGNORECASE), "France 5"),
    ]

    # Marqueurs de pied de page.
    # Ils ne sont utilisés qu'APRÈS le début réel de la grille.
    FOOTER_MARKERS = (
        "dernières vidéos",
        "dernieres videos",
        "accès rapide",
        "acces rapide",
        "le terminal",
        "le top 30",
        "derniers titres",
        "derniers albums",
        "top albums",
        "la page du jour",
        "central box",
        "page d'aide",
        "bloc-notes",
        "©",
        "copyright",
        "silo grilles tv",
    )

    BASE_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8"
        ),
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
    }

    def __init__(self, delay: float = 3.5):
        self.delay = delay

        self._home_visited = False
        self._visited_decades: Set[str] = set()
        self._decade_text_cache: Dict[str, str] = {}
        self._annual_text_cache: Dict[str, str] = {}
        self._annual_url_cache: Dict[str, str] = {}
        self._daily_text_cache: Dict[str, str] = {}
        self._debugged_zero = False

        self.scraper = self._create_scraper()

    # =====================================================
    # Session / HTTP
    # =====================================================

    def _create_scraper(self):
        scraper = cloudscraper.create_scraper(
            browser={
                "browser": "chrome",
                "platform": "windows",
                "desktop": True,
            }
        )
        scraper.headers.update(self.BASE_HEADERS.copy())
        return scraper

    def _reset_scraper(self) -> None:
        print("  ♻️ Réinitialisation de la session Depot101...")
        self.scraper = self._create_scraper()
        self._home_visited = False
        self._visited_decades.clear()
        self._decade_text_cache.clear()
        self._annual_text_cache.clear()
        self._annual_url_cache.clear()
        self._daily_text_cache.clear()

    def _headers_for(self, referer: Optional[str] = None) -> Dict[str, str]:
        headers = self.BASE_HEADERS.copy()

        if referer:
            headers["Referer"] = referer
            headers["Sec-Fetch-Site"] = "same-origin"
        else:
            headers.pop("Referer", None)
            headers["Sec-Fetch-Site"] = "none"

        return headers

    def _request(
        self,
        url: str,
        referer: Optional[str] = None,
        max_retries: int = 4,
    ) -> Optional[object]:
        """
        Requête HTTP robuste.
        Retourne None si 404.
        Lève une exception si 403 persistant ou erreur finale.
        """
        last_error: Optional[Exception] = None

        for attempt in range(max_retries):
            try:
                sleep_time = random.uniform(
                    2.0 + attempt * 1.5,
                    max(4.0, self.delay + attempt * 2.5),
                )
                time.sleep(sleep_time)

                headers = self._headers_for(referer)
                response = self.scraper.get(url, headers=headers, timeout=30)

                if response.status_code == 404:
                    return None

                if response.status_code == 403:
                    last_error = Exception(
                        f"403 Client Error: Forbidden for url: {url}"
                    )

                    if attempt < max_retries - 1:
                        print(
                            f"  ⚠️ 403 sur {url}, "
                            f"tentative {attempt + 1}/{max_retries - 1}..."
                        )
                        self._reset_scraper()
                        time.sleep(random.uniform(10.0, 20.0) * (attempt + 1))
                        continue

                    raise last_error

                response.raise_for_status()
                return response

            except Exception as e:
                last_error = e

                if attempt < max_retries - 1:
                    print(f"  ⚠️ Erreur requête sur {url}: {e}")
                    self._reset_scraper()
                    time.sleep(random.uniform(10.0, 20.0) * (attempt + 1))
                    continue

                print(f"  ❌ Erreur requête finale sur {url}: {e}")
                raise

        if last_error:
            raise last_error

        return None

    # =====================================================
    # HTML -> texte
    # =====================================================

    def _html_to_text(self, html: str) -> str:
        """
        Convertit le HTML en texte lisible, ligne par ligne.
        """
        soup = BeautifulSoup(html, "html.parser")

        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()

        return soup.get_text("\n", strip=True)

    # =====================================================
    # Détection chaîne
    # =====================================================

    def _compact_upper(self, value: str) -> str:
        return re.sub(r"\s+", "", str(value or "").strip().upper())

    def detect_channel(self, line: str) -> Optional[str]:
        """
        Détecte un nom de chaîne Depot101, y compris les formes courtes :
        A2, C+, L5, FR3, M6, etc.
        """
        raw = str(line or "").strip()

        if not raw:
            return None

        key = raw.upper()

        if key in self.CHANNEL_ALIASES:
            return self.CHANNEL_ALIASES[key]

        compact = self._compact_upper(raw)

        if compact in self.CHANNEL_COMPACT_MAP:
            return self.CHANNEL_COMPACT_MAP[compact]

        for regex, canonical in self.CHANNEL_REGEX:
            if regex.match(raw):
                return canonical

        return None

    # =====================================================
    # Navigation simulée
    # =====================================================

    def _decade_for_year(self, year: int) -> Optional[str]:
        if 1970 <= year <= 1979:
            return "70s"
        if 1980 <= year <= 1989:
            return "80s"
        if 1990 <= year <= 1999:
            return "90s"
        return None

    def _visit_home(self) -> bool:
        """
        Visite la page d'accueil une seule fois par session.
        """
        if self._home_visited:
            return True

        try:
            print("🏠 Navigation Depot101 : page d'accueil...")
            response = self._request(self.HOME_URL, referer=None, max_retries=2)

            if response is not None:
                self._home_visited = True
                print("✓ Page d'accueil Depot101 visitée")
                return True

        except Exception as e:
            print(f"⚠️ Impossible de visiter la page d'accueil Depot101 : {e}")

        return False

    def _visit_decade(self, decade: str) -> bool:
        """
        Visite la page de décennie, ex : /tele/grilles/80s
        """
        if not decade:
            return False

        if decade in self._visited_decades:
            return True

        self._visit_home()

        url = f"{self.GRILLES_URL}/{decade}"
        referer = self.HOME_URL if self._home_visited else None

        try:
            print(f"📚 Navigation Depot101 : décennie {decade}...")
            response = self._request(url, referer=referer, max_retries=2)

            if response is not None:
                text = self._html_to_text(response.text)
                self._decade_text_cache[decade] = text
                self._visited_decades.add(decade)
                print(f"✓ Décennie {decade} visitée")
                return True

        except Exception as e:
            print(f"⚠️ Impossible de visiter la décennie {decade} : {e}")

        return False

    def _annual_url_candidates(self, year: int) -> List[str]:
        year_str = str(year)
        decade = self._decade_for_year(year)

        candidates = [
            f"{self.GRILLES_URL}/{year_str}",
            f"{self.GRILLES_URL}/{year_str}/",
        ]

        if decade:
            candidates.extend(
                [
                    f"{self.GRILLES_URL}/{decade}/{year_str}",
                    f"{self.GRILLES_URL}/{decade}/{year_str}/",
                ]
            )

        # Déduplication en conservant l'ordre
        seen = set()
        ordered = []
        for item in candidates:
            if item not in seen:
                seen.add(item)
                ordered.append(item)

        return ordered

    def _navigate_to_year(self, year: int) -> Optional[str]:
        """
        Simule la navigation :
        accueil -> décennie -> année.

        Retourne le texte de la page annuelle si des dates sont trouvées.
        """
        year_str = str(year)

        if year_str in self._annual_text_cache:
            return self._annual_text_cache[year_str]

        decade = self._decade_for_year(year)

        self._visit_home()
        self._visit_decade(decade)

        referer = None

        if decade and decade in self._visited_decades:
            referer = f"{self.GRILLES_URL}/{decade}"
        elif self._home_visited:
            referer = self.HOME_URL

        for url in self._annual_url_candidates(year):
            try:
                response = self._request(url, referer=referer, max_retries=3)
            except Exception:
                continue

            if response is None:
                continue

            text = self._html_to_text(response.text)
            dates = self._extract_dates_from_text(text, year=year)

            if dates:
                self._annual_text_cache[year_str] = text
                self._annual_url_cache[year_str] = url
                print(f"✓ Navigation année {year} réussie : {url}")
                return text

        print(f"⚠️ Impossible de naviguer vers la page annuelle Depot101 {year}")
        return None

    def _daily_referer_candidates(self, year_str: str) -> List[Optional[str]]:
        """
        Candidates de Referer pour la page du jour.
        On privilégie la navigation année -> jour.
        """
        candidates: List[Optional[str]] = []

        annual_url = self._annual_url_cache.get(year_str)

        if annual_url:
            candidates.append(annual_url)

        year_url = f"{self.GRILLES_URL}/{year_str}"
        year_url_slash = f"{self.GRILLES_URL}/{year_str}/"

        candidates.append(year_url)
        candidates.append(year_url_slash)

        if self._home_visited:
            candidates.append(self.HOME_URL)

        candidates.append(None)

        # Déduplication en conservant l'ordre
        seen = set()
        ordered = []
        for item in candidates:
            if item not in seen:
                seen.add(item)
                ordered.append(item)

        return ordered

    def _fetch_daily_text(self, date_str: str) -> Optional[str]:
        """
        Récupère le texte d'une page journalière en simulant si possible :
        accueil -> décennie -> année -> jour.
        """
        if date_str in self._daily_text_cache:
            return self._daily_text_cache[date_str]

        year_str = date_str.split("-")[2]

        # Tenter la navigation annuelle si pas encore faite
        if year_str not in self._annual_text_cache:
            self._navigate_to_year(int(year_str))

        url = f"{self.BASE_URL}/{date_str}"

        for referer in self._daily_referer_candidates(year_str):
            try:
                response = self._request(url, referer=referer, max_retries=2)
            except Exception:
                continue

            if response is None:
                continue

            text = self._html_to_text(response.text)
            self._daily_text_cache[date_str] = text
            return text

        return None

    # =====================================================
    # Dates
    # =====================================================

    def _parse_french_date(self, date_text: str) -> Optional[str]:
        """
        Convertit une date française en format JJ-MM-AAAA.

        Exemples :
          mardi 1er janvier 1980 -> 01-01-1980
          samedi 5 janvier 1980 -> 05-01-1980
        """
        if not date_text:
            return None

        text = date_text.lower().strip()

        match = re.search(r"(\d{1,2})(?:er|ème|e)?\s+(\w+)\s+(\d{4})", text)
        if not match:
            return None

        try:
            day = int(match.group(1))
            month_name = match.group(2)
            year = int(match.group(3))
        except Exception:
            return None

        month = self.MONTHS.get(month_name)
        if not month:
            return None

        try:
            datetime(year, month, day)
        except ValueError:
            return None

        return f"{day:02d}-{month:02d}-{year}"

    def _extract_dates_from_text(self, text: str, year: Optional[int] = None) -> List[str]:
        """
        Extrait toutes les dates françaises visibles dans le texte.
        """
        dates: Set[str] = set()

        if not text:
            return []

        lines = text.split("\n")

        for line in lines:
            line = line.strip()
            if not line:
                continue

            lowered = line.lower()

            if re.match(
                r"^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d",
                lowered,
            ):
                parsed = self._parse_french_date(line)

                if not parsed:
                    continue

                if year is not None and not parsed.endswith(f"-{year}"):
                    continue

                dates.add(parsed)

        return sorted(dates)

    def get_available_years(self) -> List[int]:
        """
        Retourne les années prises en charge par le projet.
        """
        return list(range(1980, 2000))

    def get_available_dates(self, year: int) -> List[str]:
        """
        Récupère les dates réellement disponibles pour une année.
        """
        print(f"📅 Récupération des dates disponibles Depot101 pour {year}...")

        try:
            annual_text = self._navigate_to_year(year)

            if annual_text:
                dates = self._extract_dates_from_text(annual_text, year=year)

                if dates:
                    print(f"✓ {len(dates)} dates trouvées via page annuelle pour {year}")
                    return dates
        except Exception as e:
            print(f"⚠️ Échec navigation annuelle Depot101 pour {year}: {e}")

        # Plan B : essayer directement la page année sans décennie
        try:
            response = self._request(
                f"{self.GRILLES_URL}/{year}",
                referer=self.HOME_URL if self._home_visited else None,
                max_retries=2,
            )

            if response is not None:
                text = self._html_to_text(response.text)
                dates = self._extract_dates_from_text(text, year=year)

                if dates:
                    print(f"✓ {len(dates)} dates trouvées via fallback direct pour {year}")
                    return dates
        except Exception as e:
            print(f"⚠️ Fallback direct échoué pour {year}: {e}")

        print(
            f"⚠️ Aucune date trouvée pour {year}. "
            "Cela peut être un blocage 403 temporaire ou une structure différente."
        )
        return []

    # =====================================================
    # Parsing grille
    # =====================================================

    def _is_footer_line(self, line: str) -> bool:
        """
        Détecte une ligne de pied de page.
        """
        if not line:
            return True

        lowered = line.lower().strip()

        if not lowered:
            return True

        for marker in self.FOOTER_MARKERS:
            if lowered.startswith(marker):
                return True

        return False

    def _looks_like_channel_start(self, lines: List[str], index: int) -> bool:
        """
        Vérifie qu'une ligne de chaîne est bien le début d'une grille,
        pas simplement un élément de menu.

        On cherche dans les lignes suivantes :
        - Heure
        - Titre
        - ou une heure au format HH:MM
        """
        limit = min(index + 15, len(lines))

        for j in range(index + 1, limit):
            line = lines[j].strip()

            if not line:
                continue

            if line in ("Heure", "Titre"):
                return True

            if self.TIME_RE.match(line):
                return True

            if self.detect_channel(line):
                return False

            if self._is_footer_line(line):
                return False

        return False

    def _parse_programs(self, text: str) -> List[Dict]:
        """
        Parse la grille TV en conservant les lignes de description.
        """
        programs = []
        lines = [line.strip() for line in text.split("\n")]

        current_channel = None
        started = False

        i = 0
        n = len(lines)

        while i < n:
            line = lines[i]

            if not line:
                i += 1
                continue

            # -----------------------------------------
            # Avant le début réel de la grille
            # -----------------------------------------
            if not started:
                detected = self.detect_channel(line)

                if detected and self._looks_like_channel_start(lines, i):
                    current_channel = detected
                    started = True

                # On ignore tout le reste de l'en-tête / navigation
                i += 1
                continue

            # -----------------------------------------
            # Après le début de la grille
            # -----------------------------------------

            # Pied de page : on s'arrête seulement ici
            if self._is_footer_line(line):
                break

            detected = self.detect_channel(line)

            # Nouvelle chaîne
            if detected:
                current_channel = detected
                i += 1
                continue

            # En-têtes de tableau
            if line in ("Heure", "Titre"):
                i += 1
                continue

            # Programme : heure + chaîne connue
            if self.TIME_RE.match(line) and current_channel:
                time_str = line

                i += 1
                if i >= n:
                    break

                title = lines[i]

                if not title or self._is_footer_line(title):
                    i += 1
                    continue

                description_lines = []
                i += 1

                while i < n:
                    next_line = lines[i]

                    if not next_line:
                        i += 1
                        continue

                    if self.TIME_RE.match(next_line):
                        break

                    if self.detect_channel(next_line):
                        break

                    if next_line in ("Heure", "Titre"):
                        break

                    if self._is_footer_line(next_line):
                        break

                    description_lines.append(next_line)
                    i += 1

                programs.append(
                    {
                        "time": time_str,
                        "title": title,
                        "channel": current_channel,
                        "description": " ".join(description_lines),
                        "description_lines": description_lines,
                    }
                )

                continue

            i += 1

        return programs

    def _print_zero_debug_preview(self, text: str) -> None:
        """
        Affiche un petit aperçu du texte seulement une fois,
        pour aider au diagnostic si le parser ne trouve rien.
        """
        if self._debugged_zero:
            return

        self._debugged_zero = True

        lines = [line.strip() for line in text.split("\n") if line.strip()]
        preview = lines[:50]

        print("  🔎 Aperçu du texte extrait pour diagnostic :")
        print("  " + "-" * 60)
        for line in preview:
            print(f"    {line}")
        print("  " + "-" * 60)

    # =====================================================
    # Scraping
    # =====================================================

    def scrape_date(self, date_str: str) -> Optional[Dict]:
        """
        Scrape les programmes pour une date au format JJ-MM-AAAA.
        """
        try:
            text = self._fetch_daily_text(date_str)

            if not text:
                print(f"  ⚠️ Page indisponible ou bloquée : {date_str}")
                return None

            programs = self._parse_programs(text)

            if not programs:
                self._print_zero_debug_preview(text)
                print(f"  ⚠️ Aucun programme trouvé : {date_str}")
                return None

            return {
                "date": date_str,
                "source": "depot101",
                "scraped_at": datetime.now().isoformat(),
                "programs": programs,
            }

        except Exception as e:
            print(f"  ❌ Erreur scraping {date_str}: {e}")
            return None

    def scrape_year(self, year: int, output_dir: str = "data/depot101") -> None:
        """
        Scrape toutes les dates disponibles d'une année.
        """
        os.makedirs(output_dir, exist_ok=True)

        dates = self.get_available_dates(year)

        if not dates:
            print(f"⚠️ Aucune date trouvée pour {year}")
            return

        print(f"\n📺 Scraping Depot101 - année {year} - {len(dates)} journées")

        success_count = 0

        for index, date_str in enumerate(dates, start=1):
            print(f"[{index}/{len(dates)}] {date_str} ...", end=" ")

            data = self.scrape_date(date_str)

            if data and data.get("programs"):
                filepath = os.path.join(output_dir, f"{date_str}.json")

                with open(filepath, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

                count = len(data["programs"])
                print(f"✓ {count} programmes")
                success_count += 1
            else:
                print("✗ échec ou vide")

            # Pause stratégique pour limiter les blocages
            if index % 8 == 0:
                print("  ⏸️ Pause anti-blocage Depot101...")
                time.sleep(random.uniform(20.0, 35.0))

        print(
            f"\n✅ Depot101 {year} terminé : "
            f"{success_count}/{len(dates)} journées scrapées"
        )

    def scrape_all(self, start_year: int = 1980, end_year: int = 1999) -> None:
        """
        Scrape toutes les années.
        """
        years = list(range(start_year, end_year + 1))
        print(f"\n🎬 Scraping Depot101 complet : {years}\n")

        for index, year in enumerate(years, start=1):
            print("=" * 70)
            self.scrape_year(year)

            if index < len(years):
                print("  ⏸️ Pause entre années...")
                time.sleep(random.uniform(60.0, 120.0))


if __name__ == "__main__":
    scraper = Depot101Scraper(delay=3.5)
    scraper.scrape_year(1989)