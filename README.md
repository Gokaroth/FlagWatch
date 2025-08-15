# 🏖️ FlagWatch - Bulgarian Black Sea Beach Safety Monitor

### 🚩 **Real-Time Safety Flags**
- **Green Flag** 🟢 - Safe swimming conditions
- **Yellow Flag** 🟡 - Caution advised, moderate conditions
- **Red Flag** 🔴 - Dangerous conditions, swimming not recommended
- Automatically calculated based on live weather data

### 🗺️ **Interactive Map & List Views**
- Interactive Leaflet map showing all 15+ beaches along the Bulgarian coast
- Clickable markers with instant beach information popups
- Searchable and filterable beach list view
- Responsive design that works on mobile, tablet, and desktop

### 🌡️ **Live Weather Data**
- **Wind Speed** - Real-time wind conditions in knots and km/h
- **Wave Height** - Current wave conditions in meters
- **Water Temperature** - Sea surface temperature
- **Air Temperature** - Current air temperature
- **UV Index** - Solar radiation levels
- Data refreshed every 30 minutes from Open-Meteo API

### 🏖️ **Comprehensive Beach Database**
15+ major Bulgarian Black Sea beaches including:
- **Golden Sands** (Златни пясъци) - Major resort with Blue Flag certification
- **Sunny Beach** (Слънчев бряг) - Largest Bulgarian resort (3M+ visitors annually)
- **Sozopol** (Созопол) - UNESCO World Heritage historic beach
- **Albena** (Албена) - Family-friendly resort with mineral springs
- **Irakli** (Иракли) - Popular wild beach for camping and naturism
- **Nessebar** (Несебър) - Ancient town with UNESCO status
- And many more...

### 🌐 **Multi-Language Support**
- **English** and **Bulgarian** language support
- Automatic beach name and description translation
- Localized safety messages and interface

### 📱 **Progressive Web App (PWA)**
- Install directly to your mobile device
- Works offline with cached data
- Fast loading and native app-like experience
- Service worker for background updates

### 📍 **Location Features**
- Optional geolocation to show distance to beaches
- Share beach locations with friends
- "Find My Location" button on map

## 🚀 Live Demo

Visit the live app: **[flagwatch.netlify.app](https://flagwatch.netlify.app)**

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Mapping**: Leaflet.js with OpenStreetMap tiles
- **Weather API**: Open-Meteo (atmospheric and marine data)
- **Styling**: CSS Custom Properties with dark/light mode support
- **PWA**: Service Worker for offline functionality
- **Deployment**: Netlify with automatic deployments

## 📦 Installation & Setup

### Prerequisites
- Modern web browser with JavaScript enabled
- Internet connection (for live weather data)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/flagwatch.git
   cd flagwatch
   ```

2. **Serve the files**
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Using Node.js
   npx serve .
   
   # Or any other static file server
   ```

3. **Open in browser**
   ```
   http://localhost:8000
   ```

### Deploy to Netlify

1. Fork this repository
2. Connect to Netlify
3. Deploy with these settings:
   - **Build command**: (leave empty)
   - **Publish directory**: `/` (root)

## 📁 Project Structure

```
flagwatch/
├── index.html          # Main HTML file with app structure
├── app.js             # Core JavaScript application logic
├── style.css          # CSS styles with design system
├── sw.js              # Service Worker for PWA functionality
├── README.md          # Project documentation
└── assets/            # Images and icons (if any)
```

## 🏗️ Architecture

### Core Components

**`BeachSafetyApp` Class** - Main application controller
- Handles initialization, event listeners, and state management
- Manages map rendering and beach data loading
- Coordinates weather data fetching and UI updates

**Weather Data Pipeline**
1. Fetch live data from Open-Meteo APIs (atmospheric + marine)
2. Process and combine wind, wave, and temperature data
3. Calculate safety flags based on predefined thresholds
4. Update UI elements (markers, list items, modals)
5. Cache data for offline use

**Responsive Design**
- Mobile-first CSS approach
- Grid layout that adapts from single-column (mobile) to dual-pane (desktop)
- Touch-friendly controls and interactions

## 📊 Beach Safety Algorithm

Safety flags are calculated using these thresholds:

**🔴 Red Flag (Dangerous)**
- Wind speed > 25 knots
- Wave height > 2.0 meters  
- Water temperature  15 knots
- Wave height > 1.0 meters
- Water temperature < 18°C

**🟢 Green Flag (Safe)**
- All conditions below yellow thresholds

## 🌍 API Integration

### Open-Meteo Weather API
- **Forecast API**: `api.open-meteo.com/v1/forecast`
  - Temperature, UV index, wind speed/direction
- **Marine API**: `marine-api.open-meteo.com/v1/marine`
  - Wave height, sea surface temperature

### Fallback Data
- Demo weather conditions generated when API unavailable
- Realistic conditions based on location and beach type
- Cached data for offline functionality

## 🎨 Design System

Built with a comprehensive CSS design system featuring:
- **Color Tokens**: Semantic color variables for light/dark themes
- **Typography Scale**: Consistent font sizes and weights
- **Spacing System**: Standardized margins and padding
- **Component Library**: Reusable buttons, cards, modals
- **Responsive Breakpoints**: Mobile, tablet, desktop layouts

## 🔧 Configuration

### Beach Data
Beaches are configured in `app.js` within the `loadBeachData()` method:

```javascript
{
  "id": "beach_id",
  "name": "Beach Name",
  "name_bg": "Име на плажа",
  "coordinates": {"lat": 42.123, "lng": 27.456},
  "region": "Region",
  "type": "resort|urban|wild|nature",
  "priority": "highest|high|medium",
  "facilities": {
    "lifeguards": true,
    "blueflag": true,
    "restaurants": true
  },
  "description": "English description",
  "description_bg": "Български опис"
}
```

### Weather Update Intervals
- **Live updates**: Every 30 minutes
- **Cache duration**: 2 hours for offline mode
- **API timeout**: 10 seconds per request

## 🌐 Browser Support

- **Chrome/Chromium** 88+
- **Firefox** 85+
- **Safari** 14+
- **Edge** 88+

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines
1. Follow existing code style and naming conventions
2. Test on multiple devices and browsers
3. Ensure accessibility compliance
4. Update documentation for new features

### Adding New Beaches
1. Add beach data to the `beachData.priority_beaches` array in `app.js`
2. Include both English and Bulgarian names/descriptions
3. Verify coordinates are accurate
4. Test the new beach appears correctly on map and list

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Open-Meteo** for free weather API access
- **Leaflet.js** for excellent mapping library
- **OpenStreetMap** contributors for map tiles
- **Bulgarian Tourism** for beach information
- **Netlify** for hosting and deployment

## 📞 Support

For questions or issues:
- 🐛 [Open an issue](https://github.com/Gokaroth/flagwatch/issues)
- 🌐 Live demo: [flagwatch.netlify.app](https://flagwatch.netlify.app)

***

**Made with ❤️ for safer beach experiences on the Bulgarian Black Sea coast**

[1] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/40447289/6d0b8552-628d-47e8-83f5-e5c40bab6271/app.js
[2] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/40447289/fed13d97-7c40-475b-995a-b390386e33bb/index.html
[3] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/40447289/3f8bf815-956b-4b9c-a08d-bd580d56549f/style.css
[4] https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/40447289/5e385f6f-bfa6-435e-b887-ad7261465830/sw.js
