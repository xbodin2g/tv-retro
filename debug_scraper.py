#!/usr/bin/env python3
"""
Script de debug avec contournement anti-bot
"""

import cloudscraper
from bs4 import BeautifulSoup
import os
from datetime import datetime
import re
import time
import random
import sys

def create_scraper():
    """Crée un scraper avec contournement anti-bot"""
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )
    
    # Headers réalistes
    scraper.headers.update({
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
    
    return scraper

def debug_page(url, filename, scraper):
    """Récupère et sauvegarde le HTML d'une page avec contournement anti-bot"""
    print(f"\n{'='*80}")
    print(f"🔍 Analyse de: {url}")
    print(f"{'='*80}")
    
    try:
        # Petit délai aléatoire pour paraître plus humain
        delay = random.uniform(1.0, 3.0)
        print(f"⏳ Attente de {delay:.1f}s...")
        time.sleep(delay)
        
        response = scraper.get(url, timeout=30)
        
        print(f"📡 Status code: {response.status_code}")
        print(f"📦 Taille de la réponse: {len(response.text)} caractères")
        
        if response.status_code == 403:
            print("⚠️  403 Forbidden détecté - Cloudscraper tente de contourner...")
            # Essayer avec un délai plus long
            time.sleep(5)
            response = scraper.get(url, timeout=30)
            print(f"📡 Nouvelle tentative - Status code: {response.status_code}")
        
        response.raise_for_status()
        
        # Créer le dossier debug
        os.makedirs('debug', exist_ok=True)
        
        # Sauvegarder le HTML brut
        html_file = f'debug/{filename}.html'
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(response.text)
        
        print(f"✓ HTML sauvegardé: {html_file}")
        
        # Sauvegarder une version texte plus lisible
        soup = BeautifulSoup(response.text, 'html.parser')
        
        txt_file = f'debug/{filename}.txt'
        with open(txt_file, 'w', encoding='utf-8') as f:
            f.write(f"URL: {url}\n")
            f.write(f"Date: {datetime.now().isoformat()}\n")
            f.write(f"Status: {response.status_code}\n")
            f.write("="*80 + "\n\n")
            f.write("CONTENU DE LA PAGE:\n")
            f.write("="*80 + "\n\n")
            f.write(soup.get_text('\n', strip=True))
        
        print(f"✓ Texte sauvegardé: {txt_file}")
        
        # ANALYSE DÉTAILLÉE
        print(f"\n{'='*80}")
        print(f"📊 ANALYSE STRUCTURELLE")
        print(f"{'='*80}")
        
        # Titre
        title = soup.find('title')
        if title:
            print(f"📌 Titre: {title.get_text(strip=True)}")
        
        # Toutes les balises avec leurs classes
        print(f"\n🏷️  Balises principales trouvées:")
        for tag in ['table', 'div', 'section', 'article', 'ul', 'ol']:
            elements = soup.find_all(tag)
            if elements:
                print(f"  <{tag}>: {len(elements)} éléments")
                
                # Afficher les classes uniques
                classes = set()
                for elem in elements[:10]:
                    if elem.get('class'):
                        classes.update(elem.get('class'))
                if classes:
                    print(f"    Classes: {', '.join(sorted(list(classes))[:10])}")
        
        # Recherche de patterns d'heures
        print(f"\n⏰ Patterns d'heures détectés:")
        time_patterns = [
            (r'\b\d{1,2}h\d{2}\b', 'format 14h30'),
            (r'\b\d{1,2}:\d{2}\b', 'format 14:30'),
            (r'\b\d{1,2}H\d{2}\b', 'format 14H30'),
        ]
        
        all_text = soup.get_text()
        for pattern, desc in time_patterns:
            matches = re.findall(pattern, all_text)
            if matches:
                print(f"  {desc}: {len(matches)} occurrences")
                print(f"    Exemples: {matches[:5]}")
        
        # Recherche des chaînes TV
        print(f"\n📺 Chaînes TV détectées:")
        channels = ['TF1', 'Antenne 2', 'FR3', 'Canal+', 'La Cinq', 'M6', 'Arte', 'France 2', 'France 3']
        for channel in channels:
            if channel in all_text:
                count = all_text.count(channel)
                print(f"  {channel}: {count} fois")
        
        # Extraire un extrait pertinent (les 3000 premiers caractères avec des heures)
        print(f"\n📝 EXEMPLE DE CONTENU (premiers programmes trouvés):")
        print(f"{'-'*80}")
        
        # Chercher des lignes avec des heures
        lines = soup.get_text('\n').split('\n')
        found = 0
        for line in lines:
            line = line.strip()
            if re.search(r'\d{1,2}[h:]\d{2}', line) and len(line) > 10:
                print(line)
                found += 1
                if found >= 15:  # Afficher max 15 lignes
                    break
        
        if found == 0:
            # Si pas trouvé, afficher les 30 premières lignes non vides
            print("Aucun programme avec heure détecté, affichage du début:")
            non_empty = [line.strip() for line in lines if line.strip()][:30]
            for line in non_empty:
                print(line)
        
        print(f"{'-'*80}")
        
        return True
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("🐛 DEBUG SCRAPER AVANCÉ - Avec contournement anti-bot")
    print("="*80)
    print(f"Date: {datetime.now().isoformat()}")
    
    # Créer le scraper
    scraper = create_scraper()
    
    # URLs à analyser
    urls = [
        # Depot101
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
        {
            'url': 'https://www.depot101.com/tele/grille/15-06-1985',
            'filename': 'depot101_grille_15-06-1985'
        },
        
        # Archives80
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
        {
            'url': 'https://www.archives80.com/tele/grille/date/15-06-1985',
            'filename': 'archives80_grille_15-06-1985'
        },
    ]
    
    results = []
    for item in urls:
        success = debug_page(item['url'], item['filename'], scraper)
        results.append({
            'url': item['url'],
            'filename': item['filename'],
            'success': success
        })
    
    # Résumé final
    print(f"\n{'='*80}")
    print("📋 RÉSUMÉ FINAL")
    print(f"{'='*80}")
    
    for result in results:
        status = "✓" if result['success'] else "✗"
        print(f"{status} {result['filename']}")
    
    print(f"\n📂 Fichiers créés dans le dossier debug/:")
    if os.path.exists('debug'):
        for f in sorted(os.listdir('debug')):
            size = os.path.getsize(f'debug/{f}')
            print(f"  - {f} ({size} octets)")

if __name__ == '__main__':
    main()