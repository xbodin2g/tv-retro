#!/usr/bin/env python3
"""
Génère l'index des données directement dans data/
"""

import json
import os
from pathlib import Path
from datetime import datetime

def generate_index():
    """Génère un fichier index.json avec les années et dates disponibles"""
    
    index = {
        'years': {},
        'total_dates': 0,
        'total_programs': 0,
        'generated_at': datetime.now().isoformat()
    }
    
    sources = ['depot101', 'archives80']
    
    for source in sources:
        data_dir = Path(f'data/{source}')
        
        if not data_dir.exists():
            print(f"⚠️  Dossier {data_dir} non trouvé")
            continue
        
        print(f"📂 Traitement de {source}...")
        
        json_files = list(data_dir.glob('*.json'))
        
        for json_file in json_files:
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                date_str = data.get('date', '')
                programs = data.get('programs', [])
                
                if not date_str or not programs:
                    continue
                
                year = date_str.split('/')[0]
                
                if year not in index['years']:
                    index['years'][year] = {
                        'dates': {},
                        'total_programs': 0
                    }
                
                index['years'][year]['dates'][date_str] = {
                    'source': source,
                    'programs_count': len(programs),
                    'file': str(json_file)
                }
                
                index['years'][year]['total_programs'] += len(programs)
                index['total_dates'] += 1
                index['total_programs'] += len(programs)
                
            except Exception as e:
                print(f"  ⚠️  Erreur avec {json_file}: {e}")
    
    # Trier
    index['years'] = dict(sorted(index['years'].items()))
    for year in index['years']:
        index['years'][year]['dates'] = dict(sorted(index['years'][year]['dates'].items()))
    
    # Sauvegarder l'index principal
    with open('data/index.json', 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    # Créer les fichiers par année (dans data/ directement)
    for year, year_data in index['years'].items():
        year_file = f'data/{year}.json'
        
        year_programs = {
            'year': year,
            'dates': {}
        }
        
        for date_str, date_info in year_data['dates'].items():
            try:
                filepath = date_info['file']
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    year_programs['dates'][date_str] = data
            except:
                pass
        
        with open(year_file, 'w', encoding='utf-8') as f:
            json.dump(year_programs, f, ensure_ascii=False, indent=2)
    
    print("\n" + "="*50)
    print("📊 INDEX GÉNÉRÉ")
    print("="*50)
    print(f"Années: {len(index['years'])}")
    print(f"Dates totales: {index['total_dates']}")
    print(f"Programmes totaux: {index['total_programs']}")
    print(f"Fichiers créés dans data/")

if __name__ == '__main__':
    generate_index()