// NOTE: This app no longer uses the Gemini API for cleanliness reports.
// It has been replaced with a real scientific data source from Copernicus Marine Service.

const APP_VERSION = '9.1.0'; // Increment this to show the popup for new users/updates

/**
 * Configuration for the "What's New" popup.
 * To show the popup, ensure the `version` here matches `APP_VERSION`.
 * The content is dynamically built from the `features` array and supports multiple languages.
 */
const WHATS_NEW_CONFIG = {
    version: '9.1.0',
    features: [
        {
            title: {
                en: '♿ Accessibility & Design Refresh',
                bg: '♿ Достъпност и обновен дизайн'
            },
            description: {
                en: "FlagWatch is now fully keyboard- and screen-reader-friendly (WCAG 2.2 AA): a redesigned beach card, a cleaner detail view with the safety flag front and centre, clearer high-contrast colours, and a new minimalist map with a true dark mode. Status is never shown by colour alone.",
                bg: "FlagWatch вече е напълно достъпен с клавиатура и екранен четец (WCAG 2.2 AA): преработена карта на плажа, по-ясен изглед с флага за безопасност на видно място, по-контрастни цветове и нова минималистична карта с истински тъмен режим. Статусът никога не се показва само чрез цвят."
            },
        },
        {
            title: {
                en: '🏖️ Massive Beach Expansion!',
                bg: '🏖️ Мащабно разширение на плажовете!'
            },
            description: {
                en: "We've massively expanded our database from 15 to 56 beaches! The app now covers the entire Bulgarian Black Sea coast, from Durankulak to Rezovo, including popular wild beaches.",
                bg: "Разширихме мащабно базата си данни от 15 на 56 плажа! Приложението вече покрива цялото българско Черноморие, от Дуранкулак до Резово, включително популярни диви плажове."
            },
        },
        {
            title: {
                en: '🔬 Real Scientific Algae Data',
                bg: '🔬 Научни данни за водорасли в реално време'
            },
            description: {
                en: "Cleanliness reports are now powered by real satellite data from the EU's Copernicus Marine Service, providing accurate, science-based algae bloom information.",
                bg: "Докладите за чистота вече се базират на реални сателитни данни от Морската служба на ЕС „Коперник“, предоставяйки точна, научнообоснована информация за цъфтежа на водорасли."
            },
        },
        {
            title: {
                en: '🌗 Full Dark Mode Support',
                bg: '🌗 Пълна поддръжка на тъмен режим'
            },
            description: {
                en: "Enjoy a beautiful new dark theme, perfect for night-time viewing. Find the toggle in the Settings menu (⚙️). It also respects your system's default theme!",
                bg: "Насладете се на красива нова тъмна тема, идеална за нощно гледане. Намерете превключвателя в менюто с настройки (⚙️). Тя също така уважава темата по подразбиране на вашата система!"
            },
        },
        {
            title: {
                en: '🗺️ Enhanced Map Markers',
                bg: '🗺️ Подобрени маркери на картата'
            },
            description: {
                en: "See the cleanliness status at a glance! Beach markers on the map now include a small colored dot to indicate algae conditions.",
                bg: "Вижте състоянието на чистотата с един поглед! Маркерите на плажовете на картата вече включват малка цветна точка, която показва състоянието на водораслите."
            },
        },
         {
            title: {
                en: '🎁 See Updates Anytime',
                bg: '🎁 Вижте новостите по всяко време'
            },
            description: {
                en: "Missed what's new? You can now open this update panel anytime by clicking the gift icon (🎁) in the header.",
                bg: "Пропуснали сте какво е новото? Вече можете да отворите този панел с актуализации по всяко време, като кликнете върху иконата за подарък (🎁) в заглавната част."
            },
        }
    ]
};

// Bulgarian Black Sea Beach Safety App
class BeachSafetyApp {
    // Class properties
    currentLanguage;
    userLocation;
    map;
    markers;
    beaches;
    currentView;
    currentFilter;
    isOffline;
    currentBeach;
    deferredPrompt;
    userLocationMarker;

    constructor() {
        this.currentLanguage = localStorage.getItem('beach-app-language') || 'en';
        this.userLocation = null;
        this.map = null;
        this.markers = [];
        this.beaches = []; // Will be populated with static data first, then live data
        this.currentView = 'map';
        this.currentFilter = 'all';
        this.isOffline = !navigator.onLine;
        this.currentBeach = null;
        this.deferredPrompt = null;
        this.userLocationMarker = null;
        this.searchTerm = '';
        this.tileLayer = null;
        this.activeModal = null;
        this.lastFocusedEl = null;
        this.trendRange = '7d';
        this.eventSource = null;

        // Expose the app instance to the global scope for event handlers in HTML
        window.app = this;
        
        // Initialize app
        this.init();
    }

    async init() {
        // Setup event listeners
        this.setupEventListeners();

        // Apply theme early to avoid flash of light mode
        this.applyTheme();

        // Apply language
        this.applyLanguage();

        // Load static beach metadata, then reveal immediately (no artificial wait).
        // The list/map show honest "loading" states until live conditions arrive.
        await this.loadStaticBeachData();
        this.updateAllViews();
        this.revealApp();

        // Initialise the map right away; size it once it's visible.
        this.initializeMap();
        if (this.map) this.map.invalidateSize();

        this.setupPWA();
        this.requestLocation();

        // Fetch live conditions, then re-render with them.
        await this.fetchAllData();
        this.updateAllViews();
        if (this.beaches.some(b => b.conditions)) {
            this.announce(this.t('beachesLoaded', { n: this.beaches.filter(b => b.conditions).length }));
        }

        // Check for new features
        this.checkWhatsNew();

        // Setup offline/online handlers
        this.setupNetworkHandlers();

        // Live updates: the Fly server pushes an event the moment a new build lands.
        this.setupLiveUpdates();

        // Periodic refresh as a FALLBACK in case the SSE stream is blocked/dropped.
        setInterval(async () => {
            if (!this.isOffline) {
                console.log('Refreshing weather and cleanliness data...');
                await this.fetchAllData();
                this.updateAllViews();
            }
        }, 30 * 60 * 1000); // 30 minutes
    }

    // Hide the loading screen and show the app (called as soon as there's honest content).
    revealApp() {
        const ls = document.getElementById('loading-screen');
        if (ls) ls.style.display = 'none';
        const app = document.getElementById('app');
        if (app) app.classList.remove('hidden');
    }
    
    updateAllViews() {
        this.renderAllLists();
        if (this.map) {
            this.addBeachMarkers();
        }
        if (this.currentBeach) {
            const updatedBeach = this.beaches.find(b => b.id === this.currentBeach.id);
            if (updatedBeach) {
                this.currentBeach = updatedBeach;
                this.refreshBeachDetailModal();
            }
        }
    }

    async loadStaticBeachData() {
        // Loads the static, unchanging metadata for all beaches from /data/beaches.json.
        // This gives an instant render before the live data (conditions, cleanliness) is fetched.
        try {
            const response = await fetch('/data/beaches.json');
            if (!response.ok) {
                throw new Error(`Static beach data returned status ${response.status}`);
            }
            this.beaches = await response.json();
        } catch (error) {
            console.error('Error loading static beach data:', error);
            // Fall back to a previous (validated) live-data cache so the app can still render something.
            const cached = this.readValidCache();
            this.beaches = cached ? cached.beaches : [];
            if (cached) console.log('Static data fetch failed. Using cached beach data.');
        }
    }
    
