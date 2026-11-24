// UI DIALOGS ONLY — confirm, input, toast and popup menu
// Depends on: library/model.js (escapeHtml)

/**
 * Put focus back on the control a dialog or menu was opened from. If a
 * re-render replaced it, the matching new control is used instead.
 */
function returnFocus(opener) {
  if (!opener) return;
  if (opener.isConnected) {
    opener.focus();
    return;
  }
  const match = findByFocusKey(focusKeyOf(opener));
  if (match) match.focus();
}

function showConfirmDialog(title, message, confirmText = "OK", isDanger = false) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-title">${escapeHtml(title)}</div>
        <div class="dialog-message">${escapeHtml(message)}</div>
        <div class="dialog-actions">
          <button class="btn" data-dialog="cancel">Cancel</button>
          <button class="btn ${isDanger ? "btn-danger" : "btn-primary"}" data-dialog="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;

    const close = (result) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(result);
      // After the caller has had a chance to re-render.
      setTimeout(() => returnFocus(opener), 0);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      }
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-dialog='cancel']")) close(false);
      else if (e.target.closest("[data-dialog='confirm']")) close(true);
    });
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(overlay);
    // Enter must never confirm something destructive by accident.
    overlay.querySelector(isDanger ? "[data-dialog='cancel']" : "[data-dialog='confirm']").focus();
  });
}

function showInputDialog(title, message, defaultValue = "") {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "dialog-overlay";
    overlay.innerHTML = `
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="dialog-title">${escapeHtml(title)}</div>
        <div class="dialog-message">${escapeHtml(message)}</div>
        <input type="text" class="dialog-input" value="${escapeHtml(defaultValue)}">
        <div class="dialog-actions">
          <button class="btn" data-dialog="cancel">Cancel</button>
          <button class="btn btn-primary" data-dialog="confirm">Save</button>
        </div>
      </div>`;

    const input = overlay.querySelector(".dialog-input");
    const close = (result) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(result);
      setTimeout(() => returnFocus(opener), 0);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(null);
      }
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay || e.target.closest("[data-dialog='cancel']")) close(null);
      else if (e.target.closest("[data-dialog='confirm']")) close(input.value);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") close(input.value);
    });
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

let cancelToastTimer = null;

function clearToast() {
  if (cancelToastTimer) {
    cancelToastTimer();
    cancelToastTimer = null;
  }
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
}

/**
 * Run fn after the page has been visible for ms. The countdown restarts
 * whenever the page becomes visible, so a toast shown just before the
 * browser switches to another tab is still there on return.
 * @returns {Function} cancel
 */
function runAfterVisibleFor(ms, fn) {
  let timer = null;
  const stop = () => {
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", arm);
  };
  const arm = () => {
    clearTimeout(timer);
    if (!document.hidden) {
      timer = setTimeout(() => {
        stop();
        fn();
      }, ms);
    }
  };
  document.addEventListener("visibilitychange", arm);
  arm();
  return stop;
}

function showToast(message) {
  showToastWithAction(message, null, null);
}

/**
 * Toast with an optional action button (used for Undo).
 */
function showToastWithAction(message, actionLabel, onAction) {
  clearToast();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");

  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  if (actionLabel && typeof onAction === "function") {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      clearToast();
      onAction();
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  cancelToastTimer = runAfterVisibleFor(actionLabel ? 8000 : 3000, () => {
    cancelToastTimer = null;
    toast.remove();
  });
}

let activeMenu = null;
let menuOpener = null;

function closeMenu(restoreFocus = false) {
  if (!activeMenu) return;
  activeMenu.remove();
  activeMenu = null;
  if (restoreFocus) returnFocus(menuOpener);
  menuOpener = null;
}

/**
 * Open a popup menu below an element.
 * @param {Element} anchorEl
 * @param {Array<{label: string, onSelect: Function, danger?: boolean} | {divider: true} | {note: string}>} items
 */
function showMenu(anchorEl, items) {
  closeMenu();

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (item.divider) {
      const divider = document.createElement("div");
      divider.className = "menu-divider";
      menu.appendChild(divider);
      continue;
    }
    if (item.note) {
      const note = document.createElement("div");
      note.className = "menu-note";
      note.textContent = item.note;
      menu.appendChild(note);
      continue;
    }
    const btn = document.createElement("button");
    btn.className = "menu-item" + (item.danger ? " danger" : "");
    btn.setAttribute("role", "menuitem");
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      closeMenu();
      item.onSelect();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;
  menuOpener = anchorEl;

  // Up/Down walk the items; Home/End jump to the ends.
  menu.addEventListener("keydown", (e) => {
    const buttons = [...menu.querySelectorAll(".menu-item")];
    const current = buttons.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = (current + 1) % buttons.length;
    if (e.key === "ArrowUp") next = (current - 1 + buttons.length) % buttons.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = buttons.length - 1;
    if (next === null || buttons.length === 0) return;
    e.preventDefault();
    buttons[next].focus();
  });

  // Place below the anchor, kept inside the window.
  const anchor = anchorEl.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8));
  let top = anchor.bottom + 4;
  if (top + box.height > window.innerHeight - 8) top = Math.max(8, anchor.top - box.height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const first = menu.querySelector(".menu-item");
  if (first) first.focus();
}

function setupMenuDismissal() {
  // Capture phase, so the click that opens a menu (handled later) is not affected.
  document.addEventListener(
    "mousedown",
    (e) => {
      if (activeMenu && !activeMenu.contains(e.target)) closeMenu();
    },
    true
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu(true);
  });
  window.addEventListener("blur", () => closeMenu());
}
