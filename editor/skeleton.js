// ============================================================================
// editor/skeleton.js — instance skeletons (createPreview / createEditor own their DOM)
// ----------------------------------------------------------------------------
// 3.0 makes the editor a self-contained component (decisions.md D1): the host page
// only provides an empty mount point, and createPreview/createEditor render their
// own skeleton into it. This module is the single copy of that markup:
//   editorSkeletonHtml()          full editor shell (topbar / stage / thumbnail bar)
//   previewSkeletonHtml(opts)     preview shell: "full" = view chrome + page bar,
//                                 "embedded" = canvas surface only (covers / embeds)
//
// The ids are the DOM contract used by the view modules through createDom(rootEl);
// keep them in sync with editor/dom.js.
//
// A preview skeleton is a subset of the editor one: createEditor renders the editor
// skeleton and runs the same preview core against it (the extra editing regions are
// simply ignored by the preview core). The reverse is not true, which is why the
// two live here rather than being derived from one template.
// ============================================================================

/** GitHub repository badge slot (full chrome only; injectIcons fills the slot). */
const GITHUB_LINK =
  `<a class="icon-btn" href="https://github.com/Shingwha/open-pptd" target="_blank" rel="noopener" title="GitHub 仓库">` +
  `<span class="icon-slot" data-icon="github"></span></a>`;

/** Canvas surface: stage → canvas wrap → canvas + progressive-load mask. */
const CANVAS_SURFACE =
  `<main id="stage" class="stage">` +
  `<div id="canvas-wrap" class="canvas-wrap">` +
  `<div id="canvas" class="canvas"></div>` +
  `<div id="canvas-loading" class="canvas-loading"></div>` +
  `</div>` +
  `</main>`;

/** Zoom control group (preview full chrome / editor thumbnail bar). */
const ZOOM_GROUP =
  `<div id="zoom-ctl" class="zoom-ctl">` +
  `<button id="btn-zoom-out" class="icon-btn" title="缩小">` +
  `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 11h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
  `</button>` +
  `<span id="zoom-label" class="zoom-label" title="双击还原适配视图">100%</span>` +
  `<button id="btn-zoom-in" class="icon-btn" title="放大">` +
  `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 16.5L21 21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 11h6M11 8v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
  `</button>` +
  `<span class="zoom-sep"></span>` +
  `<button id="btn-zoom-reset" class="icon-btn" title="还原到适配视图">` +
  `<svg viewBox="0 0 24 24"><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 9l6 6M15 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
  `</button>` +
  `</div>`;

/** Present entry (preview topbar / editor topbar). */
const PRESENT_BUTTON =
  `<button id="btn-present" class="btn btn-present" title="放映：从当前页开始全屏演示 (F5)">` +
  `<span class="btn-ic"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 21v-2M8 21h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 8.5v5l4.2-2.5z" fill="currentColor"/></svg></span>` +
  `<span class="btn-label">放映</span>` +
  `</button>`;

/** Editor-only add control (3 content types) + its anchored popup, inside the stage. */
const ADD_CONTROLS =
  `<div class="fab-stack">` +
  `<button id="btn-add" class="fab" title="添加元素（文字 / 表格 / 图表）">` +
  `<svg viewBox="0 0 24 24" class="fab-ic"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>` +
  `</button>` +
  `</div>` +
  `<div id="add-list" class="add-list" hidden></div>`;

/**
 * Full editor shell (the only editing chrome: topbar / workspace / thumbnail bar).
 * @returns {string} HTML to render into the mount point
 */
