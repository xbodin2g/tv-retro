// =====================================================
// TV RÉTRO - Application principale
// =====================================================

const state = {
    currentView: 'browse',
    selectedYear: null,
    selectedDate: null,
    playlist: loadStoredPlaylist(),
    programs: [],
    index: null,
    yearData: null
};

let toastTimeout = null;

// =====================================================
// Initialisation
// =====================================================

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    setupNavigation();
    updatePlaylistDisplay();
    registerServiceWorker();

    await loadIndex();
}

// =====================================================
// Storage playlist
// =====================================================

function loadStoredPlaylist() {
    try {
        const raw = localStorage.getItem('retroPlaylist');

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter(program => program && typeof program === 'object')
            .filter(program => program.id && program.date && program.title)
            .map(program => ({
                id: String(program.id),
                date: String(program.date),
                time: program.time ? String(program.time) : '',
                title: program.title ? String(program.title) : '',
                channel: program.channel ? String(program.channel) : '',
                description: program.description ? String(program.description) : '',
                addedAt: program.addedAt || new Date().toISOString()
            }));
    } catch (error) {
        console.error('Erreur lecture playlist locale:', error);
        return [];
    }
}

function savePlaylist() {
    try {
        localStorage.setItem('retroPlaylist', JSON.stringify(state.playlist));
    } catch (error) {
        console.error('Erreur sauvegarde playlist:', error);
        showToast('❌ Impossible de sauvegarder la playlist localement');
    }
}

// =====================================================
// Helpers dates
// =====================================================

function normalizeDate(dateStr) {
    if (!dateStr) {
        return null;
    }

    const value = String(dateStr).trim();

    let parts;

    if (value.includes('-')) {
        parts = value.split('-');
    } else if (value.includes('/')) {
        parts = value.split('/');
    } else {
        return null;
    }

    if (parts.length !== 3) {
        return null;
    }

    let day;
    let month;
    let year;

    // Format AAAA-MM-DD ou AAAA/MM/DD
    if (parts[0].length === 4) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
    }
    // Format JJ-MM-AAAA ou JJ/MM/AAAA
    else {
        day = parts[0];
        month = parts[1];
        year = parts[2];
    }

    day = String(day).padStart(2, '0');
    month = String(month).padStart(2, '0');
    year = String(year);

    const numericDay = Number(day);
    const numericMonth = Number(month);
    const numericYear = Number(year);

    if (
        Number.isNaN(numericDay) ||
        Number.isNaN(numericMonth) ||
        Number.isNaN(numericYear)
    ) {
        return null;
    }

    const testDate = new Date(numericYear, numericMonth - 1, numericDay);

    if (
        testDate.getFullYear() !== numericYear ||
        testDate.getMonth() !== numericMonth - 1 ||
        testDate.getDate() !== numericDay
    ) {
        return null;
    }

    return `${day}-${month}-${year}`;
}

function formatDisplayDate(dateStr) {
    const normalized = normalizeDate(dateStr);

    if (!normalized) {
        return dateStr || '';
    }

    const [day, month, year] = normalized.split('-');

    return `${day}/${month}/${year}`;
}

function dateSortKey(dateStr) {
    const normalized = normalizeDate(dateStr);

    if (!normalized) {
        return [9999, 9999, 9999];
    }

    const [day, month, year] = normalized.split('-').map(Number);

    return [year, month, day];
}

function sortDates(dates) {
    return [...dates].sort((a, b) => {
        const keyA = dateSortKey(a);
        const keyB = dateSortKey(b);

        for (let i = 0; i < 3; i++) {
            if (keyA[i] !== keyB[i]) {
                return keyA[i] - keyB[i];
            }
        }

        return 0;
    });
}

function makeProgramId(dateStr, index) {
    const normalized = normalizeDate(dateStr) || String(dateStr);
    return `${normalized}__${Number(index)}`;
}

