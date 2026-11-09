// État global de l'application
const state = {
    currentView: 'browse',
    playlist: JSON.parse(localStorage.getItem('retroPlaylist')) || [],
    programs: [],
    channels: [
        'TF1', 'Antenne 2', 'FR3', 'Canal+', 'La Cinq', 'M6', 
        'Arte', 'France 2', 'France 3', 'France 5'
    ]
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Configuration de la navigation
    setupNavigation();
    
    // Configuration des contrôles
    setupControls();
    
    // Charger les chaînes dans le select
    loadChannels();
    
    // Mettre à jour l'affichage de la playlist
    updatePlaylistDisplay();
    
    // Enregistrer le Service Worker pour le mode hors ligne
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .catch(err => console.log('SW registration failed:', err));
    }
}

// Navigation entre les vues
function setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            
            // Mettre à jour les boutons
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Changer de vue
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`${view}-view`).classList.add('active');
            
            state.currentView = view;
        });
    });
}

// Configuration des contrôles
function setupControls() {
    const searchMode = document.getElementById('search-mode');
    const dateControls = document.querySelector('.date-controls');
    const channelControls = document.querySelector('.channel-controls');
    
    searchMode.addEventListener('change', (e) => {
        if (e.target.value === 'date') {
            dateControls.style.display = 'block';
            channelControls.style.display = 'none';
        } else {
            dateControls.style.display = 'none';
            channelControls.style.display = 'block';
        }
    });
}

// Charger les chaînes
function loadChannels() {
    const channelSelect = document.getElementById('channel-select');
    state.channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = channel;
        channelSelect.appendChild(option);
    });
}

// Charger les programmes
async function loadPrograms() {
    const datePicker = document.getElementById('date-picker');
    const source = document.getElementById('source-select').value;
    const date = datePicker.value;
    
    if (!date) {
        showToast('⚠️ Veuillez sélectionner une date');
        return;
    }
    
    showLoading(true);
    
    try {
        // Simuler un appel API (à remplacer par un vrai scraping ou API)
        const programs = await fetchPrograms(date, source);
        state.programs = programs;
        displayPrograms(programs);
    } catch (error) {
        console.error('Erreur:', error);
        showToast('❌ Erreur lors du chargement');
        displayPrograms(getSamplePrograms(date));
    } finally {
        showLoading(false);
    }
}

// Charger les programmes par chaîne
async function loadChannelPrograms() {
    const channelSelect = document.getElementById('channel-select');
    const source = document.getElementById('source-select').value;
    const channel = channelSelect.value;
    
    if (!channel) {
        showToast('⚠️ Veuillez sélectionner une chaîne');
        return;
    }
    
    showLoading(true);
    
    try {
        // Simuler un appel API
        const programs = await fetchChannelPrograms(channel, source);
        state.programs = programs;
        displayPrograms(programs);
    } catch (error) {
        console.error('Erreur:', error);
        showToast('❌ Erreur lors du chargement');
        displayPrograms(getSampleProgramsByChannel(channel));
    } finally {
        showLoading(false);
    }
}

