#!/usr/bin/env python3
"""
Script principal pour lancer le scraping et générer la base de données
"""

import sys
import os
from pathlib import Path

def main():
    print("🎬 TV RÉTRO - Scraping des grilles TV")
    print("="*50)
    
    # Créer les dossiers nécessaires
    os.makedirs('data/depot101', exist_ok=True)
    os.makedirs('data/archives80', exist_ok=True)
    os.makedirs('web/data', exist_ok=True)
    
    # Menu
    print("\nQue voulez-vous faire ?\n")
    print("1. Scraper Depot101")
    print("2. Scraper Archives80")
    print("3. Scraper les deux sources")
    print("4. Générer l'index (après scraping)")
    print("5. Scraper une année spécifique")
    print("6. Quitter")
    
    choice = input("\nVotre choix (1-6): ").strip()
    
    if choice == '1':
        from scraper.depot101_scraper import Depot101Scraper
        scraper = Depot101Scraper(delay=2.0)
        scraper.scrape_all()
    
    elif choice == '2':
        from scraper.archives80_scraper import Archives80Scraper
        scraper = Archives80Scraper(delay=2.0)
        scraper.scrape_all()
    
    elif choice == '3':
        print("\nScraping de Depot101...")
        from scraper.depot101_scraper import Depot101Scraper
        scraper1 = Depot101Scraper(delay=2.0)
        scraper1.scrape_all()
        
        print("\nScraping de Archives80...")
        from scraper.archives80_scraper import Archives80Scraper
        scraper2 = Archives80Scraper(delay=2.0)
        scraper2.scrape_all()
    
    elif choice == '4':
        from scraper.generate_index import generate_index
        generate_index()
    
    elif choice == '5':
        year = input("Quelle année voulez-vous scraper ? (ex: 1985): ").strip()
        source = input("Quelle source ? (depot101/archives80): ").strip().lower()
        
        if source == 'depot101':
            from scraper.depot101_scraper import Depot101Scraper
            scraper = Depot101Scraper(delay=2.0)
            scraper.scrape_year(int(year))
        elif source == 'archives80':
            from scraper.archives80_scraper import Archives80Scraper
            scraper = Archives80Scraper(delay=2.0)
            scraper.scrape_year(int(year))
        else:
            print("Source invalide")
    
    elif choice == '6':
        print("Au revoir !")
        sys.exit(0)
    
    else:
        print("Choix invalide")

if __name__ == '__main__':
    main()