# FileFinder AI

## Optional AI file understanding

AI analysis is opt-in and runs from Settings after the user starts it. The first provider is the OpenAI Responses API. Configure `FILEFINDER_AI_API_KEY` in the operating-system environment before launching Electron; optionally set `FILEFINDER_AI_MODEL` (defaults to `gpt-4o-mini`) and `FILEFINDER_AI_ENDPOINT` (defaults to OpenAI's Responses endpoint). The key is read only by Electron's main process and is not stored in the app database or sent to React.

Only indexed image and PDF files inside the folders the user selected are considered. Images are limited to 15 MB, PDFs to 20 MB and 20 detectable pages. Content is transmitted to the configured provider only after the user clicks **Analyze files with AI**. Selectable PDF text is extracted locally first; scanned PDFs are sent as PDF input for provider vision/text extraction. AI metadata, fingerprints, and searchable extracted text are stored locally in SQLite. Unchanged completed files are skipped on later runs.

Desktop app to find, understand, and organize files on your computer using natural language.

## Phase 1

Foundation: Electron + React + Vite UI, sidebar navigation, folder selection, and persistence.

## Run

```bash
npm install
npm run electron:dev
```

This starts Vite on port 5173 and opens the Electron window.

## Scripts

- `npm run dev` — Vite only (browser preview; folder picker needs Electron)
- `npm run electron:dev` — full desktop app
- `npm run build` — production frontend build