// Afficher les programmes
function displayPrograms(programs) {
    const container = document.getElementById('programs-container');
    
    if (programs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="retro-tv">📺</div>
                <h2>Aucun programme trouvé</h2>
                <p>Essayez une autre date ou chaîne</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = programs.map(program => `
        <div class="program-card">
            <div class="program-time">🕐 ${program.time}</div>
            <div class="program-title">🎬 ${program.title}</div>
            <div class="program-channel">📺 ${program.channel}</div>
            ${program.description ? `<p>${program.description}</p>` : ''}
            <div class="program-actions">
                <button class="add-to-playlist-btn" onclick="addToPlaylist('${program.id}')">
                    ➕ Ajouter à la playlist
                </button>
            </div>
        </div>
    `).join('');
}

// Récupérer les programmes (API simulée)
async function fetchPrograms(date, source) {
    // TODO: Remplacer par un vrai appel API vers depot101 ou archives80
    // Exemple: const response = await fetch(`https://api.depot101.com/grilles?date=${date}`);
    // return await response.json();
    
    // Pour l'instant, retourner des données de démonstration
    return getSamplePrograms(date);
}

// Récupérer les programmes par chaîne
async function fetchChannelPrograms(channel, source) {
    // TODO: Remplacer par un vrai appel API
    return getSampleProgramsByChannel(channel);
}

// Données de démonstration
function getSamplePrograms(date) {
    return [
        {
            id: '1',
            time: '06:00',
            title: 'Journal du Matin',
            channel: 'TF1',
            description: 'Les actualités du matin'
        },
        {
            id: '2',
            time: '07:00',
            title: 'Dessin Animé',
            channel: 'TF1',
            description: 'Les aventures de Goldorak'
        },
        {
            id: '3',
            time: '08:30',
            title: 'Magazine Santé',
            channel: 'Antenne 2',
            description: 'Conseils pour bien vivre'
        },
        {
            id: '4',
            time: '12:00',
            title: 'Journal de 13h',
            channel: 'TF1',
            description: 'Le journal de la mi-journée'
        },
        {
            id: '5',
            time: '14:00',
            title: 'Feuilleton de l\'après-midi',
            channel: 'FR3',
            description: 'Episode du jour'
        },
        {
            id: '6',
            time: '20:00',
            title: 'Journal de 20h',
            channel: 'TF1',
            description: 'Le journal du soir'
        },
        {
            id: '7',
            time: '20:45',
            title: 'Film du soir',
            channel: 'Canal+',
            description: 'Un classique du cinéma'
        }
    ];
}

function getSampleProgramsByChannel(channel) {
    return [
        {
            id: `${channel}-1`,
            time: '12:00',
            title: `Programme de ${channel}`,
            channel: channel,
            description: 'Programme du midi'
        },
        {
            id: `${channel}-2`,
            time: '14:00',
            title: `Émission spéciale`,
            channel: channel,
            description: 'Une émission exclusive'
        },
        {
            id: `${channel}-3`,
            time: '20:00',
            title: `Journal de 20h`,
            channel: channel,
            description: 'Le journal du soir'
        }
    ];
}

// Playlist
function addToPlaylist(programId) {
    const program = state.programs.find(p => p.id === programId);
    
    if (!program) return;
    
    // Vérifier si déjà dans la playlist
    if (state.playlist.some(p => p.id === programId)) {
        showToast('⚠️ Déjà dans la playlist');
        return;
    }
    
    state.playlist.push({
        ...program,
        addedAt: new Date().toISOString()
    });
    
    // Sauvegarder
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
    
    if (state.playlist.length === 0) {
        container.innerHTML = `
            <div class="empty-playlist">
                <p>📭 Aucun programme dans votre playlist</p>
                <small>Ajoutez des programmes depuis la vue Parcourir</small>
            </div>
        `;
        return;
    }
    
    container.innerHTML = state.playlist.map(program => `
        <div class="playlist-item">
            <div class="playlist-item-info">
                <div class="program-time">🕐 ${program.time}</div>
                <div class="program-title">🎬 ${program.title}</div>
                <div class="program-channel">📺 ${program.channel}</div>
            </div>
            <button class="remove-btn" onclick="removeFromPlaylist('${program.id}')">
                ✕
            </button>
        </div>
    `).join('');
}

// Export
function exportPlaylist() {
    if (state.playlist.length === 0) {
        showToast('⚠️ Playlist vide');
        return;
    }
    
    const exportSection = document.getElementById('export-section');
    const exportText = document.getElementById('export-text');
    
    // Format compatible TuneMyMusic
    const exportData = state.playlist.map(program => 
        `${program.title} - ${program.channel}`
    ).join('\n');
    
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

// Utilitaires
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

// Exposer les fonctions globalement
window.loadPrograms = loadPrograms;
window.loadChannelPrograms = loadChannelPrograms;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.clearPlaylist = clearPlaylist;
window.exportPlaylist = exportPlaylist;
window.copyToClipboard = copyToClipboard;