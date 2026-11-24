// BACKGROUND SERVICE WORKER — entry point
// Loads all background modules via importScripts

// Pure helper libraries
importScripts("lib/urls.js", "lib/domains.js");

// Storage layer
importScripts("storage/dedup.js", "storage/snapshots.js", "storage/trash.js", "storage/cleanup.js");

// Background modules
importScripts("library/open.js", "background/actions.js", "background/contextMenu.js", "background/init.js");
