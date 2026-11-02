// editor/skeleton.js — instance skeletons rendered into the mount point
// Single copy of the markup: editorSkeletonHtml() (full editor shell),
// previewSkeletonHtml(opts) ("full" chrome or embedded canvas), homeSkeletonHtml().
// Ids are the DOM contract consumed through createDom(rootEl); keep them in sync
// with editor/dom.js. A preview skeleton is a subset of the editor one, so the
// editor renders its own shell and runs the preview core against it.

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
  `<button id="btn-present" class="btn btn-present btn-collapse" title="放映：从当前页开始全屏演示 (F5)">` +
  `<span class="btn-ic"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 21v-2M8 21h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10 8.5v5l4.2-2.5z" fill="currentColor"/></svg></span>` +
  `<span class="btn-label">放映</span>` +
  `</button>`;

/** Editor-only add control (3 content types) + its anchored popup, inside the stage. */
const ADD_CONTROLS =
  `<div class="fab-stack">` +
  `<button id="btn-add" class="fab" title="添加元素（文字 / 表格 / 图表 / 形状 / 线条 / 图片）">` +
  `<svg viewBox="0 0 24 24" class="fab-ic"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>` +
  `</button>` +
  `</div>` +
  `<div id="add-list" class="add-list" hidden></div>`;

/**
 * Editor-only selection action bar: copy / duplicate / delete. Positioned by
 * interaction/canvas.js above the selection; hidden without a selection, while a
 * content editor is open and while presenting.
 */
const SEL_ACTIONS =
  `<div id="sel-actions" class="sel-actions" hidden>` +
  `<button type="button" class="sel-action" data-action="copy" title="复制 (Ctrl+C)" aria-label="复制">` +
  `<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="12" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 4.5V3.5h5v1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 10h6M9 14h6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>` +
  `</button>` +
  `<button type="button" class="sel-action" data-action="duplicate" title="重复 (Ctrl+D)" aria-label="重复">` +
  `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M15 9V5.8A1.8 1.8 0 0 0 13.2 4H5.8A1.8 1.8 0 0 0 4 5.8v7.4A1.8 1.8 0 0 0 5.8 15H9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>` +
  `</button>` +
  `<button type="button" class="sel-action" data-action="delete" title="删除 (Delete)" aria-label="删除">` +
  `<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7M6.5 7l.9 12.2A1.6 1.6 0 0 0 9 20.7h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>` +
  `</button>` +
  `</div>`;

/**
 * Full editor shell (the only editing chrome: topbar / workspace / thumbnail bar).
 * @returns {string} HTML to render into the mount point
 */
export function editorSkeletonHtml() {
  return (
    `<div class="app">` +
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
    `<span class="status-saved" id="status-saved">已保存</span>` +
    `<span class="status-dirty" id="status-dirty" hidden>未保存</span>` +
    `<button type="button" class="status-btn" id="btn-reload" title="从磁盘重新加载当前项目">刷新</button>` +
    `</div>` +
    `<button id="btn-undo" class="icon-btn" title="撤销 (Ctrl+Z)">` +
    `<svg viewBox="0 0 24 24"><path d="M8 7L4 11l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 11h10a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
    `</button>` +
    `<button id="btn-redo" class="icon-btn" title="重做 (Ctrl+Y)">` +
    `<svg viewBox="0 0 24 24"><path d="M16 7l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 11H10a5 5 0 0 0 0 10h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>` +
    `</button>` +
    `<span class="topbar-divider"></span>` +
    `<button id="btn-file" class="btn btn-collapse" title="文件：新建 / 打开本地项目 / 保存 / 导出（Ctrl+S 可直接保存）">` +
    `<span class="btn-ic"><svg viewBox="0 0 24 24"><path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.2V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>` +
    `<span class="btn-label">文件</span>` +
    `</button>` +
    `<button id="btn-design" class="btn btn-collapse" title="设计：颜色 / 字体 / 外观">` +
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
    SEL_ACTIONS +
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

/**
 * Home view shell (gallery as the single-page app's start view). The file menu and
 * the sample grid are wired by gallery.js; this is only the DOM contract.
 * @returns {string} HTML for the shell mount point
 */
export function homeSkeletonHtml() {
  return (
    `<div class="gallery-view" id="home-view">` +
    `<header class="gallery-top">` +
    `<div class="gallery-top-inner">` +
    `<div class="brand"><a class="brand-home" href="./" title="刷新作品画廊">OPEN PPTD</a></div>` +
    `<div class="gallery-top-actions">` +
    `<div id="gallery-mode" class="gallery-mode" hidden></div>` +
    `<details class="gallery-guide">` +
    `<summary class="btn btn-collapse" title="安装与使用说明">` +
    `<span class="btn-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.5v.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>` +
    `<span class="btn-label">使用说明</span>` +
    `</summary>` +
    `<div class="gallery-guide-panel">` +
    `<strong class="gallery-guide-title">让 AI 帮你安装</strong>` +
    `<p class="gallery-guide-note">复制这段 Prompt，发给你的 AI。</p>` +
    `<pre id="gallery-guide-prompt">Install or upgrade open-pptd and its Skill on my device. Detect my OS and current AI tool's skills directory, then execute the commands directly. To install or upgrade the CLI, use Windows (PowerShell): irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex; macOS/Linux: curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh. After that, run open-pptd assets skill install --dir [actual skills directory], using the detected path.</pre>` +
    `<div class="gallery-guide-actions">` +
    `<button id="btn-copy-guide" class="btn btn-primary btn-sm" type="button">复制 Prompt</button>` +
    `<a class="btn btn-sm gallery-guide-github" href="https://github.com/Shingwha/open-pptd" target="_blank" rel="noopener">GitHub 仓库 ↗</a>` +
    `</div>` +
    `</div>` +
    `</details>` +
    `<button id="btn-file" class="btn btn-collapse" title="文件：新建 / 打开本地项目 / 最近打开">` +
    `<span class="btn-ic"><svg viewBox="0 0 24 24"><path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.2V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></span>` +
    `<span class="btn-label">文件</span>` +
    `</button>` +
    GITHUB_LINK +
    `</div>` +
    `</div>` +
    `</header>` +
    `<div class="gallery-main">` +
    `<section class="gallery-masthead">` +
    `<div class="gallery-masthead-copy">` +
    `<h1 class="gallery-title">Presentations,<br>not templates.</h1>` +
    `<p class="gallery-sub">输入内容，生成可编辑的 PPT 与海报。</p>` +
    `</div>` +
    `</section>` +
    `<section class="gallery-toolbar" aria-label="作品筛选">` +
    `<div id="gallery-tabs" class="gallery-tabs" role="tablist" hidden></div>` +
    `</section>` +
    `<div id="gallery-grid" class="gallery-grid" hidden></div>` +
    `</div>` +
    `</div>`
  );
}
