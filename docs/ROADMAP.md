# Roadmap

Non-binding direction: what exists, what may come back, and what will not be built.

## Done

- Save tabs and windows into snapshots; restore them, including tab groups
- Search by title, site and address
- Folders and stars
- Trash with undo
- Tidy up: close open tabs that are already saved or open twice
- Export and import
- The Library: one three-pane page for everything

## Parked, to return when the core has settled

Each was removed from the UI when the Library was built. The stored data (`tags`,
`note`, `aiSummary`) is still in the vault.

- **Names and summaries from a local model.** Most snapshots are unnamed
  and show as "Snapshot · date", which is the weakest part of the list.
  The old version called a remote service; a return should run locally.
- **Tags and notes.** Meant to be filled in with help from a local model,
  not by hand.
- **Topics.** Grouping snapshots by subject across the vault.
- **Activity signals.** Which open tabs have not been used for a while.
  Suggestions only, no automation.

## Not planned

- Secret Vault (removed; unused)
- Cloud sync, accounts, or any backend

AI must never be authoritative and never take irreversible actions.
