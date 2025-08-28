# How to Update the "What's New" Popup

This guide explains how to display the "What's New" popup to users when you release a new version of the FlagWatch app with updated features. The popup supports both English and Bulgarian.

The process is managed entirely within the `app.js` file and involves two simple steps.

## Step 1: Update the App Version

At the top of `app.js`, you will find a constant named `APP_VERSION`. You **must** increment this version number to a new, unique value. The app uses this version to check if a user has seen the latest update popup.

**Example:**
If the current version is `'5.0.0'`, change it to `'6.0.0'`:

```javascript
// Before
const APP_VERSION = '5.0.0';

// After
const APP_VERSION = '6.0.0';
```

## Step 2: Edit the Popup Content (with Translations)

Directly below the `APP_VERSION` constant, there is an object named `WHATS_NEW_CONFIG`. This object controls the content displayed in the popup.

- **`version`**: Make sure this matches the new `APP_VERSION` you set in Step 1.
- **`features`**: This is an array of objects, where each object represents a feature to be highlighted. You must provide translations for both English (`en`) and Bulgarian (`bg`).
  - **`title`**: An object containing the title in both languages.
  - **`description`**: An object containing the description in both languages.

**Example:**
To announce new features for version `6.0.0`:

```javascript
const WHATS_NEW_CONFIG = {
    version: '6.0.0', // <-- Must match APP_VERSION
    features: [
        {
            title: {
                en: '🌊 New Real-Time Tide Data!',
                bg: '🌊 Нови данни за приливите в реално време!'
            },
            description: {
                en: "We've added live tide charts to the beach detail view to help you better plan your visit.",
                bg: "Добавихме диаграми на приливите на живо към изгледа с подробности за плажа, за да ви помогнем да планирате по-добре посещението си."
            },
        },
        {
            title: {
                en: '🐞 Bug Fixes & Performance Improvements',
                bg: '🐞 Поправки на грешки и подобрения в производителността'
            },
            description: {
                en: "We've squashed some bugs to make your experience smoother and faster.",
                bg: "Отстранихме някои грешки, за да направим изживяването ви по-гладко и по-бързо."
            }
        }
    ]
};
```

## How It Works

When a user opens the app, the `checkWhatsNew` function in `app.js` compares the `APP_VERSION` with the version number stored in the user's browser (`localStorage`).

- If the versions **do not match**, the app knows the user is on a new version.
- It then dynamically builds the popup's content from the `WHATS_NEW_CONFIG` object, using the currently selected language (`en` or `bg`).
- After the user dismisses the popup, the new `APP_VERSION` is saved to their browser, so they won't see the popup again until the next time you update the version.
