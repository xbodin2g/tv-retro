// =====================================================
// TV RÉTRO - Version magazine + vue journée + segments + vidéo
// - tri logique : 00:00-04:59 affichées après 23:59
// - sommaire du soir dans un tiroir fermé
// - frise avec une seule scrollbar
// - clic frise -> programme fiable
// - retour à la journée depuis la playlist
// - panel de recherche vidéo (INA, YouTube, Dailymotion, Odysee)
// =====================================================

const state = {
    currentView: 'browse',
    selectedYear: null,
    selectedDate: null,
    playlist: loadStoredPlaylist(),
    index: null,
    yearData: null,

    dayOpen: false,
    currentPrograms: [],
    currentProgramMap: new Map(),

    filters: {
        query: '',
        channel: 'all',
        showSegments: true
    }
};

let toastTimeout = null;

const LAST_DAY_STORAGE_KEY = 'retroLastDay';
const NIGHT_CUTOFF_HOUR = 5;

const CHANNEL_ORDER = [
    'ORTF 1',
    'ORTF 2',
    'ORTF 3',
    'TF1',
    'Antenne 2',
    'France 2',
    'FR3',
    'France 3',
    'Canal+',
    'TV6',
    'M6',
    'La Cinq',
    'La Sept',
    'Arte',
    'La Cinquième',
    'France 5'
];

const CHANNEL_ALIASES = {
    // ORTF
    'OR1': 'ORTF 1',
    'OR2': 'ORTF 2',
    'OR3': 'ORTF 3',
    'ORTF 1': 'ORTF 1',
    'ORTF 2': 'ORTF 2',
    'ORTF 3': 'ORTF 3',
    'ORTF1': 'ORTF 1',
    'ORTF2': 'ORTF 2',
    'ORTF3': 'ORTF 3',

    // Chaînes classiques
    'TF1': 'TF1',
    'A2': 'Antenne 2',
    'ANTENNE 2': 'Antenne 2',
    'F2': 'France 2',
    'FRANCE 2': 'France 2',
    'FR3': 'FR3',
    'FR 3': 'FR3',
    'F3': 'France 3',
    'FRANCE 3': 'France 3',
    'C+': 'Canal+',
    'CANAL+': 'Canal+',
    'CANAL': 'Canal+',
    'TV6': 'TV6',
    'L5': 'La Cinq',
    'LA5': 'La Cinq',
    'LA 5': 'La Cinq',
    'LA CINQ': 'La Cinq',
    'LA CINQUIEME': 'La Cinquième',
    'LA CINQUIÈME': 'La Cinquième',
    'CINQ': 'La Cinq',
    'M6': 'M6',
    'LA SEPT': 'La Sept',
    'L7': 'La Sept',
    'LA7': 'La Sept',
    'LA 7': 'La Sept',
    'ARTE': 'Arte',
    'FRANCE 5': 'France 5'
};

// =====================================================
// Initialisation
// =====================================================

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    setupNavigation();
    setupDayToolbarListeners();
    setupPlaylistListeners();
    setupVideoPanelListeners();
    updatePlaylistDisplay();
    registerServiceWorker();

    const loaded = await loadIndex({ display: false });

    if (!loaded) {
        return;
    }

    const restored = await restoreLastDay();

    if (!restored) {
        displayYears();
    }
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
                parentTitle: program.parentTitle ? String(program.parentTitle) : '',
                type: program.type ? String(program.type) : 'program',
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
// Storage dernière journée ouverte
// =====================================================

function setStoredLastDay(year, date) {
    try {
        localStorage.setItem(
            LAST_DAY_STORAGE_KEY,
            JSON.stringify({
                year,
                date,
                updatedAt: new Date().toISOString()
            })
        );
    } catch (error) {
        console.error('Erreur sauvegarde dernière journée:', error);
    }
}

function getStoredLastDay() {
    try {
        const raw = localStorage.getItem(LAST_DAY_STORAGE_KEY);

        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        if (!parsed.year || !parsed.date) {
            return null;
        }

        return {
            year: String(parsed.year),
            date: String(parsed.date)
        };
    } catch (error) {
        console.error('Erreur lecture dernière journée:', error);
        return null;
    }
}

function clearStoredLastDay() {
    try {
        localStorage.removeItem(LAST_DAY_STORAGE_KEY);
    } catch (error) {
        console.error('Erreur suppression dernière journée:', error);
    }
}

async function restoreLastDay() {
    const saved = getStoredLastDay();

    if (!saved || !saved.year || !saved.date) {
        return false;
    }

    if (!state.index || !state.index.years || !state.index.years[saved.year]) {
        clearStoredLastDay();
        return false;
    }

    try {
        const yearOk = await selectYear(saved.year, { display: false });

        if (!yearOk) {
            return false;
        }

        return selectDate(saved.date) === true;
    } catch (error) {
        console.error('Erreur restauration dernière journée:', error);
        return false;
    }
}

