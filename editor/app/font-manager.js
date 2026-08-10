// ============================================================================
// app/font-manager.js — 编辑器字体库（本地文件 / 网络 URL）+ 字体管理对话框
// ----------------------------------------------------------------------------
// 职责：
//   - 添加字体（<input type=file> 读字节 / fetch URL）→ parseFontInfo 取名
//     → FontFace 注册（预览立即生效，渲染器 CSS font-family 自动匹配）
//   - 删除 / 嵌入勾选 / 子集化勾选
//   - 保存项目时同步到 deck.fonts 资源表（key = family，带 file/url/subset）
//   - 加载项目时从资源表恢复：url 字体自动 fetch 注册；file 字体待用户重新选择
//   - 导出时按「嵌入勾选」生成 options.fontFiles
//
// PPTD 格式（见 references/pptd-format.md）：
//   fonts:
//     站酷小薇: { family: ZCOOL XiaoWei, file: fonts/xxx.ttf, subset: true }   # 资源表
//     title: 站酷小薇                                                          # 组件槽引用
// ============================================================================

import { parseFontInfo } from "../core/font.js";
import { parseFontResources } from "../core/theme.js";
import { showDialog } from "../interaction/dialogs/base.js";
import { showToast } from "./toast.js";

/** 系统字体池（styles.md 0.5 节；元素 fontFamily 下拉兜底选项）。 */
export const SYSTEM_FONTS = ["Microsoft YaHei", "KaiTi", "SimSun", "SimHei", "FangSong", "YouYuan"];

