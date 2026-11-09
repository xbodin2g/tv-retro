// =====================================================
// TV RÉTRO - Version magazine TV
// =====================================================

const state = {
    currentView: 'browse',
    selectedYear: null,
    selectedDate: null,
    playlist: loadStoredPlaylist(),
    index: null,
    yearData: null,

    currentPrograms: [],
    currentProgramMap: new Map(),

    filters: {
        query: '',
        channel: 'all'
    }
};

let toastTimeout = null;

const CHANNEL_ORDER = [
    'TF1',
    'Antenne 2',
    'FR3',
    'Canal+',
    'La Cinq',
    'M6',
    'Arte',
    'France 2',
    'France 3',
    'France 5'
];

const CHANNEL_ALIASES = {
    'TF1': 'TF1',
    'A2': 'Antenne 2',
    'ANTENNE 2': 'Antenne 2',
    'FR3': 'FR3',
    'FR 3': 'FR3',
    'CANAL+': 'Canal+',
    'CANAL': 'Canal+',
    'LA CINQ': 'La Cinq',
    'M6': 'M6',
    'ARTE': 'Arte',
    'FRANCE 2': 'France 2',
    'FRANCE 3': 'France 3',
    'FRANCE 5': 'France 5'
};

// Si tu préfères exporter uniquement le titre sans la chaîne, mets false.
const EXPORT_INCLUDE_CHANNEL = true;

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

// =====================================================
// Déduplication / regroupement
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

        const program = {
            time,
            channel: channel || 'Autres',
            title: title || 'Programme non identifié',
            description
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
    }

    return [...map.values()].sort((a, b) => {
        const rankA = channelRank(a.channel);
        const rankB = channelRank(b.channel);

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        const timeA = a.time || '99:99';
        const timeB = b.time || '99:99';

        if (timeA !== timeB) {
            return timeA.localeCompare(timeB);
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
                const timeA = a.time || '99:99';
                const timeB = b.time || '99:99';
                return timeA.localeCompare(timeB);
            })
        }));
}

function makeProgramId(dateStr, program) {
    const normalizedDate = normalizeDate(dateStr) || String(dateStr || '');
    const time = program.time || normalizeText(program.title) || 'sans-heure';
    const channel = slugChannel(program.channel || 'Autres');

    return `${normalizedDate}__${time}__${channel}`;
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
                        <span class="year-info">${totalPrograms} programmes archivés</span>
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
// Sélection d’une date
// =====================================================

function selectDate(date) {
    const normalizedDate = normalizeDate(date) || date;

    state.selectedDate = normalizedDate;
    state.filters = {
        query: '',
        channel: 'all'
    };

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

    let rawPrograms = [];

    if (Array.isArray(dateData.programs) && dateData.programs.length > 0) {
        rawPrograms = dateData.programs;
    } else if (dateData.channels && typeof dateData.channels === 'object') {
        rawPrograms = flattenChannels(dateData.channels);
    }

    const programs = dedupePrograms(rawPrograms);

    state.currentPrograms = programs;

    displayPrograms(programs, normalizedDate);
}

// =====================================================
// Affichage des programmes chaîne par chaîne
// =====================================================

function displayPrograms(programs, date) {
    const container = document.getElementById('programs-container');

    if (!container) {
        console.error('Élément #programs-container introuvable');
        return;
    }

    state.currentPrograms = programs;
    state.currentProgramMap = new Map();

    const channels = [...new Set(programs.map(p => p.channel || 'Autres'))]
        .sort((a, b) => channelRank(a) - channelRank(b));

    container.innerHTML = `
        <div class="programs-header">
            <button class="back-btn" onclick="displayDates('${escapeHtml(state.selectedYear || '')}')">
                ← Retour aux dates
            </button>

            <h2>📺 ${escapeHtml(formatDateLabel(date))}</h2>

            <p class="programs-count">
                <span id="total-count">${programs.length}</span> programmes archivés ·
                <span id="filtered-count">${programs.length}</span> affichés
            </p>
        </div>

        <div class="grid-toolbar">
            <input
                type="search"
                id="program-search"
                placeholder="Rechercher un programme, un animateur, une description..."
                value="${escapeHtml(state.filters.query)}"
            >

            <select id="channel-filter">
                <option value="all"${state.filters.channel === 'all' ? ' selected' : ''}>
                    Toutes les chaînes
                </option>
                ${channels.map(channel => `
                    <option value="${escapeHtml(channel)}"${state.filters.channel === channel ? ' selected' : ''}>
                        ${escapeHtml(channel)}
                    </option>
                `).join('')}
            </select>

            <div class="toolbar-actions">
                <button type="button" id="expand-all" class="tiny-btn">Déplier</button>
                <button type="button" id="collapse-all" class="tiny-btn">Réplier</button>
            </div>
        </div>

        <div id="programs-groups" class="programs-groups"></div>
    `;

    renderProgramGroups(programs, date);

    const searchInput = document.getElementById('program-search');
    const channelFilter = document.getElementById('channel-filter');
    const expandAll = document.getElementById('expand-all');
    const collapseAll = document.getElementById('collapse-all');
    const groupsContainer = document.getElementById('programs-groups');

    if (searchInput) {
        searchInput.addEventListener('input', event => {
            state.filters.query = event.target.value;
            applyFilters(date);
        });
    }

    if (channelFilter) {
        channelFilter.addEventListener('change', event => {
            state.filters.channel = event.target.value;
            applyFilters(date);
        });
    }

    if (expandAll) {
        expandAll.addEventListener('click', () => {
            document.querySelectorAll('#programs-groups .channel-block')
                .forEach(block => block.classList.remove('collapsed'));
        });
    }

    if (collapseAll) {
        collapseAll.addEventListener('click', () => {
            document.querySelectorAll('#programs-groups .channel-block')
                .forEach(block => block.classList.add('collapsed'));
        });
    }

    if (groupsContainer) {
        groupsContainer.addEventListener('click', handleProgramsClick);
    }
}

function applyFilters(date) {
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
            program.time
        ].join(' '));

        return haystack.includes(query);
    });

    renderProgramGroups(filtered, date);

    const filteredCount = document.getElementById('filtered-count');

    if (filteredCount) {
        filteredCount.textContent = String(filtered.length);
    }
}

