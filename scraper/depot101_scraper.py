#!/usr/bin/env python3
"""
Scraper Depot101 - version corrigée.

Corrections :
- ne plus s'arrêter trop tôt sur "Toutes les grilles 1980"
- détecter le vrai début de la grille
- conserver description_lines pour les extraits jeunesse
- ajouter un aperçu de debug si aucune programme n'est trouvé
"""

import cloudscraper
from bs4 import BeautifulSoup
import json
import time
import re
import os
import random
from datetime import datetime
from typing import List, Dict, Optional


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

    KNOWN_CHANNELS = [
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

    # Marqueurs de fin de page.
    # Ils ne doivent être pris en compte qu'APRÈS le début réel de la grille.
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

    def __init__(self, delay: float = 2.0):
        self.delay = delay
        self._debugged_zero = False

        self.scraper = cloudscraper.create_scraper(
            browser={
                "browser": "chrome",
                "platform": "windows",
                "desktop": True,
            }
        )

        self.scraper.headers.update(
            {
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
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Cache-Control": "max-age=0",
            }
        )

        self._init_session()

    def _init_session(self) -> None:
        """
        Visite la page d'accueil pour initialiser cookies / session.
        """
        try:
            print("🔧 Initialisation de la session Depot101...")
            time.sleep(random.uniform(1.0, 2.0))
            self.scraper.get(self.HOME_URL, timeout=30)
            print("✓ Session Depot101 initialisée")
        except Exception as e:
            print(f"⚠️ Erreur initialisation session Depot101: {e}")

    def _request(
        self,
        url: str,
        referer: Optional[str] = None,
        max_retries: int = 3,
    ) -> Optional[object]:
        """
        Requête HTTP robuste avec retries en cas de 403.
        Retourne None si 404.
        """
        headers = {}
        if referer:
            headers["Referer"] = referer

        for attempt in range(max_retries):
            try:
                sleep_time = random.uniform(1.0, max(1.5, self.delay))
                time.sleep(sleep_time)

                response = self.scraper.get(url, headers=headers, timeout=30)

                if response.status_code == 404:
                    return None

                if response.status_code == 403:
                    if attempt < max_retries - 1:
                        print(f"  ⚠️ 403 detected, retry {attempt + 1}/{max_retries - 1}...")
                        self._init_session()
                        time.sleep(random.uniform(3.0, 6.0))
                        continue
                    response.raise_for_status()

                response.raise_for_status()
                return response

            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"  ❌ Erreur requête finale: {e}")
                    raise
                print(f"  ⚠️ Erreur requête, retry: {e}")
                time.sleep(random.uniform(3.0, 6.0))

        return None

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
        limit = min(index + 12, len(lines))

        for j in range(index + 1, limit):
            line = lines[j].strip()

            if not line:
                continue

            if line in ("Heure", "Titre"):
                return True

            if self.TIME_RE.match(line):
                return True

            # Si on retombe sur une autre chaîne avant d'avoir vu l'heure,
            # ce n'est probablement pas le bon début.
            if line in self.KNOWN_CHANNELS:
                return False

            # Si on voit un pied de page avant l'heure, ce n'est pas une grille.
            if self._is_footer_line(line):
                return False

        return False

    def get_available_years(self) -> List[int]:
        """
        Retourne les années prises en charge par le projet.
        """
        return list(range(1980, 2000))

    def get_available_dates(self, year: int) -> List[str]:
        """
        Récupère les dates réellement disponibles pour une année.
        """
        url = f"{self.GRILLES_URL}/{year}"
        print(f"📅 Récupération des dates disponibles : {url}")

        try:
            response = self._request(url)
            if response is None:
                print(f"⚠️ Page année introuvable : {year}")
                return []

            soup = BeautifulSoup(response.text, "html.parser")
            text = soup.get_text("\n")

            dates = []
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
                    if parsed and parsed.endswith(f"-{year}"):
                        dates.append(parsed)

            dates = sorted(set(dates))
            print(f"✓ {len(dates)} dates trouvées pour {year}")
            return dates

        except Exception as e:
            print(f"❌ Erreur récupération dates {year}: {e}")
            return []

    def scrape_date(self, date_str: str) -> Optional[Dict]:
        """
        Scrape les programmes pour une date au format JJ-MM-AAAA.
        """
        url = f"{self.BASE_URL}/{date_str}"

        try:
            year = date_str.split("-")[2]
            referer = f"{self.GRILLES_URL}/{year}"

            response = self._request(url, referer=referer)

            if response is None:
                print(f"  ⚠️ Date non disponible : {date_str}")
                return None

            soup = BeautifulSoup(response.text, "html.parser")
            text = soup.get_text("\n", strip=True)

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

    def _print_zero_debug_preview(self, text: str) -> None:
        """
        Affiche un petit aperçu du texte seulement une fois,
        pour aider au diagnostic si le parser ne trouve rien.
        """
        if self._debugged_zero:
            return

        self._debugged_zero = True

        lines = [line.strip() for line in text.split("\n") if line.strip()]
        preview = lines[:30]

        print("  🔎 Aperçu du texte pour diagnostic :")
        print("  " + "-" * 60)
        for line in preview:
            print(f"    {line}")
        print("  " + "-" * 60)

    def _parse_programs(self, text: str) -> List[Dict]:
        """
        Parse la grille TV en conservant les lignes de description.

        Logique :
        - ignore l'en-tête du site avant le vrai début de la grille
        - détecte le début via une chaîne suivie de Heure / Titre / heure
        - n'applique les marqueurs de pied de page qu'après le début
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
                if line in self.KNOWN_CHANNELS and self._looks_like_channel_start(lines, i):
                    current_channel = line
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

            # Nouvelle chaîne
            if line in self.KNOWN_CHANNELS:
                current_channel = line
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

                    if next_line in self.KNOWN_CHANNELS:
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

        for year in years:
            print("=" * 70)
            self.scrape_year(year)


if __name__ == "__main__":
    scraper = Depot101Scraper(delay=2.0)
    scraper.scrape_year(1980)