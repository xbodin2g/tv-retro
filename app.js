// État global
const state = {
    currentView: 'browse',
    selectedYear: null,
    selectedDate: null,
    playlist: JSON.parse(localStorage.getItem('retroPlaylist')) || [],
    programs: [],
    index: null,
    yearData: null
};

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
});

async function initializeApp() {
    setupNavigation();
    await loadIndex();
    updatePlaylistDisplay();
    
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .catch(err => console.log('SW registration failed:', err));
    }
}

// Charger l'index des données disponibles
async function loadIndex() {
    try {
        const response = await fetch('data/index.json');
        state.index = await response.json();
        displayYears();
    } catch (error) {
        console.error('Erreur chargement index:', error);
        showNoData();
    }
}

// Afficher un message si pas de données
function showNoData() {
    const container = document.getElementById('years-container');
    container.innerHTML = `
        <div class="empty-state">
            <div class="retro-tv">📺</div>
            <h2>Aucune donnée disponible</h2>
            <p>Lancez d'abord le workflow GitHub Actions pour scraper les données</p>
        </div>
    `;
}

// Afficher les années disponibles
function displayYears() {
    const container = document.getElementById('years-container');
    const years = Object.keys(state.index.years);
    
    if (years.length === 0) {
        showNoData();
        return;
    }
    
    container.innerHTML = `
        <h2 class="years-title">📅 Choisissez une année</h2>
        <div class="years-grid">
            ${years.map(year => `
                <button class="year-btn" onclick="selectYear('${year}')">
                    <span class="year-number">${year}</span>
                    <span class="year-info">${state.index.years[year].total_programs} programmes</span>
                </button>
            `).join('')}
        </div>
    `;
}

// Sélectionner une année
async function selectYear(year) {
    state.selectedYear = year;
    showLoading(true);
    
    try {
        const response = await fetch(`data/${year}.json`);
        state.yearData = await response.json();
        displayDates(year);
    } catch (error) {
        console.error('Erreur:', error);
        showToast('❌ Erreur de chargement');
    } finally {
        showLoading(false);
    }
}

// Afficher les dates disponibles pour l'année
function displayDates(year) {
    const container = document.getElementById('years-container');
    const dates = Object.keys(state.yearData.dates);
    
    container.innerHTML = `
        <div class="year-header">
            <button class="back-btn" onclick="displayYears()">← Retour</button>
            <h2>📅 ${year} - ${dates.length} journées disponibles</h2>
        </div>
        <div class="dates-grid">
            ${dates.map(date => {
                const programCount = state.yearData.dates[date].programs.length;
                const dateParts = date.split('/');
                const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
                
                return `
                    <button class="date-btn" onclick="selectDate('${date}')">
                        <span class="date-display">${displayDate}</span>
                        <span class="date-info">${programCount} programmes</span>
                        <span class="date-source">${state.yearData.dates[date].source}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

// Sélectionner une date
function selectDate(date) {
    state.selectedDate = date;
    const data = state.yearData.dates[date];
    state.programs = data.programs;
    displayPrograms(state.programs, date);
}

// Afficher les programmes
function displayPrograms(programs, date) {
    const container = document.getElementById('programs-container');
    
    const dateParts = date.split('/');
    const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    
    if (programs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="retro-tv">📺</div>
                <h2>Aucun programme</h2>
                <p>Pas de programmes pour cette date</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="programs-header">
            <button class="back-btn" onclick="displayDates('${state.selectedYear}')">← Retour aux dates</button>
            <h2>📺 Programmes du ${displayDate}</h2>
            <p class="programs-count">${programs.length} programmes</p>
        </div>
        <div class="programs-list">
            ${programs.map((program, idx) => `
                <div class="program-card">
                    <div class="program-time">🕐 ${program.time}</div>
                    <div class="program-title">🎬 ${program.title}</div>
                    ${program.channel ? `<div class="program-channel">📺 ${program.channel}</div>` : ''}
                    ${program.description ? `<p class="program-description">${program.description}</p>` : ''}
                    <div class="program-actions">
                        <button class="add-to-playlist-btn" onclick="addToPlaylist('${date}-${idx}')">
                            ➕ Playlist
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Ajouter à la playlist
function addToPlaylist(programId) {
    const [date, idx] = programId.split('-');
    const program = state.yearData.dates[date].programs[parseInt(idx)];
    
    if (!program) return;
    
    const uniqueId = `${date}-${idx}`;
    
    if (state.playlist.some(p => p.id === uniqueId)) {
        showToast('⚠️ Déjà dans la playlist');
        return;
    }
    
    state.playlist.push({
        id: uniqueId,
        date: date,
        time: program.time,
        title: program.title,
        channel: program.channel,
        description: program.description,
        addedAt: new Date().toISOString()
    });
    
    savePlaylist();
    updatePlaylistDisplay();
    
    showToast(`✅ "${program.title}" ajouté`);
}

function removeFromPlaylist(programId) {
    state.playlist = state.playlist.filter(p => p.id !== programId);
    savePlaylist();
    updatePlaylistDisplay();
    showToast('🗑️ Programme retiré');
}

function clearPlaylist() {
    if (confirm('Vider toute la playlist ?')) {
        state.playlist = [];
        savePlaylist();
        updatePlaylistDisplay();
        showToast('🗑️ Playlist vidée');
    }
}

function savePlaylist() {
    localStorage.setItem('retroPlaylist', JSON.stringify(state.playlist));
}

function updatePlaylistDisplay() {
    const container = document.getElementById('playlist-container');
    
    if (state.playlist.length === 0) {
        container.innerHTML = `
            <div class="empty-playlist">
                <p>📭 Playlist vide</p>
                <small>Ajoutez des programmes depuis la vue Parcourir</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.playlist.map(program => {
        const dateParts = program.date.split('/');
        const displayDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        return `
            <div class="playlist-item">
                <div class="playlist-item-info">
                    <div class="program-time">📅 ${displayDate} 🕐 ${program.time}</div>
                    <div class="program-title">🎬 ${program.title}</div>
                    ${program.channel ? `<div class="program-channel">📺 ${program.channel}</div>` : ''}
                </div>
                <button class="remove-btn" onclick="removeFromPlaylist('${program.id}')">✕</button>
            </div>
        `;
    }).join('');
}

function exportPlaylist() {
    if (state.playlist.length === 0) {
        showToast('⚠️ Playlist vide');
        return;
    }
    
    const exportSection = document.getElementById('export-section');
    const exportText = document.getElementById('export-text');
    
    const exportData = state.playlist.map(program => 
        `${program.title}${program.channel ? ' - ' + program.channel : ''}`
    ).join('\n');
    
    exportText.value = exportData;
    exportSection.style.display = 'block';
    exportSection.scrollIntoView({ behavior: 'smooth' });
}

function copyToClipboard() {
    const exportText = document.getElementById('export-text');
    exportText.select();
    document.execCommand('copy');
    showToast('📋 Copié !');
}

function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`${view}-view`).classList.add('active');
            
            state.currentView = view;
            
            if (view === 'browse' && !state.index) {
                loadIndex();
            }
        });
    });
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Exposer globalement
window.selectYear = selectYear;
window.selectDate = selectDate;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.exportPlaylist = exportPlaylist;
window.copyToClipboard = copyToClipboard;
window.displayYears = displayYears;
window.displayDates = displayDates;