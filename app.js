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

// ------------------------------------
// Helpers dates
// ------------------------------------

function normalizeDate(dateStr) {
    if (!dateStr) return null;

    dateStr = String(dateStr).trim();

    let parts;

    if (dateStr.includes('-')) {
        parts = dateStr.split('-');
    } else if (dateStr.includes('/')) {
        parts = dateStr.split('/');
    } else {
        return null;
    }

    if (parts.length !== 3) return null;

    let day, month, year;

    if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
    } else {
        day = parts[0];
        month = parts[1];
        year = parts[2];
    }

    day = String(day).padStart(2, '0');
    month = String(month).padStart(2, '0');

    return `${day}-${month}-${year}`;
}

function formatDisplayDate(dateStr) {
    const normalized = normalizeDate(dateStr);
    if (!normalized) return dateStr;

    const [day, month, year] = normalized.split('-');
    return `${day}/${month}/${year}`;
}

function dateSortKey(dateStr) {
    const normalized = normalizeDate(dateStr);
    if (!normalized) return [9999, 9999, 9999];

    const [day, month, year] = normalized.split('-').map(Number);
    return [year, month, day];
}

function sortDates(dates) {
    return [...dates].sort((a, b) => {
        const ka = dateSortKey(a);
        const kb = dateSortKey(b);

        for (let i = 0; i < 3; i++) {
            if (ka[i] !== kb[i]) return ka[i] - kb[i];
        }

        return 0;
    });
}

function makeProgramId(dateStr, index) {
    return `${dateStr}__${index}`;
}

function parseProgramId(programId) {
    const parts = programId.split('__');

    if (parts.length !== 2) {
        return null;
    }

    return {
        date: parts[0],
        index: parseInt(parts[1], 10)
    };
}

// ------------------------------------
// Chargement des données
// ------------------------------------

async function loadIndex() {
    try {
        const response = await fetch('data/index.json');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        state.index = await response.json();
        displayYears();
    } catch (error) {
        console.error('Erreur chargement index:', error);
        showNoData();
    }
}

function showNoData() {
    const container = document.getElementById('years-container');

    container.innerHTML = `
        <div class="empty-state">
            <div class="retro-tv">📺</div>
            <h2>Aucune donnée disponible</h2>
            <p>Lancez le workflow GitHub Actions pour scraper les grilles TV.</p>
        </div>
    `;
}

// ------------------------------------
// Navigation principale
// ------------------------------------

function displayYears() {
    const container = document.getElementById('years-container');

    if (!state.index || !state.index.years || Object.keys(state.index.years).length === 0) {
        showNoData();
        return;
    }

    const years = Object.keys(state.index.years).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

    container.innerHTML = `
        <h2 class="years-title">📅 Choisissez une année</h2>
        <div class="years-grid">
            ${years.map(year => `
                <button class="year-btn" onclick="selectYear('${year}')">
                    <span class="year-number">${year}</span>
                    <span class="year-info">${state.index.years[year].total_programs || 0} programmes</span>
                </button>
            `).join('')}
        </div>
    `;
}

