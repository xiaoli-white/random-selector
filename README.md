# Random Selector

A desktop application for weighted random selection with a floating overlay window and system tray. Built with Tauri v2, Vue 3, TypeScript, and SQLite.

## Features

- **Weighted Random Selection** — Assign weights to items; the selection probability is proportional to the weight. Scroll animation runs on "Start", and clicking "Stop" picks one item. "Auto" mode picks automatically after a configurable delay.
- **Multi-Config Support** — Create, rename, copy, delete, and switch between multiple named configurations. Each config has its own items, settings, and history. Export/import configs as JSON files.
- **Floating Window** — A tiny transparent frameless window (190×48) that stays on top of all other windows. Provides a quick toggle to show/hide the main window.
- **System Tray** — Runs in the system tray with a context menu (toggle window, quit). Left-click on the tray icon toggles the main window's visibility.
- **Admin Panel** — A full settings modal with six tabs:
  - **General** — Force reload, config management, auto-pick duration, always-on-top toggle.
  - **Items** — Table with inline editing, add/delete/disable, import from text, batch operations, search/filter.
  - **History** — Browse selections with date range and name filters; clear history.
  - **Statistics** — Items ranked by selection count.
  - **Security** — Set/change/remove an admin password (SHA-256 hashed with random salt).
  - **Custom** — Customize every UI text string (labels, titles, hints, errors).
- **Import/Export** — Import items from text files (`name,weight` per line). Export/import full configs as JSON.
- **Persistent Storage** — All data stored locally in SQLite via Tauri's SQL plugin.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | [Tauri](https://tauri.app/) v2 |
| Frontend | [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) |
| Build Tool | [Vite](https://vitejs.dev/) |
| UI Library | [Ant Design Vue 4](https://next.antdv.com/) |
| Database | SQLite via [@tauri-apps/plugin-sql](https://v2.tauri.app/plugin/sql/) |
| Backend | Rust |

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Tauri v2 system dependencies](https://v2.tauri.app/start/prerequisites/) (platform-specific)

## Getting Started

```bash
# Install dependencies
npm install

# Start development with hot-reload
npm run tauri dev

# Build for production
npm run tauri build
```

The Vite dev server runs on port 1420 and the Tauri desktop app launches automatically with hot-reload support.

## Project Structure

```
├── index.html                  # Main window entry
├── floating.html               # Floating overlay window entry
├── src/
│   ├── main.ts                 # Main window Vue app entry
│   ├── floating.ts             # Floating window Vue app entry
│   ├── App.vue                 # Main window component
│   ├── FloatingWindow.vue      # Floating overlay component
│   ├── db.ts                   # Database layer (SQL queries, logic)
│   └── components/
│       └── SettingsModal.vue   # Admin settings panel
├── src-tauri/
│   ├── tauri.conf.json         # Tauri app configuration
│   ├── src/
│   │   ├── main.rs             # Rust entry point
│   │   └── lib.rs              # Commands, tray, window management
│   ├── capabilities/
│   │   └── default.json        # Tauri permissions
│   └── icons/                  # Application icons
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## License

MIT