function renderProgramGroups(programs, date) {
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

        return `
            <section class="channel-block${channelPrograms.length > 12 ? ' collapsed' : ''}" data-channel="${escapeHtml(channel)}">
                <button class="channel-header" type="button" aria-expanded="${channelPrograms.length > 12 ? 'false' : 'true'}">
                    <span class="channel-badge">${escapeHtml(channel)}</span>
                    <span class="channel-meta">${channelPrograms.length} programmes</span>
                    <span class="channel-toggle">${channelPrograms.length > 12 ? '+' : '−'}</span>
                </button>

                <div class="channel-programs">
                    ${channelPrograms.map(program => {
                        const id = makeProgramId(date, program);
                        state.currentProgramMap.set(id, program);

                        return `
                            <article class="program-row">
                                <div class="program-time">${escapeHtml(program.time || '--:--')}</div>

                                <div class="program-content">
                                    <div class="program-title">${escapeHtml(program.title || 'Titre inconnu')}</div>

                                    ${program.description ? `
                                        <p class="program-description">${escapeHtml(program.description)}</p>
                                    ` : ''}
                                </div>

                                <div class="program-actions">
                                    <button
                                        class="add-to-playlist-btn"
                                        type="button"
                                        data-program-id="${escapeHtml(id)}"
                                        aria-label="Ajouter ${escapeHtml(program.title || 'programme')} à la playlist"
                                    >
                                        ➕
                                    </button>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            </section>
        `;
    }).join('');
}

function handleProgramsClick(event) {
    const header = event.target.closest('.channel-header');

    if (header) {
        const block = header.closest('.channel-block');

        if (block) {
            const isCollapsed = block.classList.toggle('collapsed');
            const toggle = header.querySelector('.channel-toggle');
            header.setAttribute('aria-expanded', String(!isCollapsed));

            if (toggle) {
                toggle.textContent = isCollapsed ? '+' : '−';
            }
        }

        return;
    }

    const addButton = event.target.closest('.add-to-playlist-btn');

    if (addButton) {
        addToPlaylist(addButton.dataset.programId);
    }
}

// =====================================================
// Playlist
// =====================================================

function addToPlaylist(programId) {
    const program =
        state.currentProgramMap.get(programId) ||
        state.currentPrograms.find(p => makeProgramId(state.selectedDate, p) === programId);

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
        date: state.selectedDate,
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
                <div class="playlist-date">
                    📅 ${escapeHtml(formatDateLabel(program.date))}
                </div>

                <div class="program-time-inline">
                    🕐 ${escapeHtml(program.time || '--:--')}
                    ${program.channel ? ` · 📺 ${escapeHtml(program.channel)}` : ''}
                </div>

                <div class="program-title">🎬 ${escapeHtml(program.title || 'Titre inconnu')}</div>

                ${program.description ? `
                    <p class="program-description">${escapeHtml(program.description)}</p>
                ` : ''}
            </div>

            <button class="remove-btn" type="button" data-remove-id="${escapeHtml(program.id)}">
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

    const exportData = sortedPlaylist
        .map(program => {
            const title = program.title || 'Programme inconnu';

            if (EXPORT_INCLUDE_CHANNEL && program.channel) {
                return `${title} (${program.channel})`;
            }

            return title;
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
// Exposition globale
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