async function selectYear(year) {
    state.selectedYear = year;
    state.selectedDate = null;
    showLoading(true);

    try {
        const response = await fetch(`data/${year}.json`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        state.yearData = await response.json();
        displayDates(year);
    } catch (error) {
        console.error('Erreur:', error);
        showToast('❌ Erreur de chargement de l’année');
    } finally {
        showLoading(false);
    }
}

function displayDates(year) {
    const container = document.getElementById('years-container');
    const programsContainer = document.getElementById('programs-container');

    if (!state.yearData || !state.yearData.dates) {
        container.innerHTML = `
            <div class="empty-state">
                <h2>Aucune date disponible pour ${year}</h2>
            </div>
        `;
        programsContainer.innerHTML = '';
        return;
    }

    const dates = sortDates(Object.keys(state.yearData.dates));

    container.innerHTML = `
        <div class="year-header">
            <button class="back-btn" onclick="displayYears()">← Retour aux années</button>
            <h2>📅 ${year} — ${dates.length} journées disponibles</h2>
        </div>
        <div class="dates-grid">
            ${dates.map(date => {
                const dateData = state.yearData.dates[date];
                const programCount = dateData.programs_count || (dateData.programs ? dateData.programs.length : 0);
                const source = dateData.source || 'inconnue';

                return `
                    <button class="date-btn" onclick="selectDate('${date}')">
                        <span class="date-display">${formatDisplayDate(date)}</span>
                        <span class="date-info">${programCount} programmes</span>
                        <span class="date-source">${source}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    programsContainer.innerHTML = '';
}

function selectDate(date) {
    state.selectedDate = date;

    const dateData = state.yearData.dates[date];

    if (!dateData || !dateData.programs) {
        showToast('❌ Aucune donnée pour cette date');
        return;
    }

    state.programs = dateData.programs;
    displayPrograms(state.programs, date);
}

function displayPrograms(programs, date) {
    const container = document.getElementById('programs-container');

    if (!programs || programs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="retro-tv">📺</div>
                <h2>Aucun programme</h2>
                <p>Pas de programmes pour cette date.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="programs-header">
            <button class="back-btn" onclick="displayDates('${state.selectedYear}')">← Retour aux dates</button>
            <h2>📺 Programmes du ${formatDisplayDate(date)}</h2>
            <p class="programs-count">${programs.length} programmes</p>
        </div>
        <div class="programs-list">
            ${programs.map((program, idx) => `
                <div class="program-card">
                    <div class="program-time">🕐 ${program.time || '--:--'}</div>
                    <div class="program-title">🎬 ${program.title || 'Titre inconnu'}</div>
                    ${program.channel ? `<div class="program-channel">📺 ${program.channel}</div>` : ''}
                    ${program.description ? `<p class="program-description">${program.description}</p>` : ''}
                    <div class="program-actions">
                        <button class="add-to-playlist-btn" onclick="addToPlaylist('${makeProgramId(date, idx)}')">
                            ➕ Playlist
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ------------------------------------
// Playlist
// ------------------------------------

function addToPlaylist(programId) {
    const parsed = parseProgramId(programId);

    if (!parsed) {
        showToast('❌ Identifiant de programme invalide');
        return;
    }

    const { date, index } = parsed;

    const dateData = state.yearData?.dates?.[date];

    if (!dateData || !dateData.programs || !dateData.programs[index]) {
        showToast('❌ Programme introuvable');
        return;
    }

    const program = dateData.programs[index];

    if (state.playlist.some(p => p.id === programId)) {
        showToast('⚠️ Déjà dans la playlist');
        return;
    }

    state.playlist.push({
        id: programId,
        date: date,
        time: program.time || '',
        title: program.title || '',
        channel: program.channel || '',
        description: program.description || '',
        addedAt: new Date().toISOString()
    });

    savePlaylist();
    updatePlaylistDisplay();

    showToast(`✅ "${program.title}" ajouté à la playlist`);
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

    if (!container) return;

    if (state.playlist.length === 0) {
        container.innerHTML = `
            <div class="empty-playlist">
                <p>📭 Playlist vide</p>
                <small>Ajoutez des programmes depuis la vue Parcourir</small>
            </div>
        `;
        return;
    }

    container.innerHTML = state.playlist.map(program => `
        <div class="playlist-item">
            <div class="playlist-item-info">
                <div class="program-time">
                    📅 ${formatDisplayDate(program.date)} — 🕐 ${program.time}
                </div>
                <div class="program-title">🎬 ${program.title}</div>
                ${program.channel ? `<div class="program-channel">📺 ${program.channel}</div>` : ''}
                ${program.description ? `<p class="program-description">${program.description}</p>` : ''}
            </div>
            <button class="remove-btn" onclick="removeFromPlaylist('${program.id}')">✕</button>
        </div>
    `).join('');
}

// ------------------------------------
// Export TuneMyMusic
// ------------------------------------

function exportPlaylist() {
    if (state.playlist.length === 0) {
        showToast('⚠️ Playlist vide');
        return;
    }

    const exportSection = document.getElementById('export-section');
    const exportText = document.getElementById('export-text');

    const exportData = state.playlist.map(program => {
        const parts = [];

        if (program.title) parts.push(program.title);
        if (program.channel) parts.push(program.channel);
        if (program.time) parts.push(program.time);
        if (program.date) parts.push(formatDisplayDate(program.date));

        return parts.join(' - ');
    }).join('\n');

    exportText.value = exportData;
    exportSection.style.display = 'block';
    exportSection.scrollIntoView({ behavior: 'smooth' });
}

function copyToClipboard() {
    const exportText = document.getElementById('export-text');
    exportText.select();
    document.execCommand('copy');
    showToast('📋 Copié dans le presse-papier !');
}

// ------------------------------------
// Navigation UI
// ------------------------------------

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

// ------------------------------------
// Utils
// ------------------------------------

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Exposer globalement
window.selectYear = selectYear;
window.selectDate = selectDate;
window.displayYears = displayYears;
window.displayDates = displayDates;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.exportPlaylist = exportPlaylist;
window.copyToClipboard = copyToClipboard;