# repo-map · 3.1 现状（2026-11-01）

> 基线：main 17b4e46（3.0 全部合并）。3.0 的完整历史地图见 `specs/2026-10-31-2102-open-pptd-3.0/ref/repo-map.md`，本文件只记 3.1 需要的事实。

## 1. 目录与入口

| 路径 | 职责 |
|---|---|
| `packages/model` | PPTD 格式、TypeManifest、theme/font library、validate、table model |
| `packages/measure` `packages/layout` | 纯函数度量；LayoutTree/TableFacts |
| `packages/runtime` | ProjectRuntime + revision + memory source/provider |
| `packages/export` | ExportService（check/pptx/png/bundle），纯逻辑 |
| `packages/writer` `packages/renderer` | OOXML writer；DOM 预览/图表/headless |
| `packages/server` | 静态服务、save/SSE/themes/fonts/export-image（Node） |
| `packages/cli` | 5 命令：open/build/check/assets/doctor |
| `editor/` | 单壳 Home/Editor；createPreview/createEditor；最小编辑器 |
| `skill/` | 唯一 skill 源：SKILL.md + 7 refs + 6 kits/17 fragments |
| `tests/` | run-all 39 项 + e2e（手动）+ golden/parity |
| `docs/` | 仅 release-workflow + images |

## 2. 命令

```bash
node tests/run-all.mjs                 # 39/39 全量门禁
node tests/regression/dep-graph.mjs
node tests/contract/public-api.mjs
node tests/e2e/render.mjs              # 9/9（headless）
node tests/e2e/editor-minimal.mjs      # 21/21
node tests/e2e/page-ops.mjs            # 17/17
node tests/e2e/preview-shell.mjs       # 23/23
node tests/e2e/browser-export.mjs      # 15/15
node tests/e2e/incremental-load.mjs    # 5/5
node tests/tools/golden-diff.mjs       # 156 页字节一致
node tests/tools/ui-shots.mjs          # UI 截图（CDP 9247，勿并行）
```

CLI：`open/build/check/assets/doctor`；人类文本 stderr，`--json` stdout 单行。

## 3. 编辑器关键文件（W1/W2 主战场）

| 文件 | 作用 | 3.1 注意 |
|---|---|---|
| `editor/skeleton.js` | `editorSkeletonHtml` / `previewSkeletonHtml` / `homeSkeletonHtml` | 所有 id 契约；W2 重写视觉，W1 加 `#sel-actions` |
| `editor/dom.js` | `createDom(rootEl)`，id 懒查找，找不到返回 null | 改 id 必须同步；无 document fallback |
| `editor/app/state.js` | deck/selection/history/page ops（纯模型） | W1 加 clipboard ops；无 group/clipboard |
| `editor/app/api.js` | 编辑器公开 API | W1 加 copy/cut/paste/duplicate |
| `editor/app/keyboard.js` | Ctrl+Z/Y/S/A/F5 | W1 加 Ctrl+C/X/V/D |
| `editor/interaction/canvas.js` | 选择/拖动/缩放/旋转/框选/参考线/Delete/箭头微调 | W1 加 Alt 行为不必要；选中操作条定位 |
| `editor/interaction/stage.js` | 手势路由；FLOATING 选择器 | 新浮层要加入 FLOATING |
| `editor/app/project/loader.js` | 装载项目 | W1 载入新项目时清空剪贴板 |
| `editor/preview.js` / `editor/editor.js` | createPreview / createEditor | W2 只改外观，不改 API |
| `editor/interaction/design-panel.js` | 懒加载 Design 面板 | W2 重做视觉 |
| `editor/gallery.js` + `homeSkeletonHtml` | Home 画廊，封面 createPreview | W2 重做布局/卡片 |

## 4. 契约（勿破坏）

- 渲染入口：`paintPage(layoutPage, ctx)`；编辑器统一经 `layout(deck)`；headless 输出必须字节稳定（golden 156 页）。
- 元素选择属性：`[data-element-id]`、`[data-handle]`、`[data-rotate-handle]`。
- 每实例唯一 `#canvas`；`#page-count` 文本 `"N / M"`；页面菜单 7 项文案；`footer.thumbbar`、`.topbar`、`.brand-home` 被 chrome 裁剪/e2e 使用。
- `window.__pptdEditor` = api；`window.__pptdIo` = io；headless `window.__pptdShot`。
- 深浅色：`documentElement[data-pptd-theme="light"|"dark"]`。

## 5. 环境/陷阱

- Windows + Git Bash + Node 24；零依赖零构建；ESM。
- e2e 固定 CDP 端口：editor-minimal 9341、page-ops 9342、ui-shots 9247；不要并行冲突。
- 公式 fixtures 不入库：先 `node tests/tools/dump-formula-mml.mjs`。
- PPTX/ZIP 字节含时间戳：验收用结构事实（package-integrity/嵌入/尺寸），不要求字节一致。
- `dist/`、`tests/golden/out/`、`tests/projects/*/out/` 为生成物，不入库。
- 注释英文；commit 中文 conventional；不 push/tag。
