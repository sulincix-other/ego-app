/**
 * EGO Bus Tracker Application
 * Main JavaScript file for the EGO public transport tracking app
 */

// API Configuration
const API_BASE = window.location.origin;

// State Management
const state = {
    lines: [],
    stops: [],
    announcements: [],
    currentStop: null,
    liveData: null,
    liveInterval: null,
    liveRefreshing: false,
    stopCode: ''
};

// Exposed for debugging; see the "Debug Modu" section in README.md.
window.state = state;

// DOM Elements
const elements = {
    tabs: document.querySelectorAll('.tab-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    lineSearch: document.getElementById('lineSearch'),
    searchLinesBtn: document.getElementById('searchLinesBtn'),
    linesResults: document.getElementById('linesResults'),
    linesLoading: document.getElementById('linesLoading'),
    stopSearch: document.getElementById('stopSearch'),
    searchStopsBtn: document.getElementById('searchStopsBtn'),
    stopsResults: document.getElementById('stopsResults'),
    stopsLoading: document.getElementById('stopsLoading'),
    stopCode: document.getElementById('stopCode'),
    lineCode: document.getElementById('lineCode'),
    trackBtn: document.getElementById('trackBtn'),
    liveResults: document.getElementById('liveResults'),
    liveList: document.getElementById('liveList'),
    refreshLive: document.getElementById('refreshLive'),
    geoSearch: document.getElementById('geoSearch'),
    geoSearchBtn: document.getElementById('geoSearchBtn'),
    geoResults: document.getElementById('geoResults'),
    geoLoading: document.getElementById('geoLoading'),
    announcementsList: document.getElementById('announcementsList'),
    modal: document.getElementById('stopModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalBody: document.getElementById('modalBody'),
    closeModal: document.querySelector('.close-modal')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Olay dinleyicilerini bağla (tuşların çalışması için gerekli)
    initEventListeners();

    // Ana sayfayı göster, diğer içerikleri gizle
    const home = document.getElementById('home');
    const contents = document.querySelectorAll('.tab-content');

    home.classList.remove('hidden');

    contents.forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
    });
});

// Tab Navigation
function stopLivePolling() {
    if (state.liveInterval) {
        clearInterval(state.liveInterval);
        state.liveInterval = null;
    }
}

function switchToTab(tabId) {
    // Ana sayfa menüsünü gizle
    document.getElementById('home').classList.add('hidden');

    // Stop polling when the user leaves the live tab.
    if (tabId !== 'live') stopLivePolling();

    // Set tab button as active
    const tabBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (tabBtn) {
        elements.tabs.forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
    }
    
    // Switch to content
    elements.tabContents.forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
        if (content.id === tabId) {
            content.classList.add('active');
            content.classList.remove('hidden');
        }
    });
    
    // Load data for the tab
    if (tabId === 'lines') loadLines();
    if (tabId === 'stops') loadStops();
    if (tabId === 'announcements') loadAnnouncements();
}

// Show Home
function showHome() {
    // Reset tabs
    elements.tabs.forEach(t => {
        t.classList.remove('active');
        t.style.pointerEvents = 'auto';
        t.style.opacity = '1';
    });
    
    // Show home, hide all tabs
    document.getElementById('home').classList.add('active');
    document.getElementById('home').classList.remove('hidden');
    
    elements.tabContents.forEach(content => {
        content.classList.remove('active');
        content.classList.add('hidden');
    });
    
    // Clear live tracking
    stopLivePolling();
    elements.liveResults.classList.add('hidden');
    elements.liveList.innerHTML = '';
}