export function createFontManager(state) {
  /** FontFace 注册：family 必须与渲染器 CSS font-family 完全一致（parseFontInfo 取 name 表）。 */
  async function registerFace(family, bytes) {
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
  }

  /** 添加本地字体文件 → 返回 family；失败抛错。 */
  async function addLocalFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "local", file: null, url: null,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** 添加网络字体 URL → 返回 family；失败抛错。 */
  async function addUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "url", file: null, url,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** 重新加载本地文件到已有条目（file 字体打开项目后 bytes 缺失时）。 */
  async function reloadLocalFile(family, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    const prev = state.fontLibrary[family] || {};
    state.fontLibrary[family] = { ...prev, bytes, source: "local", size: bytes.length };
  }

  function removeFont(family) {
    delete state.fontLibrary[family];
  }

  /** 导出用：嵌入勾选的字体字节（key = family）。 */
  function exportFontFiles() {
    const files = {};
    for (const [family, f] of Object.entries(state.fontLibrary)) {
      if (f.embed && f.bytes) files[family] = f.bytes;
    }
    return files;
  }

  /** 元素 fontFamily 下拉选项：资源表 key + 库字体 + 系统字体池。 */
  function fontOptions() {
    const opts = [["", "默认"]];
    for (const [key] of Object.entries(state.theme?.fontResources || {})) {
      opts.push([key, `${key}（资源）`]);
    }
    for (const family of Object.keys(state.fontLibrary)) {
      if (!opts.some(([v]) => v === family)) opts.push([family, `${family}（已嵌入）`]);
    }
    for (const f of SYSTEM_FONTS) {
      if (!opts.some(([v]) => v === f)) opts.push([f, f]);
    }
    return opts;
  }

  /** 保存项目：嵌入勾选的字体 → deck.fonts 资源表（key = family）。 */
  function syncToDeck() {
    const fonts = state.deck.fonts || (state.deck.fonts = {});
    const slots = new Set(["latin", "ea", "title", "subtitle", "body", "caption", "quote", "table", "chart"]);
    for (const key of Object.keys(fonts)) {
      if (!slots.has(key)) delete fonts[key]; // 清理旧资源表（跟随当前库）
    }
    for (const [family, f] of Object.entries(state.fontLibrary)) {
      if (!f.embed) continue;
      const entry = { family, subset: !!f.subset };
      if (f.source === "url" && f.url) entry.url = f.url;
      else entry.file = f.file || `fonts/${family.replace(/[\\/:*?"<>|]/g, "_")}.ttf`;
      fonts[family] = entry;
    }
  }

  /** 加载项目：从 deck.fonts 资源表恢复库条目（url 自动拉取注册；file 待用户重选）。 */
  async function restoreFromDeck() {
    const resources = parseFontResources(state.deck?.fonts);
    for (const [key, res] of Object.entries(resources)) {
      const family = res.family || key;
      if (state.fontLibrary[family]) continue;
      const entry = { source: res.url ? "url" : "local", url: res.url, file: res.file, subset: res.subset, embed: true, bytes: null, size: 0 };
      state.fontLibrary[family] = entry;
      if (res.url) {
        try {
          const bytes = new Uint8Array(await (await fetch(res.url)).arrayBuffer());
          await registerFace(family, bytes);
          entry.bytes = bytes;
          entry.size = bytes.length;
        } catch {
          showToast(`网络字体加载失败: ${family}`, "danger");
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 字体管理对话框
  // --------------------------------------------------------------------------
  function openManagerDialog() {
    const { body } = showDialog("字体管理", buildBody(), {
      onDone() {
        syncToDeck(); // 完成即同步到 deck（保存项目时落盘）
      },
    });

    function buildBody() {
      const wrap = document.createElement("div");
      wrap.className = "font-manager";

      // —— 添加区 ——
      const add = document.createElement("div");
      add.className = "font-add";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".ttf,.otf";
      fileInput.multiple = true;
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "网络字体 URL（jsDelivr / Google Fonts 直链，需 CORS）";
      const addBtn = document.createElement("button");
      addBtn.className = "btn btn-sm btn-primary";
      addBtn.textContent = "添加";
      const doAddUrl = async () => {
        const url = urlInput.value.trim();
        if (!url) return;
        try {
          const family = await addUrl(url);
          urlInput.value = "";
          showToast(`已添加网络字体: ${family}`, "success");
          refreshList();
        } catch (e) {
          showToast(`添加失败: ${e.message}`, "danger");
        }
      };
      urlInput.addEventListener("change", doAddUrl);
      addBtn.addEventListener("click", doAddUrl);
      fileInput.addEventListener("change", async () => {
        for (const file of fileInput.files) {
          try {
            const family = await addLocalFile(file);
            showToast(`已添加本地字体: ${family}`, "success");
          } catch (e) {
            showToast(`${file.name} 添加失败: ${e.message}`, "danger");
          }
        }
        fileInput.value = "";
        refreshList();
      });
      const fileBtn = document.createElement("button");
      fileBtn.className = "btn btn-sm";
      fileBtn.textContent = "选择本地文件…";
      fileBtn.addEventListener("click", () => fileInput.click());
      add.append(fileBtn, urlInput, addBtn);
      wrap.appendChild(add);

      // —— 列表 ——
      const list = document.createElement("div");
      list.className = "font-list";
      wrap.appendChild(list);
      refreshList();
      return wrap;

      function refreshList() {
        list.innerHTML = "";
        const entries = Object.entries(state.fontLibrary);
        if (!entries.length) {
          const hint = document.createElement("div");
          hint.className = "prop-hint";
          hint.textContent = "尚未添加字体。添加后可在文字属性面板的「字体」下拉中使用，导出时按勾选嵌入。";
          list.appendChild(hint);
          return;
        }
        for (const [family, f] of entries) {
          const rowEl = document.createElement("div");
          rowEl.className = "font-row";
          const name = document.createElement("span");
          name.className = "font-name";
          name.textContent = family;
          const meta = document.createElement("span");
          meta.className = "font-meta";
          meta.textContent = `${f.source === "url" ? "网络" : "本地"}${f.bytes ? ` · ${(f.size / 1024).toFixed(0)}KB` : " · 未加载"}`;
          const subCb = document.createElement("label");
          subCb.className = "prop-check";
          const subInput = document.createElement("input");
          subInput.type = "checkbox";
          subInput.checked = !!f.subset;
          subInput.addEventListener("change", () => { f.subset = subInput.checked; });
          subCb.append(subInput, document.createTextNode("子集化"));
          const embedCb = document.createElement("label");
          embedCb.className = "prop-check";
          const embedInput = document.createElement("input");
          embedInput.type = "checkbox";
          embedInput.checked = !!f.embed;
          embedInput.addEventListener("change", () => { f.embed = embedInput.checked; });
          embedCb.append(embedInput, document.createTextNode("嵌入"));
          const delBtn = document.createElement("button");
          delBtn.className = "btn btn-sm btn-danger";
          delBtn.textContent = "删除";
          delBtn.addEventListener("click", () => { removeFont(family); refreshList(); });
          rowEl.append(name, meta, subCb, embedCb, delBtn);
          if (!f.bytes && f.file) {
            // file 字体未加载：重新选择本地文件
            const reloadInput = document.createElement("input");
            reloadInput.type = "file";
            reloadInput.accept = ".ttf,.otf";
            reloadInput.style.display = "none";
            reloadInput.addEventListener("change", async () => {
              const file = reloadInput.files?.[0];
              if (!file) return;
              try {
                await reloadLocalFile(family, file);
                showToast(`已加载: ${family}`, "success");
                refreshList();
              } catch (e) {
                showToast(`加载失败: ${e.message}`, "danger");
              }
            });
            const loadBtn = document.createElement("button");
            loadBtn.className = "btn btn-sm";
            loadBtn.textContent = "加载文件…";
            loadBtn.addEventListener("click", () => reloadInput.click());
            rowEl.append(loadBtn, reloadInput);
          }
          list.appendChild(rowEl);
        }
      }
    }
  }

  return {
    addLocalFile, addUrl, reloadLocalFile, removeFont,
    exportFontFiles, fontOptions, syncToDeck, restoreFromDeck, openManagerDialog,
  };
}
