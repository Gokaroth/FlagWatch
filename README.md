# 🏖️ FlagWatch - Bulgarian Black Sea Beach Safety & Cleanliness Monitor

FlagWatch is a real-time beach safety and water cleanliness dashboard for the Bulgarian Black Sea coast. It combines live weather data with scientific satellite measurements to provide a comprehensive overview of swimming conditions, helping locals and tourists make informed decisions for a safe and enjoyable beach day.

### ✨ Key Features

-   **🌊 Real-Time Safety Flags**: Live, color-coded flag status (🟢 Safe, 🟡 Caution, 🔴 Danger) automatically calculated from wave height and wind speed.
-   **🔬 Scientific Algae Reports**: Near-real-time water cleanliness reports based on satellite data (**Chlorophyll-a concentration**) from the **Copernicus Marine Service**, indicating potential algae blooms.
-   **🌗 Light & Dark Mode**: A beautiful, user-selectable dark theme for comfortable viewing in all lighting conditions, with automatic system preference detection.
-   **🗺️ Interactive Map & List**: A fully interactive Leaflet map and a searchable, filterable list of 15+ major beaches.
-   **🌡️ Detailed Live Data**: Access up-to-date information on wave height, water & air temperature, wind speed, and UV Index.
-   **🌐 Bilingual Support**: Full interface and data translation for both **English** and **Bulgarian**.
-   **📱 Progressive Web App (PWA)**: Installable on mobile devices with offline access to cached data for a fast, native-app-like experience.

## 🚀 Live Demo

Visit the live app: **[flagwatch.netlify.app](https://flagwatch.netlify.app)**

## 🛠️ Technology Stack

-   **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
-   **Mapping**: Leaflet.js with OpenStreetMap tiles
-   **Data APIs**:
    -   **Open-Meteo**: For real-time atmospheric and marine weather data.
    -   **Copernicus Marine Service**: For scientific water cleanliness data (Chlorophyll-a).
-   **Styling**: CSS Custom Properties with a responsive, mobile-first design system.
-   **PWA**: Service Worker for offline functionality and caching.
-   **Deployment**: Netlify

## 📊 Data Algorithms

FlagWatch uses two separate data pipelines to determine beach conditions.

### 1. Beach Safety Algorithm (Flags)

Safety flags are calculated using real-time data from the **Open-Meteo API**.

-   **🔴 Red Flag (Dangerous)**
    -   Wave height > **2.0 meters** OR
    -   Wind speed > **40 km/h**
-   **🟡 Yellow Flag (Caution)**
    -   Wave height > **1.25 meters** OR
    -   Wind speed > **25 km/h**
-   **🟢 Green Flag (Safe)**
    -   All conditions are below the Yellow Flag thresholds.

### 2. Water Cleanliness Algorithm (Algae Reports)

Cleanliness status is determined by **Chlorophyll-a (CHL)** concentration from the **Copernicus Marine Service**, a primary indicator for algae blooms.

-   **High (Potential Bloom)**: CHL > **20 mg/m³**
-   **Moderate**: CHL is between **5 and 20 mg/m³**
-   **Clear**: CHL is < **5 mg/m³**

## 📁 Project Structure

```
flagwatch/
├── index.html          # Main application structure and UI
├── app.js              # Core application logic, API calls, and state management
├── style.css           # All styles, including light/dark themes and responsive layouts
├── sw.js               # Service Worker for PWA offline capabilities
├── README.md           # This file
├── DATA_SOURCES.md     # Detailed documentation on the data APIs
└── WHATS_NEW.md        # Guide for updating the in-app feature popup
```

## 📦 Local Development

### Prerequisites
-   A modern web browser
-   A local web server for serving static files

### Setup

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Gokaroth/flagwatch.git
    cd flagwatch
    ```

2.  **Serve the files**
    You can use any simple static file server.
    ```bash
    # If you have Node.js:
    npx serve .

    # If you have Python:
    python -m http.server
    ```

3.  **Open in browser**
    Navigate to `http://localhost:[port]` (e.g., `http://localhost:3000` or `http://localhost:8000`).

## 🤝 Contributing

Contributions are welcome! Please feel free to fork the repository and submit a Pull Request.

### Development Guidelines
1.  Follow the existing code style and conventions.
2.  Ensure new features are responsive and tested on both mobile and desktop.
3.  Update documentation (`README.md`, `DATA_SOURCES.md`, etc.) for any new features or changes.

## 🙏 Acknowledgments

-   **Open-Meteo** for providing a free, high-quality weather and marine API.
-   **Copernicus Marine Service** for making valuable scientific satellite data publicly accessible.
-   **Leaflet.js** and **OpenStreetMap** contributors for the excellent mapping tools.
-   **Netlify** for seamless hosting and deployment.

***

## 📞 Support

For questions or issues:
- 🐛 [Open an issue](https://github.com/Gokaroth/flagwatch/issues)
- 🌐 Live demo: [flagwatch.netlify.app](https://flagwatch.netlify.app)

***

**Made with ❤️ for safer beach experiences on the Bulgarian Black Sea coast**
