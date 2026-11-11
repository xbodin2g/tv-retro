// =====================================================
// TV RÉTRO - Magazine + Journée + Segments + Vidéo + Décennies
// + Recherche avancée (index par année, cache, résultats groupés)
// + "Ça s'est passé…" (suggestions contextuelles)
// =====================================================

const state = {
    currentView: 'browse',
    selectedDecade: null,
    selectedYear: null,
    selectedDate: null,
    playlist: loadStoredPlaylist(),
    index: null,
    yearData: null,

    dayOpen: false,
    currentPrograms: [],
    currentProgramMap: new Map(),

    filters: { query: '', channel: 'all', showSegments: true },

    suggestions: [],

    search: {
        meta: null,
        metaLoaded: false,
        filtersReady: false,
        cache: {},
        loadedYears: new Set(),
        loading: false,
        query: '',
        genre: 'all',
        channel: 'all',
        period: 'all',
        year: 'all',
        evening: false,
        sort: 'count',
        groups: [],
        totalMatches: 0,
        expanded: new Set()
    }
};

let toastTimeout = null;
let videoPanelToken = 0;
let searchDebounce = null;
let searchRunToken = 0;

const LAST_DAY_STORAGE_KEY = 'retroLastDay';
const NIGHT_CUTOFF_HOUR = 5;
const HIDDEN_GENRES = ['météo'];

const CHANNEL_ORDER = [
    'ORTF 1', 'ORTF 2', 'ORTF 3', 'TF1', 'Antenne 2', 'France 2',
    'FR3', 'France 3', 'Canal+', 'TV6', 'M6', 'La Cinq', 'La Sept',
    'Arte', 'La Cinquième', 'France 5'
];

const CHANNEL_ALIASES = {
    'OR1': 'ORTF 1', 'OR2': 'ORTF 2', 'OR3': 'ORTF 3',
    'ORTF 1': 'ORTF 1', 'ORTF 2': 'ORTF 2', 'ORTF 3': 'ORTF 3',
    'ORTF1': 'ORTF 1', 'ORTF2': 'ORTF 2', 'ORTF3': 'ORTF 3',
    'TF1': 'TF1', 'A2': 'Antenne 2', 'ANTENNE 2': 'Antenne 2',
    'F2': 'France 2', 'FRANCE 2': 'France 2',
    'FR3': 'FR3', 'FR 3': 'FR3', 'F3': 'France 3', 'FRANCE 3': 'France 3',
    'C+': 'Canal+', 'CANAL+': 'Canal+', 'CANAL': 'Canal+',
    'TV6': 'TV6', 'L5': 'La Cinq', 'LA5': 'La Cinq', 'LA 5': 'La Cinq',
    'LA CINQ': 'La Cinq', 'LA CINQUIEME': 'La Cinquième', 'LA CINQUIÈME': 'La Cinquième',
    'CINQ': 'La Cinq', 'M6': 'M6',
    'LA SEPT': 'La Sept', 'L7': 'La Sept', 'LA7': 'La Sept', 'LA 7': 'La Sept',
    'ARTE': 'Arte', 'FRANCE 5': 'France 5'
};

