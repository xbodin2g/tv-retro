#!/usr/bin/env python3
"""
Script de debug pour analyser la structure HTML des sites
"""

import requests
from bs4 import BeautifulSoup
import os
from datetime import datetime
import re

def debug_page(url, filename):
    """Récupère et sauvegarde le HTML d'une page"""
    print(f"\n🔍 Analyse de: {url}")
    
    try:
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        })
        
        response = session.get(url, timeout=30)
        response.raise_for_status()
        
        # Sauvegarder le HTML brut
        os.makedirs('debug', exist_ok=True)
        
        html_file = f'debug/{filename}.html'
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(response.text)
        
        print(f"✓ HTML sauvegardé: {html_file} ({len(response.text)} caractères)")
        
        # Analyser la structure
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extraire les informations utiles
        print("\n📊 Analyse de la structure:")
        
        # Titre de la page
        title = soup.find('title')
        if title:
            print(f"Titre: {title.get_text(strip=True)}")
        
        # Chercher les tableaux
        tables = soup.find_all('table')
        print(f"Tableaux trouvés: {len(tables)}")
        for i, table in enumerate(tables[:3]):  # Afficher les 3 premiers
            rows = table.find_all('tr')
            print(f"  Tableau {i+1}: {len(rows)} lignes")
            if rows and len(rows) > 0:
                cols = rows[0].find_all(['th', 'td'])
                print(f"    Première ligne: {len(cols)} colonnes")
        
        # Chercher les divs avec classes spécifiques
        program_divs = soup.find_all(['div', 'article', 'section'], 
                                    class_=re.compile(r'program|show|grille|emission|channel', re.I))
        print(f"Divs avec classes liées aux programmes: {len(program_divs)}")
        
        # Chercher les patterns d'heures
        time_pattern = re.compile(r'\b\d{1,2}[h:]\d{2}\b')
        all_text = soup.get_text()
        times_found = time_pattern.findall(all_text)
        print(f"Heures trouvées dans le texte: {len(times_found)}")
        if times_found:
            print(f"  Exemples: {times_found[:10]}")
        
        # Chercher les noms de chaînes connues
        channels = ['TF1', 'Antenne 2', 'FR3', 'Canal+', 'La Cinq', 'M6', 'Arte']
        print(f"\n📺 Chaînes détectées:")
        for channel in channels:
            if channel in all_text:
                # Compter les occurrences
                count = all_text.count(channel)
                print(f"  {channel}: {count} fois")
        
        # Extraire un échantillon de texte structuré
        print(f"\n📝 Échantillon de texte (premiers 2000 caractères):")
        text_sample = soup.get_text('\n', strip=True)[:2000]
        print(text_sample)
        
        # Sauvegarder aussi une version texte
        txt_file = f'debug/{filename}.txt'
        with open(txt_file, 'w', encoding='utf-8') as f:
            f.write(f"URL: {url}\n")
            f.write(f"Date: {datetime.now().isoformat()}\n")
            f.write("="*80 + "\n\n")
            f.write(soup.get_text('\n', strip=True))
        
        print(f"✓ Texte sauvegardé: {txt_file}")
        
        return True
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        return False

def main():
    print("="*80)
    print("🐛 DEBUG SCRAPER - Analyse des structures HTML")
    print("="*80)
    
    # URLs à analyser
    urls = [
        # Depot101 - Pages de navigation
        {
            'url': 'https://www.depot101.com/tele/grilles',
            'filename': 'depot101_grilles_main'
        },
        {
            'url': 'https://www.depot101.com/tele/grilles/80s',
            'filename': 'depot101_grilles_80s'
        },
        {
            'url': 'https://www.depot101.com/tele/grilles/1980',
            'filename': 'depot101_grilles_1980'
        },
        {
            'url': 'https://www.depot101.com/tele/grille/01-01-1980',
            'filename': 'depot101_grille_01-01-1980'
        },
        
        # Archives80 - Pages de navigation
        {
            'url': 'https://www.archives80.com/tele/grilles',
            'filename': 'archives80_grilles_main'
        },
        {
            'url': 'https://www.archives80.com/tele/grilles/an/1980',
            'filename': 'archives80_grilles_1980'
        },
        {
            'url': 'https://www.archives80.com/tele/grille/date/01-01-1980',
            'filename': 'archives80_grille_01-01-1980'
        },
    ]
    
    results = []
    for item in urls:
        success = debug_page(item['url'], item['filename'])
        results.append({
            'url': item['url'],
            'filename': item['filename'],
            'success': success
        })
    
    # Résumé
    print("\n" + "="*80)
    print("📋 RÉSUMÉ DU DEBUG")
    print("="*80)
    
    for result in results:
        status = "✓" if result['success'] else "✗"
        print(f"{status} {result['filename']}: {result['url']}")
    
    print("\n📂 Fichiers créés dans debug/:")
    print("  - .html : HTML brut complet")
    print("  - .txt : Texte extrait pour lecture facile")
    print("\n💡 Pour voir les fichiers:")
    print("  1. Allez dans votre dépôt GitHub")
    print("  2. Ouvrez le dossier debug/")
    print("  3. Consultez les fichiers .html ou .txt")

if __name__ == '__main__':
    main()