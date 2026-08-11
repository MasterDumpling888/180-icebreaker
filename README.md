# 180 FamDinner Connection Game

A mobile-first conversation card for 180 FamDinner. The attendee experience remains on GitHub Pages. Answerers' first names, private notes, and progress stay in the attendee's browser; attendees may separately submit a short anonymous response to a free Cloudflare Worker and D1 database for officer review.

## Preview locally

You need Python 3 and a modern browser.

```sh
npm run dev
```

Open `http://localhost:8000`. Do not open `index.html` directly because browsers usually block local JSON requests from `file://` pages.

The attendee UI works without the API, but anonymous submissions remain queued locally until an API is configured. To run the API locally after installing/authenticating Wrangler:

```sh
npm run db:migrate:local
npm run dev:api
```

Create `worker/.dev.vars` for local officer access. Never commit this file:

```dotenv
ADMIN_PASSCODE="use-a-long-event-passcode"
SESSION_SECRET="use-a-different-long-random-secret"
```

Then set `event.responseCollection.apiBaseUrl` to `http://localhost:8787` while testing. The officer dashboard is at `http://localhost:8000/admin.html`.

## Update an event

Edit `event.json` and review all event details and questions together:

1. Give every event a new, unique `event.id`. This prevents progress from a previous event appearing in the new event.
2. Update the title, date, topic, optional subheader, introduction, question count, discussion setting, and mix.
3. Replace the complete question list. Every active question needs a unique ID, supported type, text, and display order.
4. Set `placeholderContent` to `false` only after the ministry team approves all displayed content.
5. Run `npm test` and preview the full card on a phone before publishing.
6. Update `responseCollection.expiresAt` to midnight after the event in Manila and deploy both the Pages site and Worker so they bundle the same event configuration.

The validator prints a warning while placeholder content remains. It rejects inconsistent question counts, duplicate IDs, unsupported types, and a mismatched question mix.

## Publish free with GitHub Pages

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Open the **Actions** tab and confirm the “Deploy to GitHub Pages” workflow succeeds.
5. Use the stable Pages URL for the event QR code. Future content updates can use the same URL and QR code.

The included workflow validates `event.json` before each deployment.

## Configure the free response API

1. Create a free Cloudflare account, then create a D1 database named `180-icebreaker-responses`.
2. Replace `REPLACE_WITH_D1_DATABASE_ID` in `worker/wrangler.jsonc` with its database ID.
3. Update `ALLOWED_ORIGINS` with the exact GitHub Pages origin. Do not include a path or trailing slash.
4. Authenticate Wrangler (`npx wrangler login`) and create the two production secrets:

   ```sh
   npx wrangler secret put ADMIN_PASSCODE --config worker/wrangler.jsonc
   npx wrangler secret put SESSION_SECRET --config worker/wrangler.jsonc
   ```

5. Apply the schema and deploy:

   ```sh
   npm run db:migrate:remote
   npm run deploy:api
   ```

6. Copy the resulting `workers.dev` URL into `event.responseCollection.apiBaseUrl`, rerun `npm test`, and deploy Pages again.
7. Open `/admin.html`, enter the officer passcode, and submit a test response from a separate browser before the event.

For optional deployment through GitHub Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository Actions secrets, then manually run **Deploy response API**. It is manual so an event-content push cannot accidentally deploy against an unconfigured database.

## Code structure and themes

The browser application is split into small classes in `app.js`:

- `EventConfiguration` loads and validates event content.
- `ProgressStore` owns device-local names, notes, and completion state.
- `AnonymousResponseStore` queues explicitly shared responses and prevents duplicate retries.
- `ResponseApi` sends only the event ID, question ID, anonymous text, and random submission ID.
- `ThemeManager` follows the device theme and remembers a light or dark preference.
- `FamDinnerApp` coordinates screens and attendee interactions.
- `Html` contains safe display-formatting helpers.

Colors in `styles.css` use semantic custom properties such as `--color-surface` and `--color-text`. Light values live under `:root`; dark values override the same tokens under `:root[data-theme="dark"]`. Components should use these tokens instead of adding direct color values.

Typography and layout spacing use Utopia fluid tokens (`--text-*` and `--space-*`) that scale continuously between 360px and 1240px viewports. Reuse these tokens when adding components so new screens follow the same responsive rhythm.

The interface uses Titillium Web from Google Fonts through the `--font-family-primary` token. System sans-serif fonts remain as fallbacks if the web font cannot load.

Brand artwork lives under `assets/`. The page shell automatically switches between the supplied light and dark MGC logo variants with the selected theme.

The protected dashboard lives in `admin.html`; the API, D1 migration, expiry job, and officer authentication live under `worker/`.

## Privacy behavior

- Answerers' names, notes, and progress use browser `localStorage` under the current event ID.
- Names and private notes are never included in API requests.
- Only the separately labeled anonymous response is sent to Cloudflare after the attendee saves the question.
- Anonymous responses begin as pending and must be approved before appearing in presentation mode.
- “Clear names, progress, and notes” removes device-local data; it does not retract an already submitted anonymous response.
- Clearing browser storage or using another browser/device results in separate progress.
- An hourly cleanup removes expired live rows, and officers can delete all live event responses from the dashboard. Cloudflare's provider-level D1 Time Travel recovery history may retain deleted states for up to seven days on the free plan.
