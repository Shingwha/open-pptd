# W3 · 颜色变更失效修复 + EV token 化 + 文档

> 分支 `feat/3.2-w3-invalidation-examples-docs`（W2 合并后由 lead 创建）。
> 前置：W2 已合并（主题库删除、Design 面板只剩颜色/字体/外观）。
> 本文件在 W2 合并后由 lead 补全 `## 前置上下文` 再派工。

## 目标

1. **失效根因**：颜色变更统一走 `themeRevision`；`view.render()` 按 revision 自动全量重画缩略图，不依赖调用方传 `thumbs:"all"`。
2. **撤销/重做**：颜色撤销后画布、全部缩略图、Design 面板同步。
3. **取色器实时**：拖动时画布实时，缩略图 debounce（约 100ms）；松手提交一次历史。
4. **EV token 化**：只改 `examples/ev-range/pages/01_cover.page`、`15_final.page` 的渐变硬编码主题色为 `$token`；其他示例不动；EV golden rebaseline。
5. **文档**：README 中英文去掉主题库/`assets themes` 表述；CHANGELOG 记 breaking（主题库删除、颜色编辑保留、CLI 删除面）；`tests/docs` 通过。

## 范围（草稿）

- `editor/app/state.js`：`themeRevision`。
- `editor/context.js`：实例 `events`（EventTarget）。
- `editor/app/project/loader.js`：`applyColors({origin})`、`applyHistory` theme 变化检测 + dispatch。
- `editor/app/project/source.js`：load 时 revision/dispatch。
- `editor/app/project/io.js`：newProject revision。
- `editor/app/api.js`：`setThemeColors`/`setThemeColor`/`refreshThumbnails`。
- `editor/app/view/view.js`：revision 强制 thumbs all。
- `editor/interaction/design-panel.js`：取色器实时 + debounce；订阅 `themechange`（origin 区分）。
- `examples/ev-range/pages/{01_cover,15_final}.page`。
- `README.md`、`README.zh-CN.md`、`CHANGELOG.md`。
- `tests/e2e/editor-minimal.mjs`（补实时/撤销断言）、`tests/golden/manifest.json`（EV rebaseline）。
- 不改 `packages/model`/CLI/server/export；不改 deck theme 结构。

## 验收（草稿）

1. 全部 e2e 全绿；`run-all` 38/38；`tests/docs` 35/35。
2. `node tests/tools/golden-render.mjs --filter ev-range` + `golden-diff` → 23 项目/142 页第二遍 142/142；其他 22 项目零 diff。
3. `node tests/perf/editor-perf.mjs` 通过。
4. 撤销颜色：`viewport`/全部 `.thumb-canvas` 颜色恢复；Design 面板色板/hex 同步。
5. 取色器 input：画布立即更新；缩略图 ≤ ~100ms；change 后全量且历史一步。
6. 写入范围外零 diff。

## 禁触清单（草稿）

`packages/model/**`、`packages/cli/**`、`packages/server/**`、`packages/export/**`、`contract.json`、`package.json`、公式/vendor、其他 examples。
