// NOTE: This app no longer uses the Gemini API for cleanliness reports.
// It has been replaced with a real scientific data source from Copernicus Marine Service.

const APP_VERSION = '9.0.0'; // Increment this to show the popup for new users/updates

/**
 * Configuration for the "What's New" popup.
 * To show the popup, ensure the `version` here matches `APP_VERSION`.
 * The content is dynamically built from the `features` array and supports multiple languages.
 */
const WHATS_NEW_CONFIG = {
    version: '9.0.0',
    features: [
        {
            title: {
                en: '🏖️ Massive Beach Expansion!',
                bg: '🏖️ Мащабно разширение на плажовете!'
            },
            description: {
                en: "We've massively expanded our database from 15 to nearly 50 beaches! The app now covers the entire Bulgarian Black Sea coast, from Durankulak to Rezovo, including popular wild beaches.",
                bg: "Разширихме мащабно базата си данни от 15 на близо 50 плажа! Приложението вече покрива цялото българско Черноморие, от Дуранкулак до Резово, включително популярни диви плажове."
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
        
        // Load static beach info and then fetch all live data
        await this.loadStaticBeachData();
        await this.fetchAllData();
        
        // Initialize map after a short delay
        setTimeout(() => {
            this.initializeMap();
        }, 500);
        
        // Setup PWA
        this.setupPWA();
        
        // Request location permission
        this.requestLocation();
        
        // Render initial views
        this.updateAllViews();
        
        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('app').classList.remove('hidden');
            // Ensure map size is correct
            if (this.map) {
                setTimeout(() => this.map.invalidateSize(), 100);
            }
            // Check for new features
            this.checkWhatsNew();
        }, 2000);
        
        // Setup offline/online handlers
        this.setupNetworkHandlers();

        // Setup periodic data refresh
        setInterval(async () => {
            if (!this.isOffline) {
                console.log('Refreshing weather and cleanliness data...');
                await this.fetchAllData();
                this.updateAllViews();
            }
        }, 30 * 60 * 1000); // 30 minutes
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
            // Fall back to a previous live-data cache if present so the app can still render something.
            const cachedData = localStorage.getItem('beach-app-data');
            if (cachedData) {
                try {
                    this.beaches = JSON.parse(cachedData).beaches || [];
                    console.log('Static data fetch failed. Using cached beach data.');
                } catch (e) {
                    this.beaches = [];
                }
            } else {
                this.beaches = [];
            }
        }
    }
    
    async fetchAllData() {
        // Caching logic
        const cachedData = localStorage.getItem('beach-app-data');
        if (cachedData) {
            const parsedData = JSON.parse(cachedData);
            // Use cache if it's less than 30 mins old
            if (new Date() - new Date(parsedData.timestamp) < 30 * 60 * 1000) {
                this.beaches = parsedData.beaches;
                console.log("Using fresh cached data.");
                this.hideDataError();
                return;
            }
        }

        if (this.isOffline) {
            console.log("Offline mode, using cached beach data if available.");
            if (cachedData) {
                this.beaches = JSON.parse(cachedData).beaches;
                this.hideDataError();
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

            this.beaches = liveBeachData;
            localStorage.setItem('beach-app-data', JSON.stringify({
                timestamp: new Date().toISOString(),
                beaches: this.beaches
            }));
            this.hideDataError();

        } catch (error) {
            console.error('Error fetching live data from /api/beaches:', error);
            // Fallback to cached data if it exists, otherwise reveal the data-error banner.
            if (cachedData) {
                this.beaches = JSON.parse(cachedData).beaches;
                console.log("Live fetch failed. Using stale cached data.");
                this.hideDataError();
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

        // Search and filter
        document.getElementById('search-input').addEventListener('input', (e) => this.filterAndRenderLists(e.target.value));
        document.getElementById('search-input-desktop').addEventListener('input', (e) => this.filterAndRenderLists(e.target.value));
        
        document.querySelectorAll('.filter-controls').forEach(container => {
            container.addEventListener('click', (e) => {
                if (e.target.classList.contains('filter-btn')) {
                    this.currentFilter = e.target.dataset.filter;
                    // Update both sets of filter buttons
                    document.querySelectorAll('.filter-btn').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.filter === this.currentFilter);
                    });
                    this.filterAndRenderLists(document.getElementById('search-input').value);
                }
            });
        });

        // Map controls
        document.getElementById('locate-btn').addEventListener('click', () => this.panToUserLocation());

        // Dark mode toggle
        document.getElementById('dark-mode-toggle').addEventListener('change', (e) => this.toggleDarkMode(e.target.checked));
        
        // PWA Install button
        document.getElementById('install-btn').addEventListener('click', () => this.promptInstall());

        // Share button
        document.getElementById('share-location').addEventListener('click', () => this.shareBeachLocation());
    }

    initializeMap() {
        if (this.map) return;
        try {
            this.map = L.map('map', {
                center: [42.7, 27.7], // Centered on Bulgarian coast
                zoom: 8,
                zoomControl: false, // We have custom controls
            });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(this.map);
            this.addBeachMarkers();
            console.log("Map initialized successfully");
        } catch (e) {
            console.error("Could not initialize map:", e);
        }
    }

    addBeachMarkers() {
        if (!this.map || !this.beaches.length) return;
        // Clear existing markers
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        this.beaches.forEach(beach => {
            if (!beach.conditions) return; // Don't render markers if live data isn't available
            const flag = beach.conditions.flag;

            // Respect the current filter. A specific colour filter only matches that flag;
            // a null flag (unknown) is shown only under 'all'.
            if (this.currentFilter !== 'all' && flag !== this.currentFilter) return;

            const flagEmoji = flag === 'red' ? '🔴' : flag === 'yellow' ? '🟡' : flag === 'green' ? '🟢' : '⚪';
            const flagClass = flag || 'unknown';
            // Map cleanliness status to a dot class; 'unavailable' (or missing) renders neutral/grey.
            const cleanlinessStatus = beach.cleanliness?.status || 'unavailable';

            const markerIcon = L.divIcon({
                className: `custom-marker-icon ${flagClass}`,
                html: `<div class="flag-emoji ${flagClass}">${flagEmoji}</div><div class="cleanliness-dot ${cleanlinessStatus}"></div>`,
                iconSize: [30, 42],
                iconAnchor: [15, 42]
            });

            const marker = L.marker([beach.coordinates.lat, beach.coordinates.lng], { icon: markerIcon })
                .addTo(this.map)
                .on('click', () => this.openBeachDetailModal(beach.id));

            this.markers.push(marker);
        });
    }

    renderAllLists() {
        this.renderBeachList('beach-list'); // Mobile
        this.renderBeachList('beach-list-desktop'); // Desktop
    }

    renderBeachList(containerId) {
        const listContainer = document.getElementById(containerId);
        listContainer.innerHTML = '';
        if (!this.beaches.length || !this.beaches[0].conditions) {
            listContainer.innerHTML = `<div class="no-results"><p>${this.isOffline ? 'No cached data.' : 'Loading live data...'}</p></div>`;
            return;
        }

        const searchTerm = (containerId.includes('desktop') ? document.getElementById('search-input-desktop') : document.getElementById('search-input')).value.toLowerCase();
        
        const filteredBeaches = this.beaches.filter(beach => {
            const name = this.currentLanguage === 'bg' ? beach.name_bg : beach.name;
            const matchesSearch = name.toLowerCase().includes(searchTerm);
            const matchesFilter = this.currentFilter === 'all' || beach.conditions.flag === this.currentFilter;
            return matchesSearch && matchesFilter;
        });

        if (filteredBeaches.length === 0) {
            listContainer.innerHTML = `<div class="no-results"><p>${this.translations[this.currentLanguage].noResults}</p></div>`;
            return;
        }

        filteredBeaches.forEach(beach => {
            const beachItem = document.createElement('div');
            beachItem.className = 'beach-item';
            beachItem.dataset.beachId = beach.id;
            beachItem.addEventListener('click', () => this.openBeachDetailModal(beach.id));

            const flag = beach.conditions.flag;
            const flagEmoji = flag === 'red' ? '🔴' : flag === 'yellow' ? '🟡' : flag === 'green' ? '🟢' : '⚪';
            const name = this.currentLanguage === 'bg' ? beach.name_bg : beach.name;
            const nameSecondary = this.currentLanguage === 'bg' ? beach.name : beach.name_bg;

            let distanceHTML = '';
            if (this.userLocation && beach.distance) {
                distanceHTML = `<span class="beach-distance">${beach.distance.toFixed(1)} km</span>`;
            }

            beachItem.innerHTML = `
                <div class="beach-item-header">
                    <div>
                        <h3 class="beach-name">${name}</h3>
                        <p class="beach-name-bg">${nameSecondary}</p>
                    </div>
                    <span>${flagEmoji}</span>
                </div>
                <div class="beach-info">
                    <div>${this.getFacilityIcons(beach.facilities)}</div>
                    ${distanceHTML}
                </div>
            `;
            listContainer.appendChild(beachItem);
        });
    }

    filterAndRenderLists() {
        this.renderAllLists();
    }

    getFacilityIcons(facilities) {
        if (!facilities) return '<span>-</span>';
        let icons = '';
        if (facilities.lifeguards) icons += '<span class="facility-icon" title="Lifeguards">🛟</span>';
        if (facilities.restaurants) icons += '<span class="facility-icon" title="Restaurants">🍽️</span>';
        if (facilities.blueflag) icons += '<span class="facility-icon" title="Blue Flag">🌊</span>';
        if (facilities.family) icons += '<span class="facility-icon" title="Family Friendly">👨‍👩‍👧‍👦</span>';
        return icons || '<span>-</span>';
    }

    openBeachDetailModal(beachId) {
        this.currentBeach = this.beaches.find(b => b.id === beachId);
        if (!this.currentBeach || !this.currentBeach.conditions) return;
        
        this.refreshBeachDetailModal();
        this.toggleModal('beach-modal', true);
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
        flagIndicator.className = `flag-indicator ${flagKey}`;

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
        facilitiesEl.innerHTML = `<h4>${this.translations[lang].facilities}</h4><div class="facilities-list">${Object.keys(beach.facilities || {}).filter(f => beach.facilities[f]).map(f => `<span class="facility-tag">${this.translations[lang].facilityNames[f] || f}</span>`).join('')}</div>`;

        // Last updated — always surface so stale data is visible.
        const lastUpdatedEl = document.getElementById('last-updated');
        if (c.lastUpdated) {
            const lastUpdatedDate = new Date(c.lastUpdated);
            lastUpdatedEl.textContent = `${this.translations[lang].lastUpdated}: ${lastUpdatedDate.toLocaleString()}`;
        } else {
            lastUpdatedEl.textContent = `${this.translations[lang].lastUpdated}: —`;
        }
    }

    setView(view) {
        this.currentView = view;
        document.getElementById('map-tab').classList.toggle('active', view === 'map');
        document.getElementById('list-tab').classList.toggle('active', view === 'list');

        document.getElementById('map-view').classList.toggle('active', view === 'map');
        document.getElementById('list-view').classList.toggle('active', view === 'list');
        
        document.getElementById('search-container-mobile').style.display = view === 'list' ? 'block' : 'none';

        if (view === 'map' && this.map) {
            setTimeout(() => this.map.invalidateSize(), 100);
        }
    }

    toggleModal(modalId, show) {
        const modal = document.getElementById(modalId);
        if (show) {
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
        } else {
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            if (modalId === 'beach-modal') {
                this.currentBeach = null;
            }
        }
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
            this.map.flyTo([this.userLocation.lat, this.userLocation.lng], 12);
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
    
    shareBeachLocation() {
        if (navigator.share && this.currentBeach) {
            const beach = this.currentBeach;
            const name = this.currentLanguage === 'bg' ? beach.name_bg : beach.name;
            const flagStatus = this.translations[this.currentLanguage].flags[beach.conditions.flag || 'unknown'];
            const text = `Checking out ${name}! Current status is ${flagStatus}. #FlagWatch`;
            
            navigator.share({
                title: 'FlagWatch Beach Status',
                text: text,
                url: window.location.href 
            }).then(() => {
                console.log('Thanks for sharing!');
            }).catch(console.error);
        } else {
            alert(this.translations[this.currentLanguage].sharingNotSupported);
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
    }

    toggleLanguage() {
        this.currentLanguage = this.currentLanguage === 'en' ? 'bg' : 'en';
        localStorage.setItem('beach-app-language', this.currentLanguage);
        this.applyLanguage();
        this.updateAllViews();
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
            "whats-new-modal-title": "What's New!",
            "offline-text": "Offline Mode - Showing cached data",
            "searchPlaceholder": "Search beaches...",
            "flagStatus": "Flag Status",
            "lastUpdated": "Last updated",
            "facilities": "Facilities",
            "noResults": "No beaches match your criteria.",
            "locationNotEnabled": "Location permission is not enabled. Please enable it in your browser settings to use this feature.",
            "sharingNotSupported": "Web Share API is not supported in your browser.",
            "waterTempDisclaimer": "Water temp is a modeled estimate; shoreline may differ by 2–4°C.",
            "dataError": "Couldn't load live conditions. Check your connection and try again.",
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
            "whats-new-modal-title": "Какво ново!",
            "offline-text": "Офлайн режим - Показват се кеширани данни",
            "searchPlaceholder": "Търсене на плажове...",
            "flagStatus": "Статус на флага",
            "lastUpdated": "Последно обновяване",
            "facilities": "Удобства",
            "noResults": "Няма плажове, отговарящи на вашите критерии.",
            "locationNotEnabled": "Разрешението за местоположение не е активирано. Моля, активирайте го в настройките на браузъра си, за да използвате тази функция.",
            "sharingNotSupported": "API за споделяне в мрежата не се поддържа от вашия браузър.",
            "waterTempDisclaimer": "Температурата на водата е моделирана оценка; на брега може да се различава с 2–4°C.",
            "dataError": "Неуспешно зареждане на актуалните условия. Проверете връзката си и опитайте отново.",
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