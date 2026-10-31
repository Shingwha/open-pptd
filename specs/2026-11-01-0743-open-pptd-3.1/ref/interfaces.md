# interfaces · 3.1 新增契约

> 3.0 的包/运行时/导出契约不变；本文件只补 3.1 的编辑器操作、DOM 与设计约束。

## 1. 编辑器元素操作 API

```js
// editor/api（window.__pptdEditor 同步暴露）
copySelected(): number            // 复制选中元素到内部剪贴板，返回元素数；不写 deck、不产生 undo 步
cutSelected(): number             // copySelected + 删除选中；一个 undo 步
pasteClipboard(opts?: { inPlace?: boolean }): string[]  // 粘贴到当前页，返回新 elementId；一个 undo 步
duplicateSelected(): string[]     // 复制并立即粘贴（偏移 +16,+16），不依赖/不覆盖剪贴板？见下
hasClipboard(): boolean
getClipboardCount(): number
```

- 剪贴板是**实例内内存**（不写 localStorage/系统剪贴板）；只存元素深拷贝，不存页面引用。
- 粘贴到当前页；`bounds.x/y` 依次偏移 `+16,+16`（多次粘贴级联）；`inPlace:true` 不偏移（Ctrl+Shift+V）。
- 每个粘贴元素分配新 `elementId`（`nextElementId()`），其余字段深拷贝；不得出现页内重复 id。
- 粘贴后选中新元素；`dirty`/undo 语义与普通插入一致。
- 复制不改变 deck/history；剪切=复制+删除（一个快照）；粘贴/重复各自一个快照。
- 载入新项目/新建空白时清空剪贴板（loader/io 调用 `clearClipboard`）。
- `duplicateSelected()` 内部可复用复制/粘贴，但**不得覆盖用户剪贴板**（用临时快照或参数化实现）。

## 2. 键盘

- `Ctrl/Cmd+C` 复制；`Ctrl/Cmd+X` 剪切；`Ctrl/Cmd+V` 粘贴；`Ctrl/Cmd+Shift+V` 原位粘贴；`Ctrl/Cmd+D` 重复。
- 输入焦点（input/textarea/select/contenteditable）内不拦截；present 模式下不生效；多实例只让 `ui.isActive()` 的实例响应。
- 现有 Ctrl+Z/Y/S/A、Delete/Backspace、方向键微调、Esc、F5 保持不变。

## 3. DOM 契约

### 3.1 必须保留（W2 可改样式/层级，不可改语义）

| 契约 | 位置 | 说明 |
|---|---|---|
| `[data-element-id]` | 渲染元素节点 | 命中/选择/拖动 |
| `[data-handle]` / `[data-rotate-handle]` | 选区手柄 | 缩放/旋转 |
| 每实例唯一 `#canvas` | skeleton | 双实例 e2e 断言节点不同 |
| `.sel-overlay` 唯一 + `.member` 每选中元素一个 | canvas | 多选断言 |
| `#page-count` 文本 `"N / M"` | thumbbar | page-ops/preview-shell |
| `footer.thumbbar`、`.topbar`、`.brand-home` | skeleton | chrome 裁剪/嵌入断言 |
| `.thumb`、`.thumb.active[data-page-index]`、`#btn-add-page`、`#btn-page-menu` | thumbbar | 页面操作 |
| `.page-menu .mi` 7 项文案 | page-menu | page-ops 硬断言 |
| `#btn-add`、`#add-list .add-item[data-add-type]` 顺序 text/table/chart | skeleton | editor-minimal |
| `#btn-design`、`.design-*` 类 | design panel | editor-minimal |
| `#btn-fonts/#btn-theme/#inspector/#quickbar/#add-menu` 不得存在 | — | 旧 UI 禁止回归 |
| `.gallery-view`、`.gallery-card`、`.gallery-card-canvas .pptd-preview[data-chrome=embedded]` | Home | preview-shell |
| `#gallery-view` 不得存在 | Home | 旧 id 禁止回归 |
| `window.__pptdEditor` / `__pptdIo` / `__pptdShot` / `__pptdTheme` | main/shot | e2e/宿主 |

### 3.2 新增（W1）

```html
<!-- inside #stage, hidden by default; W2 restyles -->
<div id="sel-actions" class="sel-actions" hidden>
  <button type="button" class="sel-action" data-action="copy" title="复制 (Ctrl+C)">…</button>
  <button type="button" class="sel-action" data-action="duplicate" title="重复 (Ctrl+D)">…</button>
  <button type="button" class="sel-action" data-action="delete" title="删除 (Delete)">…</button>
</div>
```

- 仅在有选中元素且未进入内容编辑/放映时显示；定位在选区上方，超出视口时翻到下方并夹取。
- 必须加入 `interaction/stage.js` 的 FLOATING 选择器，避免触发画布手势。
- destroy 后不残留；双实例各自独立。

## 4. 设计令牌（W2 目标，最终值以 `ref/design-direction.md` 为准）

```css
:root, [data-pptd-theme] {
  --paper: #F6F3EC;       /* app 背景 */
  --panel: #FFFDF8;       /* 面板/画布外框 */
  --ink: #1B1A17;
  --sub: #6B675D;
  --faint: #9B9588;
  --line: #E2DCD0;
  --line-strong: #CFC7B8;
  --accent: #C2472E;      /* 单一强调色 */
  --accent-soft: #F3E2DC;
  --danger: #B3261E;
  --radius-sm: 4px; --radius: 6px; --radius-lg: 10px;
  --topbar-h: 56px;
  --font-ui: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-display: "Iowan Old Style", "Palatino Linotype", Georgia, "Songti SC", serif;
}
[data-pptd-theme="dark"] {
  --paper: #161513; --panel: #1D1C19; --ink: #EDE7DA; --sub: #B3AC9D;
  --faint: #7F796C; --line: #2C2A25; --line-strong: #3B382F;
  --accent: #E06A4F; --accent-soft: #3A231D; --danger: #E5675C;
}
```

- 语义 token 名可保留旧名做别名迁移；W2 完成后删除未使用别名。
- 禁止：渐变背景、backdrop-filter、重阴影、装饰性大圆角、过度动效（只保留 120–180ms 的 opacity/transform）。