    // Read and validate the cached snapshot. Returns { timestamp, beaches } or null.
    // A corrupt entry is dropped so one bad write can never brick the app on load.
    readValidCache() {
        const raw = localStorage.getItem('beach-app-data');
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.beaches) && parsed.beaches.length) {
                return parsed;
            }
        } catch (e) {
            console.warn('Discarding corrupt cached beach data:', e);
            localStorage.removeItem('beach-app-data');
        }
        return null;
    }

    async fetchAllData(force = false) {
        const cached = this.readValidCache();

        // Use cache if it's less than 30 mins old — unless forced (e.g. an SSE live update).
        if (!force && cached && (new Date() - new Date(cached.timestamp) < 30 * 60 * 1000)) {
            this.beaches = cached.beaches;
            console.log("Using fresh cached data.");
            this.hideDataError();
            return;
        }

        if (this.isOffline) {
            console.log("Offline mode, using cached beach data if available.");
            if (cached) {
                this.beaches = cached.beaches;
                this.showStaleNotice(cached.timestamp);
            } else {
                this.showDataError();
            }
            return;
        }

        try {
            console.log("Fetching all live data from /api/beaches...");
            // GET the merged static + live records as a JSON array (no request body).
            const response = await fetch('/api/beaches');

            if (!response.ok) {
                throw new Error(`Live data endpoint returned status ${response.status}`);
            }

            const liveBeachData = await response.json();
            if (!Array.isArray(liveBeachData) || !liveBeachData.length) {
                throw new Error('Live data was not a usable array');
            }

            this.beaches = liveBeachData;
            localStorage.setItem('beach-app-data', JSON.stringify({
                timestamp: new Date().toISOString(),
                beaches: this.beaches
            }));
            this.hideDataError();

        } catch (error) {
            console.error('Error fetching live data from /api/beaches:', error);
            // Fall back to cached data if valid; surface that it is stale (not live).
            if (cached) {
                this.beaches = cached.beaches;
                console.log("Live fetch failed. Using stale cached data.");
                this.showStaleNotice(cached.timestamp);
            } else {
                console.error("No cached data available and live fetch failed.");
                this.showDataError();
            }
        }
    }

    showDataError() {
        const banner = document.getElementById('data-error');
        const textEl = document.getElementById('data-error-text');
        if (textEl) textEl.textContent = this.translations[this.currentLanguage].dataError;
        if (banner) banner.classList.remove('hidden');
    }

    // Shown when serving saved (possibly stale) data because the live fetch failed —
    // so a user never mistakes hours-old conditions for live ones.
    showStaleNotice(timestamp) {
        const banner = document.getElementById('data-error');
        const textEl = document.getElementById('data-error-text');
        if (textEl) {
            const t = timestamp ? new Date(timestamp).toLocaleString() : '—';
            textEl.textContent = `${this.translations[this.currentLanguage].staleData} (${t})`;
        }
        if (banner) banner.classList.remove('hidden');
    }

    hideDataError() {
        const banner = document.getElementById('data-error');
        if (banner) banner.classList.add('hidden');
    }

    // Null-safe formatter: returns '—' for null/undefined/NaN, else the number formatted with the unit.
    fmt(v, unit = '', digits = 1) {
        if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) {
            return '—';
        }
        const num = Number(v);
        if (Number.isNaN(num)) return '—';
        return `${num.toFixed(digits)}${unit}`;
    }

    // Convert a wind direction in degrees to a 16-point compass cardinal.
    degToCardinal(deg) {
        if (deg === null || deg === undefined || Number.isNaN(Number(deg))) return null;
        const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const idx = Math.round((Number(deg) % 360) / 22.5) % 16;
        return dirs[idx];
    }

    setupEventListeners() {
        // Mobile tabs
        document.getElementById('map-tab').addEventListener('click', () => this.setView('map'));
        document.getElementById('list-tab').addEventListener('click', () => this.setView('list'));

        // Language toggle
        document.getElementById('language-toggle').addEventListener('click', () => this.toggleLanguage());
        document.getElementById('language-toggle-desktop').addEventListener('click', () => this.toggleLanguage());

        // Modals
        document.getElementById('settings-btn').addEventListener('click', () => this.toggleModal('settings-modal', true));
        document.getElementById('settings-btn-desktop').addEventListener('click', () => this.toggleModal('settings-modal', true));
        document.getElementById('close-settings').addEventListener('click', () => this.toggleModal('settings-modal', false));
        document.querySelector('#settings-modal .modal-backdrop').addEventListener('click', () => this.toggleModal('settings-modal', false));
        
        document.getElementById('whats-new-btn').addEventListener('click', () => this.populateAndOpenWhatsNewModal());
        document.getElementById('whats-new-btn-desktop').addEventListener('click', () => this.populateAndOpenWhatsNewModal());
        document.getElementById('close-whats-new').addEventListener('click', () => this.toggleModal('whats-new-modal', false));
        document.getElementById('dismiss-whats-new').addEventListener('click', () => this.toggleModal('whats-new-modal', false));
        document.querySelector('#whats-new-modal .modal-backdrop').addEventListener('click', () => this.toggleModal('whats-new-modal', false));
        
        document.getElementById('close-modal').addEventListener('click', () => this.toggleModal('beach-modal', false));
        document.querySelector('#beach-modal .modal-backdrop').addEventListener('click', () => this.toggleModal('beach-modal', false));

        // Search — single source of truth; both inputs kept in sync.
        const onSearch = (e) => {
            this.searchTerm = e.target.value;
            this.syncSearchInputs(e.target);
            this.renderAllLists();
            this.announceListCount();
        };
        document.getElementById('search-input').addEventListener('input', onSearch);
        document.getElementById('search-input-desktop').addEventListener('input', onSearch);

        // Filter chips as an ARIA radiogroup (click + arrow-key roving selection).
        this.setupFilters();

        // Trend-range toggle (7d / 24h) in the beach-detail modal.
        this.setupTrendRange();

        // Map controls
        document.getElementById('locate-btn').addEventListener('click', () => this.panToUserLocation());

        // Dark mode toggle
        document.getElementById('dark-mode-toggle').addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        
        // PWA Install button
        document.getElementById('install-btn').addEventListener('click', () => this.promptInstall());

        // Beach-modal footer actions
        document.getElementById('show-on-map').addEventListener('click', () => this.showCurrentBeachOnMap());
        document.getElementById('get-directions').addEventListener('click', () => this.openDirections());
        document.getElementById('share-location').addEventListener('click', () => this.shareBeachLocation());
    }

    // Minimal HTML escaper for interpolated text (names come from controlled data,
    // but escaping keeps innerHTML construction safe).
    escape(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    syncSearchInputs(source) {
        ['search-input', 'search-input-desktop'].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el !== source && el.value !== this.searchTerm) el.value = this.searchTerm;
        });
    }

    // Wire each filter radiogroup: click selects; arrow/Home/End move + select (roving).
    setupFilters() {
        document.querySelectorAll('.filter-controls[role="radiogroup"]').forEach((group) => {
            group.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-btn');
                if (btn && group.contains(btn)) this.setFilter(btn.dataset.filter);
            });
            group.addEventListener('keydown', (e) => this.handleRadioKeydown(e, group));
        });
    }

    handleRadioKeydown(e, group) {
        const radios = Array.from(group.querySelectorAll('.filter-btn'));
        if (!radios.length) return;
        const current = radios.findIndex((r) => r.dataset.filter === this.currentFilter);
        let idx = current < 0 ? 0 : current;
        switch (e.key) {
            case 'ArrowRight': case 'ArrowDown': idx = (idx + 1) % radios.length; break;
            case 'ArrowLeft':  case 'ArrowUp':   idx = (idx - 1 + radios.length) % radios.length; break;
            case 'Home': idx = 0; break;
            case 'End': idx = radios.length - 1; break;
            default: return;
        }
        e.preventDefault();
        this.setFilter(radios[idx].dataset.filter);
        radios[idx].focus();
    }

    // Select a flag filter and sync BOTH radiogroups (aria-checked, roving tabindex, .active).
    setFilter(filter) {
        if (!filter) return;
        this.currentFilter = filter;
        document.querySelectorAll('.filter-btn').forEach((btn) => {
            const on = btn.dataset.filter === filter;
            btn.setAttribute('aria-checked', on ? 'true' : 'false');
            btn.classList.toggle('active', on);
            btn.tabIndex = on ? 0 : -1; // one tab stop per group: the checked radio
        });
        this.renderAllLists();
        if (this.map) this.addBeachMarkers();
        this.announceListCount();
    }

    // Announce how many beaches are currently shown (filter/search result) to AT.
    announceListCount() {
        if (!this.beaches.some((b) => b.conditions)) return;
        const term = (this.searchTerm || '').toLowerCase();
        const withData = this.beaches.filter((b) => b.conditions);
        const shown = withData.filter((b) => {
            const name = this.currentLanguage === 'bg' ? b.name_bg : b.name;
            const matchesSearch = name.toLowerCase().includes(term);
            const matchesFilter = this.currentFilter === 'all' || b.conditions.flag === this.currentFilter;
            return matchesSearch && matchesFilter;
        }).length;
        this.announce(this.t('filterResults', { n: shown, total: withData.length }));
    }

    initializeMap() {
        if (this.map) return;
        try {
            const reduce = this.prefersReducedMotion();
            this.map = L.map('map', {
                center: [42.7, 27.7], // Centered on Bulgarian coast
                zoom: 8,
                zoomControl: false, // We have custom controls
                zoomAnimation: !reduce,
                fadeAnimation: !reduce,
                markerZoomAnimation: !reduce,
            });
            // CARTO basemap (Positron / dark_matter). A native dark style means we no longer
            // CSS-invert the tiles — which previously corrupted the flag/algae marker colours.
            this.tileLayer = L.tileLayer(this.getTileUrl(), {
                subdomains: 'abcd',
                maxZoom: 20,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            }).addTo(this.map);
            this.addBeachMarkers();
            console.log("Map initialized successfully");
        } catch (e) {
            console.error("Could not initialize map:", e);
        }
    }

    prefersReducedMotion() {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    // Pick the CARTO style for the current theme.
    getTileUrl() {
        const dark = document.body.classList.contains('dark-mode');
        return `https://{s}.basemaps.cartocdn.com/${dark ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`;
    }

    updateMapTiles() {
        if (this.tileLayer && this.tileLayer.setUrl) this.tileLayer.setUrl(this.getTileUrl());
    }

    addBeachMarkers() {
        if (!this.map || !this.beaches.length) return;
        // Clear existing markers
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        const lang = this.currentLanguage;
        this.beaches.forEach(beach => {
            if (!beach.conditions) return; // Don't render markers if live data isn't available
            const flag = beach.conditions.flag;

            // Respect the current filter. A specific colour filter only matches that flag;
            // a null flag (unknown) is shown only under 'all'.
            if (this.currentFilter !== 'all' && flag !== this.currentFilter) return;

            const flagKey = flag || 'unknown';
            const flagEmoji = flag === 'red' ? '🔴' : flag === 'yellow' ? '🟡' : flag === 'green' ? '🟢' : '⚪';
            const cleanlinessStatus = beach.cleanliness?.status || 'unavailable';
            // Algae shown by SHAPE (a leaf), not colour alone (WCAG 1.4.1). Clear/unavailable
            // show no leaf — the full status is in the marker's accessible name and the modal.
            const algaeBadge = cleanlinessStatus === 'high' ? '🌿🌿' : cleanlinessStatus === 'moderate' ? '🌿' : '';

            const name = lang === 'bg' ? beach.name_bg : beach.name;
            const flagText = this.translations[lang].flags[flagKey];
            const algaeText = this.translations[lang].algaeStatus[cleanlinessStatus] || this.translations[lang].algaeStatus.unavailable;
            const label = `${name}: ${flagText}, ${this.t('mapStatusAlgae')} ${algaeText}`;

            const markerIcon = L.divIcon({
                className: `custom-marker-icon ${flagKey}`,
                html: `<div class="flag-emoji ${flagKey}" aria-hidden="true">${flagEmoji}</div>`
                    + (algaeBadge ? `<div class="cleanliness-badge ${cleanlinessStatus}" aria-hidden="true">${algaeBadge}</div>` : '')
                    + `<span class="visually-hidden">${this.escape(label)}</span>`,
                iconSize: [30, 42],
                // Round marker (the flag disc is vertically centred in the box),
                // so the geographic point is the box centre — not the bottom edge.
                iconAnchor: [15, 21]
            });

            const marker = L.marker([beach.coordinates.lat, beach.coordinates.lng], { icon: markerIcon, keyboard: true, title: label })
                .addTo(this.map)
                .on('click', () => this.openBeachDetailModal(beach.id));

            // Custom divIcon markers aren't keyboard/SR-ready by default — label and wire keys.
            const el = marker.getElement && marker.getElement();
            if (el) {
                el.setAttribute('role', 'button');
                el.setAttribute('tabindex', '0');
                el.setAttribute('aria-label', label);
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openBeachDetailModal(beach.id); }
                });
            }

            this.markers.push(marker);
        });
    }

    renderAllLists() {
        this.renderBeachList('beach-list'); // Mobile
        this.renderBeachList('beach-list-desktop'); // Desktop
    }

    renderBeachList(containerId) {
        const listContainer = document.getElementById(containerId);
        const lang = this.currentLanguage;
        listContainer.innerHTML = '';
        if (!this.beaches.length || !this.beaches.some(b => b.conditions)) {
            const msg = this.isOffline ? this.translations[lang].dataError : this.translations[lang].loadingText;
            listContainer.innerHTML = `<li class="no-results"><p>${msg}</p></li>`;
            return;
        }

        const searchTerm = (this.searchTerm || '').toLowerCase();

        const filteredBeaches = this.beaches.filter(beach => {
            if (!beach.conditions) return false;
            const name = lang === 'bg' ? beach.name_bg : beach.name;
            const matchesSearch = name.toLowerCase().includes(searchTerm);
            const matchesFilter = this.currentFilter === 'all' || beach.conditions.flag === this.currentFilter;
            return matchesSearch && matchesFilter;
        });

        if (filteredBeaches.length === 0) {
            listContainer.innerHTML = `<li class="no-results"><p>${this.translations[lang].noResults}</p></li>`;
            return;
        }

        filteredBeaches.forEach(beach => {
            const li = document.createElement('li');
            li.className = 'beach-item';
            li.dataset.beachId = beach.id;

            const flag = beach.conditions.flag;
            const flagKey = flag || 'unknown';
            const flagEmoji = flag === 'red' ? '🔴' : flag === 'yellow' ? '🟡' : flag === 'green' ? '🟢' : '⚪';
            // Flag status as a word (strip the leading emoji) for the card's accessible name.
            const flagWord = (this.translations[lang].flags[flagKey] || '').replace(/^\S+\s+/, '');
            const name = lang === 'bg' ? beach.name_bg : beach.name;
            const nameSecondary = lang === 'bg' ? beach.name : beach.name_bg;

            let distanceHTML = '';
            if (this.userLocation && beach.distance) {
                distanceHTML = `<span class="beach-distance">${beach.distance.toFixed(1)} km</span>`;
            }

            // Stretched-button card: the <button> holds the name (its accessible name +
            // a hidden flag-status suffix); ::after makes the whole <li> one click target.
            li.innerHTML = `
                <div class="beach-item-header">
                    <div>
                        <h3 class="beach-name"><button type="button" class="beach-item__btn">${this.escape(name)}<span class="visually-hidden"> — ${this.escape(flagWord)}</span></button></h3>
                        <p class="beach-name-bg">${this.escape(nameSecondary)}</p>
                    </div>
                    <span class="flag-glyph" aria-hidden="true">${flagEmoji}</span>
                </div>
                <div class="beach-info">
                    <div>${this.getFacilityIcons(beach.facilities)}</div>
                    ${distanceHTML}
                </div>
            `;
            li.querySelector('.beach-item__btn').addEventListener('click', () => this.openBeachDetailModal(beach.id));
            listContainer.appendChild(li);
        });
    }

    getFacilityIcons(facilities) {
        if (!facilities) return '<span aria-hidden="true">-</span>';
        const names = this.translations[this.currentLanguage].facilityNames;
        const map = [['lifeguards', '🛟'], ['restaurants', '🍽️'], ['blueflag', '🌊'], ['family', '👨‍👩‍👧‍👦']];
        let icons = '';
        for (const [key, emoji] of map) {
            if (facilities[key]) {
                const label = names[key] || key;
                // role=img + aria-label gives the emoji a reliable name for screen readers
                // (title alone is unreliable); listed as text in the modal too.
                icons += `<span class="facility-icon" role="img" aria-label="${this.escape(label)}">${emoji}</span>`;
            }
        }
        return icons || '<span aria-hidden="true">-</span>';
    }

    openBeachDetailModal(beachId) {
        this.currentBeach = this.beaches.find(b => b.id === beachId);
        if (!this.currentBeach || !this.currentBeach.conditions) return;

        this.refreshBeachDetailModal();
        this.toggleModal('beach-modal', true);
        this.loadTrends(beachId); // async; renders sparklines (or an honest empty state)
    }
    
    refreshBeachDetailModal() {
        if (!this.currentBeach) return;
        const beach = this.currentBeach;
        const lang = this.currentLanguage;
        
        const c = beach.conditions || {};
        const cleanliness = beach.cleanliness || {};

        const name = lang === 'bg' ? beach.name_bg : beach.name;
        document.getElementById('beach-modal-title').textContent = name;

        // Flag — null flag means UNKNOWN (neutral), never green.
        const flagKey = c.flag || 'unknown';
        const flagText = this.translations[lang].flags[flagKey];
        const flagIndicator = document.getElementById('beach-flag');
        flagIndicator.textContent = `${this.translations[lang].flagStatus}: ${flagText}`;
        flagIndicator.className = `flag-hero ${flagKey}`;

        // Conditions — backend returns NUMBERS or null; render null-safely.
        document.getElementById('wind-value').textContent = this.fmt(c.windSpeed, ' km/h', 0);
        document.getElementById('waves-value').textContent = this.fmt(c.waveHeight, ' m', 2);
        document.getElementById('water-temp-value').textContent = this.fmt(c.waterTemp, '°C', 1);
        document.getElementById('air-temp-value').textContent = this.fmt(c.airTemp, '°C', 1);
        document.getElementById('uv-index-value').textContent = this.fmt(c.uvIndex, '', 1);

        // Wind gusts (km/h) and wind direction (degrees, with compass cardinal when available).
        const gustEl = document.getElementById('wind-gust-value');
        if (gustEl) gustEl.textContent = this.fmt(c.windGust, ' km/h', 0);

        const dirEl = document.getElementById('wind-direction-value');
        if (dirEl) {
            if (c.windDirection === null || c.windDirection === undefined || Number.isNaN(Number(c.windDirection))) {
                dirEl.textContent = '—';
            } else {
                const cardinal = this.degToCardinal(c.windDirection);
                dirEl.textContent = cardinal
                    ? `${this.fmt(c.windDirection, '°', 0)} (${cardinal})`
                    : this.fmt(c.windDirection, '°', 0);
            }
        }

        // Water temp disclaimer note.
        const disclaimerEl = document.getElementById('water-temp-disclaimer');
        if (disclaimerEl) disclaimerEl.textContent = this.translations[lang].waterTempDisclaimer;

        // Cleanliness — 'unavailable' renders neutral and never implies clean water.
        const cleanlinessStatus = cleanliness.status || 'unavailable';
        const cleanlinessStatusEl = document.getElementById('cleanliness-status');
        cleanlinessStatusEl.textContent = this.translations[lang].algaeStatus[cleanlinessStatus] || this.translations[lang].algaeStatus.unavailable;
        cleanlinessStatusEl.className = `cleanliness-status ${cleanlinessStatus}`;
        document.getElementById('cleanliness-report').textContent = (lang === 'bg' ? cleanliness.report_bg : cleanliness.report_en) || this.translations[lang].algaeStatus.unavailable;

        // Safety message.
        document.getElementById('safety-message').textContent = this.translations[lang].safetyMessages[flagKey];

        // Facilities
        const facilitiesEl = document.getElementById('beach-facilities');
        facilitiesEl.innerHTML = `<h3 class="modal-section-title">${this.translations[lang].facilities}</h3><div class="facilities-list">${Object.keys(beach.facilities || {}).filter(f => beach.facilities[f]).map(f => `<span class="facility-tag">${this.escape(this.translations[lang].facilityNames[f] || f)}</span>`).join('')}</div>`;

        // Last updated — surface as a relative freshness cue (absolute time on hover/title)
        // so stale data is obvious. Honest '—' when we have no timestamp.
        const lastUpdatedEl = document.getElementById('last-updated');
        if (c.lastUpdated) {
            const rel = this.timeAgo(c.lastUpdated);
            lastUpdatedEl.textContent = rel ? this.t('updatedAgo', { t: rel }) : `${this.translations[lang].lastUpdated}: —`;
            lastUpdatedEl.title = `${this.translations[lang].lastUpdated}: ${new Date(c.lastUpdated).toLocaleString()}`;
        } else {
            lastUpdatedEl.textContent = `${this.translations[lang].lastUpdated}: —`;
            lastUpdatedEl.removeAttribute('title');
        }
    }

    setView(view) {
        this.currentView = view;
        const mapTab = document.getElementById('map-tab');
        const listTab = document.getElementById('list-tab');
        mapTab.classList.toggle('active', view === 'map');
        listTab.classList.toggle('active', view === 'list');
        mapTab.setAttribute('aria-pressed', view === 'map' ? 'true' : 'false');
        listTab.setAttribute('aria-pressed', view === 'list' ? 'true' : 'false');

        document.getElementById('map-view').classList.toggle('active', view === 'map');
        document.getElementById('list-view').classList.toggle('active', view === 'list');

        document.getElementById('search-container-mobile').style.display = view === 'list' ? 'block' : 'none';

        if (view === 'map' && this.map) {
            setTimeout(() => this.map.invalidateSize(), 100);
        }
    }

    // Accessible dialog open/close (WAI-ARIA APG dialog pattern): move focus in,
    // trap Tab, close on Escape, make the background inert, restore focus on close.
    toggleModal(modalId, show) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        if (show) this.openModal(modal); else this.closeModal(modal);
    }

    openModal(modal) {
        this.lastFocusedEl = document.activeElement;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        this.activeModal = modal;
        this.setBackgroundInert(modal, true);

        // Move focus into the dialog (close button, else first focusable, else the dialog).
        const target = modal.querySelector('.modal-close') || this.getFocusable(modal)[0] || modal;
        if (target && target.focus) target.focus();

        if (!this.modalKeydownHandler) this.modalKeydownHandler = (e) => this.handleModalKeydown(e);
        document.addEventListener('keydown', this.modalKeydownHandler, true);
    }

    closeModal(modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        this.setBackgroundInert(modal, false);
        if (modal.id === 'beach-modal') this.currentBeach = null;
        if (this.modalKeydownHandler) document.removeEventListener('keydown', this.modalKeydownHandler, true);
        this.activeModal = null;
        // Return focus to the trigger that opened the dialog.
        if (this.lastFocusedEl && this.lastFocusedEl.focus) this.lastFocusedEl.focus();
        this.lastFocusedEl = null;
    }

    // Visible, focusable elements inside a container (for focus + Tab trap).
    getFocusable(container) {
        const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        return Array.from(container.querySelectorAll(sel)).filter(el =>
            !el.closest('.hidden') && !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true'
        );
    }

    // Make every top-level element except the active modal inert while it is open.
    setBackgroundInert(modal, on) {
        Array.from(document.body.children).forEach(el => {
            if (el === modal || el.classList.contains('skip-link')) return;
            el.toggleAttribute('inert', on);
        });
    }

    handleModalKeydown(e) {
        if (!this.activeModal) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            this.closeModal(this.activeModal);
            return;
        }
        if (e.key !== 'Tab') return;
        const f = this.getFocusable(this.activeModal);
        if (!f.length) { e.preventDefault(); return; }
        const first = f[0], last = f[f.length - 1], active = document.activeElement;
        if (e.shiftKey && (active === first || !this.activeModal.contains(active))) {
            e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (active === last || !this.activeModal.contains(active))) {
            e.preventDefault(); first.focus();
        }
    }

    // Announce a message to assistive tech via the polite live region.
    announce(message) {
        const region = document.getElementById('sr-status');
        if (!region || !message) return;
        // Clearing first makes repeat/identical messages re-announce.
        region.textContent = '';
        // Microtask delay so SR notices the change.
        Promise.resolve().then(() => { region.textContent = message; });
    }

    // Format a string template like "{n} of {total}…" with the given values.
    t(key, vars = {}) {
        let s = this.translations[this.currentLanguage][key] || '';
        for (const k in vars) s = s.replace(`{${k}}`, vars[k]);
        return s;
    }

    // Relative time for the freshness cue, e.g. "12 min ago" / "преди 12 мин".
    timeAgo(date) {
        const then = new Date(date).getTime();
        if (Number.isNaN(then)) return null;
        const mins = Math.round((Date.now() - then) / 60000);
        if (mins < 1) return this.t('timeJustNow');
        if (mins < 60) return this.t('timeMinAgo', { n: mins });
        const hours = Math.round(mins / 60);
        if (hours < 24) return this.t('timeHoursAgo', { n: hours });
        return this.t('timeDaysAgo', { n: Math.round(hours / 24) });
    }

    // ---- Live updates (Server-Sent Events) ----
    // The Fly server pushes an "update" event the instant a new build lands; we refetch and
    // re-render. EventSource auto-reconnects, so the 30-min interval is only a fallback.
    setupLiveUpdates() {
        if (typeof EventSource === 'undefined') return;
        try {
            this.eventSource = new EventSource('/api/stream');
            this.eventSource.addEventListener('update', async () => {
                if (this.isOffline) return;
                await this.fetchAllData(true); // force past the local cache
                this.updateAllViews();
                if (this.currentBeach) this.loadTrends(this.currentBeach.id);
                this.announce(this.t('liveUpdated'));
            });
            this.eventSource.onerror = () => {}; // browser handles reconnect; stay quiet
        } catch (e) {
            console.warn('Live updates unavailable:', e);
        }
    }

    // ---- Trend sparklines (condition history from /api/history) ----
    setupTrendRange() {
        const group = document.querySelector('.trends-range[role="radiogroup"]');
        if (!group) return;
        const radios = Array.from(group.querySelectorAll('.range-btn'));
        const select = (range) => {
            this.trendRange = range;
            radios.forEach(r => {
                const on = r.dataset.range === range;
                r.setAttribute('aria-checked', on ? 'true' : 'false');
                r.classList.toggle('active', on);
                r.tabIndex = on ? 0 : -1;
            });
            if (this.currentBeach) this.loadTrends(this.currentBeach.id);
        };
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.range-btn');
            if (btn) select(btn.dataset.range);
        });
        group.addEventListener('keydown', (e) => {
            const i = radios.findIndex(r => r.dataset.range === this.trendRange);
            let idx = i < 0 ? 0 : i;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') idx = (idx + 1) % radios.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') idx = (idx - 1 + radios.length) % radios.length;
            else if (e.key === 'Home') idx = 0;
            else if (e.key === 'End') idx = radios.length - 1;
            else return;
            e.preventDefault();
            select(radios[idx].dataset.range);
            radios[idx].focus();
        });
    }

    async loadTrends(beachId) {
        const body = document.getElementById('trends-body');
        if (!body) return;
        try {
            const res = await fetch(`/api/history?beach=${encodeURIComponent(beachId)}&range=${this.trendRange}`);
            if (!res.ok) throw new Error('history ' + res.status);
            const data = await res.json();
            // Ignore a stale response if the user changed beach / closed the modal meanwhile.
            if (!this.currentBeach || this.currentBeach.id !== beachId) return;
            this.renderTrends(data.samples || []);
        } catch {
            this.renderTrends([]); // honest "not enough history" empty state
        }
    }

    renderTrends(samples) {
        const body = document.getElementById('trends-body');
        if (!body) return;
        const rangeLabel = this.t(this.trendRange === '24h' ? 'range24h' : 'range7d');
        const metrics = [
            { key: 'waterTemp', cls: 'temp', label: this.t('trendTemp'), unit: '°C', digits: 1 },
            { key: 'waveHeight', cls: 'waves', label: this.t('trendWaves'), unit: ' m', digits: 2 },
            { key: 'chl', cls: 'algae', label: this.t('trendAlgae'), unit: ' mg/m³', digits: 2 },
        ];
        const rows = metrics.map(m => this.buildSparkline(samples, m, rangeLabel)).filter(Boolean);
        body.innerHTML = rows.length
            ? rows.join('')
            : `<p class="trends-empty">${this.escape(this.t('trendsEmpty'))}</p>`;
    }

    // Inline-SVG sparkline. Gaps (null samples) BREAK the line — never drawn as zero.
    buildSparkline(samples, m, rangeLabel) {
        const pts = samples.map(s => ({
            t: new Date(s.t).getTime(),
            v: (typeof s[m.key] === 'number' && Number.isFinite(s[m.key])) ? s[m.key] : null,
        }));
        const valid = pts.filter(p => p.v !== null);
        if (valid.length < 2) return ''; // not enough real points to draw this metric
        const W = 280, H = 40, pad = 4;
        const tMin = pts[0].t, tMax = pts[pts.length - 1].t;
        const vs = valid.map(p => p.v);
        const vMin = Math.min(...vs), vMax = Math.max(...vs);
        const xR = (tMax - tMin) || 1, yR = (vMax - vMin) || 1;
        const X = t => pad + ((t - tMin) / xR) * (W - 2 * pad);
        const Y = v => H - pad - ((v - vMin) / yR) * (H - 2 * pad);
        const segs = []; let cur = [];
        for (const p of pts) {
            if (p.v === null) { if (cur.length) { segs.push(cur); cur = []; } continue; }
            cur.push(`${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`);
        }
        if (cur.length) segs.push(cur);
        const lines = segs
            .map(s => `<polyline points="${s.join(' ')}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)
            .join('');
        const last = valid[valid.length - 1];
        const dot = `<circle cx="${X(last.t).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="2.5" fill="currentColor"/>`;
        const fmtV = v => `${v.toFixed(m.digits)}${m.unit}`;
        const aria = this.t('trendAria', { label: m.label, range: rangeLabel, min: fmtV(vMin), max: fmtV(vMax), unit: '' });
        return `<div class="trend-row">
            <div class="trend-meta"><span class="trend-label">${this.escape(m.label)}</span><span class="trend-current">${this.escape(fmtV(last.v))}</span></div>
            <svg class="trend-svg ${m.cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${this.escape(aria)}" preserveAspectRatio="none">${lines}${dot}</svg>
        </div>`;
    }

    requestLocation() {
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    this.calculateDistances();
                    this.renderAllLists();
                    this.addUserLocationMarker();
                },
                (error) => {
                    console.error("Location access denied or failed: ", error);
                }
            );
        }
    }

    calculateDistances() {
        if (!this.userLocation) return;
        this.beaches.forEach(beach => {
            beach.distance = this.getDistance(this.userLocation, beach.coordinates);
        });
        // Sort beaches by distance
        this.beaches.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
    }

    getDistance(coords1, coords2) {
        const R = 6371; // Radius of the Earth in km
        const dLat = (coords2.lat - coords1.lat) * Math.PI / 180;
        const dLon = (coords2.lng - coords1.lng) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coords1.lat * Math.PI / 180) * Math.cos(coords2.lat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    addUserLocationMarker() {
        if (this.map && this.userLocation) {
            if (this.userLocationMarker) {
                this.userLocationMarker.remove();
            }
            const userIcon = L.divIcon({
                className: 'user-location-marker',
                html: '📍',
                iconSize: [20, 20]
            });
            this.userLocationMarker = L.marker([this.userLocation.lat, this.userLocation.lng], { icon: userIcon }).addTo(this.map);
        }
    }


    panToUserLocation() {
        if (this.map && this.userLocation) {
            const target = [this.userLocation.lat, this.userLocation.lng];
            // Honour prefers-reduced-motion: jump instead of an animated fly-to.
            if (this.prefersReducedMotion()) this.map.setView(target, 12);
            else this.map.flyTo(target, 12);
        } else if (!this.userLocation) {
            alert(this.translations[this.currentLanguage].locationNotEnabled);
        }
    }

    setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('SW registered: ', reg))
                .catch(err => console.log('SW registration failed: ', err));
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            document.getElementById('install-btn').classList.remove('hidden');
        });
    }

    promptInstall() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the A2HS prompt');
                }
                this.deferredPrompt = null;
                document.getElementById('install-btn').classList.add('hidden');
            });
        }
    }
    
    setupNetworkHandlers() {
        this.updateOfflineStatus();
        window.addEventListener('online', () => this.updateOfflineStatus());
        window.addEventListener('offline', () => this.updateOfflineStatus());
    }

    async updateOfflineStatus() {
        this.isOffline = !navigator.onLine;
        document.getElementById('offline-indicator').classList.toggle('hidden', !this.isOffline);
        if (!this.isOffline) {
            console.log("Back online. Refreshing data...");
            // If we came back online, refresh data
            await this.fetchAllData();
            this.updateAllViews();
        }
    }
    
    // Close the detail modal, switch to the map view, and centre on the beach.
    showCurrentBeachOnMap() {
        if (!this.currentBeach || !this.map) return;
        const { lat, lng } = this.currentBeach.coordinates;
        this.toggleModal('beach-modal', false);
        this.setView('map');
        // setView() calls invalidateSize() on a 100ms timeout (the map may have been
        // display:none on mobile), so fly after that to land on the right point.
        setTimeout(() => this.map.flyTo([lat, lng], 13), 150);
    }

    // Open Google Maps directions to the beach via the official universal URL
    // (launches the Maps app on mobile if installed).
    openDirections() {
        if (!this.currentBeach) return;
        const { lat, lng } = this.currentBeach.coordinates;
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank', 'noopener');
    }

    shareBeachLocation() {
        if (!this.currentBeach) return;
        const beach = this.currentBeach;
        const name = this.currentLanguage === 'bg' ? beach.name_bg : beach.name;
        const flagStatus = this.translations[this.currentLanguage].flags[beach.conditions?.flag || 'unknown'];
        const text = this.t('shareText', { name, status: flagStatus });
        const url = window.location.href;

        // Prefer the native share sheet (mostly mobile). The Web Share API is absent
        // on most desktop browsers, so fall back to copying the link instead of
        // dead-ending in an error.
        if (navigator.share) {
            navigator.share({ title: 'FlagWatch', text, url }).catch((err) => {
                // A user-cancelled share is not an error; anything else → copy fallback.
                if (err && err.name !== 'AbortError') this.copyShareLink(`${text} ${url}`);
            });
            return;
        }
        this.copyShareLink(`${text} ${url}`);
    }

    // Copy the share text + link to the clipboard with a visible ("Copied!" on the
    // button) and screen-reader confirmation. Degrades clipboard API → execCommand →
    // alert(payload) so the user can always copy it manually as a last resort.
    copyShareLink(payload) {
        const confirm = () => {
            this.announce(this.t('linkCopied'));
            const label = document.getElementById('share-location-text');
            if (label && !label._flashing) {
                label._flashing = true;
                label.textContent = this.t('copied');
                setTimeout(() => {
                    label.textContent = this.translations[this.currentLanguage]['share-location-text'];
                    label._flashing = false;
                }, 2000);
            }
        };
        const legacy = () => {
            try {
                const ta = document.createElement('textarea');
                ta.value = payload;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? confirm() : alert(payload);
            } catch {
                alert(payload);
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(payload).then(confirm).catch(legacy);
        } else {
            legacy();
        }
    }
    
    checkWhatsNew() {
        const lastVersionSeen = localStorage.getItem('app-version-seen');
        if (lastVersionSeen !== APP_VERSION && WHATS_NEW_CONFIG.version === APP_VERSION) {
            this.populateAndOpenWhatsNewModal();
            localStorage.setItem('app-version-seen', APP_VERSION);
        }
    }
    
    populateAndOpenWhatsNewModal() {
        const whatsNewBody = document.getElementById('whats-new-body');
        const lang = this.currentLanguage;
        
        let contentHTML = '';
        WHATS_NEW_CONFIG.features.forEach(feature => {
            const title = feature.title[lang] || feature.title['en'];
            const description = feature.description[lang] || feature.description['en'];
            contentHTML += `
                <div class="settings-section">
                    <h3>${title}</h3>
                    <p>${description}</p>
                </div>
            `;
        });
        
        whatsNewBody.innerHTML = contentHTML;
        this.toggleModal('whats-new-modal', true);
    }
    
    toggleDarkMode(isDark) {
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        this.applyTheme();
    }
    
    applyTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;
        
        document.body.classList.toggle('dark-mode', isDark);
        document.getElementById('dark-mode-toggle').checked = isDark;

        // Keep the PWA theme-color and the CARTO basemap in sync with the theme.
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) themeMeta.setAttribute('content', isDark ? '#1a1b1e' : '#0077be');
        if (this.map) this.updateMapTiles();
    }

    toggleLanguage() {
        this.currentLanguage = this.currentLanguage === 'en' ? 'bg' : 'en';
        localStorage.setItem('beach-app-language', this.currentLanguage);
        this.applyLanguage();
        this.updateAllViews();
        if (this.currentBeach) this.loadTrends(this.currentBeach.id); // re-render sparklines in new lang
        // Announce in the language just switched TO.
        this.announce(this.translations[this.currentLanguage].languageSwitched);
    }

    applyLanguage() {
        const lang = this.currentLanguage;
        const translations = this.translations[lang];
        document.documentElement.lang = lang;
        
        // Update all static text content
        document.querySelectorAll('[id]').forEach(el => {
            if (translations[el.id]) {
                el.textContent = translations[el.id];
            }
        });

        // data-i18n: set textContent from a translation key (for elements whose id
        // does not match a key, e.g. filter chips and new labels).
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[key]) el.textContent = translations[key];
        });
        // data-i18n-aria: set a translated aria-label (icon-only buttons, landmarks, map region).
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            if (translations[key]) el.setAttribute('aria-label', translations[key]);
        });

        // Update placeholders
        document.getElementById('search-input').placeholder = translations.searchPlaceholder;
        document.getElementById('search-input-desktop').placeholder = translations.searchPlaceholder;

        // Explicit wiring for elements whose ids don't match their i18n keys.
        const disclaimerEl = document.getElementById('water-temp-disclaimer');
        if (disclaimerEl) disclaimerEl.textContent = translations.waterTempDisclaimer;
        const dataErrorTextEl = document.getElementById('data-error-text');
        if (dataErrorTextEl) dataErrorTextEl.textContent = translations.dataError;

        // Update language toggle button text
        document.getElementById('language-toggle').textContent = lang === 'en' ? 'BG' : 'EN';
        document.getElementById('language-toggle-desktop').textContent = lang === 'en' ? 'BG' : 'EN';
    }

    translations = {
        en: {
            "app-title": "FlagWatch",
            "app-title-desktop": "FlagWatch",
            "map-tab-text": "Map",
            "list-tab-text": "List",
            "wind-label": "Wind",
            "waves-label": "Waves",
            "water-temp-label": "Water Temp",
            "air-temp-label": "Air Temp",
            "uv-index-label": "UV Index",
            "wind-gust-label": "Wind Gusts",
            "wind-direction-label": "Wind Direction",
            "cleanliness-title": "Algae Report",
            "share-location-text": "Share",
            "settings-modal-title": "Settings",
            "theme-title": "Theme",
            "dark-mode-label": "Dark Mode",
            "flag-legend-title": "Flag Legend",
            "legend-green": "Safe swimming conditions",
            "legend-yellow": "Caution advised",
            "legend-red": "Dangerous conditions",
            "algae-legend-title": "Algae Legend",
            "legend-clear": "Clear: Low Chlorophyll",
            "legend-moderate": "Moderate: Potential algae bloom",
            "legend-high": "High: Widespread algae bloom",
            "legend-unavailable": "Unavailable: No recent satellite data",
            "safety-tips-title": "Safety Tips",
            "safetyTip1": "Always check flag status before entering water",
            "safetyTip2": "Stay close to lifeguarded areas when available",
            "safetyTip3": "Never swim alone in red flag conditions",
            "safetyTip4": "Emergency number: 112",
            "whats-new-modal-title": "What's New!",
            "offline-text": "Offline Mode - Showing cached data",
            "searchPlaceholder": "Search beaches...",
            "flagStatus": "Flag Status",
            "lastUpdated": "Last updated",
            "facilities": "Facilities",
            "noResults": "No beaches match your criteria.",
            "locationNotEnabled": "Location permission is not enabled. Please enable it in your browser settings to use this feature.",
            "sharingNotSupported": "Web Share API is not supported in your browser.",
            "shareText": "Checking out {name} on FlagWatch — current status: {status}.",
            "linkCopied": "Link copied to clipboard.",
            "copied": "Copied!",
            "show-on-map-text": "Show on Map",
            "get-directions-text": "Directions",
            "waterTempDisclaimer": "Water temp is a modeled estimate; shoreline may differ by 2–4°C.",
            "dataError": "Couldn't load live conditions. Check your connection and try again.",
            "staleData": "Showing saved data — live update failed.",
            "skipToContent": "Skip to content",
            "loadingText": "Loading beach conditions…",
            "searchLabel": "Search beaches",
            "beachListHeading": "Beaches",
            "installApp": "Install App",
            "conditionsTitle": "Conditions",
            "filterAll": "All",
            "filterGreen": "Safe",
            "filterYellow": "Caution",
            "filterRed": "Danger",
            "sidebarLabel": "Beaches: search, filter and list",
            "langSwitchLabel": "Switch language (English / Bulgarian)",
            "whatsNewLabel": "What's new",
            "settingsLabel": "Settings",
            "filterGroupLabel": "Filter beaches by flag status",
            "mapRegionLabel": "Map of Black Sea beaches. The same beaches are listed in the List tab.",
            "viewTablistLabel": "Choose map or list view",
            "locateLabel": "Find my location",
            "closeLabel": "Close",
            "mapStatusAlgae": "algae",
            "beachesLoaded": "{n} beaches loaded.",
            "filterResults": "{n} of {total} beaches shown.",
            "languageSwitched": "Language changed to English.",
            "timeJustNow": "just now",
            "timeMinAgo": "{n} min ago",
            "timeHoursAgo": "{n} h ago",
            "timeDaysAgo": "{n} d ago",
            "updatedAgo": "Updated {t}",
            "trendsTitle": "Trends",
            "range7d": "7 days",
            "range24h": "24 hours",
            "trendsRangeLabel": "Trend time range",
            "trendTemp": "Water temp",
            "trendWaves": "Waves",
            "trendAlgae": "Algae (CHL)",
            "trendsEmpty": "Not enough history yet — check back after a few updates.",
            "trendAria": "{label}, {range}: {min}–{max}{unit}",
            "liveUpdated": "Conditions updated.",
            flags: {
                green: "🟢 Safe",
                yellow: "🟡 Caution",
                red: "🔴 Danger",
                unknown: "⚪ Unknown"
            },
            safetyMessages: {
                green: "Enjoy the water, conditions are safe for swimming.",
                yellow: "Be cautious when swimming. Conditions are moderate.",
                red: "Swimming is prohibited. Conditions are dangerous.",
                unknown: "Live safety data is unavailable right now."
            },
            algaeStatus: {
                clear: "Clear",
                moderate: "Moderate",
                high: "High",
                unavailable: "Unavailable"
            },
            facilityNames: {
                lifeguards: "Lifeguards", blueflag: "Blue Flag", medical: "Medical", restaurants: "Restaurants", hotels: "Hotels", family: "Family Friendly", urban: "Urban", transport: "Public Transport", shops: "Shops", nature_reserve: "Nature Reserve", parking: "Parking", camping: "Camping", length_km: "Long Beach", nudist_friendly: "Nudist Friendly", nightlife: "Nightlife", sea_garden: "Sea Garden", water_sports: "Water Sports", dunes: "Dunes", bay: "Bay", surfing: "Surfing", river_mouth: "River Mouth", scenic: "Scenic View", protected_area: "Protected Area", resort_complex: "Resort Complex"
            }
        },
        bg: {
            "app-title": "ФлагУоч",
            "app-title-desktop": "ФлагУоч",
            "map-tab-text": "Карта",
            "list-tab-text": "Списък",
            "wind-label": "Вятър",
            "waves-label": "Вълни",
            "water-temp-label": "Темп. вода",
            "air-temp-label": "Темп. въздух",
            "uv-index-label": "UV индекс",
            "wind-gust-label": "Пориви на вятъра",
            "wind-direction-label": "Посока на вятъра",
            "cleanliness-title": "Доклад за водорасли",
            "share-location-text": "Сподели",
            "settings-modal-title": "Настройки",
            "theme-title": "Тема",
            "dark-mode-label": "Тъмен режим",
            "flag-legend-title": "Легенда на флаговете",
            "legend-green": "Безопасни условия за плуване",
            "legend-yellow": "Препоръчва се повишено внимание",
            "legend-red": "Опасни условия",
            "algae-legend-title": "Легенда за водорасли",
            "legend-clear": "Чисто: Ниска концентрация на хлорофил",
            "legend-moderate": "Умерено: Възможен цъфтеж на водорасли",
            "legend-high": "Високо: Масов цъфтеж на водорасли",
            "legend-unavailable": "Недостъпно: Няма скорошни сателитни данни",
            "safety-tips-title": "Съвети за безопасност",
            "safetyTip1": "Винаги проверявайте статуса на флага преди влизане във водата",
            "safetyTip2": "Стойте близо до зони със спасители, когато има такива",
            "safetyTip3": "Никога не плувайте сами при червен флаг",
            "safetyTip4": "Спешен телефон: 112",
            "whats-new-modal-title": "Какво ново!",
            "offline-text": "Офлайн режим - Показват се кеширани данни",
            "searchPlaceholder": "Търсене на плажове...",
            "flagStatus": "Статус на флага",
            "lastUpdated": "Последно обновяване",
            "facilities": "Удобства",
            "noResults": "Няма плажове, отговарящи на вашите критерии.",
            "locationNotEnabled": "Разрешението за местоположение не е активирано. Моля, активирайте го в настройките на браузъра си, за да използвате тази функция.",
            "sharingNotSupported": "API за споделяне в мрежата не се поддържа от вашия браузър.",
            "shareText": "Разглеждам {name} във FlagWatch — текущ статус: {status}.",
            "linkCopied": "Връзката е копирана.",
            "copied": "Копирано!",
            "show-on-map-text": "Покажи на картата",
            "get-directions-text": "Упътване",
            "waterTempDisclaimer": "Температурата на водата е моделирана оценка; на брега може да се различава с 2–4°C.",
            "dataError": "Неуспешно зареждане на актуалните условия. Проверете връзката си и опитайте отново.",
            "staleData": "Показват се запазени данни — неуспешно обновяване на живо.",
            "skipToContent": "Към съдържанието",
            "loadingText": "Зареждане на условията на плажа…",
            "searchLabel": "Търсене на плажове",
            "beachListHeading": "Плажове",
            "installApp": "Инсталирай",
            "conditionsTitle": "Условия",
            "filterAll": "Всички",
            "filterGreen": "Безопасно",
            "filterYellow": "Внимание",
            "filterRed": "Опасно",
            "sidebarLabel": "Плажове: търсене, филтър и списък",
            "langSwitchLabel": "Смяна на езика (английски / български)",
            "whatsNewLabel": "Какво ново",
            "settingsLabel": "Настройки",
            "filterGroupLabel": "Филтриране на плажове по статус на флага",
            "mapRegionLabel": "Карта на черноморските плажове. Същите плажове са в раздела „Списък“.",
            "viewTablistLabel": "Изберете изглед карта или списък",
            "locateLabel": "Намери моето местоположение",
            "closeLabel": "Затвори",
            "mapStatusAlgae": "водорасли",
            "beachesLoaded": "Заредени са {n} плажа.",
            "filterResults": "Показани са {n} от {total} плажа.",
            "languageSwitched": "Езикът е променен на български.",
            "timeJustNow": "току-що",
            "timeMinAgo": "преди {n} мин",
            "timeHoursAgo": "преди {n} ч",
            "timeDaysAgo": "преди {n} д",
            "updatedAgo": "Обновено {t}",
            "trendsTitle": "Тенденции",
            "range7d": "7 дни",
            "range24h": "24 часа",
            "trendsRangeLabel": "Период на тенденцията",
            "trendTemp": "Темп. вода",
            "trendWaves": "Вълни",
            "trendAlgae": "Водорасли (CHL)",
            "trendsEmpty": "Все още няма достатъчно история — проверете отново след няколко обновявания.",
            "trendAria": "{label}, {range}: {min}–{max}{unit}",
            "liveUpdated": "Условията са обновени.",
            flags: {
                green: "🟢 Безопасно",
                yellow: "🟡 Внимание",
                red: "🔴 Опасно",
                unknown: "⚪ Неизвестно"
            },
            safetyMessages: {
                green: "Наслаждавайте се на водата, условията са безопасни за плуване.",
                yellow: "Бъдете внимателни при плуване. Условията са умерени.",
                red: "Плуването е забранено. Условията са опасни.",
                unknown: "Данните за безопасност в момента са недостъпни."
            },
            algaeStatus: {
                clear: "Чисто",
                moderate: "Умерено",
                high: "Високо",
                unavailable: "Недостъпно"
            },
            facilityNames: {
                lifeguards: "Спасители", blueflag: "Син флаг", medical: "Медицински пункт", restaurants: "Ресторанти", hotels: "Хотели", family: "Подходящ за семейства", urban: "Градски", transport: "Обществен транспорт", shops: "Магазини", nature_reserve: "Природен резерват", parking: "Паркинг", camping: "Къмпинг", length_km: "Дълга ивица", nudist_friendly: "Нудистки", nightlife: "Нощен живот", sea_garden: "Морска градина", water_sports: "Водни спортове", dunes: "Дюни", bay: "Залив", surfing: "Сърф", river_mouth: "Устие на река", scenic: "Живописна гледка", protected_area: "Защитена местност", resort_complex: "Курортен комплекс"
            }
        }
    };
}

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BeachSafetyApp();
});