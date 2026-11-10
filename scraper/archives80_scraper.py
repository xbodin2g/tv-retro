#!/usr/bin/env python3
"""
Scraper Archives80.

- Conserve les description_lines pour les extraits jeunesse
- Détection de chaîne avec contexte
"""

import cloudscraper
from bs4 import BeautifulSoup
import json
import time
import re
import os
import random
import calendar
from datetime import datetime
from typing import Dict, List, Optional, Set


class Archives80Scraper:
    HOME_URL = "https://www.archives80.com"
    GRILLES_URL = "https://www.archives80.com/tele/grilles/an"
    GRILLES_ALT_URL = "https://www.archives80.com/tele/grilles"
    BASE_URL = "https://www.archives80.com/tele/grille/date"

    TIME_RE = re.compile(r"^\d{2}:\d{2}$")
    DATE_HREF_RE = re.compile(
        r"/tele/grilles?/(?:date/)?(\d{2}-\d{2}-\d{4})",
        re.IGNORECASE
    )

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

    CHANNEL_ALIASES = {
        "TF1": "TF1",
        "A2": "Antenne 2",
        "ANTENNE 2": "Antenne 2",
        "F2": "France 2",
        "FRANCE 2": "France 2",
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
        "LA CINQUIEME": "La Cinquième",
        "LA CINQUIÈME": "La Cinquième",
        "CINQ": "La Cinq",
        "M6": "M6",
        "LA SEPT": "La Sept",
        "L7": "La Sept",
        "LA7": "La Sept",
        "LA 7": "La Sept",
        "ARTE": "Arte",
        "FRANCE 5": "France 5",
    }

    CHANNEL_COMPACT_MAP = {
        "TF1": "TF1",
        "A2": "Antenne 2",
        "ANTENNE2": "Antenne 2",
        "F2": "France 2",
        "FRANCE2": "France 2",
        "FR3": "FR3",
        "F3": "France 3",
        "FRANCE3": "France 3",
        "C+": "Canal+",
        "CANAL+": "Canal+",
        "CANAL": "Canal+",
        "TV6": "TV6",
        "L5": "La Cinq",
        "LA5": "La Cinq",
        "LACINQ": "La Cinq",
        "LACINQUIEME": "La Cinquième",
        "CINQ": "La Cinq",
        "M6": "M6",
        "LASEPT": "La Sept",
        "L7": "La Sept",
        "LA7": "La Sept",
        "ARTE": "Arte",
        "FRANCE5": "France 5",
    }

    CHANNEL_REGEX = [
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

    FOOTER_MARKERS = (
        "autres programmes",
        "classement",
        "boite grilles",
        "box grilles",
        "©",
        "copyright",
        "tous droits",
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
        "Cache-Control": "max-age=0",
    }

    def __init__(self, delay: float = 2.5):
        self.delay = delay
        self._home_visited = False
        self._annual_urls_cache: Dict[str, str] = {}
        self._annual_dates_cache: Dict[str, List[str]] = {}
        self._daily_text_cache: Dict[str, str] = {}
        self._debugged_zero = False
        self.scraper = self._create_scraper()

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

    def _reset_scraper(self):
        self.scraper = self._create_scraper()
        self._home_visited = False

    def _request(
        self,
        url: str,
        referer: Optional[str] = None,
        max_retries: int = 3,
    ) -> Optional[object]:
        last_error = None

        for attempt in range(max_retries):
            try:
                time.sleep(random.uniform(1.0, self.delay))

                headers = self.BASE_HEADERS.copy()
                if referer:
                    headers["Referer"] = referer

                response = self.scraper.get(url, headers=headers, timeout=30)

                if response.status_code == 404:
                    return None

                if response.status_code == 403:
                    last_error = Exception(f"403 Forbidden: {url}")
                    if attempt < max_retries - 1:
                        print(f"  ⚠️ 403 sur {url}, retry {attempt + 1}...")
                        self._reset_scraper()
                        time.sleep(random.uniform(3.0, 6.0))
                        continue
                    raise last_error

                response.raise_for_status()
                return response

            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    print(f"  ⚠️ Erreur sur {url}: {e}")
                    time.sleep(random.uniform(3.0, 6.0))
                    continue
                raise

        if last_error:
            raise last_error
        return None

    def _html_to_text(self, html: str) -> str:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        return soup.get_text("\n", strip=True)

    def _compact_upper(self, value: str) -> str:
        return re.sub(r"\s+", "", str(value or "").strip().upper())

    def detect_channel(self, line: str) -> Optional[str]:
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

    def _visit_home(self) -> bool:
        if self._home_visited:
            return True

        try:
            response = self._request(self.HOME_URL, max_retries=2)
            if response is not None:
                self._home_visited = True
                return True
        except Exception:
            pass

        return False

    def _extract_dates_from_html(self, html: str, year: Optional[int] = None) -> List[str]:
        dates: Set[str] = set()
        if not html:
            return []

        try:
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a", href=True):
                match = self.DATE_HREF_RE.search(a["href"])
                if not match:
                    continue
                date = match.group(1)
                if year is not None and not date.endswith(f"-{year}"):
                    continue
                dates.add(date)
        except Exception:
            pass

        for match in self.DATE_HREF_RE.finditer(html):
            date = match.group(1)
            if year is not None and not date.endswith(f"-{year}"):
                continue
            dates.add(date)

        return sorted(dates)

    def _parse_french_date(self, date_text: str) -> Optional[str]:
        if not date_text:
            return None

        text = date_text.lower().strip()
        match = re.search(r"(\d{1,2})\s+(\w+)\s+(\d{4})", text)
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
        dates: Set[str] = set()
        if not text:
            return []

        for line in text.split("\n"):
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

    def _annual_url_candidates(self, year: int) -> List[str]:
        year_str = str(year)
        candidates = [
            f"{self.GRILLES_URL}/{year_str}",
            f"{self.GRILLES_URL}/{year_str}/",
            f"{self.GRILLES_ALT_URL}/{year_str}",
            f"{self.GRILLES_ALT_URL}/{year_str}/",
        ]
        return candidates

    def _get_annual_dates(self, year: int) -> List[str]:
        year_str = str(year)

        if year_str in self._annual_dates_cache:
            return list(self._annual_dates_cache[year_str])

        print(f"📅 Recherche des dates Archives80 pour {year}...")

        self._visit_home()

        referer = self.HOME_URL if self._home_visited else None

        for url in self._annual_url_candidates(year):
            try:
                response = self._request(url, referer=referer, max_retries=2)
            except Exception as e:
                print(f"  ⚠️ Échec {url}: {e}")
                continue

            if response is None:
                continue

            dates = self._extract_dates_from_html(response.text, year=year)

            if not dates:
                text = self._html_to_text(response.text)
                dates = self._extract_dates_from_text(text, year=year)

            if dates:
                self._annual_dates_cache[year_str] = dates
                self._annual_urls_cache[year_str] = url
                print(f"✓ {len(dates)} dates trouvées via {url}")
                return list(dates)

        print(f"⚠️ Aucune date trouvée pour {year}")
        return []

    def get_available_years(self) -> List[int]:
        return list(range(1980, 2000))

    def get_available_dates(self, year: int) -> List[str]:
        dates = self._get_annual_dates(year)

        if dates:
            return dates

        print(f"🧭 Plan B : découverte mensuelle pour {year}...")
        dates = self._discover_dates_by_month_samples(year)

        if dates:
            self._annual_dates_cache[str(year)] = dates
            print(f"✓ {len(dates)} dates trouvées via plan B pour {year}")
            return dates

        return []

    def _discover_dates_by_month_samples(self, year: int) -> List[str]:
        discovered: Set[str] = set()

        for month in range(1, 13):
            last_day = calendar.monthrange(year, month)[1]

            sample_days = sorted(
                set([1, min(5, last_day), min(10, last_day), min(15, last_day), min(20, last_day), last_day])
            )

            month_dates: Set[str] = set()

            for day in sample_days:
                date_str = f"{day:02d}-{month:02d}-{year}"

                try:
                    text = self._fetch_daily_text(date_str)
                except Exception:
                    text = None

                if not text:
                    continue

                found_dates = self._extract_dates_from_text(text, year=year)

                same_month_dates = [
                    d for d in found_dates
                    if int(d.split("-")[1]) == month
                ]

                if same_month_dates:
                    month_dates.update(same_month_dates)
                    print(f"  ✓ Mois {month:02d}/{year} : {len(same_month_dates)} dates via {date_str}")
                    break

                time.sleep(random.uniform(1.0, 2.0))

            if not month_dates:
                print(f"  ⚠️ Mois {month:02d}/{year} : aucune date trouvée")

            discovered.update(month_dates)

        return sorted(discovered)

    def _fetch_daily_text(self, date_str: str) -> Optional[str]:
        if date_str in self._daily_text_cache:
            return self._daily_text_cache[date_str]

        year_str = date_str.split("-")[2]

        if year_str not in self._annual_dates_cache:
            self._get_annual_dates(int(year_str))

        url = f"{self.BASE_URL}/{date_str}"

        annual_url = self._annual_urls_cache.get(year_str)
        referer = annual_url or (self.HOME_URL if self._home_visited else None)

        try:
            response = self._request(url, referer=referer, max_retries=2)
        except Exception:
            return None

        if response is None:
            return None

        text = self._html_to_text(response.text)
        self._daily_text_cache[date_str] = text
        return text

    def _is_footer_line(self, line: str) -> bool:
        if not line:
            return True

        lowered = line.lower().strip()
        if not lowered:
            return True

        for marker in self.FOOTER_MARKERS:
            if lowered.startswith(marker):
                return True

        return False

    def _next_nonempty_line(self, lines: List[str], start: int) -> Optional[str]:
        for j in range(start, len(lines)):
            line = lines[j].strip()
            if line:
                return line
        return None

    def _is_channel_context(self, lines: List[str], index: int) -> bool:
        next_line = self._next_nonempty_line(lines, index + 1)
        if not next_line:
            return False
        if self.TIME_RE.match(next_line):
            return True
        return False

    def _looks_like_channel_start(self, lines: List[str], index: int) -> bool:
        limit = min(index + 12, len(lines))
        for j in range(index + 1, limit):
            line = lines[j].strip()
            if not line:
                continue
            if self.TIME_RE.match(line):
                return True
            if self.detect_channel(line):
                return False
            if self._is_footer_line(line):
                return False
        return False

    def _dedupe_adjacent_lines(self, lines: List[str]) -> List[str]:
        cleaned = []
        for line in lines:
            if not cleaned or line != cleaned[-1]:
                cleaned.append(line)
        return cleaned

    def _parse_programs(self, text: str) -> List[Dict]:
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

            if not started:
                detected = self.detect_channel(line)
                if detected and self._looks_like_channel_start(lines, i):
                    current_channel = detected
                    started = True
                i += 1
                continue

            if self._is_footer_line(line):
                break

            detected = self.detect_channel(line)
            if detected and self._is_channel_context(lines, i):
                current_channel = detected
                i += 1
                continue

            if self.TIME_RE.match(line) and current_channel:
                time_str = line
                i += 1

                title = ""
                if i < n:
                    candidate = lines[i]
                    if (
                        candidate
                        and not self._is_footer_line(candidate)
                        and not self.TIME_RE.match(candidate)
                    ):
                        candidate_channel = self.detect_channel(candidate)
                        if not (
                            candidate_channel
                            and self._is_channel_context(lines, i)
                        ):
                            title = candidate
                            i += 1

                if not title:
                    continue

                raw_description_lines = []
                while i < n:
                    next_line = lines[i]
                    if not next_line:
                        i += 1
                        continue

                    if self.TIME_RE.match(next_line):
                        break

                    next_detected = self.detect_channel(next_line)
                    if next_detected and self._is_channel_context(lines, i):
                        break

                    if self._is_footer_line(next_line):
                        break

                    raw_description_lines.append(next_line)
                    i += 1

                description_lines = self._dedupe_adjacent_lines(raw_description_lines)

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
        if self._debugged_zero:
            return

        self._debugged_zero = True
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        preview = lines[:50]

        print("  🔎 Aperçu du texte extrait :")
        print("  " + "-" * 60)
        for line in preview:
            print(f"    {line}")
        print("  " + "-" * 60)

    def scrape_date(self, date_str: str) -> Optional[Dict]:
        try:
            text = self._fetch_daily_text(date_str)
            if not text:
                print(f"  ⚠️ Page indisponible : {date_str}")
                return None

            programs = self._parse_programs(text)
            if not programs:
                self._print_zero_debug_preview(text)
                print(f"  ⚠️ Aucun programme : {date_str}")
                return None

            return {
                "date": date_str,
                "source": "archives80",
                "scraped_at": datetime.now().isoformat(),
                "programs": programs,
            }

        except Exception as e:
            print(f"  ❌ Erreur {date_str}: {e}")
            return None

    def scrape_year(self, year: int, output_dir: str = "data/archives80") -> None:
        os.makedirs(output_dir, exist_ok=True)

        dates = self.get_available_dates(year)
        if not dates:
            print(f"⚠️ Aucune date pour {year}")
            return

        print(f"\n📺 Scraping Archives80 - {year} - {len(dates)} journées")

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
                print("✗")

            if index % 10 == 0:
                time.sleep(random.uniform(2.0, 4.0))

        print(f"\n✅ Archives80 {year} : {success_count}/{len(dates)} journées")

    def scrape_all(self, start_year: int = 1980, end_year: int = 1999) -> None:
        years = list(range(start_year, end_year + 1))
        for year in years:
            print("=" * 70)
            self.scrape_year(year)


if __name__ == "__main__":
    scraper = Archives80Scraper(delay=2.5)
    scraper.scrape_year(1980)