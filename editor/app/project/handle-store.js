// ============================================================================
// app/project/handle-store.js — 最近项目（IndexedDB 持久化句柄）
// ----------------------------------------------------------------------------
// FileSystemHandle 可结构化克隆，存进 IndexedDB 即「最近项目」（vscode.dev
// 等的标准做法）。句柄授权会话级失效：恢复时由调用方在用户手势里
// ensurePermission（见 handle-io.js）。上限 8 条，同句柄去重并置顶。
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

/** 全部最近项目（ts 降序）。 */
export async function listRecent() {
  try {
    const all = (await tx("readonly", (s) => s.getAll())) || [];
    return all.sort((x, y) => y.ts - x.ts).slice(0, MAX);
  } catch {
    return []; // 隐私模式等 IDB 不可用：最近列表降级为空
  }
}

export async function getRecent(id) {
  try {
    return (await tx("readonly", (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

/** 记录/置顶一个项目句柄。 */
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
    return null; // 存储失败不影响打开，只是不进最近列表
  }
}

export async function removeRecent(id) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* 忽略 */
  }
}

// ----------------------------------------------------------------------------
// 会话恢复标记：sessionStorage 存最近条目 id（句柄本身不可字符串化，进 IDB）。
// 编辑器刷新/从画廊跳转时据此续开上次项目（授权仍在则免确认，否则弹恢复卡片）。
// ----------------------------------------------------------------------------
const PENDING_KEY = "pptd-pending-project";

export function setPendingProject(id) {
  try {
    sessionStorage.setItem(PENDING_KEY, id);
  } catch {
    /* 忽略 */
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
    /* 忽略 */
  }
}
