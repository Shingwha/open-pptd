// ============================================================================
// editor/theme.js — 主题令牌注入（契约 3）
// ----------------------------------------------------------------------------
// 引擎自带的浅/深两套令牌值（与 editor/styles/tokens.css 一一对应），以及把
// 令牌注入任意挂载点的 applyThemeTokens(rootEl, { tokens, mode })。
//
// 用法（宿主 / 同源 iframe 嵌入）：
//   const restore = applyThemeTokens(document.body, { mode: "dark" });
//   // 或覆盖单个令牌
//   const restore2 = applyThemeTokens(rootEl, { tokens: { "--accent": "#7c3aed" } });
//   restore();  // 幂等还原（摘掉属性与内联覆盖）
//
// 实现：mode 落到 rootEl 的 data-pptd-theme 属性（tokens.css 的
// [data-pptd-theme="dark"] 块覆盖 :root 的浅色默认值，自定义属性自然向下继承）；
// tokens 落到 rootEl 的内联 style（优先级高于样式表，用于宿主把 --dsw-* 映射过来）。
//
// U1/T4：令牌体系重建后，权威名是 --accent 系与 --n-*；旧名（--primary 等）
// 仍是 tokens.css 里的兼容别名，宿主覆盖请注意「覆盖别名不等于覆盖 --accent」——
// 新接入请直接覆盖 --accent / --sel-ring 等规范令牌名。
// ============================================================================

/**
 * 引擎支持的令牌名（对标 editor/styles/tokens.css）。
 * 尺寸/间距/层级/动效类令牌不参与主题切换，故不在列表内。
 */
export const TOKENS = [
  // 语义中性
  "--bg", "--panel", "--line", "--line-strong", "--ink", "--sub", "--faint",
  "--hover", "--active", "--disabled", "--sel-bg", "--sel-ring",
  // 强调色
  "--accent", "--accent-hover", "--accent-soft", "--on-accent",
  // 语义色
  "--danger", "--danger-soft", "--success", "--success-soft", "--warning", "--warning-soft",
  // 遮罩与描边
  "--mask", "--chip-border",
  // 缩略条悬浮标签
  "--thumb-chip-bg", "--thumb-chip-ink", "--thumb-num-bg", "--thumb-num-ink",
  // 阴影
  "--sh-pop", "--sh-modal",
  // 兼容别名（旧宿主按旧名覆盖仍可用）
  "--primary", "--primary-strong", "--primary-soft", "--primary-tint", "--scrollbar",
  "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-sheet",
];

const LIGHT = {
  "--bg": "#f5f6f8",
  "--panel": "#ffffff",
  "--line": "#e7eaef",
  "--line-strong": "#d3d8e0",
  "--ink": "#1c2532",
  "--sub": "#5b6572",
  "--faint": "#98a2af",
  "--hover": "#ebedf0",
  "--active": "#e7eaef",
  "--disabled": "#98a2af",
  "--sel-bg": "#eef4fd",
  "--sel-ring": "#2563eb",
  "--accent": "#2563eb",
  "--accent-hover": "#1d4ed8",
  "--accent-soft": "#eef4fd",
  "--on-accent": "#ffffff",
  "--danger": "#d64545",
  "--danger-soft": "#fdf1f1",
  "--success": "#2e9e5b",
  "--success-soft": "#ecf7f0",
  "--warning": "#9a6700",
  "--warning-soft": "#fdf6e3",
  "--mask": "rgba(28, 37, 50, 0.45)",
  "--chip-border": "rgba(0, 0, 0, 0.12)",
  "--thumb-chip-bg": "rgba(28, 37, 50, 0.65)",
  "--thumb-chip-ink": "#ffffff",
  "--thumb-num-bg": "rgba(255, 255, 255, 0.85)",
  "--thumb-num-ink": "rgba(28, 37, 50, 0.6)",
  "--sh-pop": "0 4px 16px rgba(28, 37, 50, 0.1)",
  "--sh-modal": "0 12px 32px rgba(28, 37, 50, 0.14)",
  // 兼容别名
  "--primary": "#2563eb",
  "--primary-strong": "#1d4ed8",
  "--primary-soft": "#eef4fd",
  "--primary-tint": "rgba(37, 99, 235, 0.1)",
  "--scrollbar": "#d3d8e0",
  "--shadow-sm": "0 1px 2px rgba(28, 37, 50, 0.06)",
  "--shadow-md": "0 4px 16px rgba(28, 37, 50, 0.1)",
  "--shadow-lg": "0 12px 32px rgba(28, 37, 50, 0.14)",
  "--shadow-sheet": "0 -8px 32px rgba(28, 37, 50, 0.16)",
};

