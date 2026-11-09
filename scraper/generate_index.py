#!/usr/bin/env python3
"""
Génère un index des données disponibles pour l'application web
"""

import json
import os
from pathlib import Path
from typing import Dict, List

def generate_index():
    """Génère un fichier index.json avec les années et dates disponibles"""
    
    index = {
        'years': {},
        'total_dates': 0,
        'total_programs': 0,
        'generated_at': None
    }
    
    sources = ['depot101', 'archives80']
    
    for source in sources:
        data_dir = Path(f'data/{source}')
        
        if not data_dir.exists():
            print(f"⚠️  Dossier {data_dir} non trouvé")
            continue
        
        print(f"📂 Traitement de {source}...")
        
        # Parcourir tous les fichiers JSON
        json_files = list(data_dir.glob('*.json'))
        
        for json_file in json_files:
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                date_str = data.get('date', '')
                programs = data.get('programs', [])
                
                if not date_str or not programs:
                    continue
                
                # Extraire l'année
                year = date_str.split('/')[0]
                
                # Initialiser l'année si nécessaire
                if year not in index['years']:
                    index['years'][year] = {
                        'dates': {},
                        'total_programs': 0
                    }
                
                # Ajouter la date
                index['years'][year]['dates'][date_str] = {
                    'source': source,
                    'programs_count': len(programs),
                    'file': str(json_file)
                }
                
                # Mettre à jour les compteurs
                index['years'][year]['total_programs'] += len(programs)
                index['total_dates'] += 1
                index['total_programs'] += len(programs)
                
            except Exception as e:
                print(f"  ⚠️  Erreur avec {json_file}: {e}")
    
    # Trier les années
    index['years'] = dict(sorted(index['years'].items()))
    
    # Trier les dates dans chaque année
    for year in index['years']:
        index['years'][year]['dates'] = dict(sorted(index['years'][year]['dates'].items()))
    
    # Ajouter la date de génération
    from datetime import datetime
    index['generated_at'] = datetime.now().isoformat()
    
    # Sauvegarder l'index
    with open('data/index.json', 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    # Générer aussi un index par année pour le web
    os.makedirs('web/data', exist_ok=True)
    
    # Index global
    with open('web/data/index.json', 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    
    # Index par année
    for year, year_data in index['years'].items():
        year_file = f'web/data/{year}.json'
        
        # Charger tous les programmes de cette année
        year_programs = {
            'year': year,
            'dates': {}
        }
        
        for date_str, date_info in year_data['dates'].items():
            try:
                with open(date_info['file'], 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    year_programs['dates'][date_str] = data
            except:
                pass
        
        with open(year_file, 'w', encoding='utf-8') as f:
            json.dump(year_programs, f, ensure_ascii=False, indent=2)
    
    # Résumé
    print("\n" + "="*50)
    print("📊 INDEX GÉNÉRÉ")
    print("="*50)
    print(f"Années: {len(index['years'])}")
    print(f"Dates totales: {index['total_dates']}")
    print(f"Programmes totaux: {index['total_programs']}")
    print(f"Fichier créé: data/index.json")
    print(f"Fichiers web: web/data/*.json")

if __name__ == '__main__':
    generate_index()