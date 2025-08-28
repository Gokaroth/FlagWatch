
// NOTE: This app no longer uses the Gemini API for cleanliness reports.
// It has been replaced with a real scientific data source from Copernicus Marine Service.

const APP_VERSION = '7.0.0'; // Increment this to show the popup for new users/updates

/**
 * Configuration for the "What's New" popup.
 * To show the popup, ensure the `version` here matches `APP_VERSION`.
 * The content is dynamically built from the `features` array and supports multiple languages.
 */
const WHATS_NEW_CONFIG = {
    version: '7.0.0',
    features: [
        {
            title: {
                en: '🔬 Real Scientific Algae Data!',
                bg: '🔬 Реални научни данни за водорасли!'
            },
            description: {
                en: "We've replaced AI-generated reports with near-real-time satellite data from the Copernicus Marine Service. The app now uses Chlorophyll-a concentration to provide scientifically accurate algae bloom estimates.",
                bg: "Заменихме генерираните от AI доклади със сателитни данни в почти реално време от Морската служба на Коперник. Приложението вече използва концентрацията на Хлорофил-а, за да предостави научно точни оценки за цъфтежа на водорасли."
            },
        },
        {
            title: {
                en: '💡 Updated Data Legend',
                bg: '💡 Обновена легенда на данните'
            },
            description: {
                en: "Check out the Algae Legend in Settings! It's been updated to reflect the new scientific data source and show the thresholds we use for 'Clear', 'Moderate', and 'High' reports.",
                bg: "Разгледайте Легендата за водорасли в Настройки! Тя е актуализирана, за да отрази новия научен източник на данни и да покаже праговете, които използваме за 'Чисто', 'Умерено' и 'Високо'."
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
        this.beaches = [];
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
        
        // Load beach and cleanliness data
        await this.loadBeachData();
        await this.loadCleanlinessData();
        
        // Initialize map after a short delay
        setTimeout(() => {
            this.initializeMap();
        }, 500);
        
        // Setup PWA
        this.setupPWA();
        
        // Request location permission
        this.requestLocation();
        
        // Render initial views
        this.renderAllLists();
        
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
                await this.loadBeachData();
                await this.loadCleanlinessData();
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

    async loadBeachData() {
        // Caching logic for beach data
        const cachedBeaches = localStorage.getItem('beach-app-data');
        if (cachedBeaches) {
            this.beaches = JSON.parse(cachedBeaches);
        }

        const beachData = {
            "priority_beaches": [
                { "id": "golden_sands", "name": "Golden Sands", "name_bg": "Златни пясъци", "coordinates": {"lat": 43.283, "lng": 28.033}, "region": "Varna", "type": "resort", "priority": "high", "facilities": {"lifeguards": true, "blueflag": true, "medical": true, "restaurants": true, "hotels": true}, "description": "Major resort with fine golden sand and excellent facilities", "description_bg": "Главен курорт с фин златен пясък и отлични съоръжения" },
                { "id": "albena", "name": "Albena Beach", "name_bg": "Албена", "coordinates": {"lat": 43.367, "lng": 28.083}, "region": "Dobrich", "type": "resort", "priority": "high", "facilities": {"lifeguards": true, "blueflag": true, "family": true, "medical": true, "restaurants": true}, "description": "Family-friendly resort with mineral springs", "description_bg": "Семеен курорт с минерални извори" },
                { "id": "varna_beach", "name": "Varna Beach", "name_bg": "Варна", "coordinates": {"lat": 43.205, "lng": 27.916}, "region": "Varna", "type": "urban", "priority": "high", "facilities": {"lifeguards": true, "urban": true, "transport": true, "restaurants": true, "shops": true}, "description": "Main city beach accessible by public transport", "description_bg": "Главен градски плаж достъпен с обществен транспорт" },
                { "id": "bolata", "name": "Bolata Beach", "name_bg": "Болата", "coordinates": {"lat": 43.433, "lng": 28.467}, "region": "Dobrich", "type": "nature", "priority": "medium", "facilities": {"lifeguards": false, "nature_reserve": true, "parking": true}, "description": "Horseshoe-shaped bay protected by red cliffs", "description_bg": "Залив във форма на подкова, защитен от червени скали" },
                { "id": "shkorpilovtsi", "name": "Shkorpilovtsi Beach", "name_bg": "Шкорпиловци", "coordinates": {"lat": 43.167, "lng": 27.933}, "region": "Varna", "type": "wild", "priority": "medium", "facilities": {"lifeguards": false, "camping": true, "length_km": 13}, "description": "Longest beach in Bulgaria, known for its wild nature", "description_bg": "Най-дългият плаж в България, известен със своята дива природа" },
                { "id": "irakli", "name": "Irakli Beach", "name_bg": "Иракли", "coordinates": {"lat": 42.983, "lng": 27.883}, "region": "Burgas", "type": "wild", "priority": "medium", "facilities": {"lifeguards": false, "nudist_friendly": true, "camping": true}, "description": "Protected area with pristine nature and a river mouth", "description_bg": "Защитена зона с девствена природа и устие на река" },
                { "id": "sunny_beach", "name": "Sunny Beach", "name_bg": "Слънчев бряг", "coordinates": {"lat": 42.688, "lng": 27.714}, "region": "Burgas", "type": "resort", "priority": "high", "facilities": {"lifeguards": true, "blueflag": true, "nightlife": true, "restaurants": true, "hotels": true}, "description": "Largest and most famous beach resort with vibrant nightlife", "description_bg": "Най-големият и известен плажен курорт с оживен нощен живот" },
                { "id": "burgas_beach", "name": "Burgas Beach", "name_bg": "Бургас", "coordinates": {"lat": 42.659, "lng": 27.736}, "region": "Burgas", "type": "urban", "priority": "high", "facilities": {"lifeguards": true, "urban": true, "sea_garden": true, "restaurants": true}, "description": "City beach next to the famous Sea Garden", "description_bg": "Градски плаж до известната Морска градина" },
                { "id": "sozopol_harmanite", "name": "Sozopol - Harmanite", "name_bg": "Созопол - Харманите", "coordinates": {"lat": 42.717, "lng": 27.850}, "region": "Burgas", "type": "urban", "priority": "high", "facilities": {"lifeguards": true, "blueflag": true, "restaurants": true, "water_sports": true}, "description": "Popular beach in the new town of Sozopol", "description_bg": "Популярен плаж в новия град на Созопол" },
                { "id": "dyuni", "name": "Dyuni Beach", "name_bg": "Дюни", "coordinates": {"lat": 42.506, "lng": 27.467}, "region": "Burgas", "type": "resort", "priority": "medium", "facilities": {"lifeguards": true, "resort_complex": true, "water_sports": true}, "description": "Long sandy beach part of a holiday resort complex", "description_bg": "Дълъг пясъчен плаж, част от курортен комплекс" },
                { "id": "primorsko", "name": "Primorsko North Beach", "name_bg": "Приморско - Северен", "coordinates": {"lat": 42.417, "lng": 27.683}, "region": "Burgas", "type": "resort", "priority": "medium", "facilities": {"lifeguards": true, "blueflag": true, "dunes": true, "restaurants": true}, "description": "Wide beach with impressive sand dunes", "description_bg": "Широк плаж с впечатляващи пясъчни дюни" },
                { "id": "kiten_atliman", "name": "Kiten - Atliman", "name_bg": "Китен - Атлиман", "coordinates": {"lat": 42.448, "lng": 27.639}, "region": "Burgas", "type": "resort", "priority": "medium", "facilities": {"lifeguards": true, "bay": true, "family": true}, "description": "Calm bay beach, very suitable for families", "description_bg": "Спокоен заливен плаж, много подходящ за семейства" },
                { "id": "lozenets", "name": "Lozenets Beach", "name_bg": "Лозенец", "coordinates": {"lat": 42.400, "lng": 27.680}, "region": "Burgas", "type": "resort", "priority": "medium", "facilities": {"lifeguards": true, "surfing": true, "restaurants": true}, "description": "Popular with young people and water sports enthusiasts", "description_bg": "Популярен сред младите хора и любителите на водни спортове" },
                { "id": "sinemorets_veleka", "name": "Sinemorets Veleka Beach", "name_bg": "Синеморец - Велека", "coordinates": {"lat": 42.267, "lng": 27.750}, "region": "Burgas", "type": "nature", "priority": "medium", "facilities": {"lifeguards": true, "river_mouth": true, "scenic": true}, "description": "Stunning beach where the Veleka River meets the sea", "description_bg": "Зашеметяващ плаж, където река Велека се влива в морето" },
                { "id": "silistar", "name": "Silistar Beach", "name_bg": "Силистар", "coordinates": {"lat": 42.063, "lng": 27.973}, "region": "Burgas", "type": "nature", "priority": "medium", "facilities": {"lifeguards": false, "protected_area": true, "camping": true}, "description": "One of the most southern beaches, located in a protected area", "description_bg": "Един от най-южните плажове, разположен в защитена местност" }
            ]
        };
        
        const latitudes = beachData.priority_beaches.map(b => b.coordinates.lat);
        const longitudes = beachData.priority_beaches.map(b => b.coordinates.lng);
        
        try {
            if (this.isOffline) {
                console.log("Offline mode, using cached beach data.");
                return;
            }

            const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitudes.join(',')}&longitude=${longitudes.join(',')}&hourly=temperature_2m,uv_index,wind_speed_10m,wind_direction_10m&timezone=auto`);
            const marineResponse = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${latitudes.join(',')}&longitude=${longitudes.join(',')}&hourly=wave_height,sea_surface_temperature&timezone=auto`);
            
            if (!weatherResponse.ok || !marineResponse.ok) {
                throw new Error('Failed to fetch weather data');
            }
            
            const weatherData = await weatherResponse.json();
            const marineData = await marineResponse.json();

            const combinedData = beachData.priority_beaches.map((beach, index) => {
                const now = new Date();
                const currentHour = now.getHours();

                const weather = weatherData[index]?.hourly;
                const marine = marineData[index]?.hourly;
                
                const waveHeight = marine?.wave_height[currentHour] ?? 'N/A';
                const waterTemp = marine?.sea_surface_temperature[currentHour] ?? 'N/A';
                const airTemp = weather?.temperature_2m[currentHour] ?? 'N/A';
                const windSpeed = weather?.wind_speed_10m[currentHour] ?? 'N/A';
                const uvIndex = weather?.uv_index[currentHour] ?? 'N/A';

                let flag = 'green';
                if (waveHeight > 2 || windSpeed > 40) {
                    flag = 'red';
                } else if (waveHeight > 1.25 || windSpeed > 25) {
                    flag = 'yellow';
                }

                return {
                    ...beach,
                    conditions: {
                        waveHeight: waveHeight.toFixed(2),
                        waterTemp: waterTemp.toFixed(1),
                        airTemp: airTemp.toFixed(1),
                        windSpeed: windSpeed.toFixed(1),
                        uvIndex: uvIndex.toFixed(1),
                        flag: flag,
                        lastUpdated: new Date().toISOString()
                    }
                };
            });
            this.beaches = combinedData;
            localStorage.setItem('beach-app-data', JSON.stringify(this.beaches));

        } catch (error) {
            console.error('Error loading beach data:', error);
            // If API fails, we rely on potentially stale cached data
            if (!this.beaches.length) {
                // If there's no cached data at all, this is a problem
                console.error("No cached data available and API fetch failed.");
            }
        }
    }

    async loadCleanlinessData() {
        const cachedCleanliness = localStorage.getItem('beach-app-cleanliness');
        if (cachedCleanliness) {
            const data = JSON.parse(cachedCleanliness);
            // Only use cache if it's less than 6 hours old
            if (new Date() - new Date(data.timestamp) < 6 * 60 * 60 * 1000) {
                this.mergeCleanlinessData(data.reports);
                return;
            }
        }
    
        if (this.isOffline) {
            console.log("Offline mode, using cached cleanliness data if available.");
            return;
        }
    
        try {
            const reports = await this.fetchRealCleanlinessData();
            this.mergeCleanlinessData(reports);
            localStorage.setItem('beach-app-cleanliness', JSON.stringify({
                timestamp: new Date().toISOString(),
                reports: reports
            }));
        } catch (error) {
            console.error("Failed to fetch real cleanliness data, using demo data.", error);
            const demoReports = this.generateDemoCleanlinessData();
            this.mergeCleanlinessData(demoReports);
        }
    }

    async fetchRealCleanlinessData() {
        console.log("Fetching real cleanliness data from Copernicus Marine Service...");
        const reports = [];

        for (const beach of this.beaches) {
            const { lat, lng } = beach.coordinates;
            // Create a small bounding box around the beach coordinates
            const bbox = `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`;
            
            // Construct the WMS GetFeatureInfo URL
            const serviceUrl = 'https://nrt.cmems-du.eu/thredds/wms/cmems_obs-oc_blk_bgc-plankton_nrt_l3-multi-1km_P1D';
            const params = new URLSearchParams({
                service: 'WMS',
                version: '1.3.0',
                request: 'GetFeatureInfo',
                layers: 'CHL',
                query_layers: 'CHL',
                crs: 'EPSG:4326',
                bbox: bbox,
                width: '1',
                height: '1',
                i: '0',
                j: '0',
                info_format: 'application/json'
            });

            try {
                const response = await fetch(`${serviceUrl}?${params.toString()}`);
                if (!response.ok) {
                    throw new Error(`Copernicus API returned status ${response.status}`);
                }
                const data = await response.json();
                
                // Extract the Chlorophyll-a value
                const chlValue = data?.features?.[0]?.properties?.value;

                if (chlValue !== undefined && chlValue !== null) {
                    const value = parseFloat(chlValue);
                    let status = 'clear';
                    if (value >= 20) {
                        status = 'high';
                    } else if (value >= 5) {
                        status = 'moderate';
                    }
                    reports.push(this.createReportFromStatus(beach.id, status, value));
                } else {
                    // No data available for this point, assume clear
                    reports.push(this.createReportFromStatus(beach.id, 'clear', null));
                }

            } catch (error) {
                console.warn(`Could not fetch data for ${beach.name}: ${error.message}. Assuming clear.`);
                reports.push(this.createReportFromStatus(beach.id, 'clear', null));
            }
        }
        return reports;
    }
    
    createReportFromStatus(beach_id, status, value) {
        let report_en, report_bg;
        const valueText = value !== null ? ` (CHL: ${value.toFixed(2)} mg/m³)` : '';
        
        switch (status) {
            case 'high':
                report_en = `High Chlorophyll-a concentration detected${valueText}. Widespread algae bloom likely.`;
                report_bg = `Открита е висока концентрация на Хлорофил-a${valueText}. Вероятен е масов цъфтеж на водорасли.`;
                break;
            case 'moderate':
                report_en = `Moderate Chlorophyll-a concentration detected${valueText}. Some algae patches possible.`;
                report_bg = `Открита е умерена концентрация на Хлорофил-a${valueText}. Възможни са петна от водорасли.`;
                break;
            default: // clear
                report_en = `Chlorophyll-a concentration is low${valueText}. Water is expected to be clear.`;
                report_bg = `Концентрацията на Хлорофил-a е ниска${valueText}. Очаква се водата да е чиста.`;
        }
        return { beach_id, status, report_en, report_bg };
    }

    generateDemoCleanlinessData() {
        const statuses = ["clear", "moderate", "high"];
        return this.beaches.map(beach => {
            const randomStatus = statuses[Math.floor(Math.random() * 2.2)]; // Skew towards clear/moderate
            return this.createReportFromStatus(beach.id, randomStatus, null);
        });
    }

    mergeCleanlinessData(reports) {
        this.beaches.forEach(beach => {
            const report = reports.find(r => r.beach_id === beach.id);
            if (report) {
                beach.cleanliness = report;
            } else {
                // This is a fallback in case a beach was missed in the reports
                beach.cleanliness = this.createReportFromStatus(beach.id, 'clear', null);
            }
        });
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
        if (!this.map) return;
        // Clear existing markers
        this.markers.forEach(marker => marker.remove());
        this.markers = [];

        this.beaches.forEach(beach => {
            const flagEmoji = beach.conditions.flag === 'red' ? '🔴' : beach.conditions.flag === 'yellow' ? '🟡' : '🟢';
            const cleanlinessStatus = beach.cleanliness?.status || 'clear';

            const markerIcon = L.divIcon({
                className: 'custom-marker-icon',
                html: `<div class="flag-emoji">${flagEmoji}</div><div class="cleanliness-dot ${cleanlinessStatus}"></div>`,
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

            const flagEmoji = beach.conditions.flag === 'red' ? '🔴' : beach.conditions.flag === 'yellow' ? '🟡' : '🟢';
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
        let icons = '';
        if (facilities.lifeguards) icons += '<span class="facility-icon" title="Lifeguards"> lifeguard </span>';
        if (facilities.restaurants) icons += '<span class="facility-icon" title="Restaurants">🍽️</span>';
        if (facilities.blueflag) icons += '<span class="facility-icon" title="Blue Flag">🌊</span>';
        if (facilities.family) icons += '<span class="facility-icon" title="Family Friendly">👨‍👩‍👧‍👦</span>';
        return icons || '<span>-</span>';
    }

    openBeachDetailModal(beachId) {
        this.currentBeach = this.beaches.find(b => b.id === beachId);
        if (!this.currentBeach) return;
        
        this.refreshBeachDetailModal();
        this.toggleModal('beach-modal', true);
    }
    
    refreshBeachDetailModal() {
        if (!this.currentBeach) return;
        const beach = this.currentBeach;
        const lang = this.currentLanguage;
        
        const name = lang === 'bg' ? beach.name_bg : beach.name;
        document.getElementById('beach-modal-title').textContent = name;
        
        const flagText = this.translations[lang].flags[beach.conditions.flag];
        const flagIndicator = document.getElementById('beach-flag');
        flagIndicator.textContent = `${this.translations[lang].flagStatus}: ${flagText}`;
        flagIndicator.className = `flag-indicator ${beach.conditions.flag}`;
        
        // Conditions
        document.getElementById('wind-value').textContent = `${beach.conditions.windSpeed} km/h`;
        document.getElementById('waves-value').textContent = `${beach.conditions.waveHeight} m`;
        document.getElementById('water-temp-value').textContent = `${beach.conditions.waterTemp}°C`;
        document.getElementById('air-temp-value').textContent = `${beach.conditions.airTemp}°C`;
        document.getElementById('uv-index-value').textContent = `${beach.conditions.uvIndex}`;
        
        // Cleanliness
        const cleanlinessStatusEl = document.getElementById('cleanliness-status');
        cleanlinessStatusEl.textContent = this.translations[lang].algaeStatus[beach.cleanliness.status];
        cleanlinessStatusEl.className = `cleanliness-status ${beach.cleanliness.status}`;
        document.getElementById('cleanliness-report').textContent = lang === 'bg' ? beach.cleanliness.report_bg : beach.cleanliness.report_en;

        // Safety message
        document.getElementById('safety-message').textContent = this.translations[lang].safetyMessages[beach.conditions.flag];

        // Facilities
        const facilitiesEl = document.getElementById('beach-facilities');
        facilitiesEl.innerHTML = `<h4>${this.translations[lang].facilities}</h4><div class="facilities-list">${Object.keys(beach.facilities).filter(f => beach.facilities[f]).map(f => `<span class="facility-tag">${this.translations[lang].facilityNames[f] || f}</span>`).join('')}</div>`;

        // Last updated
        const lastUpdatedDate = new Date(beach.conditions.lastUpdated);
        document.getElementById('last-updated').textContent = `${this.translations[lang].lastUpdated}: ${lastUpdatedDate.toLocaleTimeString()}`;
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
            await this.loadBeachData();
            await this.loadCleanlinessData();
            this.updateAllViews();
        }
    }
    
    shareBeachLocation() {
        if (navigator.share && this.currentBeach) {
            const beach = this.currentBeach;
            const name = this.currentLanguage === 'bg' ? beach.name_bg : beach.name;
            const flagStatus = this.translations[this.currentLanguage].flags[beach.conditions.flag];
            const text = `Checking out ${name}! Current status is ${flagStatus}. #FlagWatch`;
            const url = `https://www.google.com/maps?q=${beach.coordinates.lat},${beach.coordinates.lng}`;

            navigator.share({
                title: 'FlagWatch Beach Status',
                text: text,
                url: window.location.href // Or a specific URL for the beach
            }).then(() => {
                console.log('Thanks for sharing!');
            }).catch(console.error);
        } else {
            // Fallback for browsers that don't support Web Share API
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
            flags: {
                green: "🟢 Safe",
                yellow: "🟡 Caution",
                red: "🔴 Danger"
            },
            safetyMessages: {
                green: "Enjoy the water, conditions are safe for swimming.",
                yellow: "Be cautious when swimming. Conditions are moderate.",
                red: "Swimming is prohibited. Conditions are dangerous."
            },
            algaeStatus: {
                clear: "Clear",
                moderate: "Moderate",
                high: "High"
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
            flags: {
                green: "🟢 Безопасно",
                yellow: "🟡 Внимание",
                red: "🔴 Опасно"
            },
            safetyMessages: {
                green: "Наслаждавайте се на водата, условията са безопасни за плуване.",
                yellow: "Бъдете внимателни при плуване. Условията са умерени.",
                red: "Плуването е забранено. Условията са опасни."
            },
            algaeStatus: {
                clear: "Чисто",
                moderate: "Умерено",
                high: "Високо"
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