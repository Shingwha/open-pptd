#!/usr/bin/env node
// tests/regression/theme-library.mjs — theme library + applyTheme regression.
// Covers built-in snapshots (default + 10 palettes, frozen, mutable list copies), ThemeStore
// CRUD on a temp home (atomic writes, duplicates, invalid payloads, safe ids, corrupt files),
// applyTheme (replace + keep referenced tokens/styles, preserved report, style-internal refs,
// undo by re-applying a snapshot), and custom color tokens (list/usage/set/remove guard).
// Run: node tests/regression/theme-library.mjs

import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUILTIN_THEMES,
  DEFAULT_THEME,
  THEME_PALETTES,
  applyTheme,
  colorTokenUsage,
  isBuiltinThemeId,
  listBuiltinThemes,
  listColorTokens,
  normalizeThemeFile,
  removeColorToken,
  setColorToken,
} from "../../packages/model/index.js";
import { createFileThemeStore } from "../../packages/server/theme-store.js";
import { check, checkEq, throwsCode, results, withTempDir } from "../lib/test-utils.js";

await withTempDir("open-pptd-theme-test-", async (home) => {
  console.log("== 1. 内置主题快照 ==");
  {
    checkEq("内置主题数量（默认 + 10 palette）", BUILTIN_THEMES.length, 11);
    checkEq("内置 id 顺序", BUILTIN_THEMES.map((t) => t.id), [
      "builtin:default", ...Object.keys(THEME_PALETTES).map((k) => `builtin:${k}`),
    ]);
    check("全部 builtin:true", BUILTIN_THEMES.every((t) => t.builtin === true && isBuiltinThemeId(t.id)));
    check("默认主题 colors == DEFAULT_THEME", JSON.stringify(BUILTIN_THEMES[0].colors) === JSON.stringify(DEFAULT_THEME.colors));
    const paletteOk = Object.entries(THEME_PALETTES).every(([key, p]) =>
      JSON.stringify(BUILTIN_THEMES.find((t) => t.id === `builtin:${key}`).colors) === JSON.stringify(p.colors));
    check("10 palette colors 与 THEME_PALETTES 一致", paletteOk);
    const stylesOk = BUILTIN_THEMES.every((t) =>
      JSON.stringify(t.textStyles) === JSON.stringify(DEFAULT_THEME.textStyles)
      && JSON.stringify(t.tableStyles) === JSON.stringify(DEFAULT_THEME.tableStyles));
    check("内置 textStyles/tableStyles = DEFAULT_THEME（完整快照）", stylesOk);
    check("内置快照深度冻结", Object.isFrozen(BUILTIN_THEMES[0]) && Object.isFrozen(BUILTIN_THEMES[0].colors));
    const copy = listBuiltinThemes();
    copy[0].colors.primary = "#000000";
    check("listBuiltinThemes 返回可变副本", BUILTIN_THEMES[0].colors.primary !== "#000000");
    check("内置主题不含字体字节字段", BUILTIN_THEMES.every((t) => !("fonts" in t) && !("fontResources" in t)));
  }

  console.log("\n== 2. ThemeStore CRUD（临时 home）==");
  const store = createFileThemeStore({ home });
  {
    checkEq("初始 list = 11 内置", (await store.list()).length, 11);
    const saved = await store.save({
      id: "user-test",
      name: "测试主题",
      description: "单元测试",
      colors: { primary: "#123456", gold: "#FFAA00" },
      textStyles: { title: { fontSize: 30, color: "$primary" } },
      tableStyles: { banded: { cellStyle: { fontSize: 9 } } },
    });
    checkEq("save 归一化 version", saved.version, 1);
    checkEq("save 用户主题 builtin=false", saved.builtin, false);
    check("主题文件落盘", existsSync(join(home, "themes", "user-test.json")));
    const read = await store.read("user-test");
    checkEq("read 名称", read.name, "测试主题");
    checkEq("read 自定义颜色", read.colors.gold, "#FFAA00");
    checkEq("list 含用户主题", (await store.list()).length, 12);
    checkEq("tmp 无 .part 残留", readdirSync(join(home, "tmp")).filter((f) => f.endsWith(".part")).length, 0);

    await throwsCode("save 内置 id 被拒", () => store.save({ id: "builtin:default", colors: { primary: "#123456" } }), "ERR_THEME_BUILTIN_READONLY");
    await throwsCode("save builtin:true 被拒", () => store.save({ id: "mine", builtin: true, colors: { primary: "#123456" } }), "ERR_THEME_BUILTIN_READONLY");
    await throwsCode("remove 内置被拒", () => store.remove("builtin:tech"), "ERR_THEME_BUILTIN_READONLY");
    await throwsCode("remove 不存在", () => store.remove("user-missing"), "ERR_THEME_NOT_FOUND");

    const importedJson = JSON.stringify({ version: 1, id: "user-test", name: "重复导入", colors: { primary: "#654321" } });
    const imported = await store.import(importedJson);
    checkEq("重复 id 导入生成新 id", imported.id, "user-test-2");
    const noId = await store.import({ name: "无 id 主题", colors: { primary: "#ABCDEF" } });
    check("缺 id 导入生成 user-* id", typeof noId.id === "string" && noId.id.startsWith("user-"));
    const builtinCopy = await store.import(BUILTIN_THEMES.find((t) => t.id === "builtin:tech"));
    check("导入内置快照生成用户副本", builtinCopy.builtin === false && !builtinCopy.id.startsWith("builtin:"));

    await throwsCode("非法 JSON", () => store.import("{not json"), "ERR_THEME_INVALID");
    await throwsCode("非法版本", () => store.import({ version: 2, colors: { primary: "#123456" } }), "ERR_THEME_INVALID");
    await throwsCode("colors 为空", () => store.import({ colors: {} }), "ERR_THEME_INVALID");
    const sanitized = await store.import({ id: "../../evil/theme", name: "越界", colors: { primary: "#123456", bad: "red", ok: "#AABBCC" } });
    check("危险 id 被净化", !sanitized.id.includes("/") && !sanitized.id.includes(".."), sanitized.id);
    const dropped = await store.import({ name: "坏颜色", colors: { primary: "#123456", bad: "red" } });
    checkEq("非法颜色项被丢弃", Object.keys(dropped.colors), ["primary"]);

    // corrupt user file must not break list()
    writeFileSync(join(home, "themes", "broken.json"), "{~~~", "utf8");
    const listAfterCorrupt = await store.list();
    check("损坏的用户主题被跳过", listAfterCorrupt.filter((t) => t.builtin).length === 11 && listAfterCorrupt.length >= 12);
    rmSync(join(home, "themes", "broken.json"));

    const exported = await store.export("user-test");
    checkEq("export 可解析且 id 匹配", JSON.parse(exported).id, "user-test");
    const reimported = await store.import(exported);
    checkEq("export→import 颜色一致", reimported.colors.gold, "#FFAA00");

    const removed = await store.read("user-test");
    await store.remove("user-test");
    check("remove 后 read=null", removed !== null && (await store.read("user-test")) === null);
  }

  console.log("\n== 3. applyTheme：替换 + 保留引用 ==");
  {
    const deck = {
      pages: [
        {
          background: { type: "solid", color: "$gold" },
          elements: [
            { elementType: "text", elementId: "t1", content: { color: "$gold", style: "$legacyTitle" } },
            { elementType: "table", elementId: "tb1", style: "$banded", rows: [{ cells: [{ fill: { color: "$paper" } }] }] },
            { elementType: "chart", elementId: "c1", series: [{ color: "$gold" }] },
          ],
        },
      ],
    };
    const current = {
      colors: { primary: "#111111", gold: "#FFAA00", paper: "#FAFAFA", unused: "#222222" },
      textStyles: { legacyTitle: { fontSize: 44, color: "$gold" }, unusedStyle: { fontSize: 8 } },
      tableStyles: { banded: { cellStyle: { fontSize: 9 } } },
    };
    const next = BUILTIN_THEMES.find((t) => t.id === "builtin:tech");
    const { theme, preserved } = applyTheme(current, next, { deck });
    checkEq("新主题 colors 覆盖 primary", theme.colors.primary, THEME_PALETTES.tech.colors.primary);
    checkEq("保留被引用颜色 gold", theme.colors.gold, "#FFAA00");
    checkEq("保留被引用颜色 paper", theme.colors.paper, "#FAFAFA");
    check("未引用旧颜色丢弃", theme.colors.unused === undefined);
    checkEq("preserved.colors", preserved.colors, ["gold", "paper"]);
    checkEq("保留被引用文字样式", preserved.textStyles, ["legacyTitle"]);
    checkEq("保留被引用表格样式", preserved.tableStyles, ["banded"]);
    checkEq("未被引用文字样式丢弃", theme.textStyles.unusedStyle, undefined);
    checkEq("保留文字样式内容", theme.textStyles.legacyTitle.fontSize, 44);
    checkEq("保留表格样式内容", theme.tableStyles.banded.cellStyle.fontSize, 9);
    checkEq("新主题自带 title 不被旧值覆盖", theme.textStyles.title.fontSize, DEFAULT_THEME.textStyles.title.fontSize);

    const pure = applyTheme(current, next);
    checkEq("无 deck 纯替换（无 preserved）", pure.preserved, { colors: [], textStyles: [], tableStyles: [] });
    check("无 deck 时旧自定义颜色丢弃", pure.theme.colors.gold === undefined);

    const supplied = applyTheme({ colors: { primary: "#111111" } }, BUILTIN_THEMES[0], {
      deck: { pages: [{ elements: [{ elementType: "text", content: { color: "$primary" } }] }] },
    });
    checkEq("新主题已有同名 token 用新值", supplied.theme.colors.primary, DEFAULT_THEME.colors.primary);
    checkEq("新主题已有同名 token 不进 preserved", supplied.preserved.colors, []);

    // style-internal color refs must not dangle after switching themes
    const styleTheme = normalizeThemeFile({
      name: "style refs",
      colors: { base: "#101010" },
      textStyles: { title: { color: "$brand" } },
      tableStyles: { default: { cellStyle: { color: "$brand" } } },
    });
    const styleRes = applyTheme({ colors: { brand: "#C0FFEE" }, textStyles: {}, tableStyles: {} }, styleTheme);
    checkEq("样式内部 $brand 从旧主题保留", styleRes.theme.colors.brand, "#C0FFEE");
    checkEq("样式内部引用进 preserved.colors", styleRes.preserved.colors, ["brand"]);

    // undo data layer: applying the previous full snapshot restores it
    const original = normalizeThemeFile(current);
    const changed = applyTheme(current, next, { deck });
    const undone = applyTheme(changed.theme, original, { deck });
    checkEq("undo：colors 恢复旧值", undone.theme.colors.primary, "#111111");
    checkEq("undo：旧 token 恢复", undone.theme.colors.gold, "#FFAA00");
    checkEq("undo：旧文字样式恢复", undone.theme.textStyles.legacyTitle.fontSize, 44);
  }

  console.log("\n== 4. 自定义颜色令牌（列表 / usage / 增删）==");
  {
    const theme = {
      colors: { gold: "#FFAA00", primary: "#123456", custom2: "#00FF00" },
      textStyles: {},
      tableStyles: {},
    };
    const tokens = listColorTokens(theme);
    checkEq("标准 token 排在前面", tokens.slice(0, 3).map((t) => t.key), ["primary", "gold", "custom2"]);
    check("standard 标记正确", tokens.find((t) => t.key === "primary").standard && !tokens.find((t) => t.key === "gold").standard);
    checkEq("列表覆盖全部 token", tokens.length, 3);

    const deck = {
      pages: [{
        background: { color: "$gold" },
        elements: [
          { elementType: "text", content: { color: "$gold" } },
          { elementType: "shape", fill: { type: "solid", color: "$gold" } },
          { elementType: "chart", series: [{ color: "$gold" }] },
          { elementType: "text", content: { color: "#FFAA00" }, extra: { color: "$gold" } },
        ],
      }],
    };
    checkEq("colorTokenUsage 统计颜色/填充引用", colorTokenUsage(deck, "gold"), 4);
    checkEq("colorTokenUsage 支持 $ 前缀", colorTokenUsage(deck, "$gold"), 4);
    checkEq("colorTokenUsage 未引用=0", colorTokenUsage(deck, "custom2"), 0);

    const added = setColorToken(theme, "paper", "#FAFAFA");
    checkEq("setColorToken 新增", added.colors.paper, "#FAFAFA");
    checkEq("setColorToken 返回新对象", theme.colors.paper, undefined);
    const edited = setColorToken(added, "paper", "#F0F0F0");
    checkEq("setColorToken 编辑", edited.colors.paper, "#F0F0F0");
    let invalid = 0;
    for (const [k, v] of [["1bad", "#FFFFFF"], ["ok", "red"], ["ok", "#FFF"]]) {
      try { setColorToken(theme, k, v); } catch (err) { if (err.code === "ERR_THEME_INVALID") invalid += 1; }
    }
    checkEq("非法 token/颜色被拒", invalid, 3);

    const blocked = removeColorToken(theme, "gold", { deck });
    check("被引用 token 删除被阻止", blocked.blocked === true && blocked.usage === 4 && blocked.theme.colors.gold === "#FFAA00");
    const okRemoved = removeColorToken(theme, "custom2", { deck });
    check("未引用 token 可删除", okRemoved.blocked === false && okRemoved.theme.colors.custom2 === undefined);
    const missing = removeColorToken(theme, "nope");
    check("删除不存在的 token 不报错", missing.blocked === false && missing.usage === 0);
  }
});

const failed = results.filter((r) => !r.pass);
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
if (failed.length) {
  for (const f of failed) console.error(`  ✗ ${f.name}`);
  process.exit(1);
}