function parseProgramId(programId) {
    if (!programId || typeof programId !== 'string') {
        return null;
    }

    const parts = programId.split('__');

    if (parts.length !== 2) {
        return null;
    }

    const date = normalizeDate(parts[0]) || parts[0];
    const index = Number.parseInt(parts[1], 10);

    if (Number.isNaN(index)) {
        return null;
    }

    return {
        date,
        index
    };
}

// =====================================================
// Sécurité HTML
// =====================================================

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================
// Chargement des données
// =====================================================

async function loadIndex() {
    try {
        const base = document.baseURI || window.location.href;
        const baseUrl = new URL('data/index.json', base).href;
        const url = `${baseUrl}?t=${Date.now()}`;

        console.log('Chargement de l’index depuis :', url);

        const response = await fetch(url, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Impossible de charger data/index.json (HTTP ${response.status})`);
        }

        const text = await response.text();

        if (!text.trim()) {
            throw new Error('data/index.json est vide');
        }

        state.index = JSON.parse(text);

        if (
            !state.index ||
            typeof state.index !== 'object' ||
            !state.index.years ||
            typeof state.index.years !== 'object'
        ) {
            showNoData('Le fichier data/index.json est chargé, mais sa structure est invalide.');
            return;
        }

        const yearKeys = Object.keys(state.index.years).filter(year => /^\d{4}$/.test(String(year)));

        if (yearKeys.length === 0) {
            showNoData('data/index.json ne contient encore aucune année. Lance le workflow de scraping puis generate_index_only.');
            return;
        }

        displayYears();
    } catch (error) {
        console.error('Erreur loadIndex:', error);
        showNoData(error.message || 'Erreur inconnue lors du chargement des données.');
    }
}

function showNoData(message = 'Lance d’abord le workflow GitHub Actions pour scraper les données.') {
    const container = document.getElementById('years-container');

    if (!container) {
        console.error('Élément #years-container introuvable dans index.html');
        return;
    }

    container.innerHTML = `
        <div class="empty-state">
            <div class="retro-tv">📺</div>
            <h2>Aucune donnée disponible</h2>
            <p>${escapeHtml(message)}</p>
        </div>
    `;

    const programsContainer = document.getElementById('programs-container');

    if (programsContainer) {
        programsContainer.innerHTML = '';
    }
}

// =====================================================
// Vue années
// =====================================================

function displayYears() {
    const container = document.getElementById('years-container');

    if (!container) {
        console.error('Élément #years-container introuvable');
        return;
    }

    if (!state.index || !state.index.years) {
        showNoData();
        return;
    }

    const years = Object.keys(state.index.years)
        .filter(year => /^\d{4}$/.test(String(year)))
        .sort((a, b) => Number(a) - Number(b));

    if (years.length === 0) {
        showNoData('Aucune année valide n’a été trouvée dans data/index.json.');
        return;
    }

    container.innerHTML = `
        <h2 class="years-title">📅 Choisissez une année</h2>
        <div class="years-grid">
            ${years.map(year => {
                const yearData = state.index.years[year] || {};
                const totalPrograms = Number(yearData.total_programs || 0);

                return `
                    <button class="year-btn" onclick="selectYear('${escapeHtml(year)}')">
                        <span class="year-number">${escapeHtml(year)}</span>
                        <span class="year-info">${totalPrograms} programmes</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;

    const programsContainer = document.getElementById('programs-container');

    if (programsContainer) {
        programsContainer.innerHTML = '';
    }
}

// =====================================================
// Sélection d’une année
// =====================================================

async function selectYear(year) {
    state.selectedYear = year;
    state.selectedDate = null;
    state.yearData = null;

    showLoading(true);

    try {
        const base = document.baseURI || window.location.href;
        const baseUrl = new URL(`data/${year}.json`, base).href;
        const url = `${baseUrl}?t=${Date.now()}`;

        console.log('Chargement de l’année depuis :', url);

        const response = await fetch(url, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Impossible de charger data/${year}.json (HTTP ${response.status})`);
        }

        state.yearData = await response.json();

        if (!state.yearData || !state.yearData.dates) {
            showToast(`⚠️ Aucune journée disponible pour ${year}`);
            displayYears();
            return;
        }

        displayDates(year);
    } catch (error) {
        console.error('Erreur selectYear:', error);
        showToast(`❌ ${error.message}`);
        displayYears();
    } finally {
        showLoading(false);
    }
}

// =====================================================
// Vue dates / journées disponibles
// =====================================================

function displayDates(year) {
    const container = document.getElementById('years-container');
    const programsContainer = document.getElementById('programs-container');

    if (!container) {
        console.error('Élément #years-container introuvable');
        return;
    }

    if (programsContainer) {
        programsContainer.innerHTML = '';
    }

    if (!state.yearData || !state.yearData.dates) {
        container.innerHTML = `
            <div class="year-header">
                <button class="back-btn" onclick="displayYears()">← Retour aux années</button>
                <h2>📅 ${escapeHtml(year)}</h2>
            </div>
            <div class="empty-state">
                <h2>Aucune date disponible</h2>
                <p>Aucune journée n’a été trouvée pour cette année.</p>
            </div>
        `;
        return;
    }

    const dates = sortDates(Object.keys(state.yearData.dates));

    if (dates.length === 0) {
        container.innerHTML = `
            <div class="year-header">
                <button class="back-btn" onclick="displayYears()">← Retour aux années</button>
                <h2>📅 ${escapeHtml(year)}</h2>
            </div>
            <div class="empty-state">
                <h2>Aucune date disponible</h2>
                <p>Aucune journée n’a été trouvée pour cette année.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="year-header">
            <button class="back-btn" onclick="displayYears()">← Retour aux années</button>
            <h2>📅 ${escapeHtml(year)} — ${dates.length} journées disponibles</h2>
        </div>

        <div class="dates-grid">
            ${dates.map(date => {
                const dateData = state.yearData.dates[date] || {};
                const programCount = Number(
                    dateData.programs_count ||
                    (Array.isArray(dateData.programs) ? dateData.programs.length : 0)
                );
                const source = dateData.source || 'inconnue';

                return `
                    <button class="date-btn" onclick="selectDate('${escapeHtml(date)}')">
                        <span class="date-display">${escapeHtml(formatDisplayDate(date))}</span>
                        <span class="date-info">${programCount} programmes</span>
                        <span class="date-source">${escapeHtml(source)}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

// =====================================================
// Sélection d’une date
// =====================================================

function selectDate(date) {
    const normalizedDate = normalizeDate(date) || date;

    state.selectedDate = normalizedDate;

    if (!state.yearData || !state.yearData.dates) {
        showToast('❌ Aucune donnée d’année chargée');
        return;
    }

    const dateData =
        state.yearData.dates[normalizedDate] ||
        state.yearData.dates[date];

    if (!dateData) {
        showToast('❌ Cette date n’est pas disponible');
        return;
    }

    const programs = Array.isArray(dateData.programs)
        ? [...dateData.programs]
        : [];

    programs.sort((a, b) => {
        const timeA = String(a.time || '');
        const timeB = String(b.time || '');
        return timeA.localeCompare(timeB);
    });

    state.programs = programs;

    displayPrograms(programs, normalizedDate);
}

// =====================================================
// Affichage des programmes
// =====================================================

function displayPrograms(programs, date) {
    const container = document.getElementById('programs-container');

    if (!container) {
        console.error('Élément #programs-container introuvable');
        return;
    }

    if (!programs || programs.length === 0) {
        container.innerHTML = `
            <div class="programs-header">
                <button class="back-btn" onclick="displayDates('${escapeHtml(state.selectedYear || '')}')">
                    ← Retour aux dates
                </button>
                <h2>📺 Programmes du ${escapeHtml(formatDisplayDate(date))}</h2>
            </div>
            <div class="empty-state">
                <div class="retro-tv">📺</div>
                <h2>Aucun programme</h2>
                <p>Aucun programme n’a été trouvé pour cette date.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="programs-header">
            <button class="back-btn" onclick="displayDates('${escapeHtml(state.selectedYear || '')}')">
                ← Retour aux dates
            </button>
            <h2>📺 Programmes du ${escapeHtml(formatDisplayDate(date))}</h2>
            <p class="programs-count">${programs.length} programmes</p>
        </div>

        <div class="programs-list">
            ${programs.map((program, index) => {
                const programId = makeProgramId(date, index);

                return `
                    <div class="program-card">
                        <div class="program-time">🕐 ${escapeHtml(program.time || '--:--')}</div>
                        <div class="program-title">🎬 ${escapeHtml(program.title || 'Titre inconnu')}</div>

                        ${program.channel ? `
                            <div class="program-channel">📺 ${escapeHtml(program.channel)}</div>
                        ` : ''}

                        ${program.description ? `
                            <p class="program-description">${escapeHtml(program.description)}</p>
                        ` : ''}

                        <div class="program-actions">
                            <button class="add-to-playlist-btn" data-program-id="${escapeHtml(programId)}">
                                ➕ Playlist
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    container.querySelectorAll('[data-program-id]').forEach(button => {
        button.addEventListener('click', () => {
            addToPlaylist(button.dataset.programId);
        });
    });
}

// =====================================================
// Playlist
// =====================================================

function addToPlaylist(programId) {
    const parsed = parseProgramId(programId);

    if (!parsed) {
        showToast('❌ Identifiant de programme invalide');
        return;
    }

    if (!state.yearData || !state.yearData.dates) {
        showToast('❌ Aucune donnée chargée');
        return;
    }

    const dateData = state.yearData.dates[parsed.date];

    if (!dateData) {
        showToast('❌ Date introuvable dans les données chargées');
        return;
    }

    const programs = Array.isArray(dateData.programs) ? dateData.programs : [];
    const program = programs[parsed.index];

    if (!program) {
        showToast('❌ Programme introuvable');
        return;
    }

    if (state.playlist.some(item => item.id === programId)) {
        showToast('⚠️ Ce programme est déjà dans la playlist');
        return;
    }

    state.playlist.push({
        id: programId,
        date: parsed.date,
        time: program.time || '',
        title: program.title || '',
        channel: program.channel || '',
        description: program.description || '',
        addedAt: new Date().toISOString()
    });

    savePlaylist();
    updatePlaylistDisplay();

    showToast(`✅ "${program.title || 'Programme'}" ajouté à la playlist`);
}

function removeFromPlaylist(programId) {
    state.playlist = state.playlist.filter(program => program.id !== programId);
    savePlaylist();
    updatePlaylistDisplay();
    showToast('🗑️ Programme retiré de la playlist');
}

function clearPlaylist() {
    if (state.playlist.length === 0) {
        showToast('ℹ️ La playlist est déjà vide');
        return;
    }

    const confirmed = confirm('Vider toute la playlist ?');

    if (!confirmed) {
        return;
    }

    state.playlist = [];
    savePlaylist();
    updatePlaylistDisplay();
    showToast('🗑️ Playlist vidée');
}

function updatePlaylistDisplay() {
    const container = document.getElementById('playlist-container');

    if (!container) {
        console.error('Élément #playlist-container introuvable');
        return;
    }

    if (state.playlist.length === 0) {
        container.innerHTML = `
            <div class="empty-playlist">
                <p>📭 Playlist vide</p>
                <small>Ajoutez des programmes depuis la vue Parcourir</small>
            </div>
        `;
        return;
    }

    const sortedPlaylist = [...state.playlist].sort((a, b) => {
        const keyA = dateSortKey(a.date);
        const keyB = dateSortKey(b.date);

        for (let i = 0; i < 3; i++) {
            if (keyA[i] !== keyB[i]) {
                return keyA[i] - keyB[i];
            }
        }

        return String(a.time || '').localeCompare(String(b.time || ''));
    });

    container.innerHTML = sortedPlaylist.map(program => `
        <div class="playlist-item">
            <div class="playlist-item-info">
                <div class="program-time">
                    📅 ${escapeHtml(formatDisplayDate(program.date))} — 🕐 ${escapeHtml(program.time || '--:--')}
                </div>
                <div class="program-title">🎬 ${escapeHtml(program.title || 'Titre inconnu')}</div>

                ${program.channel ? `
                    <div class="program-channel">📺 ${escapeHtml(program.channel)}</div>
                ` : ''}

                ${program.description ? `
                    <p class="program-description">${escapeHtml(program.description)}</p>
                ` : ''}
            </div>

            <button class="remove-btn" data-remove-id="${escapeHtml(program.id)}">
                ✕
            </button>
        </div>
    `).join('');

    container.querySelectorAll('[data-remove-id]').forEach(button => {
        button.addEventListener('click', () => {
            removeFromPlaylist(button.dataset.removeId);
        });
    });
}

// =====================================================
// Export TuneMyMusic
// =====================================================

function exportPlaylist() {
    if (state.playlist.length === 0) {
        showToast('⚠️ Playlist vide');
        return;
    }

    const exportSection = document.getElementById('export-section');
    const exportText = document.getElementById('export-text');

    if (!exportSection || !exportText) {
        showToast('❌ Élément d’export introuvable');
        return;
    }

    const exportData = state.playlist
        .map(program => {
            const title = program.title || 'Programme inconnu';
            const channel = program.channel ? ` - ${program.channel}` : '';
            return `${title}${channel}`;
        })
        .join('\n');

    exportText.value = exportData;
    exportSection.style.display = 'block';
    exportSection.scrollIntoView({ behavior: 'smooth' });

    showToast('✅ Playlist prête à être copiée');
}

async function copyToClipboard() {
    const exportText = document.getElementById('export-text');

    if (!exportText) {
        showToast('❌ Zone de texte introuvable');
        return;
    }

    const text = exportText.value;

    if (!text) {
        showToast('⚠️ Rien à copier');
        return;
    }

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            showToast('📋 Copié dans le presse-papier !');
            return;
        }

        exportText.select();
        exportText.setSelectionRange(0, text.length);

        const success = document.execCommand('copy');

        if (success) {
            showToast('📋 Copié dans le presse-papier !');
        } else {
            showToast('❌ Impossible de copier automatiquement');
        }
    } catch (error) {
        console.error('Erreur copie presse-papier:', error);
        showToast('❌ Impossible de copier');
    }
}

// =====================================================
// Navigation UI
// =====================================================

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;

            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            document.querySelectorAll('.view').forEach(section => {
                section.classList.remove('active');
            });

            const targetView = document.getElementById(`${view}-view`);

            if (targetView) {
                targetView.classList.add('active');
            }

            state.currentView = view;

            if (view === 'browse') {
                if (!state.index) {
                    loadIndex();
                } else {
                    displayYears();
                }
            }
        });
    });
}

// =====================================================
// Utils UI
// =====================================================

function showLoading(show) {
    const loading = document.getElementById('loading');

    if (loading) {
        loading.style.display = show ? 'block' : 'none';
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');

    if (!toast) {
        console.warn('Toast introuvable:', message);
        return;
    }

    toast.textContent = message;
    toast.classList.add('show');

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// =====================================================
// Service Worker
// =====================================================

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('Service Worker enregistré :', registration.scope);
            })
            .catch(error => {
                console.log('Échec d’enregistrement du Service Worker :', error);
            });
    });
}

// =====================================================
// Exposition globale pour les onclick simples
// =====================================================

window.selectYear = selectYear;
window.selectDate = selectDate;
window.displayYears = displayYears;
window.displayDates = displayDates;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.exportPlaylist = exportPlaylist;
window.copyToClipboard = copyToClipboard;