// Event Listeners
function initEventListeners() {
    // Lines search
    elements.lineSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchLines(elements.lineSearch.value);
    });
    elements.searchLinesBtn.addEventListener('click', () => searchLines(elements.lineSearch.value));

    // Stops search
    elements.stopSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchStops(elements.stopSearch.value);
    });
    elements.searchStopsBtn.addEventListener('click', () => searchStops(elements.stopSearch.value));

    // Live tracking
    elements.trackBtn.addEventListener('click', startLiveTracking);
    elements.refreshLive.addEventListener('click', refreshLive);

    // Geo search
    elements.geoSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchGeo(elements.geoSearch.value);
    });
    elements.geoSearchBtn.addEventListener('click', () => searchGeo(elements.geoSearch.value));

    // Live tracking: Enter ile de başlat
    elements.stopCode.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') startLiveTracking();
    });

    // Delegated handlers for dynamically rendered cards. Inline onclick handlers are
    // avoided because upstream values may contain quotes or HTML.
    elements.linesResults.addEventListener('click', (event) => {
        const card = event.target.closest('[data-line-code]');
        if (card) showLineDetailsInModal(card.dataset.lineCode);
    });

    elements.stopsResults.addEventListener('click', (event) => {
        const card = event.target.closest('[data-stop-code]');
        if (card) loadStopDetails(card.dataset.stopCode);
    });

    elements.geoResults.addEventListener('click', (event) => {
        const card = event.target.closest('[data-geo-lat]');
        if (card) showNearbyStops(card.dataset.geoLat, card.dataset.geoLng, card.dataset.geoName || '');
    });

    elements.modalBody.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-action]');
        if (!trigger) return;

        switch (trigger.dataset.action) {
            case 'line-tracking':
                openLineTracking(trigger.dataset.lineCode);
                closeModal();
                break;
            case 'live-stop':
                openLiveTab(trigger.dataset.stopCode);
                closeModal();
                break;
            case 'stop-details':
                loadStopDetails(trigger.dataset.stopCode);
                break;
            case 'home':
                showHome();
                closeModal();
                break;
        }
    });

    // Modal
    elements.closeModal.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.modal.classList.contains('hidden')) closeModal();
    });
}

// API Helper
async function apiRequest(endpoint, params = {}, options = {}) {
    const queryParams = new URLSearchParams(params).toString();
    const url = `${API_BASE}/proxy?path=${encodeURIComponent(endpoint)}${queryParams ? '&' + queryParams : ''}`;

    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: options.signal
        });
    } catch (error) {
        if (isAbortError(error)) throw error;
        console.error('API Error:', error);
        throw new Error('Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.');
    }

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (error) {
        console.error('API Parse Error:', text.slice(0, 200));
        throw new Error(`Sunucudan geçersiz yanıt alındı (HTTP ${response.status}).`);
    }

    if (data && data.error) {
        throw new Error(data.error);
    }
    if (!response.ok) {
        throw new Error(`İstek başarısız oldu (HTTP ${response.status}).`);
    }

    return data;
}

// API Endpoints
const API_ENDPOINTS = {
    hatlar: '/hibrit/act.asp',
    hatBilgileri: '/hibrit/act.asp',
    duraklar: '/hibrit/action.asp',
    duraktanGecenHatlar: '/hibrit/action.asp',
    duraktanGecisSaatleri: '/hibrit/action.asp',
    duyurular: '/hibrit/action.asp',
    yakinDuraklar: '/hibrit/action.asp',
    canlıTakip: '/hibrit/srv.asp'
};

// Global lines cache for local filtering
let allLines = [];
let linesPromise = null;
let stopsController = null;
let stopsRequestSeq = 0;
let geoController = null;
let geoRequestSeq = 0;

// Load Lines
async function fetchLines() {
    if (allLines.length > 0) return allLines;
    if (!linesPromise) {
        linesPromise = apiRequest(API_ENDPOINTS.hatlar, { FNC: 'Hatlar', LAN: 'tr' })
            .then(data => {
                allLines = data.table || [];
                state.lines = allLines;
                return allLines;
            })
            .finally(() => {
                linesPromise = null;
            });
    }
    return linesPromise;
}

async function loadLines(query = '') {
    try {
        showLoading(elements.linesLoading);
        elements.linesResults.innerHTML = '';

        const lines = await fetchLines();

        if (query && query.trim()) {
            renderLines(filterLines(query.trim()));
        } else {
            renderLines(lines);
        }
    } catch (error) {
        elements.linesResults.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
    } finally {
        hideLoading(elements.linesLoading);
    }
}

// Filter lines from cache
function filterLines(query) {
    const q = query.toLowerCase().trim();
    return allLines.filter(line => {
        const ad = (line.ad || '').toLowerCase();
        const kod = (line.kod || '').toLowerCase();
        return ad.includes(q) || kod.includes(q);
    });
}

// Search lines from cache (no API request)
async function searchLines(query) {
    if (!allLines.length) {
        await loadLines(query);
        return;
    }
    if (!query.trim()) {
        renderLines(allLines);
        return;
    }
    const filtered = filterLines(query);
    renderLines(filtered);
}

