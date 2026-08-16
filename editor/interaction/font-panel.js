// ============================================================================
// interaction/font-panel.js — 顶栏「字体」浮层
// ----------------------------------------------------------------------------
// 配色浮层同款外壳（锚定按钮下方右对齐、外点关闭、resize 重定位），
// 单列滚动三段内容：
//   1. 我的字体：库内字体行内预览（字节已在内存，零成本）+ 子集/嵌入开关 + 删除
//   2. 内置字体库：注册表按分类分组；「预览」按需拉字节（Cache API 跨会话缓存，
//      大字体首次有下载成本），「添加」入库；系统字体行复制注册名
//   3. 添加条：本地文件 / 网络 URL（回车提交）
// 每次变更即时 fontManager.syncToDeck()，无「完成」按钮（对齐配色浮层即时生效）。
// ============================================================================

import { loadFontRegistry, fetchFontBytes } from "../core/font-registry.js";
import { showToast } from "../app/toast.js";

/** 内置库分类中文名（assets/fonts/registry.json 的 category）。 */
const CAT_LABEL = { sans: "黑体", serif: "宋/衬线", handwriting: "手写/书法", display: "标题/艺术", pixel: "像素" };

/** 行内预览示例文字：汉字 + 拉丁 + 数字，一段看全三种字形特征。 */
const PREVIEW_TEXT = "永 Aa 36";

/** 已绑定的打开函数（bindFontPanel 注册；openFontPanel 供导出对话框等外部入口调用）。 */
let openPanel = null;

/** 打开字体浮层（未绑定时静默忽略）。 */
export function openFontPanel() {
  openPanel?.();
}

