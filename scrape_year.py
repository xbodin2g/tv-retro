#!/usr/bin/env python3
"""
Scrape une année spécifique
Usage: python scrape_year.py 1985 depot101
"""

import sys
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: python scrape_year.py <année> <source>")
        print("Exemple: python scrape_year.py 1985 depot101")
        sys.exit(1)
    
    year = int(sys.argv[1])
    source = sys.argv[2].lower()
    
    print(f"🎬 Scraping de l'année {year} depuis {source}")
    
    if source == 'depot101':
        from scraper.depot101_scraper import Depot101Scraper
        scraper = Depot101Scraper(delay=2.0)
        scraper.scrape_year(year)
    
    elif source == 'archives80':
        from scraper.archives80_scraper import Archives80Scraper
        scraper = Archives80Scraper(delay=2.0)
        scraper.scrape_year(year)
    
    else:
        print(f"❌ Source inconnue: {source}")
        sys.exit(1)
    
    print(f"✅ Scraping terminé pour {year}")

if __name__ == '__main__':
    main()