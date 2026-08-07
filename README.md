# 180 FamDinner Connection Game

A mobile-first, static conversation card for 180 FamDinner. It uses no backend, accounts, analytics, or shared response collection. Answerers' first names, optional notes, and progress stay in the attendee's browser.

## Preview locally

You need Python 3 and a modern browser.

```sh
npm run dev
```

Open `http://localhost:8000`. Do not open `index.html` directly because browsers usually block local JSON requests from `file://` pages.

## Update an event

Edit `event.json` and review all event details and questions together:

1. Give every event a new, unique `event.id`. This prevents progress from a previous event appearing in the new event.
2. Update the title, date, topic, introduction, question count, discussion setting, and mix.
3. Replace the complete question list. Every active question needs a unique ID, supported type, text, and display order.
4. Set `placeholderContent` to `false` only after the ministry team approves all displayed content.
5. Run `npm test` and preview the full card on a phone before publishing.

The validator prints a warning while placeholder content remains. It rejects inconsistent question counts, duplicate IDs, unsupported types, and a mismatched question mix.

## Publish free with GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and confirm the “Deploy to GitHub Pages” workflow succeeds.
5. Use the stable Pages URL for the event QR code. Future content updates can use the same URL and QR code.

The included workflow validates `event.json` before each deployment.

## Code structure and themes

The browser application is split into small classes in `app.js`:

- `EventConfiguration` loads and validates event content.
- `ProgressStore` owns device-local names, notes, and completion state.
- `ThemeManager` follows the device theme and remembers a light or dark preference.
- `FamDinnerApp` coordinates screens and attendee interactions.
- `Html` contains safe display-formatting helpers.

Colors in `styles.css` use semantic custom properties such as `--color-surface` and `--color-text`. Light values live under `:root`; dark values override the same tokens under `:root[data-theme="dark"]`. Components should use these tokens instead of adding direct color values.

Typography and layout spacing use Utopia fluid tokens (`--text-*` and `--space-*`) that scale continuously between 360px and 1240px viewports. Reuse these tokens when adding components so new screens follow the same responsive rhythm.

## Privacy behavior

- Answerers' names, notes, and progress use browser `localStorage` under the current event ID.
- Nothing typed into the app is submitted to 180, MGC, GitHub, or another service.
- “Clear names, progress, and notes” removes the current event's stored data from that browser.
- Clearing browser storage or using another browser/device results in separate progress.