export function editorSkeletonHtml() {
  return (
    `<div class="app" id="editor-app">` +
    // topbar: flat single row — brand left, one right-aligned cluster (status + undo/redo + file/design/present + GitHub)
    `<header class="topbar">` +
    `<div class="brand">` +
    `<a class="brand-home" href="./" title="返回作品画廊">OPEN PPTD</a>` +
    `<span class="brand-file" id="brand-file"></span>` +
    `</div>` +
    `<div class="topbar-actions">` +
    // status cluster (live-reload.js): shares the right cluster gap, one hairline divider follows it
    `<div class="tb-status" id="tb-status">` +
    `<span class="status-hint" id="status-hint" hidden title="GitHub Pages 部署模式：保存将下载项目包（zip）"></span>` +
    `<span class="status-dirty" id="status-dirty" hidden>● 未保存</span>` +
    `<button type="button" class="status-btn" id="btn-reload" title="从磁盘重新加载当前项目">刷新</button>` +
    `</div>` +
    `<button id="btn-undo" class="icon-btn" title="撤销 (Ctrl+Z)">` +
    `<svg viewBox="0 0 24 24"><path d="M8 7L4 11l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 11h10a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
    `</button>` +
    `<button id="btn-redo" class="icon-btn" title="重做 (Ctrl+Y)">` +
    `<svg viewBox="0 0 24 24"><path d="M16 7l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 11H10a5 5 0 0 0 0 10h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
    `</button>` +
    `<span class="topbar-divider"></span>` +
    `<button id="btn-file" class="btn" title="文件：新建 / 打开本地项目 / 保存 / 导出（Ctrl+S 可直接保存）">` +
    `<span class="btn-ic"><svg viewBox="0 0 24 24"><path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.2V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>` +
    `<span class="btn-label">文件</span>` +
    `</button>` +
    `<button id="btn-design" class="btn" title="设计：主题 / 字体 / 外观">` +
    `<span class="btn-ic"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0 0 18h1.6a1.6 1.6 0 0 0 0-3.2H12a1.6 1.6 0 0 1 0-3.2h4.4A4.6 4.6 0 0 0 21 10C21 6.1 17 3 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7.4" cy="10.6" r="1.1" fill="currentColor"/><circle cx="11.8" cy="7.4" r="1.1" fill="currentColor"/><circle cx="16.4" cy="8.6" r="1.1" fill="currentColor"/></svg></span>` +
    `<span class="btn-label">设计</span>` +
    `</button>` +
    PRESENT_BUTTON +
    GITHUB_LINK +
    `</div>` +
    `</header>` +
    // workspace: canvas fills the whole width (the Design panel is a drawer)
    `<div class="workspace">` +
    `<main id="stage" class="stage">` +
    `<div id="canvas-wrap" class="canvas-wrap">` +
    `<div id="canvas" class="canvas"></div>` +
    `<div id="canvas-loading" class="canvas-loading"></div>` +
    `</div>` +
    ADD_CONTROLS +
    `</main>` +
    `</div>` +
    // bottom page thumbnail bar (right end: page menu + zoom group + page count)
    `<footer class="thumbbar">` +
    `<div id="page-thumbs" class="page-thumbs"></div>` +
    `<button id="btn-add-page" class="thumb-add" title="在当前页后插入新页">＋</button>` +
    `<button id="btn-page-menu" class="icon-btn" title="页面操作：前插 / 后插 / 移动 / 删除">` +
    `<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
    `</button>` +
    `<div class="thumbbar-meta">` +
    ZOOM_GROUP +
    `<span id="page-count"></span>` +
    `</div>` +
    `</footer>` +
    `</div>`
  );
}

/**
 * Preview shell.
 * @param {{ chrome?: "full"|"embedded" }} [opts]
 *   full     preview view chrome: brand + present + page bar + zoom + page count
 *   embedded canvas surface only (gallery covers / host embeds / headless page)
 * @returns {string} HTML to render into the mount point
 */
export function previewSkeletonHtml({ chrome = "full" } = {}) {
  if (chrome === "embedded") {
    return `<div class="pptd-preview" data-chrome="embedded">${CANVAS_SURFACE}</div>`;
  }
  return (
    `<div class="app pptd-preview" data-chrome="full">` +
    `<header class="topbar">` +
    `<div class="brand">` +
    `<a class="brand-home" href="./" title="返回作品画廊">OPEN PPTD</a>` +
    `<span class="brand-file" id="brand-file"></span>` +
    `</div>` +
    `<div class="topbar-actions">` +
    PRESENT_BUTTON +
    GITHUB_LINK +
    `</div>` +
    `</header>` +
    `<div class="workspace">${CANVAS_SURFACE}</div>` +
    `<footer class="thumbbar">` +
    `<div id="page-thumbs" class="page-thumbs"></div>` +
    `<div class="thumbbar-meta">${ZOOM_GROUP}<span id="page-count"></span></div>` +
    `</footer>` +
    `</div>`
  );
}
