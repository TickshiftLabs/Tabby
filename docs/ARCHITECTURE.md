# Architecture Overview

Tabby is a local-only browser extension.

There is no backend and no cloud sync.

## High-Level Flow

Browser Tabs
↓
Tab Scanner
↓
Snapshot Engine
↓
Indexed Local Storage
↓
Library page (search, restore, tidy up) and popup (save)

## Key Design Decisions

- chrome.storage.local for persistence
- JSON-based storage for transparency
- Popup for saving; a full-page Library for everything else
- Pure logic lives in `lib/`, `library/model.js` and `library/tidy-model.js`,
  and is tested with `node --test tests/`
- Only `storage/` touches `chrome.storage.local`
- No network access and no host permissions
