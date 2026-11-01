#!/usr/bin/env node
// tests/regression/color-tokens.mjs — 颜色令牌工具回归（3.2 替换 theme-library 套件）。
// 覆盖 listColorTokens（标准顺序/自定义插入顺序/standard 标记）、setColorToken（新增/编辑/
// 纯函数/非法 key 与 value）、colorTokenUsage（color/fill 引用、$ 前缀、未引用=0）、
// removeColorToken（被引用阻止/未引用删除/不存在 key）。不触碰主题库/预设/存储。
// Run: node tests/regression/color-tokens.mjs

import {
  DEFAULT_THEME,
  STANDARD_COLOR_KEYS,
  ThemeError,
  colorTokenUsage,
  listColorTokens,
  removeColorToken,
  setColorToken,
} from "../../packages/model/index.js";
import { check, checkEq, results } from "../lib/test-utils.js";

console.log("== 1. 标准令牌顺序 ==");
{
  checkEq(
    "STANDARD_COLOR_KEYS 为 16 个固定顺序",
    STANDARD_COLOR_KEYS,
    ["primary", "accent", "bg", "text", "muted", "line", "success", "warning", "danger",
      "primarySoft", "primaryTint", "primaryDeep", "accent3", "accent4", "accent5", "accent6"]
  );
  check("STANDARD_COLOR_KEYS 已冻结", Object.isFrozen(STANDARD_COLOR_KEYS));
  checkEq(
    "DEFAULT_THEME.colors 含全部标准 key",
    STANDARD_COLOR_KEYS.filter((k) => typeof DEFAULT_THEME.colors[k] === "string").length,
    16
  );
}

console.log("\n== 2. listColorTokens：标准在前，自定义按插入顺序 ==");
{
  const theme = {
    colors: { gold: "#FFAA00", primary: "#123456", custom2: "#00FF00" },
    textStyles: { title: { fontSize: 30 } },
    tableStyles: { default: { rowOverColumn: true } },
  };
  const tokens = listColorTokens(theme);
  checkEq("标准 token 排在前面", tokens.map((t) => t.key).slice(0, 2), ["primary", "gold"]);
  checkEq("自定义 token 保持插入顺序", tokens.filter((t) => !t.standard).map((t) => t.key), ["gold", "custom2"]);
  check("standard 标记正确", tokens.find((t) => t.key === "primary").standard === true && tokens.find((t) => t.key === "gold").standard === false);
  checkEq("列表覆盖全部 token", tokens.length, 3);
  checkEq("空 theme 返回空列表", listColorTokens(undefined), []);
  checkEq("只传 {colors} 也可列举", listColorTokens({ colors: { accent: "#ABCDEF" } }).map((t) => t.key), ["accent"]);
}

console.log("\n== 3. setColorToken：新增/编辑/纯函数/校验 ==");
{
  const theme = {
    colors: { primary: "#123456" },
    textStyles: { title: { fontSize: 30, color: "$primary" } },
    tableStyles: { default: { cellStyle: { fontSize: 9 } } },
  };
  const beforeTs = JSON.stringify(theme.textStyles);
  const beforeTb = JSON.stringify(theme.tableStyles);
  const added = setColorToken(theme, "paper", "#FAFAFA");
  checkEq("新增 token", added.colors.paper, "#FAFAFA");
  checkEq("原 theme 不被修改（纯函数）", theme.colors.paper, undefined);
  const edited = setColorToken(added, "paper", "#F0F0F0");
  checkEq("编辑已有 token", edited.colors.paper, "#F0F0F0");
  checkEq("返回新对象", edited === added, false);
  checkEq("textStyles 原样保留", JSON.stringify(edited.textStyles), beforeTs);
  checkEq("tableStyles 原样保留", JSON.stringify(edited.tableStyles), beforeTb);
  checkEq("支持 8 位 hex", setColorToken(theme, "shade", "#11223344").colors.shade, "#11223344");

  let invalidCode = 0;
  let invalidName = 0;
  for (const [k, v] of [["1bad", "#FFFFFF"], ["bad key", "#FFFFFF"], ["ok", "red"], ["ok", "#FFF"], ["ok", null]]) {
    try {
      setColorToken(theme, k, v);
    } catch (err) {
      if (err.code === "ERR_THEME_INVALID") invalidCode += 1;
      if (err instanceof ThemeError) invalidName += 1;
    }
  }
  checkEq("非法 token/颜色统一抛 ERR_THEME_INVALID", invalidCode, 5);
  checkEq("错误类型为 ThemeError", invalidName, 5);
}

console.log("\n== 4. colorTokenUsage：引用统计 ==");
{
  const deck = {
    pages: [{
      background: { color: "$gold" },
      elements: [
        { elementType: "text", content: { color: "$gold" } },
        { elementType: "shape", fill: { type: "solid", color: "$gold" } },
        { elementType: "chart", series: [{ color: "$gold" }] },
        { elementType: "text", content: { color: "#FFAA00" }, extra: { color: "$gold" } },
        { elementType: "table", rows: [{ cells: [{ fill: { color: "$paper" } }] }] },
      ],
    }],
  };
  checkEq("统计 color/fill 引用", colorTokenUsage(deck, "gold"), 4);
  checkEq("支持 $ 前缀", colorTokenUsage(deck, "$gold"), 4);
  checkEq("嵌套 fill 引用可统计", colorTokenUsage(deck, "paper"), 1);
  checkEq("未引用=0", colorTokenUsage(deck, "custom2"), 0);
  checkEq("空 token=0", colorTokenUsage(deck, ""), 0);
}

console.log("\n== 5. removeColorToken：引用阻止/删除/不存在 ==");
{
  const theme = {
    colors: { gold: "#FFAA00", primary: "#123456", custom2: "#00FF00" },
    textStyles: { title: { fontSize: 30 } },
    tableStyles: { default: {} },
  };
  const deck = { pages: [{ elements: [{ elementType: "text", content: { color: "$gold" } }] }] };
  const blocked = removeColorToken(theme, "gold", { deck });
  check("被引用 token 删除被阻止", blocked.blocked === true && blocked.usage === 1);
  checkEq("阻止时 theme 保持不变", blocked.theme.colors.gold, "#FFAA00");
  const okRemoved = removeColorToken(theme, "custom2", { deck });
  check("未引用 token 可删除", okRemoved.blocked === false && okRemoved.usage === 0);
  checkEq("删除后 key 消失", okRemoved.theme.colors.custom2, undefined);
  checkEq("删除保留 textStyles/tableStyles", JSON.stringify(okRemoved.theme.textStyles), JSON.stringify(theme.textStyles));
  const missing = removeColorToken(theme, "nope");
  check("删除不存在的 token 不报错", missing.blocked === false && missing.usage === 0);
  checkEq("原 theme 不被修改（纯函数）", theme.colors.custom2, "#00FF00");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
if (failed.length) {
  for (const f of failed) console.error(`  ✗ ${f.name}`);
  process.exit(1);
}
