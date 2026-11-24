# Data Model

Tabby is built around snapshots.

A snapshot represents a moment of mental context,
not just a list of URLs.

## Snapshot

- id: string
- name: string (auto-generated, legacy - not used for display)
- customName: string (optional, user-defined display name)
- starred: boolean (optional, user-defined anchor)
- folderId: string | null (optional, user-defined container)
- createdAt: number (timestamp)
- reason: string
- note: string | null (optional, user-defined context)
- tabs: TabEntry[]
- tags: string[] (optional, user-defined semantic labels)

## TabEntry

- url: string
- title: string
- domain: string
- favicon: string
- windowId: number
- pinned: boolean

## Folder

- id: string
- name: string
- createdAt: number (timestamp)

---

## Parked fields

`tags` and `note` belong to features that are parked for now (see `docs/ROADMAP.md`).
They are kept on stored snapshots and in exports, but no UI shows or
edits them.

## Storage keys

- `tabby_snapshots`: Snapshot[]
- `tabby_folders`: Folder[]
- `tabby_trash`: trashed snapshots and tabs (a Snapshot plus `deletedAt`
  and `trashType`: `"snapshot"` or `"tab"`)
- `tabby_theme`: `"light"` or `"dark"`

---

All data is stored locally using chrome.storage.local
as JSON for transparency and inspectability.