// 深色板逐条照抄设计参考稿的 [data-theme="dark"]（面板比底暗一档、文字反转、
// 强调色提亮、语义色降饱和）。
const DARK = {
  "--bg": "#1b1f26",
  "--panel": "#16191f",
  "--line": "#353c47",
  "--line-strong": "#454d5a",
  "--ink": "#eef1f5",
  "--sub": "#b3bbc6",
  "--faint": "#6b7482",
  "--hover": "#2a303a",
  "--active": "#353c47",
  "--disabled": "#6b7482",
  "--sel-bg": "#1c2a44",
  "--sel-ring": "#4d8dff",
  "--accent": "#4d8dff",
  "--accent-hover": "#6ba0ff",
  "--accent-soft": "#1c2a44",
  "--on-accent": "#ffffff",
  "--danger": "#ff6b6b",
  "--danger-soft": "#3a1f22",
  "--success": "#3fbf74",
  "--success-soft": "#16301f",
  "--warning": "#e0a83a",
  "--warning-soft": "#382c12",
  "--mask": "rgba(0, 0, 0, 0.6)",
  "--chip-border": "rgba(255, 255, 255, 0.14)",
  "--thumb-chip-bg": "rgba(0, 0, 0, 0.7)",
  "--thumb-chip-ink": "#eef1f5",
  "--thumb-num-bg": "rgba(22, 25, 31, 0.85)",
  "--thumb-num-ink": "rgba(238, 241, 245, 0.7)",
  "--sh-pop": "0 4px 16px rgba(0, 0, 0, 0.45)",
  "--sh-modal": "0 12px 32px rgba(0, 0, 0, 0.6)",
  // 兼容别名
  "--primary": "#4d8dff",
  "--primary-strong": "#6ba0ff",
  "--primary-soft": "#1c2a44",
  "--primary-tint": "rgba(77, 141, 255, 0.16)",
  "--scrollbar": "#454d5a",
  "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.35)",
  "--shadow-md": "0 4px 16px rgba(0, 0, 0, 0.45)",
  "--shadow-lg": "0 12px 32px rgba(0, 0, 0, 0.6)",
  "--shadow-sheet": "0 -8px 32px rgba(0, 0, 0, 0.55)",
};

/** 内置浅色 / 深色令牌表（返回浅拷贝，调用方可安全改写）。 */
export function defaultTokens(mode = "light") {
  return { ...(mode === "dark" ? DARK : LIGHT) };
}

/**
 * 把主题注入挂载点：mode → data-pptd-theme 属性；tokens → 内联令牌覆盖。
 * @param {HTMLElement} rootEl 挂载点（通常 document.body 或编辑器根容器）
 * @param {{ tokens?: Record<string,string>, mode?: "light"|"dark" }} [opts]
 * @returns {() => void} 还原函数（幂等：摘属性、清内联覆盖）
 */
export function applyThemeTokens(rootEl, { tokens, mode } = {}) {
  const el = rootEl || (typeof document !== "undefined" ? document.body : null);
  const applied = [];
  if (!el) return () => {};

  if (mode) {
    const prev = el.getAttribute("data-pptd-theme");
    el.setAttribute("data-pptd-theme", mode);
    applied.push(() => (prev == null ? el.removeAttribute("data-pptd-theme") : el.setAttribute("data-pptd-theme", prev)));
  }

  for (const [name, value] of Object.entries(tokens || {})) {
    const prev = el.style.getPropertyValue(name);
    const had = el.style.getPropertyValue(name) !== "" || el.style.getPropertyPriority(name) !== "";
    el.style.setProperty(name, value);
    applied.push(() => (had ? el.style.setProperty(name, prev) : el.style.removeProperty(name)));
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const undo of applied.reverse()) undo();
  };
}
