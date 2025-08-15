
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
        
        // Initialize app
        this.init();
    }

    async init() {
        // Setup event listeners
        this.setupEventListeners();
        
        // Apply language first
        this.applyLanguage();
        
        // Load beach data
        await this.loadBeachData();
        
        // Initialize map after a short delay
        setTimeout(() => {
            this.initializeMap();
        }, 500);
        
        // Setup PWA
        this.setupPWA();
        
        // Request location permission
        this.requestLocation();
        
        // Render beach list initially
        this.renderBeachList();
        
        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('app').classList.remove('hidden');
            // Ensure map size is correct
            if (this.map) {
                setTimeout(() => this.map.invalidateSize(), 100);
            }
        }, 2000);
        
        // Setup offline/online handlers
        this.setupNetworkHandlers();

        // Setup periodic data refresh
        setInterval(async () => {
            if (!this.isOffline) {
                console.log('Refreshing weather data...');
                await this.loadBeachData();
                this.renderBeachList();
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
        }, 30 * 60 * 1000); // 30 minutes
    }

    async loadBeachData() {
        const beachData = {
            "priority_beaches": [
                {
                    "id": "golden_sands",
                    "name": "Golden Sands",
                    "name_bg": "Златни пясъци",
                    "coordinates": {"lat": 43.283, "lng": 28.033},
                    "region": "Varna",
                    "type": "resort",
                    "priority": "high",
                    "facilities": {"lifeguards": true, "blueflag": true, "medical": true, "restaurants": true, "hotels": true},
                    "description": "Major resort with fine golden sand and excellent facilities",
                    "description_bg": "Главен курорт с фин златен пясък и отлични съоръжения"
                },
                {
                    "id": "albena",
                    "name": "Albena Beach",
                    "name_bg": "Албена",
                    "coordinates": {"lat": 43.367, "lng": 28.083},
                    "region": "Dobrich",
                    "type": "resort",
                    "priority": "high",
                    "facilities": {"lifeguards": true, "blueflag": true, "family": true, "medical": true, "restaurants": true},
                    "description": "Family-friendly resort with mineral springs",
                    "description_bg": "Семеен курорт с минерални извори"
                },
                {
                    "id": "varna_beach",
                    "name": "Varna Beach",
                    "name_bg": "Варна",
                    "coordinates": {"lat": 43.205, "lng": 27.916},
                    "region": "Varna",
                    "type": "urban",
                    "priority": "high",
                    "facilities": {"lifeguards": true, "urban": true, "transport": true, "restaurants": true, "shops": true},
                    "description": "Main city beach accessible by public transport",
                    "description_bg": "Главен градски плаж достъпен с обществен транспорт"
                },
                {
                    "id": "bolata",
                    "name": "Bolata Beach",
                    "name_bg": "Болата",
                    "coordinates": {"lat": 43.433, "lng": 28.467},
                    "region": "Dobrich",
                    "type": "nature",
                    "priority": "medium",
                    "facilities": {"lifeguards": false, "nature_reserve": true, "parking": true},
                    "description": "Horseshoe-shaped bay protected by red cliffs",
                    "description_bg": "Залив във форма на подкова, защитен от червени скали"
                },
                {
                    "id": "shkorpilovtsi",
                    "name": "Shkorpilovtsi Beach",
                    "name_bg": "Шкорпиловци",
                    "coordinates": {"lat": 43.167, "lng": 27.933},
                    "region": "Varna",
                    "type": "wild",
                    "priority": "medium",
                    "facilities": {"lifeguards": false, "camping": true, "length_km": 13},
                    "description": "Longest beach in Bulgaria - 13km of wild coastline",
                    "description_bg": "Най-дългият плаж в България - 13км диво крайбрежие"
                },
                {
                    "id": "byala",
                    "name": "Byala Beach",
                    "name_bg": "Бяла",
                    "coordinates": {"lat": 42.983, "lng": 27.883},
                    "region": "Varna",
                    "type": "quiet",
                    "priority": "medium",
                    "facilities": {"lifeguards": true, "cliffs": true, "restaurants": true},
                    "description": "Peaceful beach with white chalk cliffs",
                    "description_bg": "Спокоен плаж с бели варовикови скали"
                },
                {
                    "id": "sunny_beach",
                    "name": "Sunny Beach",
                    "name_bg": "Слънчев бряг",
                    "coordinates": {"lat": 42.688, "lng": 27.714},
                    "region": "Burgas",
                    "type": "resort",
                    "priority": "highest",
                    "facilities": {"lifeguards": true, "water_sports": true, "nightlife": true, "hotels": true, "restaurants": true},
                    "description": "Largest Bulgarian resort with 3M+ annual visitors",
                    "description_bg": "Най-големият български курорт с над 3 млн. посетители годишно"
                },
                {
                    "id": "nessebar",
                    "name": "Nessebar Beach",
                    "name_bg": "Несебър",
                    "coordinates": {"lat": 42.659, "lng": 27.736},
                    "region": "Burgas",
                    "type": "cultural",
                    "priority": "highest",
                    "facilities": {"lifeguards": true, "unesco": true, "historic": true, "museums": true, "restaurants": true},
                    "description": "UNESCO World Heritage site with ancient history",
                    "description_bg": "Обект на световното културно наследство на ЮНЕСКО"
                },
                {
                    "id": "irakli",
                    "name": "Irakli Beach",
                    "name_bg": "Иракли",
                    "coordinates": {"lat": 42.717, "lng": 27.85},
                    "region": "Burgas",
                    "type": "wild",
                    "priority": "high",
                    "facilities": {"lifeguards": false, "camping": true, "nudism": true, "nature": true},
                    "description": "Most popular wild beach - camping and naturism allowed",
                    "description_bg": "Най-популярният див плаж - разрешени къмпинг и натуризъм"
                },
                {
                    "id": "burgas_beach",
                    "name": "Burgas Beach",
                    "name_bg": "Бургас",
                    "coordinates": {"lat": 42.506, "lng": 27.467},
                    "region": "Burgas",
                    "type": "urban",
                    "priority": "high",
                    "facilities": {"lifeguards": true, "port": true, "airport": true, "transport": true, "restaurants": true},
                    "description": "Major southern city and transport hub",
                    "description_bg": "Главен южен град и транспортен център"
                },
                {
                    "id": "sozopol_central",
                    "name": "Sozopol Central Beach",
                    "name_bg": "Созопол (централен)",
                    "coordinates": {"lat": 42.417, "lng": 27.683},
                    "region": "Burgas",
                    "type": "cultural",
                    "priority": "highest",
                    "facilities": {"lifeguards": true, "blueflag": true, "historic": true, "restaurants": true, "hotels": true},
                    "description": "Blue Flag 2025 beach in historic old town",
                    "description_bg": "Плаж Син флаг 2025 в историческия стар град"
                },
                {
                    "id": "chernomorets",
                    "name": "Chernomorets Beach",
                    "name_bg": "Черноморец",
                    "coordinates": {"lat": 42.448, "lng": 27.639},
                    "region": "Burgas",
                    "type": "quiet",
                    "priority": "medium",
                    "facilities": {"lifeguards": true, "horseshoe_bay": true, "camping": true, "family": true},
                    "description": "Peaceful family destination in horseshoe-shaped bay",
                    "description_bg": "Спокойна семейна дестинация в залив във форма на подкова"
                },
                {
                    "id": "dunes_south",
                    "name": "Dunes-South Beach",
                    "name_bg": "Дюни-Юг",
                    "coordinates": {"lat": 42.4, "lng": 27.68},
                    "region": "Burgas",
                    "type": "resort",
                    "priority": "high",
                    "facilities": {"lifeguards": true, "blueflag": true, "surfing": true, "water_sports": true},
                    "description": "Blue Flag 2025 - excellent for water sports and surfing",
                    "description_bg": "Син флаг 2025 - отлично за водни спортове и сърфинг"
                },
                {
                    "id": "primorsko_north",
                    "name": "Primorsko North Beach",
                    "name_bg": "Приморско (север)",
                    "coordinates": {"lat": 42.267, "lng": 27.75},
                    "region": "Burgas",
                    "type": "family",
                    "priority": "medium",
                    "facilities": {"lifeguards": true, "family_friendly": true, "restaurants": true, "hotels": true},
                    "description": "Popular family destination, less crowded alternative",
                    "description_bg": "Популярна семейна дестинация, по-малко претъпкана алтернатива"
                },
                {
                    "id": "sinemorets_veleka",
                    "name": "Sinemorets Veleka Beach",
                    "name_bg": "Синеморец (Велека)",
                    "coordinates": {"lat": 42.063, "lng": 27.973},
                    "region": "Burgas",
                    "type": "nature",
                    "priority": "medium",
                    "facilities": {"lifeguards": true, "river_mouth": true, "nature_park": true, "fresh_water": true},
                    "description": "Unique river-sea meeting point in Strandzha Nature Park",
                    "description_bg": "Уникална точка на срещата река-море в природен парк Странджа"
                }
            ]
        };

        let liveWeatherData;
        try {
            liveWeatherData = await this.fetchLiveWeatherData(beachData.priority_beaches);
        } catch (error) {
            console.error("Failed to fetch live weather data. Falling back to demo data.", error);
            liveWeatherData = null;
        }

        this.beaches = beachData.priority_beaches.map((beach, index) => {
            let weather;
            if (liveWeatherData && liveWeatherData[index]) {
                weather = { ...liveWeatherData[index], dataSource: 'live' };
            } else {
                weather = { ...this.generateDemoWeatherConditions(beach), dataSource: 'demo' };
            }

            const flag = this.calculateSafetyFlag(weather);
            
            return {
                ...beach,
                weather,
                flag,
                distance: null // Will be calculated later
            };
        });

        // Cache data for offline use
        localStorage.setItem('beach-app-data', JSON.stringify(this.beaches));
    }

    async fetchLiveWeatherData(beaches) {
        const latitudes = beaches.map(b => b.coordinates.lat.toFixed(3)).join(',');
        const longitudes = beaches.map(b => b.coordinates.lng.toFixed(3)).join(',');
    
        // API call for atmospheric data
        const forecastParams = "temperature_2m,uv_index,wind_speed_10m,wind_direction_10m";
        const forecastApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&hourly=${forecastParams}&timezone=auto`;
    
        // API call for marine data
        const marineParams = "wave_height,sea_surface_temperature";
        const marineApiUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${latitudes}&longitude=${longitudes}&hourly=${marineParams}&timezone=auto`;
    
        try {
            const [forecastResponse, marineResponse] = await Promise.all([
                fetch(forecastApiUrl),
                fetch(marineApiUrl)
            ]);
    
            if (!forecastResponse.ok) {
                const errorBody = await forecastResponse.json();
                console.error("Forecast API Error:", errorBody);
                throw new Error(`Forecast API error! status: ${forecastResponse.status}, reason: ${errorBody.reason}`);
            }
            if (!marineResponse.ok) {
                const errorBody = await marineResponse.json();
                console.error("Marine API Error:", errorBody);
                throw new Error(`Marine API error! status: ${marineResponse.status}, reason: ${errorBody.reason}`);
            }
    
            const forecastData = await forecastResponse.json();
            const marineData = await marineResponse.json();

            const findCurrentHourIndex = (timeArray) => {
                const now = new Date();
                now.setMinutes(0, 0, 0);
                const currentTimeISO = now.toISOString().slice(0, 16);
                const index = timeArray.findIndex(t => t.startsWith(currentTimeISO));
                return index !== -1 ? index : 0;
            };
    
            return beaches.map((beach, index) => {
                const forecastHourly = forecastData[index].hourly;
                const marineHourly = marineData[index].hourly;
    
                const forecastIndex = findCurrentHourIndex(forecastHourly.time);
                const marineIndex = findCurrentHourIndex(marineHourly.time);

                const windKmH = forecastHourly.wind_speed_10m[forecastIndex];
                const windKnots = windKmH * 0.539957;
    
                return {
                    wind: Math.round(windKnots * 10) / 10,
                    windDirection: forecastHourly.wind_direction_10m[forecastIndex],
                    waves: Math.round(marineHourly.wave_height[marineIndex] * 10) / 10,
                    temperature: Math.round(marineHourly.sea_surface_temperature[marineIndex] * 10) / 10,
                    airTemperature: Math.round(forecastHourly.temperature_2m[forecastIndex] * 10) / 10,
                    uvIndex: Math.round(forecastHourly.uv_index[forecastIndex] * 10) / 10,
                    lastUpdated: new Date()
                };
            });
    
        } catch (error) {
            console.error("Error fetching weather data:", error);
            throw error; // Re-throw to be caught by the caller
        }
    }

    generateDemoWeatherConditions(beach) {
        // Simulate realistic weather conditions based on beach location and type
        const baseConditions = {
            wind: Math.random() * 35, // 0-35 knots
            windDirection: Math.random() * 360, // 0-360 degrees
            waves: Math.random() * 3, // 0-3 meters
            temperature: 15 + Math.random() * 15, // 15-30°C
            airTemperature: 18 + Math.random() * 15, // 18-33°C
            uvIndex: Math.random() * 11, // 0-11
        };

        // Adjust for beach characteristics
        if (beach.type === 'nature' || beach.type === 'wild') {
            baseConditions.wind *= 1.2; // More exposed to wind
            baseConditions.waves *= 1.3;
        }

        if (beach.region === 'Dobrich') {
            baseConditions.wind *= 1.1; // Northern region more windy
            baseConditions.temperature -= 2;
        }

        return {
            wind: Math.round(baseConditions.wind * 10) / 10,
            windDirection: Math.round(baseConditions.windDirection),
            waves: Math.round(baseConditions.waves * 10) / 10,
            temperature: Math.round(baseConditions.temperature * 10) / 10,
            airTemperature: Math.round(baseConditions.airTemperature * 10) / 10,
            uvIndex: Math.round(baseConditions.uvIndex * 10) / 10,
            lastUpdated: new Date()
        };
    }

    calculateSafetyFlag(weather) {
        const { wind, waves, temperature } = weather;

        // Red flag conditions
        if (wind > 25 || waves > 2.0 || temperature < 14) {
            return 'red';
        }

        // Yellow flag conditions
        if (wind > 15 || waves > 1.0 || temperature < 18) {
            return 'yellow';
        }

        // Green flag (safe conditions)
        return 'green';
    }

    setupEventListeners() {
        // Language toggle
        const langToggle = document.getElementById('language-toggle');
        if (langToggle) {
            langToggle.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleLanguage();
            });
        }

        // View tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.target.closest('.nav-tab').dataset.view;
                if (view) {
                    this.switchView(view);
                }
            });
        });

        // Search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.filterBeaches();
            });
        }

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const filter = e.target.dataset.filter;
                if (filter) {
                    this.setFilter(filter);
                }
            });
        });

        // Location button
        const locateBtn = document.getElementById('locate-btn');
        if (locateBtn) {
            locateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.requestLocation();
            });
        }

        // Settings button
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openSettingsModal();
            });
        }

        // Modal close buttons
        const closeModal = document.getElementById('close-modal');
        if (closeModal) {
            closeModal.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal('beach-modal');
            });
        }

        const closeSettings = document.getElementById('close-settings');
        if (closeSettings) {
            closeSettings.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal('settings-modal');
            });
        }

        // Modal backdrop clicks
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) {
                    this.closeAllModals();
                }
            });
        });

        // Share location button
        const shareLocation = document.getElementById('share-location');
        if (shareLocation) {
            shareLocation.addEventListener('click', (e) => {
                e.preventDefault();
                this.shareCurrentBeach();
            });
        }

        // Install button
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.installPWA();
            });
        }
    }

    initializeMap() {
        try {
            // Initialize Leaflet map
            const mapContainer = document.getElementById('map');
            if (!mapContainer || this.map) { // Prevent re-initialization
                return;
            }

            this.map = L.map('map', {
                zoomControl: true,
                attributionControl: true
            }).setView([42.8, 27.8], 8);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 18
            }).addTo(this.map);

            // Add beach markers
            this.addBeachMarkers();

            console.log('Map initialized successfully');
        } catch (error) {
            console.error('Error initializing map:', error);
        }
    }

    addBeachMarkers() {
        if (!this.map) {
            return;
        }

        // Clear existing markers
        this.markers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.markers = [];

        this.beaches.forEach(beach => {
            const flagColor = beach.flag;
            const emoji = flagColor === 'green' ? '🟢' : flagColor === 'yellow' ? '🟡' : '🔴';
            
            try {
                // Create custom marker
                const marker = L.marker([beach.coordinates.lat, beach.coordinates.lng], {
                    title: this.currentLanguage === 'en' ? beach.name : beach.name_bg
                }).addTo(this.map);

                // Create popup content
                const popupContent = `
                    <div class="beach-popup">
                        <h3>${this.currentLanguage === 'en' ? beach.name : beach.name_bg}</h3>
                        <div class="flag-status ${flagColor}">
                            ${emoji} ${this.getSafetyMessage(flagColor)}
                        </div>
                        <button onclick="window.app.openBeachDetail('${beach.id}')" class="btn btn--sm btn--primary">
                            ${this.currentLanguage === 'en' ? 'View Details' : 'Виж детайли'}
                        </button>
                    </div>
                `;

                marker.bindPopup(popupContent);
                this.markers.push(marker);
            } catch (error) {
                console.error('Error creating marker for beach:', beach.name, error);
            }
        });

        console.log(`Added ${this.markers.length} beach markers to map`);
    }

    getSafetyMessage(flag) {
        const messages = {
            green: {
                en: "Safe swimming conditions",
                bg: "Безопасни условия за плуване"
            },
            yellow: {
                en: "Caution advised",
                bg: "Препоръчва се внимание"
            },
            red: {
                en: "Dangerous conditions",
                bg: "Опасни условия"
            }
        };

        return messages[flag][this.currentLanguage];
    }

    renderBeachList() {
        const listContainer = document.getElementById('beach-list');
        if (!listContainer) return;

        const filteredBeaches = this.getFilteredBeaches();

        if (filteredBeaches.length === 0) {
            listContainer.innerHTML = `
                <div class="no-results">
                    <p>${this.currentLanguage === 'en' ? 'No beaches found' : 'Няма намерени плажове'}</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = filteredBeaches.map(beach => {
            const flagEmoji = beach.flag === 'green' ? '🟢' : beach.flag === 'yellow' ? '🟡' : '🔴';
            const distanceText = beach.distance ? `${beach.distance.toFixed(1)} km` : '';
            
            return `
                <div class="beach-item" onclick="window.app.openBeachDetail('${beach.id}')" tabindex="0" role="button">
                    <div class="beach-item-header">
                        <div>
                            <h3 class="beach-name">${this.currentLanguage === 'en' ? beach.name : beach.name_bg}</h3>
                            <div class="beach-name-bg">${beach.region}</div>
                        </div>
                        <div class="flag-indicator ${beach.flag}">
                            ${flagEmoji} ${this.getSafetyMessage(beach.flag)}
                        </div>
                    </div>
                    <div class="beach-info">
                        <div class="beach-facilities">
                            ${this.renderFacilityIcons(beach.facilities)}
                        </div>
                        ${distanceText ? `<div class="beach-distance">${distanceText}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // Add keyboard event listeners for beach items
        listContainer.querySelectorAll('.beach-item').forEach(item => {
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.click();
                }
            });
        });
    }

    renderFacilityIcons(facilities) {
        const icons = [];
        if (facilities.lifeguards) icons.push('<span class="facility-icon" title="Lifeguards">🏊‍♂️</span>');
        if (facilities.restaurants) icons.push('<span class="facility-icon" title="Restaurants">🍽️</span>');
        if (facilities.blueflag) icons.push('<span class="facility-icon" title="Blue Flag">🏅</span>');
        if (facilities.hotels) icons.push('<span class="facility-icon" title="Hotels">🏨</span>');
        if (facilities.medical) icons.push('<span class="facility-icon" title="Medical">⚕️</span>');
        if (facilities.parking) icons.push('<span class="facility-icon" title="Parking">🅿️</span>');
        
        return icons.slice(0, 4).join(''); // Show max 4 icons
    }

    getFilteredBeaches() {
        let filtered = [...this.beaches];

        // Apply flag filter
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(beach => beach.flag === this.currentFilter);
        }

        // Apply search filter
        const searchInput = document.getElementById('search-input');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        
        if (searchTerm) {
            filtered = filtered.filter(beach => 
                beach.name.toLowerCase().includes(searchTerm) ||
                beach.name_bg.toLowerCase().includes(searchTerm) ||
                beach.region.toLowerCase().includes(searchTerm)
            );
        }

        // Sort by distance if available, otherwise by priority
        const priorityOrder = { 'highest': 0, 'high': 1, 'medium': 2 };
        return filtered.sort((a, b) => {
            if (a.distance !== null && b.distance !== null) {
                return a.distance - b.distance;
            }
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });
    }

    openBeachDetail(beachId) {
        const beach = this.beaches.find(b => b.id === beachId);
        if (!beach) return;

        this.currentBeach = beach;
        this.refreshBeachDetailModal();
        this.openModal('beach-modal');
    }

    degreesToCardinal(deg) {
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(((deg % 360) / 45)) % 8;
        return directions[index];
    }

    refreshBeachDetailModal() {
        if (!this.currentBeach) return;
        const beach = this.currentBeach;

        const modalTitle = document.getElementById('beach-modal-title');
        if (modalTitle) {
            modalTitle.textContent = this.currentLanguage === 'en' ? beach.name : beach.name_bg;
        }

        const flagIndicator = document.getElementById('beach-flag');
        if (flagIndicator) {
            const flagEmoji = beach.flag === 'green' ? '🟢' : beach.flag === 'yellow' ? '🟡' : '🔴';
            flagIndicator.innerHTML = `
                <div class="flag-indicator ${beach.flag}">
                    ${flagEmoji} ${this.getSafetyMessage(beach.flag)}
                </div>
            `;
        }

        const windValue = document.getElementById('wind-value');
        const wavesValue = document.getElementById('waves-value');
        const waterTempValue = document.getElementById('water-temp-value');
        const airTempValue = document.getElementById('air-temp-value');
        const uvIndexValue = document.getElementById('uv-index-value');
        
        if (windValue) windValue.textContent = `${beach.weather.wind} knots ${this.degreesToCardinal(beach.weather.windDirection)}`;
        if (wavesValue) wavesValue.textContent = `${beach.weather.waves} m`;
        if (waterTempValue) waterTempValue.textContent = `${beach.weather.temperature}°C`;
        if (airTempValue) airTempValue.textContent = `${beach.weather.airTemperature}°C`;
        if (uvIndexValue) uvIndexValue.textContent = `${beach.weather.uvIndex}`;

        const safetyMessage = document.getElementById('safety-message');
        if (safetyMessage) {
            safetyMessage.innerHTML = `
                <strong>${this.getSafetyMessage(beach.flag)}</strong><br>
                ${this.currentLanguage === 'en' ? beach.description : beach.description_bg}
            `;
        }

        const facilitiesContainer = document.getElementById('beach-facilities');
        if (facilitiesContainer) {
            const facilityList = this.getFacilityList(beach.facilities);
            facilitiesContainer.innerHTML = `
                <h4>${this.currentLanguage === 'en' ? 'Facilities' : 'Съоръжения'}</h4>
                <div class="facilities-list">
                    ${facilityList.map(f => `<span class="facility-tag">${f}</span>`).join('')}
                </div>
            `;
        }

        const lastUpdated = document.getElementById('last-updated');
        if (lastUpdated) {
            const dataSourceText = beach.weather.dataSource === 'live'
                ? (this.currentLanguage === 'en' ? 'Live Data' : 'Данни на живо')
                : (this.currentLanguage === 'en' ? 'Demo Data' : 'Демо данни');
            lastUpdated.textContent = 
                `${this.currentLanguage === 'en' ? 'Last updated' : 'Последно обновяване'}: ${new Date(beach.weather.lastUpdated).toLocaleTimeString()} (${dataSourceText})`;
        }
    }

    getFacilityList(facilities) {
        const facilityMap = {
            lifeguards: { en: 'Lifeguards', bg: 'Спасители' },
            restaurants: { en: 'Restaurants', bg: 'Ресторанти' },
            hotels: { en: 'Hotels', bg: 'Хотели' },
            medical: { en: 'Medical Care', bg: 'Медицинска помощ' },
            blueflag: { en: 'Blue Flag', bg: 'Син флаг' },
            parking: { en: 'Parking', bg: 'Паркинг' },
            camping: { en: 'Camping', bg: 'Къмпинг' },
            water_sports: { en: 'Water Sports', bg: 'Водни спортове' },
            unesco: { en: 'UNESCO Site', bg: 'ЮНЕСКО обект' },
            transport: { en: 'Public Transport', bg: 'Обществен транспорт' },
            nature_reserve: { en: 'Nature Reserve', bg: 'Природен резерват' },
            family_friendly: { en: 'Family Friendly', bg: 'Семейно подходящ' }
        };

        return Object.keys(facilities)
            .filter(key => facilities[key] === true)
            .map(key => facilityMap[key] ? facilityMap[key][this.currentLanguage] : key)
            .slice(0, 8); // Limit to 8 facilities
    }

    async requestLocation() {
        if (!navigator.geolocation) {
            console.log('Geolocation not supported');
            return;
        }

        const locateBtn = document.getElementById('locate-btn');

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 300000
                });
            });

            this.userLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };

            // Calculate distances
            this.calculateDistances();

            // Add user location marker to map
            if (this.map) {
                if (this.userLocationMarker) {
                    this.map.removeLayer(this.userLocationMarker);
                }

                this.userLocationMarker = L.marker([this.userLocation.lat, this.userLocation.lng], {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: '📍',
                        iconSize: [20, 20]
                    })
                }).addTo(this.map);

                // Center map on user location
                this.map.setView([this.userLocation.lat, this.userLocation.lng], 10);
            }

            // Update beach list
            this.renderBeachList();

        } catch (error) {
            console.log('Location access denied or failed:', error);
            if (locateBtn) {
                const originalText = locateBtn.innerHTML;
                locateBtn.innerHTML = '❌';
                setTimeout(() => {
                    locateBtn.innerHTML = originalText;
                }, 2000);
            }
        }
    }

    calculateDistances() {
        if (!this.userLocation) return;

        this.beaches.forEach(beach => {
            beach.distance = this.calculateDistance(
                this.userLocation.lat, this.userLocation.lng,
                beach.coordinates.lat, beach.coordinates.lng
            );
        });
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toggleLanguage() {
        this.currentLanguage = this.currentLanguage === 'en' ? 'bg' : 'en';
        localStorage.setItem('beach-app-language', this.currentLanguage);
        this.applyLanguage();
        
        // Update map markers and beach list
        if (this.map) {
            this.addBeachMarkers();
        }
        this.renderBeachList();
        
        // Refresh open modal with new language
        if (this.currentBeach) {
            this.refreshBeachDetailModal();
        }
    }

    applyLanguage() {
        const translations = {
            'app-title': {
                en: 'Black Sea Beach Safety',
                bg: 'Безопасност на Черноморските плажове'
            },
            'map-tab-text': {
                en: 'Map',
                bg: 'Карта'
            },
            'list-tab-text': {
                en: 'List',
                bg: 'Списък'
            },
            'wind-label': {
                en: 'Wind',
                bg: 'Вятър'
            },
            'waves-label': {
                en: 'Waves',
                bg: 'Вълни'
            },
            'water-temp-label': {
                en: 'Water Temp',
                bg: 'Темп. на водата'
            },
            'air-temp-label': {
                en: 'Air Temp',
                bg: 'Темп. на въздуха'
            },
            'uv-index-label': {
                en: 'UV Index',
                bg: 'UV Индекс'
            },
            'flag-legend-title': {
                en: 'Flag Legend',
                bg: 'Легенда на флаговете'
            },
            'legend-green': {
                en: 'Safe swimming conditions',
                bg: 'Безопасни условия за плуване'
            },
            'legend-yellow': {
                en: 'Caution advised - moderate conditions',
                bg: 'Препоръчва се внимание - умерени условия'
            },
            'legend-red': {
                en: 'Dangerous conditions - swimming not recommended',
                bg: 'Опасни условия - плуването не се препоръчва'
            },
            'safety-tips-title': {
                en: 'Safety Tips',
                bg: 'Съвети за безопасност'
            },
            'settings-modal-title': {
                en: 'Settings',
                bg: 'Настройки'
            },
            'offline-text': {
                en: 'Offline Mode - Showing cached data',
                bg: 'Офлайн режим - Показват се кеширани данни'
            },
            'share-location-text': {
                en: 'Share Location',
                bg: 'Сподели локация'
            }
        };

        // Update language toggle button
        const langToggle = document.getElementById('language-toggle');
        if (langToggle) {
            langToggle.textContent = this.currentLanguage.toUpperCase();
        }

        // Update search placeholder
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.placeholder = this.currentLanguage === 'en' ? 'Search beaches...' : 'Търсене на плажове...';
        }

        // Update all translatable elements
        Object.keys(translations).forEach(id => {
            const element = document.getElementById(id);
            if (element && translations[id][this.currentLanguage]) {
                element.textContent = translations[id][this.currentLanguage];
            }
        });

        // Update safety tips
        const safetyTips = {
            en: [
                'Always check flag status before entering water',
                'Stay close to lifeguarded areas when available',
                'Never swim alone in red flag conditions',
                'Emergency number: 112'
            ],
            bg: [
                'Винаги проверявайте статуса на флага преди да влезете във водата',
                'Оставайте близо до зони със спасители, когато са налични',
                'Никога не плувайте сами при червен флаг',
                'Номер за спешни случаи: 112'
            ]
        };

        const tipsList = document.getElementById('safety-tips-list');
        if (tipsList) {
            tipsList.innerHTML = safetyTips[this.currentLanguage]
                .map(tip => `<li>${tip}</li>`)
                .join('');
        }
    }

    switchView(view) {
        this.currentView = view;
        
        // Update tab states
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`[data-view="${view}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Update view states
        document.querySelectorAll('.view').forEach(viewEl => {
            viewEl.classList.remove('active');
        });
        const activeView = document.getElementById(`${view}-view`);
        if (activeView) {
            activeView.classList.add('active');
        }

        // Render content if needed
        if (view === 'list') {
            this.renderBeachList();
        } else if (view === 'map') {
            // Refresh map
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 300);
        }
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update filter button states
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeFilter = document.querySelector(`[data-filter="${filter}"]`);
        if (activeFilter) {
            activeFilter.classList.add('active');
        }

        // Update beach list
        this.renderBeachList();
    }

    filterBeaches() {
        // Render updated list
        this.renderBeachList();
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
        }
        if (modalId === 'beach-modal') {
            this.currentBeach = null;
        }
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
        document.body.style.overflow = '';
        this.currentBeach = null;
    }

    openSettingsModal() {
        this.openModal('settings-modal');
    }

    shareCurrentBeach() {
        if (!this.currentBeach) return;

        const shareText = `${this.currentLanguage === 'en' ? this.currentBeach.name : this.currentBeach.name_bg} - ${this.getSafetyMessage(this.currentBeach.flag)}`;
        const shareUrl = `${window.location.origin}?beach=${this.currentBeach.id}`;

        if (navigator.share) {
            navigator.share({
                title: 'Beach Safety Status',
                text: shareText,
                url: shareUrl
            }).catch(err => console.log('Error sharing:', err));
        } else {
            // Fallback - copy to clipboard
            if (navigator.clipboard) {
                navigator.clipboard.writeText(`${shareText} - ${shareUrl}`).then(() => {
                    alert(this.currentLanguage === 'en' ? 'Link copied to clipboard!' : 'Връзката е копирана!');
                }).catch(err => {
                    console.log('Error copying to clipboard:', err);
                });
            }
        }
    }

    setupPWA() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => console.log('SW registered:', registration))
                .catch(error => console.log('SW registration failed:', error));
        }

        // Show install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            const installBtn = document.getElementById('install-btn');
            if (installBtn) {
                installBtn.classList.remove('hidden');
            }
        });
    }

    installPWA() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted the install prompt');
                }
                this.deferredPrompt = null;
                const installBtn = document.getElementById('install-btn');
                if (installBtn) {
                    installBtn.classList.add('hidden');
                }
            });
        }
    }

    setupNetworkHandlers() {
        const updateOfflineStatus = async () => {
            this.isOffline = !navigator.onLine;
            const indicator = document.getElementById('offline-indicator');
            
            if (indicator) {
                if (this.isOffline) {
                    indicator.classList.remove('hidden');
                    // Load cached data if available
                    const cachedData = localStorage.getItem('beach-app-data');
                    if (cachedData) {
                        try {
                            const parsedData = JSON.parse(cachedData);
                            // Convert date string back to Date object
                            this.beaches = parsedData.map(beach => ({
                                ...beach,
                                weather: {
                                    ...beach.weather,
                                    lastUpdated: new Date(beach.weather.lastUpdated)
                                }
                            }));
                            this.renderBeachList();
                            if (this.map) {
                                this.addBeachMarkers();
                            }
                        } catch (error) {
                            console.error('Error loading cached data:', error);
                        }
                    }
                } else {
                    indicator.classList.add('hidden');
                    // Refresh data when back online
                    await this.loadBeachData();
                    this.renderBeachList();
                    if (this.map) {
                        this.addBeachMarkers();
                    }
                }
            }
        };

        window.addEventListener('online', updateOfflineStatus);
        window.addEventListener('offline', updateOfflineStatus);
        
        // Initial check
        updateOfflineStatus();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BeachSafetyApp();
});

// Handle initial beach from URL parameter
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const beachId = urlParams.get('beach');
    if (beachId && window.app) {
        setTimeout(() => {
            window.app.openBeachDetail(beachId);
        }, 3000); // Wait for app to load
    }
});