// Render Lines
function renderLines(lines) {
    if (lines.length === 0) {
        // Eğer allLines boşsa, API hatası mesajı göster
        if (allLines.length === 0) {
            elements.linesResults.innerHTML = '<p class="empty-message">Hatlar yüklenemedi</p>';
        } else {
            // Cache'de veri var ama arama sonucu yok
            elements.linesResults.innerHTML = '<p class="empty-message">Sonuç bulunamadı</p>';
        }
        return;
    }

    elements.linesResults.innerHTML = lines.map(line => `
        <div class="result-card" data-line-code="${escapeHtml(line.kod)}">
            <h4>${escapeHtml(line.ad)}</h4>
            <p><strong>Kod:</strong> ${escapeHtml(line.kod)}</p>
            <p><strong>Süre:</strong> ${escapeHtml(line.sure)} dk</p>
            <p><strong>Mesafe:</strong> ${escapeHtml(line.mesafe)} km</p>
            <div class="meta">${escapeHtml(line.detay || '')}</div>
        </div>
    `).join('');
}

// Load Stops
async function loadStops(query = '') {
    if (!query.trim()) {
        elements.stopsResults.innerHTML = '<p class="empty-message">Durak adı veya kodu yazarak arama yapın</p>';
        return;
    }

    const requestId = ++stopsRequestSeq;
    if (stopsController) stopsController.abort();
    stopsController = new AbortController();

    try {
        showLoading(elements.stopsLoading);
        elements.stopsResults.innerHTML = '';

        const data = await apiRequest(API_ENDPOINTS.duraklar, {
            FNC: 'Duraklar',
            QUERY: query,
            LAN: 'tr'
        }, { signal: stopsController.signal });

        if (requestId !== stopsRequestSeq) return;

        if (data.table && data.table.length > 0) {
            state.stops = data.table;
            renderStops(state.stops);
        } else {
            elements.stopsResults.innerHTML = '<p class="empty-message">Duraklar yüklenemedi</p>';
        }
    } catch (error) {
        if (isAbortError(error) || requestId !== stopsRequestSeq) return;
        elements.stopsResults.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
    } finally {
        if (requestId === stopsRequestSeq) hideLoading(elements.stopsLoading);
    }
}

async function searchStops(query) {
    if (!query.trim()) {
        // DÜZELTME: Durak araması boşken hatları yükleme hatası giderildi
        await loadStops();
        return;
    }
    await loadStops(query);
}

// Render Stops
function renderStops(stops) {
    if (stops.length === 0) {
        elements.stopsResults.innerHTML = '<p class="empty-message">Sonuç bulunamadı</p>';
        return;
    }

    elements.stopsResults.innerHTML = stops.map(stop => `
        <div class="result-card" data-stop-code="${escapeHtml(stop.kod)}">
            <h4>${escapeHtml(stop.ad)}</h4>
            <p><strong>Kod:</strong> ${escapeHtml(stop.kod)}</p>
            <p><strong>Konum:</strong> ${escapeHtml(stop.konum)}</p>
            <div class="meta">Lat: ${escapeHtml(stop.lat)}, Lng: ${escapeHtml(stop.lng)}</div>
        </div>
    `).join('');
}

