# Spec 00 · UI 重构总纲（细线 Line）

> 日期：2026-09-30　方向：细线 Line（用户拍板）　范围：编辑器 + 作品画廊
> 状态：✅ 2026-09-30 全部五波已合并 @ main（4c17255→W5 merge），门禁 24/24

## 目标与范围

对 open-pptd 前端做整体视觉重构（编辑器为主、画廊同步），并核对 DeepSeek Harness 适配面的主题规范符合性。

- **做**：编辑器 chrome（顶栏/缩放/FAB/缩略条）、选中浮条、右侧属性面板、窄屏体验、画廊视觉与主题响应、令牌字面量审计门禁。
- **不做**：`packages/` 任何文件；元素类型 `props()/menu` 字段数据面；选择模型与键位；`editor/theme.js` 对外契约签名（`TOKENS / defaultTokens / applyThemeTokens` 冻结）；DSH 适配仓本体（本仓只保证契约面与映射文档）。

## 拍板决策（2026-09-30，用户已定，不再反复）

| # | 决策 | 内容 |
|---|---|---|
| D1 | 视觉方向 | **细线 Line**：1px 发丝线表达层级；白底、极少投影（仅下拉/对话框保留 `--shadow-md/lg`）；无填充色块分区；密度适中偏紧凑 |
| D2 | 缩放控件 | **并入缩略条右端**：`− 100% ＋ ⛶` 与页数同排；**删除**拖动移位、localStorage 位置记忆、dblclick 归位逻辑；画布浮层只剩浮条 + FAB |
| D3 | 选中浮条 | 去文字标签；每类型只留核心项 + `⋯`（打开属性面板）+ 删除图标钮；类型徽章保留 |
| D4 | 顶栏文件名 | `brand-file` 显示项目**文件名**（如 `经营复盘.pptd`），完整路径放 `title` |
| D5 | FAB 视觉 | 白底 1px 边 + ink 图标；激活态 accent |
| D6 | 底线条款 | 圆角保持 6/8/12；`--topbar-h` 48→44；阴影档位不增 |
| D7 | 画廊 | 同步细线化；支持深/浅/跟随系统三态（与编辑器共享 `pptd.themeMode` localStorage 键），`applyThemeTokens` 对画廊根同样生效 |

## 全局不变量（回归红线）

1. `node tests/run-all.mjs` 全绿（合并前后各跑一次，独立 `echo $?` 确认退出码，禁止管道吞码）。
2. `tests/regression/dep-graph.mjs` 红线：`packages/` 不 import `editor/`、`editor/` 不 import `packages/{server,cli}`、`packages/{model,writer}` 不碰 DOM——本次改动天然不越界，保持。
3. 顶栏平铺结构不动：品牌(回画廊) + 文件/字体/配色/放映 + undo/redo + GitHub。
4. FAB 两圆钮与缩略条 `＋` 页钮常驻原位；多选/框选/右键菜单/缩略条拖排序能力不回归。
5. 选中叠加层**零填充**：1px 环 + 4 方角点 + 旋转柄（用户追加定案，违反即打回）。
6. `editor/theme.js` 的 `TOKENS / defaultTokens / applyThemeTokens` 签名与语义冻结（DSH 契约 3）。
7. 对外测试钩子 `window.__pptdEditor/__pptdIo/__pptdShot` 与 DOM id 契约（`zoom-ctl` 元素从画布移除，但其内部按钮 id `btn-zoom-out/btn-zoom-in/btn-zoom-reset/zoom-label` 原样保留在缩略条）。
8. 新增/修改测试不得匹配中文文案字符串（防 UI 文案调整炸测试）。
9. 每个 commit 独立过门禁，不留中间态；注释一律英文；commit 信息用中文 conventional（例 `refactor(editor): 缩放控件并入缩略条`）。

## 波次表与写入范围（文件级不相交）

| 波 | 分支 | 内容 | 前置 |
|---|---|---|---|
| W1 | `feat/ui-line-chrome` | 令牌审计、控件原语细线化、顶栏、缩放并缩略条、FAB、view.js 碰撞块移除 | 无（先行） |
| W2 | `feat/ui-line-quickbar` | 选中浮条重做 | W1 合并 |
| W3 | `feat/ui-line-inspector` | 属性面板细线化 | W1 合并 |
| W4 | `feat/ui-line-gallery` | 画廊细线化 + 主题三态 | W1 合并（与 W2/W3 并行） |
| W5 | `feat/ui-line-responsive-dsh` | 窄屏整饰、令牌字面量门禁、DSH 映射文档、深浅色走查 | W2/W3/W4 合并 |

**文件所有权**（唯一所有者，跨波次改他人文件 = 越界）：

- W1：`editor/styles/{tokens,primitives,layout}.css`、`editor/index.html`、`editor/app/toolbar.js`、`editor/app/view/zoom-ctl.js`（删除）、`editor/app/view/view.js`（仅碰撞块）、`editor/app/project/loader.js`、`editor/editor.js`（仅 zoom-ctl 绑定行）
- W2：`editor/app/view/view.js`（其余部分）、`editor/types/*.js`、`editor/ui.js`、`editor/styles/canvas.css`
- W3：`editor/interaction/{properties,fields}.js`、`editor/styles/inspector.css`
- W4：根 `index.html`、`editor/gallery.js`、`editor/app/file-menu.js`、`editor/styles/panels.css`（gallery 区块）
- W5：`editor/styles/responsive.css`、`tests/regression/ui-token-literals.mjs`（新增）、`specs/ref/dsh-theme-mapping.md`（新增）

## Git / worktree 协议

见 spec-team SKILL.md「Git / worktree 协议」节：worktree 放仓库外 `~/.worktrees/open-pptd/<分支>`，分支从**合并时刻最新 main** 创建；全程不 push、不打 tag；lead 统一 `merge --no-ff` 与门禁；agent 不 merge、不碰主检出、不改任何 spec。

## 环境事实

- Windows 10，git bash，仓库路径含非 ASCII（`C:\Users\法法\...`）；Node 可用；本机有全部项目字体（渲染测试可信）。
- `node tests/run-all.mjs` 内 serve 测试用随机端口（`listen(0)`），多 agent 并行跑回归**安全**；`tests/tools/ui-shots.mjs` 用固定 CDP 端口 9247，**只有 W5 允许跑**。
- 用户自己负责浏览器实测：agent 无需驱动浏览器做视觉验收，静态检查 + 回归即可；截图 A/B 由 lead 在终验做。
- 服务启动参考：`node bin/open-pptd.js serve --port 8931`，编辑器 `http://127.0.0.1:8931/editor/?deck=<相对路径>/deck.pptd`（注意示例项目是 `deck.pptd` 文件名）。
