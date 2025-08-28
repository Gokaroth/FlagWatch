// This is our new backend! It's a Netlify Function.
// It runs in a Node.js environment on Netlify's servers.

const fetchCopernicusData = async (beach) => {
    const { lat, lng } = beach.coordinates;
    const bbox = `${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`;
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
            console.warn(`Copernicus API returned status ${response.status} for ${beach.name}`);
            return null;
        }
        const data = await response.json();
        return data?.features?.[0]?.properties?.value;
    } catch (error) {
        console.error(`Error fetching Copernicus data for ${beach.name}:`, error);
        return null;
    }
};

const createCleanlinessReport = (chlValue) => {
    let status = 'clear';
    if (chlValue !== null && chlValue !== undefined) {
        const value = parseFloat(chlValue);
        if (value >= 20) {
            status = 'high';
        } else if (value >= 5) {
            status = 'moderate';
        }
    }
    
    const valueText = chlValue !== null ? `(CHL: ${parseFloat(chlValue).toFixed(2)} mg/m³)` : '';
    let report_en, report_bg;
    switch (status) {
        case 'high':
            report_en = `High Chlorophyll-a concentration detected${valueText}. Widespread algae bloom likely.`;
            report_bg = `Открита е висока концентрация на Хлорофил-a${valueText}. Вероятен е масов цъфтеж на водорасли.`;
            break;
        case 'moderate':
            report_en = `Moderate Chlorophyll-a concentration detected${valueText}. Some algae patches possible.`;
            report_bg = `Открита е умерена концентрация на Хлорофил-a${valueText}. Възможни са петна от водорасли.`;
            break;
        default:
            report_en = `Chlorophyll-a concentration is low${valueText}. Water is expected to be clear.`;
            report_bg = `Концентрацията на Хлорофил-a е ниска${valueText}. Очаква се водата да е чиста.`;
    }
    return { status, report_en, report_bg };
};

exports.handler = async (event) => {
    // The frontend will send beach data in the POST body
    const beaches = JSON.parse(event.body);

    if (!beaches || beaches.length === 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'No beach data provided' }),
        };
    }

    const latitudes = beaches.map(b => b.coordinates.lat);
    const longitudes = beaches.map(b => b.coordinates.lng);

    try {
        // --- Fetch Weather and Marine Data from Open-Meteo ---
        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitudes.join(',')}&longitude=${longitudes.join(',')}&hourly=temperature_2m,uv_index,wind_speed_10m,wind_direction_10m&timezone=auto`);
        const marineResponse = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${latitudes.join(',')}&longitude=${longitudes.join(',')}&hourly=wave_height,sea_surface_temperature&timezone=auto`);

        if (!weatherResponse.ok || !marineResponse.ok) {
            throw new Error('Failed to fetch data from Open-Meteo');
        }

        const weatherData = await weatherResponse.json();
        const marineData = await marineResponse.json();

        // --- Fetch Cleanliness Data from Copernicus in parallel ---
        const cleanlinessPromises = beaches.map(beach => fetchCopernicusData(beach));
        const chlValues = await Promise.all(cleanlinessPromises);
        
        // --- Combine All Data ---
        const combinedData = beaches.map((beach, index) => {
            const now = new Date();
            // Adjust to get the current hour in UTC for API consistency if needed, but timezone=auto should handle this.
            const currentHour = now.getHours();

            const weather = weatherData[index]?.hourly;
            const marine = marineData[index]?.hourly;
            
            // Safety checks for API response structure
            const waveHeight = marine?.wave_height?.[currentHour] ?? 0;
            const waterTemp = marine?.sea_surface_temperature?.[currentHour] ?? 0;
            const airTemp = weather?.temperature_2m?.[currentHour] ?? 0;
            const windSpeed = weather?.wind_speed_10m?.[currentHour] ?? 0;
            const uvIndex = weather?.uv_index?.[currentHour] ?? 0;

            let flag = 'green';
            if (waveHeight > 2 || windSpeed > 40) {
                flag = 'red';
            } else if (waveHeight > 1.25 || windSpeed > 25) {
                flag = 'yellow';
            }
            
            // Get cleanliness report
            const chlValue = chlValues[index];
            const cleanliness = createCleanlinessReport(chlValue);

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
                },
                cleanliness: cleanliness
            };
        });

        return {
            statusCode: 200,
            body: JSON.stringify(combinedData),
        };

    } catch (error) {
        console.error('Error in Netlify Function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch beach data.', details: error.message }),
        };
    }
};