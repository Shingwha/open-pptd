// ============================================================================
// app/file-menu.js — 「文件」下拉菜单外壳（画廊与编辑器共用）
// ----------------------------------------------------------------------------
// 桌面软件统一心智：文件操作入口 = 文件菜单。画廊（开始页角色）放
// 打开编辑器/打开/最近；编辑器另加新建/保存/导出——同一外壳，内容按上下文渲染。
// 外壳负责：浮层开合（定位/外点关闭/resize 重定位统一走 popover.js）、
// 条目构建器（item/sep/label）与「最近打开」区段（IndexedDB 句柄列表）。
// ============================================================================

import { listRecent } from "./project/handle-store.js";
import { attachPopover } from "../popover.js";

/**
 * 绑定一个「文件」下拉菜单。
 * @param anchor 触发按钮（点击切换开合）
 * @param renderBody async ({ menu, item, sep, label, appendRecents }) => void
 *   每次展开时调用（内容实时刷新，最近列表不过期）
 */
export function createFileMenu(anchor, renderBody) {
  let menu = null;
  let popover = null;
  const isOpen = () => menu?.classList.contains("open");

  function item(text, { hint = "", onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "file-menu-item";
    const label = document.createElement("span");
    label.textContent = text;
    btn.appendChild(label);
    if (hint) {
      const kbd = document.createElement("span");
      kbd.className = "file-menu-hint";
      kbd.textContent = hint;
      btn.appendChild(kbd);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      onClick();
    });
    return btn;
  }

  function sep() {
    const el = document.createElement("div");
    el.className = "file-menu-sep";
    return el;
  }

  function label(text) {
    const el = document.createElement("div");
    el.className = "file-menu-label";
    el.textContent = text;
    return el;
  }

  /** 「最近打开」区段（无记录时不渲染）。onPick(entry) 由调用方定义打开方式。 */
  async function appendRecents(menu, onPick) {
    const recents = await listRecent();
    if (!recents.length) return;
    menu.append(sep(), label("最近打开"));
    for (const entry of recents) {
      menu.appendChild(item(entry.name, { hint: timeAgo(entry.ts), onClick: () => onPick(entry) }));
    }
  }

  /** 相对时间（最近列表副文本）。 */
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return new Date(ts).toLocaleDateString();
  }

  async function open() {
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "file-menu";
      document.body.appendChild(menu);
      // 浮层外壳（锚点下方左对齐定位 / 外点与 Esc 关闭 / resize 重定位）
      popover = attachPopover(anchor, menu, { align: "left", isOpen, close });
    }
    menu.innerHTML = "";
    await renderBody({ menu, item, sep, label, appendRecents });
    menu.classList.add("open");
    popover.position(); // 先显示再定位：offsetWidth 需要可见才有值
  }

  function close() {
    menu?.classList.remove("open");
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  });
}
