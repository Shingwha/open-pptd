// ============================================================================
// model/chart/colors.js — 图表取色与色派生（官方 §5.2，writer/renderer 共享）
// ----------------------------------------------------------------------------

import { resolveColor } from "../theme.js";

/**
 * 层级图节点色（官方 treemap/sunburst 颜色派生规则，writer/renderer 共享）：
 *   fill 单值 → 所有根同色；1D 数组按根循环；2D 数组外层按根、内层按级直接取色；
 *   子节点沿 HSL.L 每级 -10（L_new = max(0, L_old - 10)）。
 * @param {object} s 归一化后的系列（含 fill）
 * @param {number} rootIdx 根节点出现顺序索引
 * @param {number} levelFromRoot 距根的层级（0 = 根）
 */
export function hierarchyColor(theme, s, rootIdx, levelFromRoot) {
  const fill = s?.fill;
  if (fill == null) return null;
  if (Array.isArray(fill)) {
    const f = fill[rootIdx % fill.length];
    if (Array.isArray(f)) {
      if (levelFromRoot < f.length) return resolveColor(theme, f[levelFromRoot]) || null;
      const base = resolveColor(theme, f[f.length - 1]) || null;
      return base ? darkenByLightness(base, 10 * (levelFromRoot - f.length + 1)) : null;
    }
    const base = resolveColor(theme, f) || null;
    return base ? darkenByLightness(base, 10 * levelFromRoot) : null;
  }
  const base = resolveColor(theme, fill) || null;
  return base ? darkenByLightness(base, 10 * levelFromRoot) : null;
}

/** hex → HEX8（#RRGGBBAA，官方 Color 透明形式；ECharts 与 OOXML 都接受）。 */
export function hexA(hex, alpha) {
  const h = String(hex || "#888888").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h.slice(0, 6)}${a}`;
}

/** HEX6/HEX8 → { rgb: "RRGGBB"（大小写保持原样）, alpha: 0..1 | null }；
 * 其余输入返回 null。OOXML 投影端 alpha ×100000 写 a:alpha，rgb 大写化与
 * 否由各投影端自定（经典 srgbClr 走 hexToRgbVal 大写、cx:dataPt 保持原样）。 */
export function parseHexColor(hex) {
  const c = String(hex || "");
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return { rgb: c.slice(1, 7), alpha: parseInt(c.slice(7), 16) / 255 };
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return { rgb: c.slice(1), alpha: null };
  return null;
}

/** HSL 亮度减少 n%（官方 treemap 派生：L_new = max(0, L_old - 10)）。 */
export function darkenByLightness(hex, step = 10) {
  const h = String(hex || "#888888").replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const nl = Math.max(0, l - step / 100);
  // 保持色相饱和度不变，只改亮度（HSL → RGB）
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const ns = s;
  const c = (1 - Math.abs(2 * nl - 1)) * ns;
  const hp = hue2rgb(hueOf(r, g, b, max, min, d), c, nl);
  return `#${hp.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hue2rgb(h, c, l) {
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => v + m);
}

function hueOf(r, g, b, max, min, d) {
  if (d === 0) return 0;
  if (max === r) return ((g - b) / d) % 6 * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}
