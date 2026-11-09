#!/usr/bin/env python3
"""
Scraper optimisé pour Archives80 - Avec navigation simulée
"""

import cloudscraper
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime
import os
import random
from typing import List, Dict, Optional

class Archives80Scraper:
    BASE_URL = "https://www.archives80.com"
    GRILLE_URL = f"{BASE_URL}/tele/grille/date"
    GRILLES_URL = f"{BASE_URL}/tele/grilles/an"
    
    MONTHS = {
        'janvier': 1, 'février': 2, 'fevrier': 2, 'mars': 3, 'avril': 4,
        'mai': 5, 'juin': 6, 'juillet': 7, 'août': 8, 'aout': 8,
        'septembre': 9, 'octobre': 10, 'novembre': 11, 'décembre': 12, 'decembre': 12
    }
    
    def __init__(self, delay: float = 2.0):
        self.delay = delay
        self.scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
        )
        
        # Headers complets comme dans le debug
        self.scraper.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        })
        
        # Initialiser la session en visitant la page d'accueil
        self._init_session()
    
    def _init_session(self):
        """Initialise la session en visitant la page d'accueil"""
        try:
            print("🔧 Initialisation de la session...")
            time.sleep(random.uniform(1.0, 2.0))
            self.scraper.get(self.BASE_URL, timeout=30)
            print("✓ Session initialisée")
        except Exception as e:
            print(f"⚠️  Erreur initialisation: {e}")
    
    def _parse_french_date(self, date_text: str) -> Optional[str]:
        """Convertit une date française en format JJ-MM-AAAA"""
        date_text = date_text.lower().strip()
        
        match = re.search(r'(\d{1,2})\s+(\w+)\s+(\d{4})', date_text)
        if not match:
            return None
        
        day = int(match.group(1))
        month_name = match.group(2)
        year = int(match.group(3))
        
        month = self.MONTHS.get(month_name)
        if not month:
            return None
        
        return f"{day:02d}-{month:02d}-{year}"
    
    def get_available_dates(self, year: int) -> List[str]:
        """Récupère les dates réellement disponibles"""
        try:
            url = f"{self.GRILLES_URL}/{year}"
            print(f"Récupération des dates: {url}")
            
            time.sleep(random.uniform(2.0, 3.0))
            response = self.scraper.get(url, timeout=30)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            text = soup.get_text('\n')
            
            dates = []
            lines = text.split('\n')
            
            for line in lines:
                line = line.strip()
                if re.match(r'^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d', line.lower()):
                    parsed = self._parse_french_date(line)
                    if parsed:
                        dates.append(parsed)
            
            dates = sorted(list(set(dates)))
            print(f"✓ {len(dates)} dates trouvées pour {year}")
            
            return dates
            
        except Exception as e:
            print(f"❌ Erreur: {e}")
            return []
    
    def scrape_date(self, date_str: str, max_retries: int = 3) -> Optional[Dict]:
        """Scrape les programmes avec retry et navigation simulée"""
        url = f"{self.GRILLE_URL}/{date_str}"
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    print(f"  🔄 Tentative {attempt + 1}/{max_retries}...")
                    time.sleep(random.uniform(3.0, 5.0))
                else:
                    time.sleep(random.uniform(2.0, 3.0))
                
                # Simuler une navigation : d'abord la page de l'année
                year = date_str.split('-')[2]
                year_url = f"{self.GRILLES_URL}/{year}"
                
                # Ajouter le referer pour simuler qu'on vient de la page de l'année
                self.scraper.headers['Referer'] = year_url
                
                # Faire une requête sur la page de l'année (si pas déjà fait)
                try:
                    self.scraper.get(year_url, timeout=30)
                    time.sleep(random.uniform(1.0, 2.0))
                except:
                    pass  # Pas grave si ça échoue
                
                # Maintenant récupérer la page de la date
                response = self.scraper.get(url, timeout=30)
                
                if response.status_code == 404:
                    return None
                
                if response.status_code == 403:
                    print(f"  ⚠️  403 Forbidden - Tentative {attempt + 1}")
                    # Réinitialiser la session
                    if attempt < max_retries - 1:
                        self._init_session()
                    continue
                
                response.raise_for_status()
                
                soup = BeautifulSoup(response.text, 'html.parser')
                text = soup.get_text('\n', strip=True)
                
                programs = self._parse_programs(text)
                
                if not programs:
                    return None
                
                return {
                    'date': date_str,
                    'source': 'archives80',
                    'scraped_at': datetime.now().isoformat(),
                    'programs': programs
                }
                
            except Exception as e:
                print(f"  ❌ Erreur: {e}")
                if attempt < max_retries - 1:
                    continue
                return None
        
        return None
    
    def _parse_programs(self, text: str) -> List[Dict]:
        """Parse les programmes"""
        programs = []
        lines = text.split('\n')
        
        channel_map = {
            'TF1': 'TF1',
            'A2': 'Antenne 2',
            'FR3': 'FR3',
            'CANAL+': 'Canal+',
            'LA CINQ': 'La Cinq',
            'M6': 'M6'
        }
        
        channels = list(channel_map.keys())
        current_channel = None
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            if line.upper() in channels:
                current_channel = channel_map[line.upper()]
                i += 1
                continue
            
            if re.match(r'^\d{2}:\d{2}$', line) and current_channel:
                time_str = line
                
                i += 1
                if i < len(lines):
                    title = lines[i].strip()
                    
                    description = []
                    i += 1
                    while i < len(lines):
                        next_line = lines[i].strip()
                        if (re.match(r'^\d{2}:\d{2}$', next_line) or 
                            next_line.upper() in channels or
                            next_line.startswith('Autres programmes') or
                            next_line.startswith('Classement') or
                            not next_line):
                            break
                        description.append(next_line)
                        i += 1
                    
                    programs.append({
                        'time': time_str,
                        'title': title,
                        'channel': current_channel,
                        'description': ' '.join(description) if description else ''
                    })
                    continue
            
            i += 1
        
        return programs
    
    def scrape_year(self, year: int, output_dir: str = 'data/archives80') -> None:
        """Scrape toutes les dates disponibles"""
        os.makedirs(output_dir, exist_ok=True)
        
        dates = self.get_available_dates(year)
        
        if not dates:
            print(f"⚠️  Aucune date trouvée pour {year}")
            return
        
        print(f"\n📅 Année {year}: {len(dates)} dates à scraper")
        
        success_count = 0
        
        for i, date_str in enumerate(dates, 1):
            print(f"[{i}/{len(dates)}] {date_str}...", end=" ")
            
            data = self.scrape_date(date_str)
            if data and data['programs']:
                filename = date_str
                filepath = os.path.join(output_dir, f"{filename}.json")
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                print(f"✓ {len(data['programs'])} prog")
                success_count += 1
            else:
                print("✗ échec")
            
            # Pause plus longue entre chaque date pour éviter le blocage
            if i % 10 == 0:
                print(f"  ⏸️  Pause de 10 secondes...")
                time.sleep(10)
        
        print(f"\n✅ Année {year}: {success_count}/{len(dates)} jours scrapés\n")
    
    def scrape_all(self, start_year: int = 1980, end_year: int = 1989) -> None:
        """Scrape toutes les années"""
        years = list(range(start_year, end_year + 1))
        print(f"Scraping de {len(years)} années\n")
        
        for year in years:
            print(f"{'='*60}")
            self.scrape_year(year)

if __name__ == '__main__':
    scraper = Archives80Scraper(delay=2.0)
    scraper.scrape_year(1980)