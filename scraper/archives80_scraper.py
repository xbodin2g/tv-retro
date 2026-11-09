#!/usr/bin/env python3
"""
Scraper pour Archives80 - Grilles TV des années 80/90
"""

import requests
from bs4 import BeautifulSoup
import json
import time
import re
from datetime import datetime
import os
from typing import List, Dict, Optional

class Archives80Scraper:
    BASE_URL = "https://www.archives80.com/tele/grilles"
    
    def __init__(self, delay: float = 1.0):
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        
    def get_available_years(self) -> List[int]:
        """Récupère les années disponibles"""
        try:
            response = self.session.get(self.BASE_URL)
            soup = BeautifulSoup(response.content, 'html.parser')
            
            years = []
            
            # Chercher dans les liens
            year_links = soup.find_all('a', href=re.compile(r'grilles.*\d{4}'))
            for link in year_links:
                href = link.get('href', '')
                text = link.get_text(strip=True)
                
                # Extraire l'année du texte ou du lien
                match = re.search(r'\b(19[89]\d)\b', text + ' ' + href)
                if match:
                    years.append(int(match.group(1)))
            
            return sorted(list(set(years)))
        except Exception as e:
            print(f"Erreur: {e}")
            return []
    
    def get_available_dates(self, year: int) -> List[str]:
        """Récupère les dates disponibles pour une année"""
        try:
            # Essayer différentes structures d'URL possibles
            possible_urls = [
                f"{self.BASE_URL}/{year}",
                f"{self.BASE_URL}?year={year}",
                f"{self.BASE_URL}/annee/{year}"
            ]
            
            for url in possible_urls:
                response = self.session.get(url)
                if response.status_code == 200:
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    dates = []
                    # Chercher les liens de dates
                    date_links = soup.find_all('a', href=re.compile(f'{year}.*\d{{2}}.*\d{{2}}'))
                    
                    for link in date_links:
                        text = link.get_text(strip=True)
                        # Format JJ/MM/AAAA ou AAAA/MM/JJ
                        match = re.search(r'(\d{2}[/\-]\d{2}[/\-]\d{4})|(\d{4}[/\-]\d{2}[/\-]\d{2})', text)
                        if match:
                            date_str = match.group(1) or match.group(2)
                            # Normaliser au format AAAA/MM/JJ
                            normalized = self._normalize_date(date_str)
                            if normalized:
                                dates.append(normalized)
                    
                    if dates:
                        return sorted(list(set(dates)))
            
            return []
        except Exception as e:
            print(f"Erreur pour l'année {year}: {e}")
            return []
    
    def _normalize_date(self, date_str: str) -> Optional[str]:
        """Normalise une date au format AAAA/MM/JJ"""
        try:
            # Nettoyer
            date_str = date_str.replace('-', '/')
            
            parts = date_str.split('/')
            if len(parts) != 3:
                return None
            
            # Déterminer le format
            if len(parts[0]) == 4:  # AAAA/MM/JJ
                return date_str
            elif len(parts[2]) == 4:  # JJ/MM/AAAA
                return f"{parts[2]}/{parts[1]}/{parts[0]}"
            
            return None
        except:
            return None
    
    def scrape_date(self, date_str: str) -> Optional[Dict]:
        """Scrape les programmes pour une date"""
        try:
            # Construire l'URL
            url = f"{self.BASE_URL}/{date_str}"
            print(f"Scraping: {url}")
            
            response = self.session.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            
            programs = []
            
            # Structure 1: Tableaux avec heures
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')
                for row in rows:
                    cols = row.find_all(['td', 'th'])
                    if len(cols) >= 2:
                        program = self._parse_table_row(cols)
                        if program:
                            programs.append(program)
            
            # Structure 2: Listes d'émissions
            if not programs:
                lists = soup.find_all(['ul', 'ol'])
                for list_elem in lists:
                    items = list_elem.find_all('li')
                    for item in items:
                        program = self._parse_list_item(item)
                        if program:
                            programs.append(program)
            
            # Structure 3: Divs avec classes spécifiques
            if not programs:
                program_divs = soup.find_all(['div', 'article'], 
                                           class_=re.compile(r'program|show|emission|grille', re.I))
                for div in program_divs:
                    program = self._parse_program_div(div)
                    if program:
                        programs.append(program)
            
            return {
                'date': date_str,
                'source': 'archives80',
                'scraped_at': datetime.now().isoformat(),
                'programs': programs
            }
            
        except Exception as e:
            print(f"Erreur pour {date_str}: {e}")
            return None
    
    def _parse_table_row(self, cols) -> Optional[Dict]:
        """Parse une ligne de tableau"""
        try:
            time_text = cols[0].get_text(strip=True)
            
            # Vérifier si c'est une heure valide
            if not re.match(r'\d{1,2}[h:]\d{2}', time_text):
                return None
            
            # Normaliser l'heure
            time_text = time_text.replace('h', ':')
            
            title_text = cols[1].get_text(strip=True)
            channel = ''
            description = ''
            
            if len(cols) > 2:
                channel = cols[2].get_text(strip=True)
            if len(cols) > 3:
                description = cols[3].get_text(strip=True)
            
            return {
                'time': time_text,
                'title': title_text,
                'channel': channel,
                'description': description
            }
        except:
            return None
    
    def _parse_list_item(self, item) -> Optional[Dict]:
        """Parse un élément de liste"""
        try:
            text = item.get_text(' ', strip=True)
            
            # Pattern: HH:MM Titre (Chaîne)
            match = re.search(r'(\d{1,2}[h:]\d{2})\s+(.+?)(?:\s*\(([^)]+)\))?\s*$', text)
            if match:
                time_str = match.group(1).replace('h', ':')
                return {
                    'time': time_str,
                    'title': match.group(2).strip(),
                    'channel': match.group(3) or '',
                    'description': ''
                }
            
            return None
        except:
            return None
    
    def _parse_program_div(self, div) -> Optional[Dict]:
        """Parse un div de programme"""
        try:
            # Chercher les éléments time/horaire
            time_elem = div.find(['span', 'div', 'strong'], 
                               class_=re.compile(r'time|heure|hour', re.I))
            
            if not time_elem:
                # Chercher directement dans le texte
                text = div.get_text(' ', strip=True)
                time_match = re.search(r'(\d{1,2}[h:]\d{2})', text)
                if time_match:
                    time_str = time_match.group(1).replace('h', ':')
                else:
                    return None
            else:
                time_str = time_elem.get_text(strip=True).replace('h', ':')
            
            # Chercher le titre
            title_elem = div.find(['h2', 'h3', 'h4', 'strong'], 
                                 class_=re.compile(r'title|titre|name', re.I))
            
            if title_elem:
                title = title_elem.get_text(strip=True)
            else:
                # Extraire le titre du texte complet
                text = div.get_text(' ', strip=True)
                title_match = re.search(f'{time_str}\\s+(.+?)(?:\\s*\\(|$)', text)
                if title_match:
                    title = title_match.group(1).strip()
                else:
                    return None
            
            # Chercher la chaîne
            channel = ''
            channel_elem = div.find(class_=re.compile(r'channel|chaine|station', re.I))
            if channel_elem:
                channel = channel_elem.get_text(strip=True)
            
            return {
                'time': time_str,
                'title': title,
                'channel': channel,
                'description': ''
            }
            
        except:
            return None
    
    def scrape_year(self, year: int, output_dir: str = 'data/archives80') -> None:
        """Scrape toutes les dates d'une année"""
        os.makedirs(output_dir, exist_ok=True)
        
        dates = self.get_available_dates(year)
        print(f"Année {year}: {len(dates)} dates trouvées")
        
        for i, date_str in enumerate(dates, 1):
            print(f"[{i}/{len(dates)}] Scraping {date_str}...")
            
            data = self.scrape_date(date_str)
            if data:
                filename = date_str.replace('/', '-')
                filepath = os.path.join(output_dir, f"{filename}.json")
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                print(f"  ✓ {len(data['programs'])} programmes extraits")
            else:
                print(f"  ✗ Échec")
            
            time.sleep(self.delay)
    
    def scrape_all(self, start_year: int = 1980, end_year: int = 1999) -> None:
        """Scrape toutes les années"""
        years = self.get_available_years()
        
        if not years:
            print("Aucune année trouvée, utilisation de la plage par défaut")
            years = list(range(start_year, end_year + 1))
        
        print(f"Scraping de {len(years)} années")
        
        for year in years:
            print(f"\n{'='*50}")
            print(f"Année {year}")
            print('='*50)
            self.scrape_year(year)

if __name__ == '__main__':
    scraper = Archives80Scraper(delay=2.0)
    
    # Test une année
    # scraper.scrape_year(1985)
    
    # Scraping complet
    scraper.scrape_all(1980, 1999)