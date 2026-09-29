// ============================================================================
// app/project/handle-store.js — recent projects (IndexedDB-persisted handles)
// ----------------------------------------------------------------------------
// FileSystemHandle is structured-cloneable, so storing it in IndexedDB gives
// "recent projects" (the standard approach, as in vscode.dev). Handle grants
// expire per session: on restore the caller runs ensurePermission inside a user
// gesture (see handle-io.js). Cap is 8 entries, deduplicated by handle and moved
// to the top.
// ============================================================================

const DB_NAME = "open-pptd-projects";
const STORE = "recent";
const MAX = 8;

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
      })
  );
}

const sameEntry = async (a, b) => {
  try {
    return typeof a.isSameEntry === "function" ? await a.isSameEntry(b) : a === b;
  } catch {
    return false;
  }
};

/** All recent projects (ts descending). */
export async function listRecent() {
  try {
    const all = (await tx("readonly", (s) => s.getAll())) || [];
    return all.sort((x, y) => y.ts - x.ts).slice(0, MAX);
  } catch {
    return []; // IDB unavailable (private mode etc.): recent list degrades to empty
  }
}

export async function getRecent(id) {
  try {
    return (await tx("readonly", (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

/** Record/promote a project handle. */
export async function addRecent(handle) {
  try {
    const all = (await tx("readonly", (s) => s.getAll())) || [];
    for (const e of all) {
      if (await sameEntry(e.handle, handle)) await tx("readwrite", (s) => s.delete(e.id));
    }
    const entry = { id: crypto.randomUUID(), name: handle.name || "未命名项目", handle, ts: Date.now() };
    await tx("readwrite", (s) => s.put(entry));
    const rest = ((await tx("readonly", (s) => s.getAll())) || []).sort((x, y) => y.ts - x.ts);
    for (const e of rest.slice(MAX)) await tx("readwrite", (s) => s.delete(e.id));
    return entry;
  } catch {
    return null; // a storage failure does not block opening, it just skips the recent list
  }
}

export async function removeRecent(id) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

// ----------------------------------------------------------------------------
// Session-restore marker: sessionStorage holds the recent entry id (the handle
// itself is not stringifiable; it lives in IDB). The editor uses it on refresh /
// gallery jump to reopen the last project (no prompt while the grant holds,
// otherwise the restore card appears).
// ----------------------------------------------------------------------------
const PENDING_KEY = "pptd-pending-project";

export function setPendingProject(id) {
  try {
    sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    /* ignore */
  }
}

export function getPendingProjectId() {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingProject() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