export function bindFontPanel({ state, io, anchor }) {
  const fm = io.fontManager;
  let panel = null;
  let bodyEl = null; // 滚动列表区（重建内容时保留节点，滚动位置不丢）
  let searchEl = null;
  let noMatchEl = null;
  /** 已注册 FontFace 的内置库 family（预览态跨渲染记忆）。 */
  const previewed = new Set();
  /** 注册表：undefined=加载中，null=失败，对象=就绪。 */
  let registry = undefined;

  loadFontRegistry()
    .then((r) => (registry = r))
    .catch(() => (registry = null))
    .finally(() => {
      if (panel?.classList.contains("open")) render();
    });

  const isOpen = () => panel?.classList.contains("open");

  /** 变更后统一收口：同步资源表 + 重渲染 + 重新套用搜索过滤。 */
  function commit() {
    fm.syncToDeck();
    render();
  }

  // --------------------------------------------------------------------------
  // 构建（外壳一次，内容每次打开/变更重建）
  // --------------------------------------------------------------------------
  function build() {
    panel = document.createElement("div");
    panel.className = "font-panel";

    const head = document.createElement("div");
    head.className = "font-panel-head";
    const title = document.createElement("span");
    title.className = "font-panel-title";
    title.textContent = "字体";
    const hint = document.createElement("span");
    hint.className = "font-panel-hint";
    hint.textContent = "添加后可在文字属性「字体」下拉选用，导出按勾选嵌入";
    head.append(title, hint);
    panel.appendChild(head);

    searchEl = document.createElement("input");
    searchEl.type = "text";
    searchEl.className = "font-search";
    searchEl.placeholder = "搜索字体…";
    searchEl.addEventListener("input", () => applySearch());
    panel.appendChild(searchEl);

    bodyEl = document.createElement("div");
    bodyEl.className = "font-body";
    panel.appendChild(bodyEl);

    noMatchEl = document.createElement("div");
    noMatchEl.className = "font-empty";
    noMatchEl.textContent = "没有匹配的字体";
    noMatchEl.hidden = true;
    bodyEl.appendChild(noMatchEl);

    panel.appendChild(buildAddBar());
    document.body.appendChild(panel);
    render();
  }

  /** 底部添加条：本地文件（多选）+ 网络 URL（form 回车提交）。 */
  function buildAddBar() {
    const bar = document.createElement("div");
    bar.className = "font-add";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".ttf,.otf";
    fileInput.multiple = true;
    fileInput.className = "font-add-file";
    fileInput.addEventListener("change", async () => {
      for (const file of fileInput.files) {
        try {
          const family = await fm.addLocalFile(file);
          showToast(`已添加本地字体: ${family}`, "success");
        } catch (e) {
          showToast(`${file.name} 添加失败: ${e.message}`, "danger");
        }
      }
      fileInput.value = "";
      commit();
    });
    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.className = "btn btn-sm";
    fileBtn.textContent = "选择本地文件…";
    fileBtn.addEventListener("click", () => fileInput.click());

    const form = document.createElement("form");
    form.className = "font-add-url";
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.placeholder = "网络字体 URL（需 CORS）";
    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "btn btn-sm btn-primary";
    addBtn.textContent = "添加";
    let adding = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url || adding) return;
      adding = true;
      addBtn.disabled = true;
      addBtn.textContent = "添加中…";
      try {
        const family = await fm.addUrl(url);
        urlInput.value = "";
        showToast(`已添加网络字体: ${family}`, "success");
        commit();
      } catch (err) {
        showToast(`添加失败: ${err.message}`, "danger");
      } finally {
        adding = false;
        addBtn.disabled = false;
        addBtn.textContent = "添加";
      }
    });
    form.append(urlInput, addBtn);

    bar.append(fileBtn, form, fileInput);
    return bar;
  }

  // --------------------------------------------------------------------------
  // 渲染
  // --------------------------------------------------------------------------
  function render() {
    if (!bodyEl) return;
    const q = searchEl?.value.trim().toLowerCase() || "";
    bodyEl.innerHTML = "";
    bodyEl.appendChild(renderMyFonts());
    bodyEl.appendChild(renderLibrary());
    applySearch(q);
  }

  /** 「我的字体」区：库内字体行（预览 + 元信息 + 开关 + 删除）。 */
  function renderMyFonts() {
    const wrap = document.createElement("div");
    wrap.className = "font-secwrap";

    const sec = document.createElement("div");
    sec.className = "font-sec";
    const entries = Object.entries(state.fontLibrary);
    sec.textContent = entries.length ? `我的字体（${entries.length}）` : "我的字体";
    wrap.appendChild(sec);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "font-empty";
      empty.textContent = "尚未添加字体。可从下方内置字体库选用，或选择本地文件 / 输入网络 URL。";
      wrap.appendChild(empty);
      return wrap;
    }
    for (const [family, f] of entries) wrap.appendChild(myFontRow(family, f));
    return wrap;
  }

  function myFontRow(family, f) {
    const row = document.createElement("div");
    row.className = "font-item";
    row.dataset.q = `${family}`.toLowerCase();

    const main = document.createElement("div");
    main.className = "font-item-main";
    if (f.bytes) {
      const preview = document.createElement("div");
      preview.className = "font-item-preview";
      preview.textContent = PREVIEW_TEXT;
      preview.style.fontFamily = `"${family}"`;
      main.appendChild(preview);
    }
    const info = document.createElement("div");
    info.className = "font-item-info";
    const name = document.createElement("span");
    name.className = "font-item-name";
    name.textContent = family;
    info.appendChild(name);
    const srcLabel = f.source === "registry" ? "内置库" : f.source === "url" ? "网络" : "本地";
    const meta = document.createElement("span");
    meta.className = "font-item-meta";
    meta.textContent = f.bytes ? `${srcLabel} · ${fmtSize(f.size)}` : `${srcLabel} · 未加载`;
    info.appendChild(meta);
    main.appendChild(info);
    row.appendChild(main);

    // 未加载字体的恢复入口：url 字体重试拉取；file 字体重选本地文件
    if (!f.bytes && f.source === "url" && f.url) {
      const retryBtn = mkBtn("重试", async (btn) => {
        btn.disabled = true;
        btn.textContent = "加载中…";
        try {
          await fm.addUrl(f.url);
          showToast(`已加载: ${family}`, "success");
          commit();
        } catch (e) {
          showToast(`加载失败: ${e.message}`, "danger");
          btn.disabled = false;
          btn.textContent = "重试";
        }
      });
      row.appendChild(retryBtn);
    } else if (!f.bytes && f.file) {
      const reloadInput = document.createElement("input");
      reloadInput.type = "file";
      reloadInput.accept = ".ttf,.otf";
      reloadInput.className = "font-add-file";
      reloadInput.addEventListener("change", async () => {
        const file = reloadInput.files?.[0];
        if (!file) return;
        try {
          await fm.reloadLocalFile(family, file);
          showToast(`已加载: ${family}`, "success");
        } catch (e) {
          showToast(`加载失败: ${e.message}`, "danger");
        }
        commit();
      });
      row.append(mkBtn("加载文件…", () => reloadInput.click()), reloadInput);
    }

    // 子集 / 嵌入开关（chip，点击即翻转，静默生效）
    row.appendChild(mkChip("子集", "导出时只嵌入用到的字形，体积更小", f.subset, (on) => {
      f.subset = on;
      commit();
    }));
    row.appendChild(mkChip("嵌入", "导出 PPTX 时随文件嵌入，换机不丢字体", f.embed, (on) => {
      f.embed = on;
      commit();
    }));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "font-del";
    delBtn.textContent = "✕";
    delBtn.title = `删除 ${family}`;
    delBtn.addEventListener("click", () => {
      fm.removeFont(family);
      showToast(`已删除 ${family}`, "info");
      commit();
    });
    row.appendChild(delBtn);
    return row;
  }

  /** 「内置字体库」区：注册表分类分组 + 系统字体（按需预览 + 添加 / 复制）。 */
  function renderLibrary() {
    const wrap = document.createElement("div");
    wrap.className = "font-secwrap";

    const sec = document.createElement("div");
    sec.className = "font-sec";
    sec.textContent = "内置字体库";
    wrap.appendChild(sec);

    if (registry === undefined) {
      const loading = document.createElement("div");
      loading.className = "font-empty";
      loading.textContent = "内置字体库加载中…";
      wrap.appendChild(loading);
      return wrap;
    }
    if (!registry?.fonts?.length) {
      const fail = document.createElement("div");
      fail.className = "font-empty";
      fail.textContent = "内置字体库不可用（离线或注册表缺失）。";
      wrap.appendChild(fail);
      return wrap;
    }

    const byCat = {};
    for (const f of registry.fonts) (byCat[f.category] ||= []).push(f);
    for (const [cat, list] of Object.entries(byCat)) {
      const group = document.createElement("div");
      group.className = "font-group";
      const catTitle = document.createElement("div");
      catTitle.className = "font-cat";
      catTitle.textContent = CAT_LABEL[cat] || cat;
      group.appendChild(catTitle);
      for (const f of list) group.appendChild(registryRow(f));
      wrap.appendChild(group);
    }

    if (registry.systemFonts?.length) {
      const group = document.createElement("div");
      group.className = "font-group";
      const catTitle = document.createElement("div");
      catTitle.className = "font-cat";
      catTitle.textContent = "系统字体（仅声明不嵌入）";
      group.appendChild(catTitle);
      for (const f of registry.systemFonts) group.appendChild(systemFontRow(f));
      wrap.appendChild(group);
    }
    return wrap;
  }

  /** 注册表字体行：预览文字（按需加载）+ 名称 + [预览] [添加/✓]。 */
  function registryRow(f) {
    const row = document.createElement("div");
    row.className = "font-item";
    row.dataset.q = `${f.key} ${f.family}`.toLowerCase();

    const main = document.createElement("div");
    main.className = "font-item-main";
    const preview = document.createElement("div");
    preview.className = "font-item-preview";
    preview.textContent = PREVIEW_TEXT;
    const inLibrary = !!state.fontLibrary[f.family];
    if (previewed.has(f.family)) preview.style.fontFamily = `"${f.family}"`;
    main.appendChild(preview);
    const info = document.createElement("div");
    info.className = "font-item-info";
    const name = document.createElement("span");
    name.className = "font-item-name";
    name.textContent = f.key;
    name.title = `注册名: ${f.family}\n${f.style}\n${f.license}`;
    info.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "font-item-meta";
    meta.textContent = f.family;
    info.appendChild(meta);
    main.appendChild(info);
    row.appendChild(main);

    const ops = document.createElement("div");
    ops.className = "font-item-ops";
    if (!previewed.has(f.family)) {
      ops.appendChild(mkBtn("预览", async (btn) => {
        btn.disabled = true;
        btn.textContent = "加载中…";
        try {
          const bytes = await fetchFontBytes(f);
          if (!bytes) throw new Error("字体文件不可用");
          await fm.registerFace(f.family, bytes);
          previewed.add(f.family);
          render();
        } catch (e) {
          showToast(`预览加载失败: ${e.message}`, "danger");
          btn.disabled = false;
          btn.textContent = "预览";
        }
      }));
    }
    if (inLibrary) {
      const added = mkBtn("✓ 已添加", null);
      added.disabled = true;
      ops.appendChild(added);
    } else {
      ops.appendChild(mkBtn("添加", async (btn) => {
        btn.disabled = true;
        btn.textContent = "添加中…";
        try {
          const family = await fm.addRegistryFont(f.key);
          previewed.add(family);
          showToast(`已添加内置字体: ${family}`, "success");
          commit();
        } catch (e) {
          showToast(`添加失败: ${e.message}`, "danger");
          btn.disabled = false;
          btn.textContent = "添加";
        }
      }));
    }
    row.appendChild(ops);
    return row;
  }

  /** 系统字体行：无字节，仅复制注册名（粘贴到元素 fontFamily）。 */
  function systemFontRow(f) {
    const row = document.createElement("div");
    row.className = "font-item";
    row.dataset.q = `${f.key} ${f.family}`.toLowerCase();

    const main = document.createElement("div");
    main.className = "font-item-main";
    const info = document.createElement("div");
    info.className = "font-item-info";
    const name = document.createElement("span");
    name.className = "font-item-name";
    name.textContent = f.key;
    name.title = `注册名: ${f.family}\n平台: ${f.platform}\n仅声明不嵌入，需打开方系统已装`;
    info.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "font-item-meta";
    meta.textContent = f.family;
    info.appendChild(meta);
    main.appendChild(info);
    row.appendChild(main);

    const ops = document.createElement("div");
    ops.className = "font-item-ops";
    ops.appendChild(mkBtn("复制", async () => {
      try {
        await navigator.clipboard.writeText(f.family);
        showToast(`已复制注册名: ${f.family}`, "success");
      } catch {
        showToast("复制失败，请手动抄写注册名", "danger");
      }
    }));
    row.appendChild(ops);
    return row;
  }

  // --------------------------------------------------------------------------
  // 搜索过滤（行 dataset.q 命中；隐藏空分组与空分区；全空显示无结果提示）
  // --------------------------------------------------------------------------
  function applySearch(qOverride) {
    if (!panel || !bodyEl) return;
    const q = (qOverride !== undefined ? qOverride : searchEl.value).trim().toLowerCase();
    let anyVisible = false;
    for (const wrap of bodyEl.querySelectorAll(".font-secwrap")) {
      const items = [...wrap.querySelectorAll(".font-item")];
      let visible = 0;
      for (const it of items) {
        const hit = !q || it.dataset.q?.includes(q);
        it.hidden = !hit;
        if (hit) visible++;
      }
      for (const g of wrap.querySelectorAll(".font-group")) {
        g.hidden = ![...g.querySelectorAll(".font-item")].some((i) => !i.hidden);
      }
      wrap.hidden = visible === 0;
      anyVisible ||= visible > 0;
    }
    noMatchEl.hidden = anyVisible || !q;
  }

  // --------------------------------------------------------------------------
  // 小构件
  // --------------------------------------------------------------------------
  /** 小文字按钮（btn btn-sm）；onClick(btn) 支持异步期间的按钮态。 */
  function mkBtn(text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = text;
    if (onClick) btn.addEventListener("click", () => onClick(btn));
    return btn;
  }

  /** 开关 chip：胶囊按钮，active = 主色浅底（视觉对齐 add-cat 选中态）。 */
  function mkChip(text, title, on, onToggle) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "font-chip" + (on ? " active" : "");
    chip.textContent = text;
    chip.title = title;
    chip.addEventListener("click", () => {
      const next = !chip.classList.contains("active");
      chip.classList.toggle("active", next);
      onToggle(next);
    });
    return chip;
  }

  function fmtSize(n) {
    return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
  }

  // --------------------------------------------------------------------------
  // 开关（外壳对齐 theme-panel.js）
  // --------------------------------------------------------------------------
  function position() {
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${r.bottom + 8}px`;
    panel.style.right = `${Math.max(8, Math.min(window.innerWidth - r.right, 24))}px`;
  }

  function open() {
    if (!panel) build();
    render();
    position();
    panel.classList.add("open");
  }

  function close() {
    panel?.classList.remove("open");
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || anchor.contains(e.target)) return;
    close();
  });
  window.addEventListener("resize", () => {
    if (isOpen()) position();
  });

  openPanel = open;
}