// =====================================================
// Initialisation
// =====================================================

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    injectSearchUI();
    setupNavigation();
    setupDayToolbarListeners();
    setupPlaylistListeners();
    setupVideoPanelListeners();
    setupSearchListeners();
    setupYearsClickListener();
    updatePlaylistDisplay();
    registerServiceWorker();

    const loaded = await loadIndex({ display: false });
    if (!loaded) {
        return;
    }

    buildSuggestions();

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
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(p => p && typeof p === 'object')
            .filter(p => p.id && p.date && p.title)
            .map(p => ({
                id: String(p.id),
                date: String(p.date),
                time: p.time ? String(p.time) : '',
                title: p.title ? String(p.title) : '',
                channel: p.channel ? String(p.channel) : '',
                description: p.description ? String(p.description) : '',
                parentTitle: p.parentTitle ? String(p.parentTitle) : '',
                type: p.type ? String(p.type) : 'program',
                addedAt: p.addedAt || new Date().toISOString()
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
// Storage dernière journée
// =====================================================

function setStoredLastDay(year, date) {
    try {
        localStorage.setItem(LAST_DAY_STORAGE_KEY, JSON.stringify({
            year, date, updatedAt: new Date().toISOString()
        }));
    } catch (error) {
        console.error('Erreur sauvegarde dernière journée:', error);
    }
}

function getStoredLastDay() {
    try {
        const raw = localStorage.getItem(LAST_DAY_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.year || !parsed.date) return null;
        return { year: String(parsed.year), date: String(parsed.date) };
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
    if (!saved || !saved.year || !saved.date) return false;
    if (!state.index || !state.index.years || !state.index.years[saved.year]) {
        clearStoredLastDay();
        return false;
    }
    try {
        const yearOk = await selectYear(saved.year, { display: false });
        if (!yearOk) return false;
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
    if (!value) return '';
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
    if (!dateStr) return null;
    const value = String(dateStr).trim();
    let parts;
    if (value.includes('-')) parts = value.split('-');
    else if (value.includes('/')) parts = value.split('/');
    else return null;
    if (parts.length !== 3) return null;

    let day, month, year;
    if (parts[0].length === 4) { year = parts[0]; month = parts[1]; day = parts[2]; }
    else { day = parts[0]; month = parts[1]; year = parts[2]; }

    day = String(day).padStart(2, '0');
    month = String(month).padStart(2, '0');
    year = String(year);

    const nd = Number(day), nm = Number(month), ny = Number(year);
    if (Number.isNaN(nd) || Number.isNaN(nm) || Number.isNaN(ny)) return null;

    const test = new Date(ny, nm - 1, nd);
    if (test.getFullYear() !== ny || test.getMonth() !== nm - 1 || test.getDate() !== nd) return null;

    return `${day}-${month}-${year}`;
}

function dateToDate(dateStr) {
    const n = normalizeDate(dateStr);
    if (!n) return null;
    const [d, m, y] = n.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatDateLabel(dateStr) {
    const normalized = normalizeDate(dateStr);
    if (!normalized) return dateStr || '';
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
    if (!normalized) return dateStr || '';
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
        const ka = dateSortKey(a), kb = dateSortKey(b);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return 0;
    });
}

function normalizeTime(value) {
    if (!value) return '';
    const text = String(value).trim();
    const match = text.match(/^(\d{1,2})[:h.](\d{2})$/i);
    if (!match) return '';
    const hour = Number(match[1]), minute = Number(match[2]);
    if (hour > 23 || minute > 59) return '';
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function timeSortKey(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 9999;
    const parts = timeStr.split(':');
    const hour = Number(parts[0]), minute = Number(parts[1]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return 9999;
    if (hour >= NIGHT_CUTOFF_HOUR) return (hour - NIGHT_CUTOFF_HOUR) * 60 + minute;
    return (hour + 24 - NIGHT_CUTOFF_HOUR) * 60 + minute;
}

function canonicalChannel(value) {
    const raw = String(value || '').trim();
    if (!raw) return 'Autres';
    const upper = raw.toUpperCase();
    if (CHANNEL_ALIASES[upper]) return CHANNEL_ALIASES[upper];
    const normalizedUpper = normalizeText(raw).toUpperCase();
    if (CHANNEL_ALIASES[normalizedUpper]) return CHANNEL_ALIASES[normalizedUpper];
    const compact = normalizedUpper.replace(/\s+/g, '');
    if (CHANNEL_ALIASES[compact]) return CHANNEL_ALIASES[compact];
    return raw;
}

function channelRank(channel) {
    const index = CHANNEL_ORDER.indexOf(channel);
    return index === -1 ? CHANNEL_ORDER.length + 1 : index;
}

function slugChannel(channel) {
    return normalizeText(channel).replace(/\s+/g, '-').replace(/^-|-$/g, '') || 'autre';
}

function cleanTitle(value) {
    let title = String(value || '').trim().replace(/\s+/g, ' ');
    const parts = title.split(/\s+[-–—]\s+/);
    if (parts.length === 2 && normalizeText(parts[0]) === normalizeText(parts[1])) {
        return parts[0].trim();
    }
    return title;
}

function truncateText(value, maxLength) {
    const text = String(value || '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 1)}…`;
}

// =====================================================
// Déduplication / regroupement
// =====================================================

function programKey(program) {
    const time = program.time || '';
    const channel = program.channel || 'Autres';
    const title = program.title || '';
    if (time) return `${time}|${channel}`;
    return `${normalizeText(title)}|${channel}`;
}

function dedupePrograms(programs) {
    const map = new Map();
    for (const rawProgram of programs) {
        if (!rawProgram || typeof rawProgram !== 'object') continue;
        const time = normalizeTime(rawProgram.time);
        const channel = canonicalChannel(rawProgram.channel);
        const title = cleanTitle(rawProgram.title);
        const description = String(rawProgram.description || '').trim().replace(/\s+/g, ' ');
        const segments = Array.isArray(rawProgram.segments) ? rawProgram.segments : [];
        const program = { time, channel: channel || 'Autres', title: title || 'Programme non identifié', description, segments };
        const key = programKey(program);
        if (!map.has(key)) { map.set(key, program); continue; }
        const existing = map.get(key);
        if (program.title.length > existing.title.length) existing.title = program.title;
        if (program.description.length > existing.description.length) existing.description = program.description;
        if (!existing.time && program.time) existing.time = program.time;
        if (!existing.segments.length && program.segments.length) existing.segments = program.segments;
    }
    return [...map.values()].sort((a, b) => {
        const ra = channelRank(a.channel), rb = channelRank(b.channel);
        if (ra !== rb) return ra - rb;
        const sa = timeSortKey(a.time), sb = timeSortKey(b.time);
        if (sa !== sb) return sa - sb;
        return normalizeText(a.title).localeCompare(normalizeText(b.title));
    });
}

function flattenChannels(channels) {
    if (!channels || typeof channels !== 'object') return [];
    return Object.values(channels).flat().filter(Boolean);
}

function groupProgramsByChannel(programs) {
    const map = new Map();
    for (const program of programs) {
        const channel = program.channel || 'Autres';
        if (!map.has(channel)) map.set(channel, []);
        map.get(channel).push(program);
    }
    return [...map.entries()]
        .sort((a, b) => channelRank(a[0]) - channelRank(b[0]))
        .map(([channel, channelPrograms]) => ({
            channel,
            programs: [...channelPrograms].sort((a, b) => timeSortKey(a.time) - timeSortKey(b.time))
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
// Chargement index
// =====================================================

async function loadIndex(options = {}) {
    try {
        const base = document.baseURI || window.location.href;
        const baseUrl = new URL('data/index.json', base).href;
        const url = `${baseUrl}?t=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Impossible de charger data/index.json (HTTP ${response.status})`);
        const text = await response.text();
        if (!text.trim()) throw new Error('data/index.json est vide');
        state.index = JSON.parse(text);
        if (!state.index || typeof state.index !== 'object' || !state.index.years || typeof state.index.years !== 'object') {
            showNoData('Le fichier data/index.json est chargé, mais sa structure est invalide.');
            return false;
        }
        const yearKeys = Object.keys(state.index.years).filter(y => /^\d{4}$/.test(String(y)));
        if (yearKeys.length === 0) {
            showNoData('data/index.json ne contient encore aucune année. Lance le workflow de scraping puis generate_index_only.');
            return false;
        }
        if (options.display !== false) displayYears();
        return true;
    } catch (error) {
        console.error('Erreur loadIndex:', error);
        showNoData(error.message || 'Erreur inconnue lors du chargement des données.');
        return false;
    }
}

function showNoData(message = 'Lance d’abord le workflow GitHub Actions pour scraper les données.') {
    const container = document.getElementById('years-container');
    if (!container) return;
    container.innerHTML = `
        <div class="empty-state">
            <div class="retro-tv">📺</div>
            <h2>Aucune donnée disponible</h2>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    const pg = document.getElementById('programs-groups');
    if (pg) pg.innerHTML = '';
}

// =====================================================
// Vue années + décennies + suggestions
// =====================================================

function displayYears() {
    const container = document.getElementById('years-container');
    if (!container) return;
    if (!state.index || !state.index.years) { showNoData(); return; }

    const years = Object.keys(state.index.years)
        .filter(y => /^\d{4}$/.test(String(y)))
        .sort((a, b) => Number(a) - Number(b));
    if (years.length === 0) { showNoData('Aucune année valide trouvée.'); return; }

    const decades = {};
    years.forEach(year => {
        const decade = Math.floor(Number(year) / 10) * 10;
        (decades[decade] = decades[decade] || []).push(year);
    });
    const decadeKeys = Object.keys(decades).map(Number).sort((a, b) => a - b);
    if (!state.selectedDecade || !decades[state.selectedDecade]) {
        state.selectedDecade = String(decadeKeys[0]);
    }
    const selectedDecadeNum = Number(state.selectedDecade);

    const decadeTabs = decadeKeys.map(decade => {
        const label = `${String(decade).slice(2)}s`;
        const count = decades[decade].length;
        const active = decade === selectedDecadeNum;
        return `
            <button class="decade-tab${active ? ' active' : ''}" type="button" onclick="selectDecade('${decade}')">
                <span class="decade-label">${label}</span>
                <span class="decade-count">${count} an${count > 1 ? 's' : ''}</span>
            </button>
        `;
    }).join('');

    const decadeYears = decades[selectedDecadeNum] || [];
    const yearsHtml = decadeYears.map(year => {
        const yearData = state.index.years[year] || {};
        const totalPrograms = Number(yearData.total_programs || 0);
        return `
            <button class="year-btn" onclick="selectYear('${escapeHtml(year)}')">
                <span class="year-number">${escapeHtml(year)}</span>
                <span class="year-info">${totalPrograms} programmes archivés</span>
            </button>
        `;
    }).join('');

    container.innerHTML = `
        ${renderSuggestionsHTML()}
        <h2 class="years-title">📅 Choisissez une décennie puis une année</h2>
        <div class="decade-tabs">${decadeTabs}</div>
        <div class="years-grid">${yearsHtml}</div>
    `;
}

function selectDecade(decade) {
    state.selectedDecade = String(decade);
    displayYears();
}

function setupYearsClickListener() {
    const container = document.getElementById('years-container');
    if (!container) return;
    container.addEventListener('click', event => {
        const reshuffle = event.target.closest('#reshuffle-suggestions');
        if (reshuffle) { buildSuggestions(); displayYears(); return; }
        const card = event.target.closest('[data-open-day]');
        if (card) { openDay(card.dataset.openDay); }
    });
}

// =====================================================
// Sélection année
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
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Impossible de charger data/${year}.json (HTTP ${response.status})`);
        state.yearData = await response.json();
        if (!state.yearData || !state.yearData.dates) {
            showToast(`⚠️ Aucune journée disponible pour ${year}`);
            if (options.display !== false) displayYears();
            return false;
        }
        if (options.display !== false) displayDates(year);
        return true;
    } catch (error) {
        console.error('Erreur selectYear:', error);
        showToast(`❌ ${error.message}`);
        if (options.display !== false) displayYears();
        return false;
    } finally {
        showLoading(false);
    }
}

// =====================================================
// Vue dates
// =====================================================

function displayDates(year) {
    const container = document.getElementById('years-container');
    if (!container) return;
    if (!state.yearData || !state.yearData.dates) {
        container.innerHTML = `
            <div class="year-header">
                <button class="back-btn" onclick="displayYears()">← Retour aux années</button>
                <h2>📅 ${escapeHtml(year)}</h2>
            </div>
            <div class="empty-state"><h2>Aucune date disponible</h2></div>
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
            <div class="empty-state"><h2>Aucune date disponible</h2></div>
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
                const programCount = Number(dateData.programs_count || (Array.isArray(dateData.programs) ? dateData.programs.length : 0));
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
// Ouverture journée
// =====================================================

function selectDate(date) {
    const normalizedDate = normalizeDate(date) || date;
    if (!state.yearData || !state.yearData.dates) { showToast('❌ Aucune donnée d’année chargée'); return false; }
    const dateData = state.yearData.dates[normalizedDate] || state.yearData.dates[date];
    if (!dateData) { showToast('❌ Cette date n’est pas disponible'); return false; }
    state.selectedDate = normalizedDate;
    state.filters = { query: '', channel: 'all', showSegments: true };
    let rawPrograms = [];
    if (Array.isArray(dateData.programs) && dateData.programs.length > 0) rawPrograms = dateData.programs;
    else if (dateData.channels && typeof dateData.channels === 'object') rawPrograms = flattenChannels(dateData.channels);
    state.currentPrograms = dedupePrograms(rawPrograms);
    openDayView(dateData);
    return true;
}

function openDayView(dateData) {
    const browseList = document.getElementById('browse-list');
    const dayPanel = document.getElementById('day-panel');
    if (!browseList || !dayPanel) return;
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
    if (!browseList || !dayPanel) return;
    state.dayOpen = false;
    state.selectedDate = null;
    clearStoredLastDay();
    dayPanel.hidden = true;
    browseList.hidden = false;
    updatePlaylistReturnBar();
    if (state.selectedYear && state.yearData) displayDates(state.selectedYear);
    else displayYears();
    window.scrollTo({ top: 0, behavior: 'auto' });
}

function reopenDayView() {
    if (!state.dayOpen || !state.yearData || !state.selectedDate) return false;
    const dateData = state.yearData.dates[state.selectedDate];
    if (!dateData) return false;
    const browseList = document.getElementById('browse-list');
    const dayPanel = document.getElementById('day-panel');
    if (!browseList || !dayPanel) return false;
    browseList.hidden = true;
    dayPanel.hidden = false;
    renderDay(dateData);
    updatePlaylistReturnBar();
    return true;
}

// Ouvre une journée depuis n'importe où (recherche, suggestions)
async function openDay(date, time, channel) {
    const normalized = normalizeDate(date);
    if (!normalized) { showToast('❌ Date invalide'); return; }
    const year = normalized.split('-')[2];
    setActiveView('browse');
    const ok = await selectYear(year, { display: false });
    if (!ok) { showToast('❌ Année indisponible'); return; }
    const opened = selectDate(normalized);
    if (opened && time && channel) {
        const anchor = programAnchorId(normalized, { time: normalizeTime(time), channel: canonicalChannel(channel) });
        setTimeout(() => jumpToProgram(anchor), 200);
    }
}

// =====================================================
// Rendu journée
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

    if (dayTitle) dayTitle.textContent = formatDateLabel(dateData.date || state.selectedDate);
    if (dayMeta) dayMeta.textContent = `${programs.length} programmes`;
    if (daySource) daySource.textContent = dateData.source || 'source inconnue';
    if (searchInput) searchInput.value = state.filters.query;
    if (showSegmentsCheckbox) showSegmentsCheckbox.checked = state.filters.showSegments;

    const channels = [...new Set(programs.map(p => p.channel || 'Autres'))].sort((a, b) => channelRank(a) - channelRank(b));
    if (channelFilter) {
        channelFilter.innerHTML = `
            <option value="all"${state.filters.channel === 'all' ? ' selected' : ''}>Toutes les chaînes</option>
            ${channels.map(channel => `<option value="${escapeHtml(channel)}"${state.filters.channel === channel ? ' selected' : ''}>${escapeHtml(channel)}</option>`).join('')}
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

    if (searchInput) searchInput.addEventListener('input', e => { state.filters.query = e.target.value; applyFilters(); });
    if (channelFilter) channelFilter.addEventListener('change', e => { state.filters.channel = e.target.value; applyFilters(); });
    if (showSegmentsCheckbox) showSegmentsCheckbox.addEventListener('change', e => { state.filters.showSegments = e.target.checked; applyFilters(); });
    if (expandAll) expandAll.addEventListener('click', () => document.querySelectorAll('#programs-groups .channel-block').forEach(b => setChannelBlockCollapsed(b, false)));
    if (collapseAll) collapseAll.addEventListener('click', () => document.querySelectorAll('#programs-groups .channel-block').forEach(b => setChannelBlockCollapsed(b, true)));
    if (dayPanel) dayPanel.addEventListener('click', handleDayClick);
}

function handleDayClick(event) {
    const backBtn = event.target.closest('#day-back-btn');
    if (backBtn) { closeDayView(); return; }
    const videoBtn = event.target.closest('.video-search-btn');
    if (videoBtn) { openVideoPanel(videoBtn.dataset.videoId); return; }
    const channelHeader = event.target.closest('.channel-header');
    if (channelHeader) {
        const block = channelHeader.closest('.channel-block');
        if (block) setChannelBlockCollapsed(block, !block.classList.contains('collapsed'));
        return;
    }
    const jumpTarget = event.target.closest('[data-target-anchor]');
    if (jumpTarget) { jumpToProgram(jumpTarget.dataset.targetAnchor); return; }
    const addButton = event.target.closest('.add-to-playlist-btn');
    if (addButton) addToPlaylist(addButton.dataset.programId);
}

function setChannelBlockCollapsed(block, collapsed) {
    if (!block) return;
    block.classList.toggle('collapsed', collapsed);
    const header = block.querySelector('.channel-header');
    const toggle = block.querySelector('.channel-toggle');
    if (header) header.setAttribute('aria-expanded', String(!collapsed));
    if (toggle) toggle.textContent = collapsed ? '+' : '−';
}

function jumpToProgram(anchorId) {
    let targetEl = document.getElementById(anchorId);
    if (!targetEl) {
        state.filters.query = '';
        state.filters.channel = 'all';
        const si = document.getElementById('program-search');
        const cf = document.getElementById('channel-filter');
        if (si) si.value = '';
        if (cf) cf.value = 'all';
        applyFilters();
        targetEl = document.getElementById(anchorId);
    }
    if (!targetEl) { showToast('❌ Programme introuvable dans la grille'); return; }
    const block = targetEl.closest('.channel-block');
    if (block && block.classList.contains('collapsed')) setChannelBlockCollapsed(block, false);
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.add('flash-highlight');
    setTimeout(() => targetEl.classList.remove('flash-highlight'), 1200);
}

// =====================================================
// Sommaire du soir
// =====================================================

function renderSummary(programs, detailsElement) {
    const container = document.getElementById('day-summary');
    if (!container) return;
    const evening = programs.filter(p => (p.time || '') >= '20:30');
    if (evening.length === 0) {
        if (detailsElement) detailsElement.hidden = true;
        container.innerHTML = '';
        return;
    }
    if (detailsElement) detailsElement.hidden = false;
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
// Frise
// =====================================================

function renderTimeline(programs) {
    const container = document.getElementById('day-timeline');
    if (!container) return;
    if (!programs || programs.length === 0) {
        container.innerHTML = `<div class="empty-state compact"><p>Aucune frise disponible.</p></div>`;
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
                                <button class="timeline-chip" type="button" data-target-anchor="${escapeHtml(anchorId)}" title="${escapeHtml(`${program.time || '--:--'} ${program.title || ''}`)}">
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
// Filtres journée + groupes
// =====================================================

function applyFilters() {
    const query = normalizeText(state.filters.query);
    const channel = state.filters.channel;
    const filtered = state.currentPrograms.filter(program => {
        if (channel !== 'all' && program.channel !== channel) return false;
        if (!query) return true;
        const haystack = normalizeText([program.title, program.description, program.channel, program.time, ...(program.segments || []).map(s => s.title)].join(' '));
        return haystack.includes(query);
    });
    const fc = document.getElementById('filtered-count');
    if (fc) fc.textContent = String(filtered.length);
    renderTimeline(filtered);
    renderGroups(filtered);
}

function renderGroups(programs) {
    const container = document.getElementById('programs-groups');
    if (!container) return;
    state.currentProgramMap.clear();
    if (!programs || programs.length === 0) {
        container.innerHTML = `<div class="empty-state compact"><h3>Aucun programme trouvé</h3><p>Modifiez la recherche ou choisissez une autre chaîne.</p></div>`;
        return;
    }
    const groups = groupProgramsByChannel(programs);
    container.innerHTML = groups.map(group => {
        const collapsed = group.programs.length > 12;
        return `
            <section class="channel-block${collapsed ? ' collapsed' : ''}" data-channel="${escapeHtml(group.channel)}">
                <button class="channel-header" type="button" aria-expanded="${!collapsed}">
                    <span class="channel-badge">${escapeHtml(group.channel)}</span>
                    <span class="channel-meta">${group.programs.length} programmes</span>
                    <span class="channel-toggle">${collapsed ? '+' : '−'}</span>
                </button>
                <div class="channel-programs">${group.programs.map(p => renderProgramRow(p)).join('')}</div>
            </section>
        `;
    }).join('');
}

function renderProgramRow(program) {
    const date = state.selectedDate;
    const parentId = makeProgramId(date, program.time, program.channel, 'p');
    const anchorId = programAnchorId(date, program);
    state.currentProgramMap.set(parentId, {
        id: parentId, date, time: program.time || '', channel: program.channel || '',
        title: program.title || '', description: program.description || '', parentTitle: '', type: 'program'
    });
    const segments = state.filters.showSegments && Array.isArray(program.segments) ? program.segments : [];
    const segmentsHtml = segments.length > 0 ? `
        <details class="segments">
            <summary>${segments.length} extrait${segments.length > 1 ? 's' : ''} détecté${segments.length > 1 ? 's' : ''}</summary>
            <ul class="segments-list">
                ${segments.map(segment => {
                    const segmentId = makeProgramId(date, program.time, program.channel, `s${segment.index}`);
                    state.currentProgramMap.set(segmentId, {
                        id: segmentId, date, time: program.time || '', channel: program.channel || '',
                        title: segment.title || '', description: segment.raw || '', parentTitle: program.title || '', type: 'segment'
                    });
                    return `
                        <li class="segment-item">
                            <div class="segment-content">
                                <div class="segment-title">${escapeHtml(segment.title || 'Extrait')}</div>
                                ${segment.raw && segment.raw !== segment.title ? `<div class="segment-raw">${escapeHtml(segment.raw)}</div>` : ''}
                            </div>
                            <div class="segment-actions">
                                <button class="video-search-btn segment-video-btn" type="button" data-video-id="${escapeHtml(segmentId)}" title="Rechercher des vidéos">▶️</button>
                                <button class="add-to-playlist-btn segment-add-btn" type="button" data-program-id="${escapeHtml(segmentId)}" title="Ajouter à la playlist">➕</button>
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
                ${program.description ? `<p class="program-description">${escapeHtml(program.description)}</p>` : ''}
                ${segmentsHtml}
            </div>
            <div class="program-actions">
                <button class="video-search-btn" type="button" data-video-id="${escapeHtml(parentId)}" title="Rechercher des vidéos">▶️</button>
                <button class="add-to-playlist-btn" type="button" data-program-id="${escapeHtml(parentId)}" title="Ajouter à la playlist">➕</button>
            </div>
        </article>
    `;
}

// =====================================================
// Panel vidéo
// =====================================================

function buildVideoSearchQuery(program) {
    return String(program.title || '').trim();
}

function buildVideoLinks(program) {
    const query = buildVideoSearchQuery(program);
    const encoded = encodeURIComponent(query);
    const year = program.date ? program.date.split('-')[2] : '';
    const encodedWithYear = encodeURIComponent(year ? `${query} ${year}` : query);
    return [
        { name: 'INA', icon: '🎬', className: 'ina', url: `https://www.ina.fr/recherche?q=${encoded}`, description: 'Archives TV françaises' },
        { name: 'YouTube', icon: '▶️', className: 'youtube', url: `https://www.youtube.com/results?search_query=${encodedWithYear}`, description: 'Vidéos et extraits' },
        { name: 'archive.org', icon: '🏛️', className: 'archive', url: `https://archive.org/search?query=${encoded}`, description: 'Archives libres et complètes' }
    ];
}

function videoSectionHeader(name, icon) {
    return `<div class="video-inline-header"><span>${icon}</span><span>${escapeHtml(name)}</span></div>`;
}
function videoLoadingHtml() {
    return `<div class="video-inline-loading"><span class="video-inline-spinner"></span> Recherche en cours…</div>`;
}
function videoFallbackHtml(message, url) {
    return `<div class="video-inline-fallback">${escapeHtml(message)} <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ouvrir la recherche ↗</a></div>`;
}
function videoResultCard(item) {
    const title = escapeHtml(item.title || 'Vidéo');
    const url = escapeHtml(item.url || '#');
    const platform = escapeHtml(item.platform || '');
    const thumb = item.thumb
        ? `<img class="video-result-thumb" src="${escapeHtml(item.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('video-result-thumb-empty');this.removeAttribute('src');this.textContent='📼';">`
        : `<div class="video-result-thumb video-result-thumb-empty">📼</div>`;
    return `<a class="video-result-card ${platform}" href="${url}" target="_blank" rel="noopener noreferrer" title="${title}">${thumb}<span class="video-result-title">${title}</span></a>`;
}

async function loadDailymotionResults(query, container, token) {
    if (!container) return;
    const searchUrl = `https://www.dailymotion.com/search/${encodeURIComponent(query)}/videos`;
    container.innerHTML = videoSectionHeader('Dailymotion', '📺') + videoLoadingHtml();
    try {
        const apiUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,thumbnail_url&limit=6`;
        const response = await fetch(apiUrl);
        if (token !== videoPanelToken) return;
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const list = Array.isArray(data.list) ? data.list : [];
        if (list.length === 0) { container.innerHTML = videoSectionHeader('Dailymotion', '📺') + videoFallbackHtml('Aucun résultat direct.', searchUrl); return; }
        const cards = list.map(v => videoResultCard({ title: v.title, thumb: v.thumbnail_url, url: `https://www.dailymotion.com/video/${v.id}`, platform: 'dailymotion' })).join('');
        container.innerHTML = videoSectionHeader('Dailymotion', '📺') + `<div class="video-results-grid">${cards}</div>`;
    } catch (error) {
        if (token !== videoPanelToken) return;
        container.innerHTML = videoSectionHeader('Dailymotion', '📺') + videoFallbackHtml('Recherche directe indisponible.', searchUrl);
    }
}

async function loadOdyseeResults(query, container, token) {
    if (!container) return;
    const searchUrl = `https://odysee.com/$/search?q=${encodeURIComponent(query)}`;
    container.innerHTML = videoSectionHeader('Odysee', '🌐') + videoLoadingHtml();
    try {
        const response = await fetch('https://api.na-backend.odysee.com/api/v1/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'claim_search', params: { text: query, claim_type: ['stream'], stream_types: ['video'], no_totals: true, page_size: 6 } })
        });
        if (token !== videoPanelToken) return;
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const items = (data && data.result && Array.isArray(data.result.items)) ? data.result.items : [];
        if (items.length === 0) { container.innerHTML = videoSectionHeader('Odysee', '🌐') + videoFallbackHtml('Aucun résultat direct.', searchUrl); return; }
        const cards = items.map(item => {
            const value = item.value || {};
            let url = item.canonical_url || item.permanent_url || '';
            url = String(url).replace('lbry://', 'https://odysee.com/').replace(/#/g, ':');
            return videoResultCard({ title: value.title || item.name, thumb: value.thumbnail ? value.thumbnail.url : '', url: url || searchUrl, platform: 'odysee' });
        }).join('');
        container.innerHTML = videoSectionHeader('Odysee', '🌐') + `<div class="video-results-grid">${cards}</div>`;
    } catch (error) {
        if (token !== videoPanelToken) return;
        container.innerHTML = videoSectionHeader('Odysee', '🌐') + videoFallbackHtml('Recherche directe indisponible.', searchUrl);
    }
}

function showVideoPanel(program) {
    const overlay = document.getElementById('video-panel-overlay');
    const titleEl = document.getElementById('video-panel-title');
    const metaEl = document.getElementById('video-panel-meta');
    const linksContainer = document.getElementById('video-panel-links');
    if (!overlay || !titleEl || !metaEl || !linksContainer) return;

    titleEl.textContent = program.title || 'Programme';
    const metaParts = [];
    if (program.date) metaParts.push(formatShortDate(program.date));
    if (program.time) metaParts.push(program.time);
    if (program.channel) metaParts.push(program.channel);
    if (program.parentTitle && program.type === 'segment') metaParts.push(`dans ${program.parentTitle}`);
    metaEl.textContent = metaParts.join(' · ');

    const links = buildVideoLinks(program);
    linksContainer.innerHTML = links.map(link => `
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="video-link ${escapeHtml(link.className)}">
            <span class="video-link-icon">${link.icon}</span>
            <span class="video-link-content">
                <span class="video-link-name">${escapeHtml(link.name)}</span>
                <span class="video-link-desc">${escapeHtml(link.description)}</span>
            </span>
            <span class="video-link-arrow">↗</span>
        </a>
    `).join('');

    const panel = overlay.querySelector('.video-panel');
    let resultsEl = document.getElementById('video-panel-results');
    if (!resultsEl && panel) {
        resultsEl = document.createElement('div');
        resultsEl.id = 'video-panel-results';
        resultsEl.className = 'video-panel-results';
        const note = panel.querySelector('.video-panel-note');
        if (note) panel.insertBefore(resultsEl, note); else panel.appendChild(resultsEl);
    }
    if (resultsEl) {
        resultsEl.innerHTML = `<div class="video-inline-section" id="video-dailymotion-section"></div><div class="video-inline-section" id="video-odysee-section"></div>`;
    }
    const query = buildVideoSearchQuery(program);
    videoPanelToken += 1;
    const token = videoPanelToken;
    loadDailymotionResults(query, document.getElementById('video-dailymotion-section'), token);
    loadOdyseeResults(query, document.getElementById('video-odysee-section'), token);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
}

function openVideoPanel(programId) {
    const program = state.currentProgramMap.get(programId);
    if (!program) { showToast('❌ Programme introuvable'); return; }
    showVideoPanel(program);
}
function openVideoPanelFromPlaylist(programId) {
    const program = state.playlist.find(item => item.id === programId);
    if (!program) { showToast('❌ Programme introuvable dans la playlist'); return; }
    showVideoPanel(program);
}
function closeVideoPanel() {
    const overlay = document.getElementById('video-panel-overlay');
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = '';
    videoPanelToken += 1;
}
function setupVideoPanelListeners() {
    const overlay = document.getElementById('video-panel-overlay');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeVideoPanel(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const o = document.getElementById('video-panel-overlay');
            if (o && !o.hidden) closeVideoPanel();
        }
    });
}

// =====================================================
// Recherche avancée — injection UI
// =====================================================

function injectSearchUI() {
    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('[data-view="search"]')) {
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.type = 'button';
        btn.dataset.view = 'search';
        btn.textContent = '🔎 Recherche';
        const aboutBtn = nav.querySelector('[data-view="about"]');
        if (aboutBtn) nav.insertBefore(btn, aboutBtn); else nav.appendChild(btn);
    }

    const container = document.querySelector('main.container') || document.querySelector('.container');
    if (container && !document.getElementById('search-view')) {
        const section = document.createElement('section');
        section.id = 'search-view';
        section.className = 'view';
        section.innerHTML = `
            <div class="search-panel">
                <h2 class="search-title">🔎 Recherche dans les archives</h2>
                <p class="search-subtitle">Émission, série, film, présentateur… sur toutes les années ou une période.</p>
                <div class="search-bar">
                    <input type="search" id="search-input" placeholder="Ex. Club Dorothée, Dorothée, Columbo, jeu…" autocomplete="off">
                </div>
                <div class="search-filters">
                    <label>Période
                        <select id="search-period"><option value="all">Toute la base</option></select>
                    </label>
                    <label>Année
                        <select id="search-year"><option value="all">Toutes</option></select>
                    </label>
                    <label>Genre
                        <select id="search-genre"><option value="all">Tous</option></select>
                    </label>
                    <label>Chaîne
                        <select id="search-channel"><option value="all">Toutes</option></select>
                    </label>
                    <label class="checkbox-label search-evening">
                        <input type="checkbox" id="search-evening"> Soirée (≥18h)
                    </label>
                    <button type="button" id="search-reset" class="tiny-btn">Réinitialiser</button>
                </div>
                <div class="search-sortbar">
                    <span id="search-status" class="search-status"></span>
                    <label class="search-sort-label">Tri
                        <select id="search-sort">
                            <option value="count">Nombre de diffusions</option>
                            <option value="alpha">Alphabétique</option>
                        </select>
                    </label>
                </div>
                <div id="search-results" class="search-results"></div>
            </div>
        `;
        container.appendChild(section);
    }
}

function setupSearchListeners() {
    const input = document.getElementById('search-input');
    const period = document.getElementById('search-period');
    const yearSel = document.getElementById('search-year');
    const genre = document.getElementById('search-genre');
    const channel = document.getElementById('search-channel');
    const evening = document.getElementById('search-evening');
    const sort = document.getElementById('search-sort');
    const reset = document.getElementById('search-reset');
    const results = document.getElementById('search-results');

    if (input) input.addEventListener('input', e => {
        state.search.query = e.target.value;
        scheduleSearch();
    });
    if (period) period.addEventListener('change', e => {
        state.search.period = e.target.value;
        state.search.year = 'all';
        populateSearchYears();
        runSearch();
    });
    if (yearSel) yearSel.addEventListener('change', e => { state.search.year = e.target.value; runSearch(); });
    if (genre) genre.addEventListener('change', e => { state.search.genre = e.target.value; runSearch(); });
    if (channel) channel.addEventListener('change', e => { state.search.channel = e.target.value; runSearch(); });
    if (evening) evening.addEventListener('change', e => { state.search.evening = e.target.checked; runSearch(); });
    if (sort) sort.addEventListener('change', e => { state.search.sort = e.target.value; renderSearchResults(); });
    if (reset) reset.addEventListener('click', resetSearch);

    if (results) results.addEventListener('click', e => {
        const header = e.target.closest('.search-group-header');
        if (header) { toggleSearchGroup(header.dataset.groupKey); return; }
        const chip = e.target.closest('[data-search-date]');
        if (chip) { openDay(chip.dataset.searchDate, chip.dataset.searchTime, chip.dataset.searchChannel); }
    });
}

async function ensureSearchMeta() {
    if (state.search.metaLoaded) return state.search.meta;
    try {
        const base = document.baseURI || window.location.href;
        const url = new URL('data/search_meta.json', base).href + `?t=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        state.search.meta = await response.json();
        state.search.metaLoaded = true;
        populateSearchFilters();
        return state.search.meta;
    } catch (error) {
        console.error('Erreur chargement search_meta:', error);
        const status = document.getElementById('search-status');
        if (status) status.textContent = "❌ Index de recherche indisponible. Lance generate_index_only.";
        return null;
    }
}

function populateSearchFilters() {
    if (state.search.filtersReady) return;
    const meta = state.search.meta;
    if (!meta) return;

    const decades = [...new Set((meta.years || []).map(y => Math.floor(y / 10) * 10))].sort((a, b) => a - b);
    const period = document.getElementById('search-period');
    if (period) {
        period.innerHTML = `<option value="all">Toute la base</option>` +
            decades.map(d => `<option value="${d}">Années ${String(d).slice(2)}</option>`).join('');
    }

    const genre = document.getElementById('search-genre');
    if (genre) {
        const genres = (meta.genres || []).filter(g => !HIDDEN_GENRES.includes(g));
        genre.innerHTML = `<option value="all">Tous</option>` +
            genres.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    }

    const channel = document.getElementById('search-channel');
    if (channel) {
        const chans = [...(meta.channels || [])].sort((a, b) => channelRank(a) - channelRank(b));
        channel.innerHTML = `<option value="all">Toutes</option>` +
            chans.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }

    populateSearchYears();
    state.search.filtersReady = true;
}

function populateSearchYears() {
    const meta = state.search.meta;
    const yearSel = document.getElementById('search-year');
    if (!meta || !yearSel) return;
    let years = meta.years || [];
    if (state.search.period !== 'all') {
        const d = Number(state.search.period);
        years = years.filter(y => Math.floor(y / 10) * 10 === d);
    }
    yearSel.innerHTML = `<option value="all">Toutes</option>` +
        years.map(y => `<option value="${y}"${String(state.search.year) === String(y) ? ' selected' : ''}>${y}</option>`).join('');
}

function getSearchYears() {
    const meta = state.search.meta;
    if (!meta) return [];
    if (state.search.year !== 'all') return [Number(state.search.year)];
    let years = meta.years || [];
    if (state.search.period !== 'all') {
        const d = Number(state.search.period);
        years = years.filter(y => Math.floor(y / 10) * 10 === d);
    }
    return years;
}

function decodeSearchRows(data, meta) {
    const chans = meta.channels || [];
    const genres = meta.genres || [];
    const rows = Array.isArray(data.programs) ? data.programs : [];
    return rows.map(r => {
        const title = r[0] || '';
        const channel = chans[r[1]] || 'Autres';
        const date = r[2] || '';
        const time = r[3] || '';
        const genre = genres[r[4]] || 'autre';
        const people = r[5] || '';
        return { title, channel, date, time, genre, people, nt: normalizeText(title), np: normalizeText(people) };
    });
}

async function loadSearchData(years) {
    const meta = state.search.meta;
    if (!meta) return;
    const missing = years.filter(y => !state.search.loadedYears.has(y));
    if (missing.length === 0) return;

    state.search.loading = true;
    const status = document.getElementById('search-status');
    let done = 0;
    const base = document.baseURI || window.location.href;

    await Promise.all(missing.map(async y => {
        try {
            const url = new URL(`data/search/${y}.json`, base).href + `?t=${Date.now()}`;
            const response = await fetch(url, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                state.search.cache[y] = decodeSearchRows(data, meta);
                state.search.loadedYears.add(y);
            } else {
                state.search.cache[y] = [];
                state.search.loadedYears.add(y);
            }
        } catch (error) {
            console.warn('Erreur chargement search year', y, error);
            state.search.cache[y] = [];
            state.search.loadedYears.add(y);
        } finally {
            done++;
            if (status) status.textContent = `⏳ Chargement des archives… ${done}/${missing.length}`;
        }
    }));
    state.search.loading = false;
}

function resetSearch() {
    state.search.query = '';
    state.search.genre = 'all';
    state.search.channel = 'all';
    state.search.period = 'all';
    state.search.year = 'all';
    state.search.evening = false;
    state.search.expanded = new Set();
    const ids = ['search-input', 'search-genre', 'search-channel', 'search-period', 'search-year'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = (id === 'search-input') ? '' : 'all'; });
    const ev = document.getElementById('search-evening'); if (ev) ev.checked = false;
    populateSearchYears();
    renderSearchPrompt();
}

function scheduleSearch() {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(runSearch, 250);
}

async function runSearch() {
    await ensureSearchMeta();
    if (!state.search.meta) return;

    const q = normalizeText(state.search.query);
    const words = q ? q.split(' ').filter(Boolean) : [];
    const hasFilter = state.search.genre !== 'all' || state.search.channel !== 'all' || state.search.evening;

    if (words.length === 0 && !hasFilter) { renderSearchPrompt(); return; }

    const years = getSearchYears();
    const status = document.getElementById('search-status');
    searchRunToken += 1;
    const token = searchRunToken;

    await loadSearchData(years);
    if (token !== searchRunToken) return;

    const groups = new Map();
    let total = 0;
    for (const y of years) {
        const rows = state.search.cache[y] || [];
        for (const row of rows) {
            if (state.search.genre !== 'all' && row.genre !== state.search.genre) continue;
            if (state.search.channel !== 'all' && row.channel !== state.search.channel) continue;
            if (state.search.evening) {
                const h = row.time ? Number(row.time.split(':')[0]) : -1;
                if (h < 18) continue;
            }
            if (words.length) {
                const hay = row.nt + ' ' + row.np;
                if (!words.every(w => hay.includes(w))) continue;
            }
            total++;
            const key = row.nt + '|' + row.channel;
            let g = groups.get(key);
            if (!g) { g = { key, title: row.title, channel: row.channel, genre: row.genre, occ: [], count: 0 }; groups.set(key, g); }
            g.count++;
            g.occ.push({ date: row.date, time: row.time });
        }
    }

    const arr = [...groups.values()];
    arr.forEach(g => g.occ.sort((a, b) => {
        const ka = dateSortKey(a.date), kb = dateSortKey(b.date);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return timeSortKey(a.time) - timeSortKey(b.time);
    }));

    state.search.groups = arr;
    state.search.totalMatches = total;
    state.search.expanded = new Set();
    renderSearchResults();
}

function renderSearchPrompt() {
    const status = document.getElementById('search-status');
    if (status) status.textContent = '';
    const results = document.getElementById('search-results');
    if (!results) return;
    const meta = state.search.meta;
    let suggestions = '';
    if (meta && Array.isArray(meta.top_shows)) {
        const picks = meta.top_shows.filter(s => !HIDDEN_GENRES.includes('') && s[0]).slice(0, 12);
        suggestions = `
            <div class="search-suggestions">
                <p>Quelques émissions populaires :</p>
                <div class="search-suggestion-chips">
                    ${picks.map(s => `<button type="button" class="search-suggestion-chip" data-suggest="${escapeHtml(s[0])}">${escapeHtml(s[0])}</button>`).join('')}
                </div>
            </div>
        `;
    }
    results.innerHTML = `
        <div class="empty-state compact">
            <h3>Que voulez-vous retrouver ?</h3>
            <p>Tapez un titre d'émission, une série, un film ou un présentateur, ou choisissez un genre / une chaîne.</p>
            ${suggestions}
        </div>
    `;
    results.querySelectorAll('[data-suggest]').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('search-input');
            if (input) input.value = btn.dataset.suggest;
            state.search.query = btn.dataset.suggest;
            runSearch();
        });
    });
}

function renderSearchResults() {
    const results = document.getElementById('search-results');
    const status = document.getElementById('search-status');
    if (!results) return;

    const groups = state.search.groups || [];
    const total = state.search.totalMatches || 0;

    if (groups.length === 0) {
        if (status) status.textContent = '';
        results.innerHTML = `<div class="empty-state compact"><h3>Aucun résultat</h3><p>Essayez un autre terme, élargissez la période ou retirez un filtre.</p></div>`;
        return;
    }

    const sorted = [...groups].sort((a, b) =>
        state.search.sort === 'alpha' ? a.title.localeCompare(b.title) : b.count - a.count
    );

    const MAX_GROUPS = 200;
    const shown = sorted.slice(0, MAX_GROUPS);
    if (status) {
        status.textContent = `${total} diffusion${total > 1 ? 's' : ''} · ${groups.length} émission${groups.length > 1 ? 's' : ''}${groups.length > MAX_GROUPS ? ` (${MAX_GROUPS} affichées)` : ''}`;
    }

    results.innerHTML = shown.map(g => {
        const expanded = state.search.expanded.has(g.key);
        const datesHtml = expanded ? `
            <div class="search-group-dates">
                ${g.occ.map(o => `
                    <button type="button" class="search-date-chip" data-search-date="${escapeHtml(o.date)}" data-search-time="${escapeHtml(o.time)}" data-search-channel="${escapeHtml(g.channel)}">
                        <span class="search-date-day">${escapeHtml(formatShortDate(o.date))}</span>
                        <span class="search-date-time">${escapeHtml(o.time || '--:--')}</span>
                    </button>
                `).join('')}
            </div>
        ` : '';
        return `
            <div class="search-group${expanded ? ' expanded' : ''}">
                <button type="button" class="search-group-header" data-group-key="${escapeHtml(g.key)}">
                    <span class="search-group-title">${escapeHtml(g.title)}</span>
                    <span class="search-group-badges">
                        <span class="search-badge-channel">${escapeHtml(g.channel)}</span>
                        <span class="search-badge-genre">${escapeHtml(g.genre)}</span>
                        <span class="search-badge-count">${g.count}</span>
                    </span>
                    <span class="search-group-toggle">${expanded ? '−' : '+'}</span>
                </button>
                ${datesHtml}
            </div>
        `;
    }).join('');
}

function toggleSearchGroup(key) {
    if (state.search.expanded.has(key)) state.search.expanded.delete(key);
    else state.search.expanded.add(key);
    renderSearchResults();
}

// =====================================================
// "Ça s'est passé…" — suggestions contextuelles
// =====================================================

function getAllDates() {
    const out = [];
    if (!state.index || !state.index.years) return out;
    for (const year of Object.keys(state.index.years)) {
        const dates = state.index.years[year].dates || {};
        for (const d of Object.keys(dates)) out.push(d);
    }
    return out;
}

function detectPeriod(today) {
    const m = today.getMonth() + 1, d = today.getDate();
    if ((m === 12 && d >= 15) || (m === 1 && d <= 5)) return 'noel';
    if (m === 7 || m === 8) return 'ete';
    if (m === 9 && d <= 20) return 'rentree';
    if (m === 12 && d === 31) return 'nouvelan';
    return null;
}

function inPeriod(dateStr, period) {
    const dt = dateToDate(dateStr);
    if (!dt) return false;
    const m = dt.getMonth() + 1, d = dt.getDate();
    if (period === 'noel') return (m === 12 && d >= 15) || (m === 1 && d <= 5);
    if (period === 'ete') return m === 7 || m === 8;
    if (period === 'rentree') return m === 9 && d <= 20;
    return false;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildSuggestions() {
    const allDates = getAllDates();
    if (allDates.length === 0) { state.suggestions = []; return; }

    const today = new Date();
    const wd = today.getDay();
    const currentYear = today.getFullYear();
    const period = detectPeriod(today);
    const weekdayName = today.toLocaleDateString('fr-FR', { weekday: 'long' });

    const pool = [];

    // "Il y a X ans, un jour comme aujourd'hui" (même mois, jour proche)
    allDates.forEach(d => {
        const dt = dateToDate(d);
        if (!dt) return;
        if (dt.getMonth() === today.getMonth() && Math.abs(dt.getDate() - today.getDate()) <= 2) {
            const y = dt.getFullYear();
            const diff = currentYear - y;
            if (diff > 0) pool.push({ date: d, reason: `Il y a ${diff} ans`, priority: 3 });
        }
    });

    // Période (Noël, été, rentrée)
    if (period) {
        const label = period === 'noel' ? 'Esprit Noël 🎄' : period === 'ete' ? 'Vacances d’été ☀️' : 'Esprit rentrée 🎒';
        allDates.forEach(d => { if (inPeriod(d, period)) pool.push({ date: d, reason: label, priority: 2 }); });
    }

    // Jour similaire (samedi/dimanche/mercredi = enfants, sinon semaine)
    const special = (wd === 0 || wd === 3 || wd === 6);
    allDates.forEach(d => {
        const dt = dateToDate(d);
        if (!dt) return;
        const dwd = dt.getDay();
        if (special) {
            if (dwd === wd) pool.push({ date: d, reason: `Un ${weekdayName} comme aujourd'hui`, priority: 1 });
        } else {
            if (dwd >= 1 && dwd <= 5 && dwd !== 3) pool.push({ date: d, reason: 'Un jour de semaine', priority: 1 });
        }
    });

    // Sélection : priorité aux anniversaires/période, puis jour similaire
    const picked = [];
    const usedDates = new Set();
    const byPriority = [3, 2, 1];
    for (const prio of byPriority) {
        const candidates = shuffle(pool.filter(p => p.priority === prio && !usedDates.has(p.date)));
        for (const c of candidates) {
            if (picked.length >= 4) break;
            picked.push(c);
            usedDates.add(c.date);
        }
        if (picked.length >= 4) break;
    }
    // Compléter si besoin
    if (picked.length < 4) {
        for (const c of shuffle(pool)) {
            if (picked.length >= 4) break;
            if (!usedDates.has(c.date)) { picked.push(c); usedDates.add(c.date); }
        }
    }

    state.suggestions = picked.slice(0, 4);
}

function renderSuggestionsHTML() {
    if (!state.suggestions || state.suggestions.length === 0) return '';
    const cards = state.suggestions.map(s => `
        <button type="button" class="suggest-card" data-open-day="${escapeHtml(s.date)}">
            <span class="suggest-reason">${escapeHtml(s.reason)}</span>
            <span class="suggest-date">${escapeHtml(formatDateLabel(s.date))}</span>
            <span class="suggest-cta">Voir la grille →</span>
        </button>
    `).join('');
    return `
        <section class="suggest-box">
            <div class="suggest-head">
                <h3>📻 Ça s'est passé…</h3>
                <button type="button" id="reshuffle-suggestions" class="tiny-btn">🎲 Autres</button>
            </div>
            <div class="suggest-grid">${cards}</div>
        </section>
    `;
}

// =====================================================
// Playlist
// =====================================================

function addToPlaylist(programId) {
    const program = state.currentProgramMap.get(programId);
    if (!program) { showToast('❌ Programme introuvable'); return; }
    if (state.playlist.some(item => item.id === programId)) { showToast('⚠️ Déjà dans la playlist'); return; }
    state.playlist.push({ ...program, addedAt: new Date().toISOString() });
    savePlaylist();
    updatePlaylistDisplay();
    const label = program.type === 'segment' ? `extrait "${program.title}"` : `"${program.title}"`;
    showToast(`✅ ${label} ajouté à la playlist`);
}

function removeFromPlaylist(programId) {
    state.playlist = state.playlist.filter(p => p.id !== programId);
    savePlaylist();
    updatePlaylistDisplay();
    showToast('🗑️ Élément retiré');
}

function clearPlaylist() {
    if (state.playlist.length === 0) { showToast('ℹ️ Playlist déjà vide'); return; }
    if (!confirm('Vider toute la playlist ?')) return;
    state.playlist = [];
    savePlaylist();
    updatePlaylistDisplay();
    showToast('🗑️ Playlist vidée');
}

function setupPlaylistListeners() {
    const container = document.getElementById('playlist-container');
    if (!container) return;
    container.addEventListener('click', event => {
        const videoBtn = event.target.closest('.video-search-btn');
        if (videoBtn) { openVideoPanelFromPlaylist(videoBtn.dataset.videoId); return; }
        const removeBtn = event.target.closest('[data-remove-id]');
        if (removeBtn) removeFromPlaylist(removeBtn.dataset.removeId);
    });
}

function updatePlaylistDisplay() {
    const container = document.getElementById('playlist-container');
    if (!container) return;
    if (state.playlist.length === 0) {
        container.innerHTML = `<div class="empty-playlist"><p>📭 Playlist vide</p><small>Ajoutez des programmes ou des extraits depuis la vue Journée</small></div>`;
        updatePlaylistReturnBar();
        return;
    }
    const sorted = [...state.playlist].sort((a, b) => {
        const ka = dateSortKey(a.date), kb = dateSortKey(b.date);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return timeSortKey(a.time) - timeSortKey(b.time);
    });
    container.innerHTML = sorted.map(program => `
        <div class="playlist-item">
            <div class="playlist-item-info">
                <div class="playlist-date">📅 ${escapeHtml(formatDateLabel(program.date))}</div>
                <div class="program-time-inline">
                    🕐 ${escapeHtml(program.time || '--:--')}
                    ${program.channel ? ` · 📺 ${escapeHtml(program.channel)}` : ''}
                    ${program.type === 'segment' ? ' · <span class="badge-segment">extrait</span>' : ''}
                </div>
                ${program.parentTitle ? `<div class="playlist-parent">Dans : ${escapeHtml(program.parentTitle)}</div>` : ''}
                <div class="program-title">🎬 ${escapeHtml(program.title || 'Titre inconnu')}</div>
                ${program.description ? `<p class="program-description">${escapeHtml(program.description)}</p>` : ''}
            </div>
            <div class="playlist-item-actions">
                <button class="video-search-btn playlist-video-btn" type="button" data-video-id="${escapeHtml(program.id)}" title="Rechercher des vidéos">▶️</button>
                <button class="remove-btn" type="button" data-remove-id="${escapeHtml(program.id)}">✕</button>
            </div>
        </div>
    `).join('');
    updatePlaylistReturnBar();
}

function updatePlaylistReturnBar() {
    const bar = document.getElementById('playlist-day-return');
    const label = document.getElementById('playlist-day-label');
    if (!bar) return;
    if (state.dayOpen && state.selectedDate) {
        bar.hidden = false;
        if (label) label.textContent = formatDateLabel(state.selectedDate);
    } else {
        bar.hidden = true;
    }
}

function returnToDayFromPlaylist() {
    setActiveView('browse');
    if (!reopenDayView()) {
        if (state.selectedYear && state.yearData) displayDates(state.selectedYear);
        else displayYears();
    }
}

// =====================================================
// Export
// =====================================================

function exportPlaylist() {
    if (state.playlist.length === 0) { showToast('⚠️ Playlist vide'); return; }
    const exportSection = document.getElementById('export-section');
    const exportText = document.getElementById('export-text');
    const exportFormat = document.getElementById('export-format');
    const exportParent = document.getElementById('export-parent');
    if (!exportSection || !exportText) { showToast('❌ Élément d’export introuvable'); return; }
    const format = exportFormat ? exportFormat.value : 'title_channel_date';
    const includeParent = exportParent ? exportParent.checked : true;
    const sorted = [...state.playlist].sort((a, b) => {
        const ka = dateSortKey(a.date), kb = dateSortKey(b.date);
        for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
        return timeSortKey(a.time) - timeSortKey(b.time);
    });
    exportText.value = sorted.map(p => formatExportLine(p, format, includeParent)).join('\n');
    exportSection.style.display = 'block';
    exportSection.scrollIntoView({ behavior: 'smooth' });
    showToast('✅ Playlist prête à être copiée');
}

function formatExportLine(program, format, includeParent) {
    let title = program.title || 'Programme inconnu';
    if (program.type === 'segment' && includeParent && program.parentTitle) title = `${program.parentTitle} : ${title}`;
    const channel = program.channel || '';
    const date = formatShortDate(program.date);
    const time = program.time || '';
    switch (format) {
        case 'title': return title;
        case 'title_channel': return channel ? `${title} (${channel})` : title;
        case 'title_date': return `${title} - ${date}`;
        case 'title_channel_date': return channel ? `${title} (${channel}) - ${date}` : `${title} - ${date}`;
        case 'full': return channel ? `${title} (${channel}) - ${time} - ${date}` : `${title} - ${time} - ${date}`;
        default: return channel ? `${title} (${channel}) - ${date}` : `${title} - ${date}`;
    }
}

async function copyToClipboard() {
    const exportText = document.getElementById('export-text');
    if (!exportText) { showToast('❌ Zone de texte introuvable'); return; }
    const text = exportText.value;
    if (!text) { showToast('⚠️ Rien à copier'); return; }
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            showToast('📋 Copié dans le presse-papier !');
            return;
        }
        exportText.select();
        exportText.setSelectionRange(0, text.length);
        const success = document.execCommand('copy');
        showToast(success ? '📋 Copié dans le presse-papier !' : '❌ Impossible de copier');
    } catch (error) {
        console.error('Erreur copie:', error);
        showToast('❌ Impossible de copier');
    }
}

// =====================================================
// Navigation
// =====================================================

function setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(button => {
        button.addEventListener('click', () => setActiveView(button.dataset.view));
    });
}

function setActiveView(view) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    document.querySelectorAll('.view').forEach(section => section.classList.remove('active'));
    const targetView = document.getElementById(`${view}-view`);
    if (targetView) targetView.classList.add('active');
    state.currentView = view;

    if (view === 'browse') {
        if (!state.index) {
            loadIndex({ display: false }).then(ok => { if (ok && !reopenDayView()) displayYears(); });
        } else if (!reopenDayView()) {
            if (state.selectedYear && state.yearData) displayDates(state.selectedYear);
            else displayYears();
        }
    }
    if (view === 'playlist') updatePlaylistReturnBar();
    if (view === 'search') {
        ensureSearchMeta().then(() => {
            if (state.search.groups && state.search.groups.length > 0) renderSearchResults();
            else if (state.search.query || state.search.genre !== 'all' || state.search.channel !== 'all') runSearch();
            else renderSearchPrompt();
        });
    }
}

// =====================================================
// Utils UI
// =====================================================

function showLoading(show) {
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = show ? 'block' : 'none';
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) { console.warn('Toast introuvable:', message); return; }
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker enregistré :', reg.scope))
            .catch(err => console.log('Échec SW :', err));
    });
}

// =====================================================
// Exposition globale
// =====================================================

window.selectYear = selectYear;
window.selectDate = selectDate;
window.selectDecade = selectDecade;
window.displayYears = displayYears;
window.displayDates = displayDates;
window.closeDayView = closeDayView;
window.openDay = openDay;
window.returnToDayFromPlaylist = returnToDayFromPlaylist;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.exportPlaylist = exportPlaylist;
window.copyToClipboard = copyToClipboard;
window.openVideoPanel = openVideoPanel;
window.closeVideoPanel = closeVideoPanel;