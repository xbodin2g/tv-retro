#!/usr/bin/env python3
"""
Scrape toutes les années d'une source
Usage: python scrape_all.py depot101
"""

import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: python scrape_all.py <source>")
        print("Sources: depot101, archives80")
        sys.exit(1)
    
    source = sys.argv[1].lower()
    
    print(f"🎬 Scraping complet de {source}")
    
    if source == 'depot101':
        from scraper.depot101_scraper import Depot101Scraper
        scraper = Depot101Scraper(delay=2.0)
        scraper.scrape_all()
    
    elif source == 'archives80':
        from scraper.archives80_scraper import Archives80Scraper
        scraper = Archives80Scraper(delay=2.0)
        scraper.scrape_all()
    
    else:
        print(f"❌ Source inconnue: {source}")
        sys.exit(1)
    
    print(f"✅ Scraping complet terminé pour {source}")

if __name__ == '__main__':
    main()