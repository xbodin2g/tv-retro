#!/usr/bin/env python3
"""
Scraper pour Archives80 - Structure corrigée
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
    BASE_URL = "https://www.archives80.com/tele/grille/date"
    
    def __init__(self, delay: float = 2.0):
        self.delay = delay
        self.scraper = cloudscraper.create_scraper(
            browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
        )
        self.scraper.headers.update({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9',
        })
    
    def get_available_years(self) -> List[int]:
        """Récupère les années disponibles"""
        return list(range(1980, 1990))
    
    def get_available_dates(self, year: int) -> List[str]:
        """Génère toutes les dates possibles pour l'année"""
        dates = []
        
        for month in range(1, 13):
            for day in range(1, 32):
                try:
                    datetime(year, month, day)
                    date_str = f"{day:02d}-{month:02d}-{year}"
                    dates.append(date_str)
                except ValueError:
                    continue
        
        return dates
    
    def scrape_date(self, date_str: str) -> Optional[Dict]:
        """Scrape les programmes pour une date"""
        try:
            url = f"{self.BASE_URL}/{date_str}"
            print(f"Scraping: {url}")
            
            time.sleep(random.uniform(1.0, 2.0))
            response = self.scraper.get(url, timeout=30)
            
            if response.status_code == 404:
                print(f"  ⚠️  Date non disponible: {date_str}")
                return None
            
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            text = soup.get_text('\n', strip=True)
            
            programs = self._parse_programs(text)
            
            if not programs:
                print(f"  ⚠️  Aucun programme trouvé pour {date_str}")
                return None
            
            return {
                'date': date_str,
                'source': 'archives80',
                'scraped_at': datetime.now().isoformat(),
                'programs': programs
            }
            
        except Exception as e:
            print(f"  ❌ Erreur pour {date_str}: {e}")
            return None
    
    def _parse_programs(self, text: str) -> List[Dict]:
        """Parse les programmes"""
        programs = []
        lines = text.split('\n')
        
        # Chaînes sur Archives80 (A2 = Antenne 2)
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
            
            # Détecter une nouvelle chaîne
            if line.upper() in channels:
                current_channel = channel_map[line.upper()]
                i += 1
                continue
            
            # Chercher une heure
            if re.match(r'^\d{2}:\d{2}$', line) and current_channel:
                time_str = line
                
                # Titre sur la ligne suivante
                i += 1
                if i < len(lines):
                    title = lines[i].strip()
                    
                    # Description sur les lignes suivantes
                    description = []
                    i += 1
                    while i < len(lines):
                        next_line = lines[i].strip()
                        # Arrêter si nouvelle heure, chaîne, ou section
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
        """Scrape toutes les dates d'une année"""
        os.makedirs(output_dir, exist_ok=True)
        
        dates = self.get_available_dates(year)
        print(f"Année {year}: {len(dates)} dates à tester")
        
        success_count = 0
        
        for i, date_str in enumerate(dates, 1):
            print(f"[{i}/{len(dates)}] {date_str}...")
            
            data = self.scrape_date(date_str)
            if data and data['programs']:
                filename = date_str
                filepath = os.path.join(output_dir, f"{filename}.json")
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                print(f"  ✓ {len(data['programs'])} programmes")
                success_count += 1
            else:
                print(f"  ✗ Non disponible ou vide")
        
        print(f"\n✅ Année {year} terminée: {success_count}/{len(dates)} jours scrapés")
    
    def scrape_all(self, start_year: int = 1980, end_year: int = 1989) -> None:
        """Scrape toutes les années"""
        years = list(range(start_year, end_year + 1))
        print(f"Scraping de {len(years)} années")
        
        for year in years:
            print(f"\n{'='*50}")
            print(f"Année {year}")
            print('='*50)
            self.scrape_year(year)

if __name__ == '__main__':
    scraper = Archives80Scraper(delay=2.0)
    scraper.scrape_year(1980)