// Show Line Details Modal
async function showLineDetailsInModal(lineCode) {
    try {
        const data = await apiRequest(API_ENDPOINTS.hatBilgileri, {
            FNC: 'HatBilgileri',
            KOD: lineCode,
            YOL: 'TRUE',
            LAN: 'tr'
        });

        if (data.table_durak && data.table_durak.length > 0) {
            const stops = data.table_durak;
            const lineName = allLines.find(l => l.kod === lineCode)?.ad || lineCode;
            
            elements.modalTitle.textContent = `🛤️ Hat: ${lineCode} - ${lineName}`;
            elements.modalBody.innerHTML = `
                <div class="modal-header">
                    <h3>🛤️ Hat Bilgileri</h3>
                    <p>Toplam ${stops.length} durak</p>
                </div>
                
                <h3 class="modal-section-title">📍 Bu Hattın Durakları:</h3>
                <div class="modal-scroll">
                    ${stops.map((stop, index) => `
                        <div class="stop-card">
                            <div class="stop-info">
                                <div class="stop-name">${escapeHtml(stop.ad)}</div>
                                <div class="stop-code">📍 Durak Kodu: ${escapeHtml(stop.kod)}</div>
                                ${stop.konum ? `<div class="stop-location">${escapeHtml(stop.konum)}</div>` : ''}
                            </div>
                            <div class="stop-number">${index + 1}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="modal-actions">
                    <button class="btn-primary" data-action="line-tracking" data-line-code="${escapeHtml(lineCode)}">
                        🚌 Bu Hattı Canlı Takip Et
                    </button>
                    <button class="btn-secondary" data-action="home">
                        🏠 Ana Sayfaya Dön
                    </button>
                </div>
            `;
            
            elements.modal.classList.remove('hidden');
        } else {
            elements.modalTitle.textContent = 'Hat Bulunamadı';
            elements.modalBody.innerHTML = '<p class="empty-message">Bu koda ait hat bulunamadı.</p>';
            elements.modal.classList.remove('hidden');
        }
    } catch (error) {
        elements.modalTitle.textContent = 'Hata';
        elements.modalBody.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
        elements.modal.classList.remove('hidden');
    }
}

function openLiveTracking(stopCode) {
    elements.stopCode.value = stopCode;
    state.stopCode = stopCode; // DÜZELTME: Canlı takip durum bilgisi senkronize tutuluyor
    elements.lineCode.value = '';
    startLiveTracking();
}

function openLiveTab(stopCode) {
    switchToTab('live');
    openLiveTracking(stopCode);
}

// Hat modalından canlı takibe geç: hat kodunu doldur, durak kodunu kullanıcıya bırak.
function openLineTracking(lineCode) {
    switchToTab('live');
    stopLivePolling();
    elements.stopCode.value = '';
    elements.lineCode.value = lineCode;
    state.stopCode = '';
    elements.liveResults.classList.add('hidden');
    elements.liveList.innerHTML = '';
    elements.stopCode.focus();
}

async function loadStopDetails(stopCode) {
    try {
        const data = await apiRequest(API_ENDPOINTS.duraktanGecenHatlar, {
            FNC: 'DuraktanGecenHatlar',
            KOD: stopCode,
            LAN: 'tr'
        });

        if (data.table && data.table.length > 0) {
            const lines = data.table;
            
            const byDuration = {};
            lines.forEach(line => {
                const duration = line.sure || 'Bilinmiyor';
                if (!byDuration[duration]) byDuration[duration] = [];
                byDuration[duration].push(line);
            });
            
            const sortedDurations = Object.keys(byDuration).sort((a, b) => {
                const numA = parseInt(a.replace(/[^0-9]/g, '')) || 999;
                const numB = parseInt(b.replace(/[^0-9]/g, '')) || 999;
                return numA - numB;
            });
            
            elements.modalTitle.textContent = `Durak: ${stopCode}`;
            elements.modalBody.innerHTML = `
                <div class="stop-details">
                    <h3 class="section-title">🚦 Bu duraktan geçen hatlar:</h3>
                    ${sortedDurations.map(duration => `
                        <div class="stop-duration-group">
                            <h4 class="duration-heading">⏱️ ${escapeHtml(duration)} dakikada</h4>
                            ${byDuration[duration].map(line => `
                                <div class="stop-detail-row">
                                    <strong>${escapeHtml(line.ad)}</strong>
                                    <span class="detail-code">${escapeHtml(line.kod)}</span>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                    
                    <h3 class="section-title">🚌 Canlı Takip</h3>
                    <div class="action-container">
                        <button class="btn-primary" data-action="live-stop" data-stop-code="${escapeHtml(stopCode)}">
                            Yaklaşan Otobüsleri Görüntüle
                        </button>
                        <button class="btn-secondary" data-action="home">
                            🏠 Ana Sayfaya Dön
                        </button>
                    </div>
                </div>
            `;
            
            elements.modal.classList.remove('hidden');
        } else {
            elements.modalTitle.textContent = 'Durak Bulunamadı';
            elements.modalBody.innerHTML = '<p class="empty-message">Bu kodlu bir durak bulunamadı.</p>';
            elements.modal.classList.remove('hidden');
        }
    } catch (error) {
        elements.modalTitle.textContent = 'Hata';
        elements.modalBody.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
        elements.modal.classList.remove('hidden');
    }
}

function closeModal() {
    elements.modal.classList.add('hidden');
}

// Live Tracking
async function startLiveTracking() {
    const stopCode = elements.stopCode.value.trim() || state.stopCode;
    const lineCode = elements.lineCode.value.trim();

    if (!stopCode) {
        alert('Lütfen bir durak kodu girin');
        return;
    }

    state.stopCode = stopCode;

    // Avoid overlapping polls when starting a new track.
    stopLivePolling();
    state.liveRefreshing = false;

    // Kullanıcıya yükleme geri bildirimi ver.
    elements.liveResults.classList.remove('hidden');
    elements.liveList.innerHTML = '<div class="loading">Otobüsler aranıyor...</div>';

    try {
        const params = {
            FNC: lineCode ? 'Otobus' : 'Otobusler',
            DURAK: stopCode,
            LAN: 'tr'
        };
        if (lineCode) params.HAT = lineCode;

        const data = await apiRequest(API_ENDPOINTS.canlıTakip, params);

        if (data.table && data.table.length > 0) {
            state.liveData = data;
            renderLiveList(data.table);
            elements.liveResults.classList.remove('hidden');
            
            state.liveInterval = setInterval(refreshLive, 30000);
        } else {
            elements.liveResults.classList.remove('hidden');
            elements.liveList.innerHTML = `
                <div class="no-data-card">
                    <div class="icon">🚌</div>
                    <h3>Aktif Otobüs Yok</h3>
                    <p>Bu durakta şu anda aktif otobüs bulunmuyor.</p>
                </div>
            `;
        }
    } catch (error) {
        elements.liveList.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
    }
}

async function refreshLive() {
    if (state.liveRefreshing) return;

    const stopCode = elements.stopCode.value.trim() || state.stopCode;
    const lineCode = elements.lineCode.value.trim();

    if (!stopCode) return;

    state.liveRefreshing = true;
    try {
        const params = {
            FNC: lineCode ? 'Otobus' : 'Otobusler',
            DURAK: stopCode,
            LAN: 'tr'
        };
        if (lineCode) params.HAT = lineCode;

        const data = await apiRequest(API_ENDPOINTS.canlıTakip, params);

        if (data.table && data.table.length > 0) {
            state.liveData = data;
            renderLiveList(data.table);
        } else {
            elements.liveList.innerHTML = `
                <div class="no-data-card">
                    <div class="icon">🚌</div>
                    <h3>Canlı Veri Yok</h3>
                    <p>Bu durakta şu anda otobüs yok veya canlı takip verisi alınamıyor.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Refresh error:', error);
    } finally {
        state.liveRefreshing = false;
    }
}

// Render Live List
function renderLiveList(items) {
    if (!items || items.length === 0) {
        elements.liveList.innerHTML = `
            <div class="no-data-card">
                <div class="icon">🚌</div>
                <h3>Canlı Veri Yok</h3>
                <p>Bu durakta şu anda otobüs yok veya canlı takip verisi alınamıyor.</p>
            </div>
        `;
        return;
    }

    const vehicles = items.filter(item => {
        if (!item.arac_no || item.arac_no === '-') return false;
        if (item.availabilite === 0 || item.availabilite === '0' || item.availabilite === false || item.availabilite === 'false') return false;
        if (item.status === 'durduruldu' || item.status === 'duraklatildi') return false;
        const durum = String(item.durum || '').toLowerCase();
        if (durum.includes('durdur') || durum.includes('pasif')) return false;
        return true;
    });

    if (vehicles.length === 0) {
        elements.liveList.innerHTML = `
            <div class="no-data-card">
                <div class="icon">🚌</div>
                <h3>Aktif Otobüs Yok</h3>
                <p>Bu durakta şu anda aktif otobüs bulunmuyor.</p>
            </div>
        `;
        return;
    }

    const byTime = {};
    vehicles.forEach(vehicle => {
        const time = vehicle.sure || vehicle.san || 'Bilinmiyor';
        if (!byTime[time]) byTime[time] = [];
        byTime[time].push(vehicle);
    });

    const sortedTimes = Object.keys(byTime).sort((a, b) => {
        const numA = parseInt(a.replace(/[^0-9]/g, '')) || 999;
        const numB = parseInt(b.replace(/[^0-9]/g, '')) || 999;
        return numA - numB;
    });

    // DÜZELTME: Tüm inline CSS'ler kaldırıldı, sınıflar üzerinden atama yapıldı ve kırık div yapısı düzeltildi.
    let html = `
        <div class="live-summary-card">
            <div class="summary-wrapper">
                <div>
                    <h3>🚌 Yaklaşan Otobüsler</h3>
                    <p>Toplam ${vehicles.length} otobüs yaklaşıyor</p>
                </div>
                <div class="refresh-badge">
                    🔄 Otomatik yenileme: 30s
                </div>
            </div>
        </div>
    `;

    sortedTimes.forEach(time => {
        const vehiclesAtTime = byTime[time];
        const isUrgent = parseInt(time) <= 5;
        const groupClass = isUrgent ? 'time-group urgent' : 'time-group';
        const urgencyText = isUrgent ? '🔥 EN YAKIN' : '⏱️ Yaklaşan';

        html += `
            <div class="${groupClass}">
                <div class="time-header">
                    <div class="icon">⏱️</div>
                    <div class="time-info">
                        <div class="time-text">${escapeHtml(time)} dakika içinde</div>
                        <div class="urgency-text">${urgencyText} • ${vehiclesAtTime.length} otobüs</div>
                    </div>
                    <div class="count-badge">${vehiclesAtTime.length}</div>
                </div>
                <div class="vehicles-list">
                    ${vehiclesAtTime.map(vehicle => {
                        const busNo = vehicle.arac_no || vehicle.arac || '-';
                        const plakaNo = vehicle.plaka_no || vehicle.plaka || '';
                        const busCode = vehicle.hat_kod || vehicle.hat || vehicle.kod || vehicle.line || '-';
                        
                        let badges = '';
                        if (busNo !== '-') {
                            badges += `<span class="badge badge-bus">🚌 ${escapeHtml(busCode)}</span>`;
                        }
                        if (plakaNo) {
                            badges += `<span class="badge badge-plate">🚗 ${escapeHtml(plakaNo)}</span>`;
                        }
                        if (vehicle.trafik?.trafficLevel) {
                            const level = vehicle.trafik.trafficLevel;
                            const heavy = ['yogun', 'az_yogun', 'cok_yogun', 'çok_yoğun'].includes(level);
                            const trafficClass = heavy ? 'traffic-heavy' : 'traffic-normal';
                            badges += `<span class="badge ${trafficClass}">🚦 ${escapeHtml(vehicle.trafik.label || level)}</span>`;
                        }

                        return `
                            <div class="vehicle-item">
                                <div class="vehicle-main">
                                    <div class="badges-row">${badges || '<span class="text-muted">🚌 Otobüs</span>'}</div>
                                    ${busCode !== '-' ? `<div class="info-line">🛤️ Otobüs: ${escapeHtml(busNo)}</div>` : ''}
                                    ${vehicle.hiz ? `<div class="info-line text-success">⚡ Hız: ${escapeHtml(vehicle.hiz)} km/s</div>` : ''}
                                </div>
                                <div class="vehicle-meta">
                                    ${vehicle.detay ? `<div class="detail-text">${escapeHtml(vehicle.detay)}</div>` : ''}
                                    ${vehicle.trafik?.avgDelayText ? `<div class="delay-text">🕐 ${escapeHtml(vehicle.trafik.avgDelayText)} dk gecikme</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });

    elements.liveList.innerHTML = html;
}

// Geo Search
async function searchGeo(query) {
    if (!query.trim()) {
        elements.geoResults.innerHTML = '';
        return;
    }

    const requestId = ++geoRequestSeq;
    if (geoController) geoController.abort();
    geoController = new AbortController();

    try {
        showLoading(elements.geoLoading);
        elements.geoResults.innerHTML = '';

        const params = new URLSearchParams({ q: query, limit: 10 });
        const response = await fetch(`${API_BASE}/api/geocode?${params.toString()}`, {
            headers: { 'Accept': 'application/json' },
            signal: geoController.signal
        });

        let data;
        try {
            data = await response.json();
        } catch (error) {
            if (isAbortError(error)) throw error;
            throw new Error(`Geçersiz yanıt alındı (HTTP ${response.status}).`);
        }

        if (requestId !== geoRequestSeq) return;

        if (!response.ok) {
            throw new Error(data.error || `İstek başarısız oldu (HTTP ${response.status}).`);
        }

        if (data.type === 'FeatureCollection' && data.features && data.features.length > 0) {
            renderGeoResults(data.features);
        } else {
            elements.geoResults.innerHTML = '<p class="empty-message">Sonuç bulunamadı</p>';
        }
    } catch (error) {
        if (isAbortError(error) || requestId !== geoRequestSeq) return;
        elements.geoResults.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
    } finally {
        if (requestId === geoRequestSeq) hideLoading(elements.geoLoading);
    }
}

function renderGeoResults(features) {
    elements.geoResults.innerHTML = features.map(feature => {
        const props = feature.properties || {};
        const coords = (feature.geometry && feature.geometry.coordinates) || [];
        if (coords.length < 2) return '';

        const lat = Number(coords[1]);
        const lng = Number(coords[0]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';

        const name = props.name || 'Bilinmeyen Yer';
        return `
            <div class="result-card"
                 data-geo-lat="${lat}" data-geo-lng="${lng}" data-geo-name="${escapeHtml(name)}">
                <h4>${escapeHtml(name)}</h4>
                <p><strong>Tür:</strong> ${escapeHtml(props.osm_value || 'Diğer')}</p>
                ${props.city ? `<p><strong>Şehir:</strong> ${escapeHtml(props.city)}</p>` : ''}
                ${props.state ? `<p><strong>İl:</strong> ${escapeHtml(props.state)}</p>` : ''}
                <div class="meta">
                    📍 ${lat}, ${lng}
                </div>
            </div>
        `;
    }).join('');
}

// Bir konumun yakınındaki durakları göster
async function showNearbyStops(lat, lng, name = '') {
    elements.modalTitle.textContent = `📍 ${name || 'Konum'} yakınındaki duraklar`;
    elements.modalBody.innerHTML = '<div class="loading">Yakın duraklar aranıyor...</div>';
    elements.modal.classList.remove('hidden');

    try {
        const data = await apiRequest(API_ENDPOINTS.yakinDuraklar, {
            FNC: 'YakinDuraklar',
            LAT: lat,
            LNG: lng,
            MSF: 500,
            LAN: 'tr'
        });

        const stops = data.table || [];
        if (stops.length === 0) {
            elements.modalBody.innerHTML = '<p class="empty-message">Yakında durak bulunamadı.</p>';
            return;
        }

        elements.modalBody.innerHTML = `
            <div class="modal-header">
                <h3>📍 Yakın Duraklar</h3>
                <p>${stops.length} durak bulundu</p>
            </div>
            <div class="modal-scroll">
                ${stops.map(stop => `
                    <div class="stop-card clickable" data-action="stop-details" data-stop-code="${escapeHtml(stop.kod)}">
                        <div class="stop-info">
                            <div class="stop-name">${escapeHtml(stop.ad)}</div>
                            <div class="stop-code">📍 ${escapeHtml(stop.kod)}${stop.detay ? ' • ' + escapeHtml(stop.detay) : ''}</div>
                            ${stop.hatlar ? `<div class="stop-location">🚌 ${escapeHtml(stop.hatlar)}</div>` : ''}
                        </div>
                        <div class="stop-number">›</div>
                    </div>
                `).join('')}
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" data-action="home">🏠 Ana Sayfaya Dön</button>
            </div>
        `;
    } catch (error) {
        elements.modalBody.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
    }
}

// Load Announcements
async function loadAnnouncements() {
    try {
        showLoading(elements.announcementsList);

        const data = await apiRequest(API_ENDPOINTS.duyurular, { FNC: 'Duyurular', LAN: 'tr' });

        if (data.table && data.table.length > 0) {
            state.announcements = data.table;
            renderAnnouncements(state.announcements);
        } else {
            elements.announcementsList.innerHTML = '<p class="empty-message">Duyuru bulunamadı</p>';
        }
    } catch (error) {
        elements.announcementsList.innerHTML = `<p class="error-message">Hata: ${escapeHtml(error.message)}</p>`;
    }
}

function renderAnnouncements(announcements) {
    if (announcements.length === 0) {
        elements.announcementsList.innerHTML = '<p class="empty-message">Duyuru bulunamadı</p>';
        return;
    }

    elements.announcementsList.innerHTML = announcements.map(ann => `
        <div class="announcement-item">
            <h4>${escapeHtml(ann.baslik || 'Duyuru')}</h4>
            <div class="date">${escapeHtml(ann.tarih || '')}</div>
        </div>
    `).join('');
}

// Utility Functions
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function isAbortError(error) {
    return Boolean(error) && (error.name === 'AbortError' || error.code === 20);
}

function showLoading(element) {
    if (element) {
        element.classList.remove('hidden');
    }
}

function hideLoading(element) {
    if (element) {
        element.classList.add('hidden');
    }
}
