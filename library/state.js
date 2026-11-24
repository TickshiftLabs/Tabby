// UI STATE ONLY — the single source of truth for the Library page
// No DOM, no storage access

const state = {
  snapshots: [], // snapshots with at least one tab
  folders: [],
  trash: [],
  // {type:"all"} | {type:"starred"} | {type:"folder", folderId} | {type:"trash"} | {type:"tidy"}
  place: { type: "all" },
  selectedId: null, // snapshot id, or trash item id when the place is Trash
  query: "",
  showAllFor: null, // snapshot id whose tabs are shown in full during a search
  sort: "recent", // "recent" | "alpha"
};