// =====================================================
// Helpers texte / sécurité
// =====================================================

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeText(value) {
    if (!value) {
        return '';
    }

    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cssSafeId(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/^-+|-+$/g, '') || 'id';
}

// =====================================================
// Helpers date / heure / chaîne
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

function formatDateLabel(dateStr) {
    const normalized = normalizeDate(dateStr);

    if (!normalized) {
        return dateStr || '';
    }

    const [day, month, year] = normalized.split('-');

    try {
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' });
        return `${weekday} ${day}/${month}/${year}`;
    } catch {
        return `${day}/${month}/${year}`;
    }
}

function formatShortDate(dateStr) {
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

function normalizeTime(value) {
    if (!value) {
        return '';
    }

    const text = String(value).trim();
    const match = text.match(/^(\d{1,2})[:h.](\d{2})$/i);

    if (!match) {
        return '';
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour > 23 || minute > 59) {
        return '';
    }

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeSortKey(timeStr) {
    if (!timeStr || !timeStr.includes(':')) {
        return 9999;
    }

    const parts = timeStr.split(':');
    const hour = Number(parts[0]);
    const minute = Number(parts[1]);

    if (Number.isNaN(hour) || Number.isNaN(minute)) {
        return 9999;
    }

    if (hour >= NIGHT_CUTOFF_HOUR) {
        return (hour - NIGHT_CUTOFF_HOUR) * 60 + minute;
    } else {
        return (hour + 24 - NIGHT_CUTOFF_HOUR) * 60 + minute;
    }
}

function canonicalChannel(value) {
    const raw = String(value || '').trim();

    if (!raw) {
        return 'Autres';
    }

    const upper = raw.toUpperCase();

    if (CHANNEL_ALIASES[upper]) {
        return CHANNEL_ALIASES[upper];
    }

    const normalizedUpper = normalizeText(raw).toUpperCase();

    if (CHANNEL_ALIASES[normalizedUpper]) {
        return CHANNEL_ALIASES[normalizedUpper];
    }

    const compact = normalizedUpper.replace(/\s+/g, '');

    if (CHANNEL_ALIASES[compact]) {
        return CHANNEL_ALIASES[compact];
    }

    return raw;
}

function channelRank(channel) {
    const index = CHANNEL_ORDER.indexOf(channel);
    return index === -1 ? CHANNEL_ORDER.length + 1 : index;
}

function slugChannel(channel) {
    return normalizeText(channel)
        .replace(/\s+/g, '-')
        .replace(/^-|-$/g, '') || 'autre';
}

function cleanTitle(value) {
    let title = String(value || '').trim().replace(/\s+/g, ' ');

    const parts = title.split(/\s+[-–—]\s+/);

    if (parts.length === 2) {
        if (normalizeText(parts[0]) === normalizeText(parts[1])) {
            return parts[0].trim();
        }
    }

    return title;
}

function truncateText(value, maxLength) {
    const text = String(value || '');

    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, maxLength - 1)}…`;
}

// =====================================================
// Déduplication / regroupement / segments
// =====================================================

function programKey(program) {
    const time = program.time || '';
    const channel = program.channel || 'Autres';
    const title = program.title || '';

    if (time) {
        return `${time}|${channel}`;
    }

    return `${normalizeText(title)}|${channel}`;
}

function dedupePrograms(programs) {
    const map = new Map();

    for (const rawProgram of programs) {
        if (!rawProgram || typeof rawProgram !== 'object') {
            continue;
        }

        const time = normalizeTime(rawProgram.time);
        const channel = canonicalChannel(rawProgram.channel);
        const title = cleanTitle(rawProgram.title);
        const description = String(rawProgram.description || '').trim().replace(/\s+/g, ' ');
        const segments = Array.isArray(rawProgram.segments) ? rawProgram.segments : [];

        const program = {
            time,
            channel: channel || 'Autres',
            title: title || 'Programme non identifié',
            description,
            segments
        };

        const key = programKey(program);

        if (!map.has(key)) {
            map.set(key, program);
            continue;
        }

        const existing = map.get(key);

        if (program.title.length > existing.title.length) {
            existing.title = program.title;
        }

        if (program.description.length > existing.description.length) {
            existing.description = program.description;
        }

        if (!existing.time && program.time) {
            existing.time = program.time;
        }

        if (!existing.segments.length && program.segments.length) {
            existing.segments = program.segments;
        }
    }

    return [...map.values()].sort((a, b) => {
        const rankA = channelRank(a.channel);
        const rankB = channelRank(b.channel);

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const sortA = timeSortKey(a.time);
        const sortB = timeSortKey(b.time);

        if (sortA !== sortB) {
            return sortA - sortB;
        }

        return normalizeText(a.title).localeCompare(normalizeText(b.title));
    });
}

function flattenChannels(channels) {
    if (!channels || typeof channels !== 'object') {
        return [];
    }

    return Object.values(channels)
        .flat()
        .filter(Boolean);
}

function groupProgramsByChannel(programs) {
    const map = new Map();

    for (const program of programs) {
        const channel = program.channel || 'Autres';

        if (!map.has(channel)) {
            map.set(channel, []);
        }

        map.get(channel).push(program);
    }

    return [...map.entries()]
        .sort((a, b) => channelRank(a[0]) - channelRank(b[0]))
        .map(([channel, channelPrograms]) => ({
            channel,
            programs: [...channelPrograms].sort((a, b) => {
                const sortA = timeSortKey(a.time);
                const sortB = timeSortKey(b.time);
                return sortA - sortB;
            })
        }));
}

function makeProgramId(dateStr, time, channel, suffix = 'p') {
    const normalizedDate = normalizeDate(dateStr) || String(dateStr || '');
    const safeTime = String(time || 'sans-heure').replace(':', 'h');
    const safeChannel = slugChannel(channel || 'Autres');
    const safeSuffix = String(suffix || 'p').replace(/[^a-zA-Z0-9_-]/g, '-');

    return `${normalizedDate}__${safeTime}__${safeChannel}__${safeSuffix}`;
}

function programAnchorId(dateStr, program) {
    const id = makeProgramId(dateStr, program.time, program.channel, 'p');
    return `prog-${cssSafeId(id)}`;
}

// =====================================================
// Chargement des données
// =====================================================

async function loadIndex(options = {}) {
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
            return false;
        }

        const yearKeys = Object.keys(state.index.years).filter(year => /^\d{4}$/.test(String(year)));

        if (yearKeys.length === 0) {
            showNoData('data/index.json ne contient encore aucune année. Lance le workflow de scraping puis generate_index_only.');
            return false;
        }

        if (options.display !== false) {
            displayYears();
        }

        return true;
    } catch (error) {
        console.error('Erreur loadIndex:', error);
        showNoData(error.message || 'Erreur inconnue lors du chargement des données.');
        return false;
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

    const programsGroups = document.getElementById('programs-groups');

    if (programsGroups) {
        programsGroups.innerHTML = '';
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
                        <span class="year-info">${totalPrograms} programmes archivés</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

// =====================================================
// Sélection d’une année
// =====================================================

async function selectYear(year, options = {}) {
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

            if (options.display !== false) {
                displayYears();
            }

            return false;
        }

        if (options.display !== false) {
            displayDates(year);
        }

        return true;
    } catch (error) {
        console.error('Erreur selectYear:', error);
        showToast(`❌ ${error.message}`);

        if (options.display !== false) {
            displayYears();
        }

        return false;
    } finally {
        showLoading(false);
    }
}

// =====================================================
// Vue dates / journées disponibles
// =====================================================

function displayDates(year) {
    const container = document.getElementById('years-container');

    if (!container) {
        console.error('Élément #years-container introuvable');
        return;
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
                        <span class="date-display">${escapeHtml(formatDateLabel(date))}</span>
                        <span class="date-info">${programCount} programmes</span>
                        <span class="date-source">${escapeHtml(source)}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

// =====================================================
// Sélection d’une date -> ouverture vue Journée
// =====================================================

function selectDate(date) {
    const normalizedDate = normalizeDate(date) || date;

    if (!state.yearData || !state.yearData.dates) {
        showToast('❌ Aucune donnée d’année chargée');
        return false;
    }

    const dateData =
        state.yearData.dates[normalizedDate] ||
        state.yearData.dates[date];

    if (!dateData) {
        showToast('❌ Cette date n’est pas disponible');
        return false;
    }

    state.selectedDate = normalizedDate;
    state.filters = {
        query: '',
        channel: 'all',
        showSegments: true
    };

    let rawPrograms = [];

    if (Array.isArray(dateData.programs) && dateData.programs.length > 0) {
        rawPrograms = dateData.programs;
    } else if (dateData.channels && typeof dateData.channels === 'object') {
        rawPrograms = flattenChannels(dateData.channels);
    }

    state.currentPrograms = dedupePrograms(rawPrograms);

    openDayView(dateData);

    return true;
}

function openDayView(dateData) {
    const browseList = document.getElementById('browse-list');
    const dayPanel = document.getElementById('day-panel');

    if (!browseList || !dayPanel) {
        console.error('Éléments browse-list / day-panel introuvables');
        return;
    }

    state.dayOpen = true;
    browseList.hidden = true;
    dayPanel.hidden = false;

    renderDay(dateData);
    setStoredLastDay(state.selectedYear, state.selectedDate);
    updatePlaylistReturnBar();

    window.scrollTo({ top: 0, behavior: 'auto' });
}

function closeDayView() {
    const browseList = document.getElementById('browse-list');
    const dayPanel = document.getElementById('day-panel');

    if (!browseList || !dayPanel) {
        return;
    }

    state.dayOpen = false;
    state.selectedDate = null;
    clearStoredLastDay();

    dayPanel.hidden = true;
    browseList.hidden = false;

    updatePlaylistReturnBar();

    if (state.selectedYear && state.yearData) {
        displayDates(state.selectedYear);
    } else {
        displayYears();
    }

    window.scrollTo({ top: 0, behavior: 'auto' });
}

function reopenDayView() {
    if (!state.dayOpen || !state.yearData || !state.selectedDate) {
        return false;
    }

    const dateData = state.yearData.dates[state.selectedDate];

    if (!dateData) {
        return false;
    }

    const browseList = document.getElementById('browse-list');
    const dayPanel = document.getElementById('day-panel');

    if (!browseList || !dayPanel) {
        return false;
    }

    browseList.hidden = true;
    dayPanel.hidden = false;

    renderDay(dateData);
    updatePlaylistReturnBar();

    return true;
}

// =====================================================
// Rendu de la vue Journée
// =====================================================

function renderDay(dateData) {
    const dayTitle = document.getElementById('day-title');
    const dayMeta = document.getElementById('day-meta');
    const daySource = document.getElementById('day-source');
    const searchInput = document.getElementById('program-search');
    const channelFilter = document.getElementById('channel-filter');
    const showSegmentsCheckbox = document.getElementById('show-segments');
    const summaryDetails = document.getElementById('summary-details');

    const programs = state.currentPrograms;

    if (dayTitle) {
        dayTitle.textContent = formatDateLabel(dateData.date || state.selectedDate);
    }

    if (dayMeta) {
        dayMeta.textContent = `${programs.length} programmes`;
    }

    if (daySource) {
        daySource.textContent = dateData.source || 'source inconnue';
    }

    if (searchInput) {
        searchInput.value = state.filters.query;
    }

    if (showSegmentsCheckbox) {
        showSegmentsCheckbox.checked = state.filters.showSegments;
    }

    const channels = [...new Set(programs.map(p => p.channel || 'Autres'))]
        .sort((a, b) => channelRank(a) - channelRank(b));

    if (channelFilter) {
        channelFilter.innerHTML = `
            <option value="all"${state.filters.channel === 'all' ? ' selected' : ''}>
                Toutes les chaînes
            </option>
            ${channels.map(channel => `
                <option value="${escapeHtml(channel)}"${state.filters.channel === channel ? ' selected' : ''}>
                    ${escapeHtml(channel)}
                </option>
            `).join('')}
        `;
    }

    renderSummary(programs, summaryDetails);
    renderTimeline(programs);
    applyFilters();
}

function setupDayToolbarListeners() {
    const dayPanel = document.getElementById('day-panel');
    const searchInput = document.getElementById('program-search');
    const channelFilter = document.getElementById('channel-filter');
    const showSegmentsCheckbox = document.getElementById('show-segments');
    const expandAll = document.getElementById('expand-all');
    const collapseAll = document.getElementById('collapse-all');

    if (searchInput) {
        searchInput.addEventListener('input', event => {
            state.filters.query = event.target.value;
            applyFilters();
        });
    }

    if (channelFilter) {
        channelFilter.addEventListener('change', event => {
            state.filters.channel = event.target.value;
            applyFilters();
        });
    }

    if (showSegmentsCheckbox) {
        showSegmentsCheckbox.addEventListener('change', event => {
            state.filters.showSegments = event.target.checked;
            applyFilters();
        });
    }

    if (expandAll) {
        expandAll.addEventListener('click', () => {
            document.querySelectorAll('#programs-groups .channel-block')
                .forEach(block => setChannelBlockCollapsed(block, false));
        });
    }

    if (collapseAll) {
        collapseAll.addEventListener('click', () => {
            document.querySelectorAll('#programs-groups .channel-block')
                .forEach(block => setChannelBlockCollapsed(block, true));
        });
    }

    if (dayPanel) {
        dayPanel.addEventListener('click', handleDayClick);
    }
}

function handleDayClick(event) {
    const backBtn = event.target.closest('#day-back-btn');
    if (backBtn) {
        closeDayView();
        return;
    }

    const videoBtn = event.target.closest('.video-search-btn');
    if (videoBtn) {
        openVideoPanel(videoBtn.dataset.videoId);
        return;
    }

    const channelHeader = event.target.closest('.channel-header');
    if (channelHeader) {
        const block = channelHeader.closest('.channel-block');

        if (block) {
            const isCollapsed = !block.classList.contains('collapsed');
            setChannelBlockCollapsed(block, isCollapsed);
        }

        return;
    }

    const jumpTarget = event.target.closest('[data-target-anchor]');
    if (jumpTarget) {
        jumpToProgram(jumpTarget.dataset.targetAnchor);
        return;
    }

    const addButton = event.target.closest('.add-to-playlist-btn');
    if (addButton) {
        addToPlaylist(addButton.dataset.programId);
    }
}

function setChannelBlockCollapsed(block, collapsed) {
    if (!block) {
        return;
    }

    if (collapsed) {
        block.classList.add('collapsed');
    } else {
        block.classList.remove('collapsed');
    }

    const header = block.querySelector('.channel-header');
    const toggle = block.querySelector('.channel-toggle');

    if (header) {
        header.setAttribute('aria-expanded', String(!collapsed));
    }

    if (toggle) {
        toggle.textContent = collapsed ? '+' : '−';
    }
}

function jumpToProgram(anchorId) {
    let targetEl = document.getElementById(anchorId);

    if (!targetEl) {
        state.filters.query = '';
        state.filters.channel = 'all';

        const searchInput = document.getElementById('program-search');
        const channelFilter = document.getElementById('channel-filter');

        if (searchInput) {
            searchInput.value = '';
        }

        if (channelFilter) {
            channelFilter.value = 'all';
        }

        applyFilters();
        targetEl = document.getElementById(anchorId);
    }

    if (!targetEl) {
        showToast('❌ Programme introuvable dans la grille affichée');
        return;
    }

    const block = targetEl.closest('.channel-block');

    if (block && block.classList.contains('collapsed')) {
        setChannelBlockCollapsed(block, false);
    }

    targetEl.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });

    targetEl.classList.add('flash-highlight');

    setTimeout(() => {
        targetEl.classList.remove('flash-highlight');
    }, 1200);
}

// =====================================================
// Sommaire du soir dans un tiroir
// =====================================================

function renderSummary(programs, detailsElement) {
    const container = document.getElementById('day-summary');

    if (!container) {
        return;
    }

    const evening = programs.filter(program => {
        const time = program.time || '';
        return time >= '20:30';
    });

    if (evening.length === 0) {
        if (detailsElement) {
            detailsElement.hidden = true;
        }

        container.innerHTML = '';
        return;
    }

    if (detailsElement) {
        detailsElement.hidden = false;
    }

    container.innerHTML = `
        <div class="summary-grid">
            ${evening.map(program => {
                const anchorId = programAnchorId(state.selectedDate, program);

                return `
                    <button class="summary-chip" type="button" data-target-anchor="${escapeHtml(anchorId)}">
                        <span class="summary-time">${escapeHtml(program.time || '--:--')}</span>
                        <span class="summary-channel">${escapeHtml(program.channel || 'Autres')}</span>
                        <span class="summary-title">${escapeHtml(truncateText(program.title || 'Programme', 55))}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

// =====================================================
// Frise chronologique
// =====================================================

function renderTimeline(programs) {
    const container = document.getElementById('day-timeline');

    if (!container) {
        return;
    }

    if (!programs || programs.length === 0) {
        container.innerHTML = `
            <div class="empty-state compact">
                <p>Aucune frise disponible.</p>
            </div>
        `;
        return;
    }

    const groups = groupProgramsByChannel(programs);

    container.innerHTML = `
        <div class="timeline-inner">
            ${groups.map(group => `
                <div class="timeline-row">
                    <div class="timeline-channel">${escapeHtml(group.channel)}</div>
                    <div class="timeline-track">
                        ${group.programs.map(program => {
                            const anchorId = programAnchorId(state.selectedDate, program);
                            const shortTitle = truncateText(program.title || 'Programme', 34);

                            return `
                                <button
                                    class="timeline-chip"
                                    type="button"
                                    data-target-anchor="${escapeHtml(anchorId)}"
                                    title="${escapeHtml(`${program.time || '--:--'} ${program.title || ''}`)}"
                                >
                                    <span class="timeline-chip-time">${escapeHtml(program.time || '--:--')}</span>
                                    <span class="timeline-chip-title">${escapeHtml(shortTitle)}</span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// =====================================================
// Filtres + rendu des groupes chaîne
// =====================================================

function applyFilters() {
    const query = normalizeText(state.filters.query);
    const channel = state.filters.channel;

    const filtered = state.currentPrograms.filter(program => {
        const matchesChannel = channel === 'all' || program.channel === channel;

        if (!matchesChannel) {
            return false;
        }

        if (!query) {
            return true;
        }

        const haystack = normalizeText([
            program.title,
            program.description,
            program.channel,
            program.time,
            ...(program.segments || []).map(seg => seg.title)
        ].join(' '));

        return haystack.includes(query);
    });

    const filteredCount = document.getElementById('filtered-count');

    if (filteredCount) {
        filteredCount.textContent = String(filtered.length);
    }

    renderTimeline(filtered);
    renderGroups(filtered);
}

function renderGroups(programs) {
    const container = document.getElementById('programs-groups');

    if (!container) {
        console.error('Élément #programs-groups introuvable');
        return;
    }

    state.currentProgramMap.clear();

    if (!programs || programs.length === 0) {
        container.innerHTML = `
            <div class="empty-state compact">
                <h3>Aucun programme trouvé</h3>
                <p>Modifiez la recherche ou choisissez une autre chaîne.</p>
            </div>
        `;
        return;
    }

    const groups = groupProgramsByChannel(programs);

    container.innerHTML = groups.map(group => {
        const channel = group.channel;
        const channelPrograms = group.programs;
        const collapsed = channelPrograms.length > 12;

        return `
            <section class="channel-block${collapsed ? ' collapsed' : ''}" data-channel="${escapeHtml(channel)}">
                <button class="channel-header" type="button" aria-expanded="${!collapsed}">
                    <span class="channel-badge">${escapeHtml(channel)}</span>
                    <span class="channel-meta">${channelPrograms.length} programmes</span>
                    <span class="channel-toggle">${collapsed ? '+' : '−'}</span>
                </button>

                <div class="channel-programs">
                    ${channelPrograms.map(program => renderProgramRow(program)).join('')}
                </div>
            </section>
        `;
    }).join('');
}

function renderProgramRow(program) {
    const date = state.selectedDate;
    const parentId = makeProgramId(date, program.time, program.channel, 'p');
    const anchorId = programAnchorId(date, program);

    state.currentProgramMap.set(parentId, {
        id: parentId,
        date,
        time: program.time || '',
        channel: program.channel || '',
        title: program.title || '',
        description: program.description || '',
        parentTitle: '',
        type: 'program'
    });

    const segments = state.filters.showSegments && Array.isArray(program.segments)
        ? program.segments
        : [];

    const segmentsHtml = segments.length > 0 ? `
        <details class="segments">
            <summary>${segments.length} extrait${segments.length > 1 ? 's' : ''} détecté${segments.length > 1 ? 's' : ''}</summary>
            <ul class="segments-list">
                ${segments.map(segment => {
                    const segmentId = makeProgramId(date, program.time, program.channel, `s${segment.index}`);

                    state.currentProgramMap.set(segmentId, {
                        id: segmentId,
                        date,
                        time: program.time || '',
                        channel: program.channel || '',
                        title: segment.title || '',
                        description: segment.raw || '',
                        parentTitle: program.title || '',
                        type: 'segment'
                    });

                    return `
                        <li class="segment-item">
                            <div class="segment-content">
                                <div class="segment-title">${escapeHtml(segment.title || 'Extrait')}</div>
                                ${segment.raw && segment.raw !== segment.title ? `
                                    <div class="segment-raw">${escapeHtml(segment.raw)}</div>
                                ` : ''}
                            </div>
                            <div class="segment-actions">
                                <button
                                    class="video-search-btn segment-video-btn"
                                    type="button"
                                    data-video-id="${escapeHtml(segmentId)}"
                                    aria-label="Rechercher des vidéos de ${escapeHtml(segment.title || 'extrait')}"
                                    title="Rechercher des vidéos"
                                >
                                    ▶️
                                </button>
                                <button
                                    class="add-to-playlist-btn segment-add-btn"
                                    type="button"
                                    data-program-id="${escapeHtml(segmentId)}"
                                    aria-label="Ajouter ${escapeHtml(segment.title || 'extrait')} à la playlist"
                                    title="Ajouter à la playlist"
                                >
                                    ➕
                                </button>
                            </div>
                        </li>
                    `;
                }).join('')}
            </ul>
        </details>
    ` : '';

    return `
        <article class="program-row" id="${escapeHtml(anchorId)}">
            <div class="program-time">${escapeHtml(program.time || '--:--')}</div>

            <div class="program-content">
                <div class="program-title">${escapeHtml(program.title || 'Titre inconnu')}</div>

                ${program.description ? `
                    <p class="program-description">${escapeHtml(program.description)}</p>
                ` : ''}

                ${segmentsHtml}
            </div>

            <div class="program-actions">
                <button
                    class="video-search-btn"
                    type="button"
                    data-video-id="${escapeHtml(parentId)}"
                    aria-label="Rechercher des vidéos de ${escapeHtml(program.title || 'programme')}"
                    title="Rechercher des vidéos"
                >
                    ▶️
                </button>
                <button
                    class="add-to-playlist-btn"
                    type="button"
                    data-program-id="${escapeHtml(parentId)}"
                    aria-label="Ajouter ${escapeHtml(program.title || 'programme')} à la playlist"
                    title="Ajouter à la playlist"
                >
                    ➕
                </button>
            </div>
        </article>
    `;
}

// =====================================================
// Panel de recherche vidéo
// =====================================================

function buildVideoSearchQuery(program) {
    let query = program.title || '';
    query = String(query).trim();
    return query;
}

function buildVideoLinks(program) {
    const query = buildVideoSearchQuery(program);
    const encoded = encodeURIComponent(query);
    const year = program.date ? program.date.split('-')[2] : '';
    const encodedWithYear = encodeURIComponent(year ? `${query} ${year}` : query);

    return [
        {
            name: 'INA',
            icon: '🎬',
            className: 'ina',
            url: `https://www.ina.fr/recherche?q=${encoded}`,
            description: 'Archives TV françaises'
        },
        {
            name: 'YouTube',
            icon: '▶️',
            className: 'youtube',
            url: `https://www.youtube.com/results?search_query=${encodedWithYear}`,
            description: 'Vidéos et extraits'
        },
        {
            name: 'Dailymotion',
            icon: '📺',
            className: 'dailymotion',
            url: `https://www.dailymotion.com/search/${encoded}`,
            description: 'Vidéos et génériques'
        },
        {
            name: 'Odysee',
            icon: '🌐',
            className: 'odysee',
            url: `https://odysee.com/$/search?q=${encoded}`,
            description: 'Plateforme libre'
        }
    ];
}

function openVideoPanel(programId) {
    const program = state.currentProgramMap.get(programId);

    if (!program) {
        showToast('❌ Programme introuvable');
        return;
    }

    const overlay = document.getElementById('video-panel-overlay');
    const titleEl = document.getElementById('video-panel-title');
    const metaEl = document.getElementById('video-panel-meta');
    const linksContainer = document.getElementById('video-panel-links');

    if (!overlay || !titleEl || !metaEl || !linksContainer) {
        console.error('Éléments du panel vidéo introuvables');
        return;
    }

    titleEl.textContent = program.title || 'Programme';

    const metaParts = [];
    if (program.date) {
        metaParts.push(formatShortDate(program.date));
    }
    if (program.time) {
        metaParts.push(program.time);
    }
    if (program.channel) {
        metaParts.push(program.channel);
    }
    if (program.parentTitle && program.type === 'segment') {
        metaParts.push(`dans ${program.parentTitle}`);
    }
    metaEl.textContent = metaParts.join(' · ');

    const links = buildVideoLinks(program);

    linksContainer.innerHTML = links.map(link => `
        <a
            href="${escapeHtml(link.url)}"
            target="_blank"
            rel="noopener noreferrer"
            class="video-link ${escapeHtml(link.className)}"
        >
            <span class="video-link-icon">${link.icon}</span>
            <span class="video-link-content">
                <span class="video-link-name">${escapeHtml(link.name)}</span>
                <span class="video-link-desc">${escapeHtml(link.description)}</span>
            </span>
            <span class="video-link-arrow">↗</span>
        </a>
    `).join('');

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
}

function closeVideoPanel() {
    const overlay = document.getElementById('video-panel-overlay');
    if (overlay) {
        overlay.hidden = true;
    }
    document.body.style.overflow = '';
}

function setupVideoPanelListeners() {
    const overlay = document.getElementById('video-panel-overlay');

    if (overlay) {
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closeVideoPanel();
            }
        });
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            const overlay = document.getElementById('video-panel-overlay');
            if (overlay && !overlay.hidden) {
                closeVideoPanel();
            }
        }
    });
}

// =====================================================
// Playlist
// =====================================================

function addToPlaylist(programId) {
    const program = state.currentProgramMap.get(programId);

    if (!program) {
        showToast('❌ Programme introuvable');
        return;
    }

    if (state.playlist.some(item => item.id === programId)) {
        showToast('⚠️ Cet élément est déjà dans la playlist');
        return;
    }

    state.playlist.push({
        ...program,
        addedAt: new Date().toISOString()
    });

    savePlaylist();
    updatePlaylistDisplay();

    const label = program.type === 'segment'
        ? `extrait "${program.title}"`
        : `"${program.title}"`;

    showToast(`✅ ${label} ajouté à la playlist`);
}

function removeFromPlaylist(programId) {
    state.playlist = state.playlist.filter(program => program.id !== programId);
    savePlaylist();
    updatePlaylistDisplay();
    showToast('🗑️ Élément retiré de la playlist');
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

function setupPlaylistListeners() {
    const container = document.getElementById('playlist-container');

    if (!container) {
        return;
    }

    container.addEventListener('click', event => {
        const removeBtn = event.target.closest('[data-remove-id]');

        if (removeBtn) {
            removeFromPlaylist(removeBtn.dataset.removeId);
        }
    });
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
                <small>Ajoutez des programmes ou des extraits depuis la vue Journée</small>
            </div>
        `;
        updatePlaylistReturnBar();
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

        return timeSortKey(a.time) - timeSortKey(b.time);
    });

    container.innerHTML = sortedPlaylist.map(program => `
        <div class="playlist-item">
            <div class="playlist-item-info">
                <div class="playlist-date">
                    📅 ${escapeHtml(formatDateLabel(program.date))}
                </div>

                <div class="program-time-inline">
                    🕐 ${escapeHtml(program.time || '--:--')}
                    ${program.channel ? ` · 📺 ${escapeHtml(program.channel)}` : ''}
                    ${program.type === 'segment' ? ' · <span class="badge-segment">extrait</span>' : ''}
                </div>

                ${program.parentTitle ? `
                    <div class="playlist-parent">
                        Dans : ${escapeHtml(program.parentTitle)}
                    </div>
                ` : ''}

                <div class="program-title">🎬 ${escapeHtml(program.title || 'Titre inconnu')}</div>

                ${program.description ? `
                    <p class="program-description">${escapeHtml(program.description)}</p>
                ` : ''}
            </div>

            <div class="playlist-item-actions">
                <button
                    class="video-search-btn playlist-video-btn"
                    type="button"
                    data-video-id="${escapeHtml(program.id)}"
                    title="Rechercher des vidéos"
                >
                    ▶️
                </button>
                <button class="remove-btn" type="button" data-remove-id="${escapeHtml(program.id)}">
                    ✕
                </button>
            </div>
        </div>
    `).join('');

    updatePlaylistReturnBar();
}

function updatePlaylistReturnBar() {
    const bar = document.getElementById('playlist-day-return');
    const label = document.getElementById('playlist-day-label');

    if (!bar) {
        return;
    }

    if (state.dayOpen && state.selectedDate) {
        bar.hidden = false;

        if (label) {
            label.textContent = formatDateLabel(state.selectedDate);
        }
    } else {
        bar.hidden = true;
    }
}

function returnToDayFromPlaylist() {
    setActiveView('browse');

    if (!reopenDayView()) {
        if (state.selectedYear && state.yearData) {
            displayDates(state.selectedYear);
        } else {
            displayYears();
        }
    }
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
    const exportFormat = document.getElementById('export-format');
    const exportParent = document.getElementById('export-parent');

    if (!exportSection || !exportText) {
        showToast('❌ Élément d’export introuvable');
        return;
    }

    const format = exportFormat ? exportFormat.value : 'title_channel_date';
    const includeParent = exportParent ? exportParent.checked : true;

    const sortedPlaylist = [...state.playlist].sort((a, b) => {
        const keyA = dateSortKey(a.date);
        const keyB = dateSortKey(b.date);

        for (let i = 0; i < 3; i++) {
            if (keyA[i] !== keyB[i]) {
                return keyA[i] - keyB[i];
            }
        }

        return timeSortKey(a.time) - timeSortKey(b.time);
    });

    const exportData = sortedPlaylist
        .map(program => formatExportLine(program, format, includeParent))
        .join('\n');

    exportText.value = exportData;
    exportSection.style.display = 'block';
    exportSection.scrollIntoView({ behavior: 'smooth' });

    showToast('✅ Playlist prête à être copiée');
}

function formatExportLine(program, format, includeParent) {
    let title = program.title || 'Programme inconnu';

    if (program.type === 'segment' && includeParent && program.parentTitle) {
        title = `${program.parentTitle} : ${title}`;
    }

    const channel = program.channel || '';
    const date = formatShortDate(program.date);
    const time = program.time || '';

    switch (format) {
        case 'title':
            return title;

        case 'title_channel':
            return channel ? `${title} (${channel})` : title;

        case 'title_date':
            return `${title} - ${date}`;

        case 'title_channel_date':
            return channel ? `${title} (${channel}) - ${date}` : `${title} - ${date}`;

        case 'full':
            return channel
                ? `${title} (${channel}) - ${time} - ${date}`
                : `${title} - ${time} - ${date}`;

        default:
            return channel ? `${title} (${channel}) - ${date}` : `${title} - ${date}`;
    }
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
            setActiveView(button.dataset.view);
        });
    });
}

function setActiveView(view) {
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

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
            loadIndex({ display: false }).then(ok => {
                if (!ok) {
                    return;
                }

                if (!reopenDayView()) {
                    displayYears();
                }
            });
        } else {
            if (!reopenDayView()) {
                if (state.selectedYear && state.yearData) {
                    displayDates(state.selectedYear);
                } else {
                    displayYears();
                }
            }
        }
    }

    if (view === 'playlist') {
        updatePlaylistReturnBar();
    }
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
// Exposition globale
// =====================================================

window.selectYear = selectYear;
window.selectDate = selectDate;
window.displayYears = displayYears;
window.displayDates = displayDates;
window.closeDayView = closeDayView;
window.returnToDayFromPlaylist = returnToDayFromPlaylist;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.exportPlaylist = exportPlaylist;
window.copyToClipboard = copyToClipboard;
window.openVideoPanel = openVideoPanel;
window.closeVideoPanel = closeVideoPanel;