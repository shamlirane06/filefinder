# FileFinder AI

People often remember what a file contains but not where they saved it. FileFinder AI indexes folders that users explicitly select and combines local metadata search with optional AI-powered file understanding and natural-language search.

## Core Features

- Recursive indexing of selected folders into a local SQLite database
- Filename, file type, folder, and indexed metadata search with filters and sorting
- Optional AI understanding for supported image and PDF files
- Natural-language query understanding with local fallback
- Image and supported PDF previews
- AI-assisted organization suggestions with review, explicit move confirmation, and undo
- File-grounded assistant responses with source references and short-term session context
- Dashboard statistics, recent files, and quick actions

## How It Works

```text
User
  ↓
React interface
  ↓ narrow, validated Electron IPC
Electron main process
  ├─ SQLite index and local file services
  └─ AI provider calls when a feature requires them
  ↓
Search results, previews, and source references
```

The renderer does not receive unrestricted Node.js, filesystem, shell, database, or environment access. Sensitive operations stay in Electron.

## AI Usage

AI is used for opt-in image/PDF understanding, natural-language query parsing when configured, assistant answer generation over a bounded set of relevant indexed metadata, and organization suggestions based on indexed metadata. Search facts such as counts, locations, modification dates, and ranking are computed locally from the index. The assistant does not send entire files for normal questions.

Image/PDF content is sent to the configured provider only after the user starts **Analyze files with AI** in Settings. Supported images are limited to 15 MB; PDFs are limited to 20 MB and 20 detectable pages. If the provider is not configured or unavailable, local indexing and search continue to work.

## Privacy

- Only folders explicitly selected by the user are indexed.
- Indexing and ordinary search use the local SQLite database.
- Query text may be sent to the configured AI provider for natural-language understanding. Assistant questions and bounded candidate metadata may be sent for assistant answers. Organization suggestions may send bounded indexed metadata.
- File content is sent for image/PDF analysis only after the user starts that analysis.
- The API key is read from the `FILEFINDER_AI_API_KEY` environment variable in Electron's main process and is not sent to React or stored in the app database.
- AI provider data-handling and retention policies apply to information sent to that provider. Responses API requests set `store: false` where supported.

## Setup

Install dependencies:

```bash
npm install
```

Optional AI configuration: set `FILEFINDER_AI_API_KEY` in the operating-system environment before starting Electron. Optionally set `FILEFINDER_AI_MODEL` (defaults to `gpt-4o-mini`) or `FILEFINDER_AI_ENDPOINT` (defaults to the OpenAI Responses API endpoint). Do not commit credentials or `.env` files.

Start the desktop app in development:

```bash
npm run electron:dev
```

Other supported commands:

- `npm run dev` — Vite renderer only; desktop file operations require Electron.
- `npm run build` — production renderer build.
- `npm run electron` — open Electron using the configured entry point (requires the renderer to be built in production, or Vite to be running in development).

## Verification

```bash
npm run lint
npm run build
npm run test:index
npm run test:search
npm run test:ai
npm run test:natural-search
npm run test:preview
npm run test:assistant
npm run test:organization
npm run test:dashboard
npm run test:security
npm run test:scale
```
