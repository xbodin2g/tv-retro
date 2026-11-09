#!/usr/bin/env python3
"""
Scraper pour Depot101 - Grilles TV des années 80/90
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime
import os
from typing import List, Dict, Optional

class Depot101Scraper:
    BASE_URL = "https://www.depot101.com/tele/grilles"
    
    def __init__(self, delay: float = 1.0):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
    def get_available_years(self) -> List[int]:
        """Récupère les années disponibles sur le site"""
        try:
            response = self.session.get(self.BASE_URL)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Chercher les liens d'années
            years = []
            year_links = soup.find_all('a', href=re.compile(r'/\d{4}'))
            
            for link in year_links:
                href = link.get('href', '')
                match = re.search(r'/(\d{4})', href)
                if match:
                    year = int(match.group(1))
                    if 1980 <= year <= 1999:
                        years.append(year)
            
            return sorted(list(set(years)))
        except Exception as e:
            print(f"Erreur lors de la récupération des années: {e}")
            return []
    
    def get_available_dates(self, year: int) -> List[str]:
        """Récupère les dates disponibles pour une année donnée"""
        try:
            url = f"{self.BASE_URL}/{year}"
            response = self.session.get(url)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            dates = []
            date_links = soup.find_all('a', href=re.compile(r'/\d{4}/\d{2}/\d{2}'))
            
            for link in date_links:
                href = link.get('href', '')
                match = re.search(r'/(\d{4}/\d{2}/\d{2})', href)
                if match:
                    dates.append(match.group(1))
            
            return sorted(list(set(dates)))
        except Exception as e:
            print(f"Erreur pour l'année {year}: {e}")
            return []
    
    def scrape_date(self, date_str: str) -> Optional[Dict]:
        """Scrape les programmes pour une date spécifique"""
        try:
            url = f"{self.BASE_URL}/{date_str}"
            print(f"Scraping: {url}")
            
            response = self.session.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            programs = []
            
            # Adapter selon la structure HTML réelle du site
            # Voici une structure générique à adapter
            
            # Méthode 1: Recherche par tableaux
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')[1:]  # Ignorer l'en-tête
                for row in rows:
                    cols = row.find_all(['td', 'th'])
                    if len(cols) >= 3:
                        program = self._extract_program_from_row(cols)
                        if program:
                            programs.append(program)
            
            # Méthode 2: Recherche par divs/listes
            if not programs:
                program_divs = soup.find_all(['div', 'li'], class_=re.compile(r'program|show|emission', re.I))
                for div in program_divs:
                    program = self._extract_program_from_div(div)
                    if program:
                        programs.append(program)
            
            # Méthode 3: Recherche par texte structuré
            if not programs:
                text_content = soup.get_text('\n', strip=True)
                programs = self._extract_programs_from_text(text_content)
            
            return {
                'date': date_str,
                'source': 'depot101',
                'scraped_at': datetime.now().isoformat(),
                'programs': programs
            }
            
        except Exception as e:
            print(f"Erreur lors du scraping de {date_str}: {e}")
            return None
    
    def _extract_program_from_row(self, cols) -> Optional[Dict]:
        """Extrait un programme depuis une ligne de tableau"""
        try:
            time_text = cols[0].get_text(strip=True)
            title_text = cols[1].get_text(strip=True)
            channel_text = cols[2].get_text(strip=True) if len(cols) > 2 else ''
            
            # Valider le format de l'heure
            if not re.match(r'\d{1,2}:\d{2}', time_text):
                return None
            
            return {
                'time': time_text,
                'title': title_text,
                'channel': channel_text,
                'description': ''
            }
        except:
            return None
    
    def _extract_program_from_div(self, div) -> Optional[Dict]:
        """Extrait un programme depuis un div"""
        try:
            text = div.get_text(' ', strip=True)
            
            # Chercher un pattern heure - titre
            match = re.search(r'(\d{1,2}:\d{2})\s*[-–]\s*(.+?)(?:\s*\(([^)]+)\))?$', text)
            if match:
                return {
                    'time': match.group(1),
                    'title': match.group(2).strip(),
                    'channel': match.group(3) or '',
                    'description': ''
                }
            
            # Chercher un pattern titre - heure
            match = re.search(r'(.+?)\s*[-–]\s*(\d{1,2}:\d{2})', text)
            if match:
                return {
                    'time': match.group(2),
                    'title': match.group(1).strip(),
                    'channel': '',
                    'description': ''
                }
            
            return None
        except:
            return None
    
    def _extract_programs_from_text(self, text: str) -> List[Dict]:
        """Extrait les programmes depuis le texte brut"""
        programs = []
        lines = text.split('\n')
        
        for line in lines:
            # Pattern: HH:MM - Titre (Chaîne)
            match = re.search(r'(\d{1,2}:\d{2})\s*[-–]\s*(.+?)(?:\s*\(([^)]+)\))?$', line.strip())
            if match:
                programs.append({
                    'time': match.group(1),
                    'title': match.group(2).strip(),
                    'channel': match.group(3) or '',
                    'description': ''
                })
        
        return programs
    
    def scrape_year(self, year: int, output_dir: str = 'data/depot101') -> None:
        """Scrape toutes les dates disponibles pour une année"""
        os.makedirs(output_dir, exist_ok=True)
        
        dates = self.get_available_dates(year)
        print(f"Année {year}: {len(dates)} dates trouvées")
        
        for i, date_str in enumerate(dates, 1):
            print(f"[{i}/{len(dates)}] Scraping {date_str}...")
            
            data = self.scrape_date(date_str)
            if data:
                # Sauvegarder en JSON
                filename = date_str.replace('/', '-')
                filepath = os.path.join(output_dir, f"{filename}.json")
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                print(f"  ✓ {len(data['programs'])} programmes extraits")
            else:
                print(f"  ✗ Échec du scraping")
            
            time.sleep(self.delay)  # Respecter le serveur
    
    def scrape_all(self, start_year: int = 1980, end_year: int = 1999) -> None:
        """Scrape toutes les années"""
        years = self.get_available_years()
        
        if not years:
            print("Aucune année trouvée, utilisation de la plage par défaut")
            years = list(range(start_year, end_year + 1))
        
        print(f"Scraping de {len(years)} années: {years}")
        
        for year in years:
            print(f"\n{'='*50}")
            print(f"Scraping année {year}")
            print('='*50)
            self.scrape_year(year)

if __name__ == '__main__':
    scraper = Depot101Scraper(delay=2.0)
    
    # Pour tester avec une seule année
    # scraper.scrape_year(1985)
    
    # Pour scraper toutes les années
    scraper.scrape_all(1980, 1999)