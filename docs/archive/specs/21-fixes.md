# Spec · 既有问题修复 + 跨模块发现处置（21-fixes，R 并行×3）

> 性质：**混合型**——绝大多数是行为保持的合并/清理；两项是有意的行为修复（render.mjs 测试解码错误、table-editor 列头 >26 显示错误）。每项都标明了属于哪类。
> 前置阅读：`00-overview.md`、`99-git.md`、`20-cleanup.md` §1/§2（不变量与注释规范继续有效）。
> 版本不动；不 push 不 tag。

## 1. F1 paint-fixes（分支 `fix/paint`，范围 `packages/model/**` + `packages/renderer/**` + `packages/writer/**` + `tests/e2e/render.mjs`）

### T1 render.mjs scale=2 用例修复（有意修复，lead 已定因）

根因（lead 实测确认）：渲染输出正确（右下角有柱组/轴标签/图例），但测试把 zlib 解压后的 IDAT 直接当 RGBA 读取——PNG 扫描线带 filter byte 且经 Sub/Up/Paeth 差分滤波，纯色区域差分值塌缩 → 颜色计数恒在 5 上下。
修法：在测试内实现标准 PNG unfiltering（filter 0–4：None/Sub/Up/Average/Paeth，约 30 行，零依赖），按真实像素采样统计右下四分域颜色数；断言意图不变（缩放铺满画布、非左上角缩略图）。守卫：color type 6 / bit depth 8 时才做像素断言，否则打印 SKIP 说明。修复后该用例应稳定远超阈值（实测渲染图右下含蓝橙柱体+灰字+白底）。

### T2 `colorOr()` 收敛 ~40 处 `resolveColor(theme, x) || fallback`

chart option 各模块重复的 `resolveColor(theme, x) || fallback` 提为单一 helper（放 `packages/model/theme.js` 或 chart/colors.js，以依赖方向顺为准），逐点机械替换。行为等价性由黄金 diff 守门。

### T3 SVG path 解析/缩放单源化

`renderer/image.js#scalePath` 与 `writer/custgeom.js#parseSvgPath` 高度同构（ARITY 表 + 词法 vs argCount 表 + 同款 token 正则）。抽共享实现到 `packages/model`（如 `svg-path.js`，导出面纯新增），两侧消费。**约束**：先逐 token 对比两份现实现的处理差异（弧线/科学计数法/多参数跨行等），任何现行为差异必须保持原状（分支参数化）或记录不合并的理由；黄金 diff + preset-shapes 守门。

### T4 亮度双实现注释澄清（仅文档，不合并）

`chart/colors.js#luminanceOf`（Rec.709 简单加权）与 `validate.js` 内联 `lum`（WCAG 伽马线性化）语义不同（标签字色 vs 对比度阈值），有意分开。两处互相加一句英文注释指明对方与不合并的原因，防止后人"好心统一"。

门禁：run-all 全绿 + contract + dep-graph + **黄金 diff 零未登记漂移** + `node tests/e2e/render.mjs` **9/9**。

## 2. F2 editor-fixes（分支 `fix/editor`，范围 `editor/**`）

1. **table-editor 列头 >26 错误（有意修复）**：`String.fromCharCode(65+c)` 在第 27 列起显示 `[`、`\` 等错误字符，改用 model barrel 的 `colLetter`（已导出，支持 AA/AB）。同步核对 chart-editor 已用 colLetter 的行为对齐。
2. **editorTheme() 两份**（chart-editor / table-editor，语义微差：chart 回退注入 theme）：统一为单一实现（参数化回退策略），或证明不可合并并注释说明——agent 判断，报告结论。
3. **`file-menu.js label()` ≡ `components/menu.js menuLabel()`**：收敛为单一实现。
4. **`savedDeck = structuredClone + dirty=false` 惯用法三份**（saver.markSaved / io.newProject / source.applyDeck）：若能抽成无歧义的小 helper（如 `ops.commitBaseline()`）就做，涉及行为语义的（如 toast 顺序）保持原状并说明。
5. 其余发现（contain-fit 三份、urlToDataUrl 近似、bindGridKeyboard 零使用）维持记录不动作——风险/收益不匹配，注释保留。

门禁：run-all 全绿 + contract + dep-graph + serve 截图走查（编辑器主界面/表格编辑器打开态，观感除列头修正外零变化）。

## 3. F3 node-fixes（分支 `fix/node`，范围 `packages/paths.js` + `packages/server/**` + `packages/cli/**`）

1. **FONT_REGISTRY_DIR/ICON_REGISTRY_DIR 双份定义**：单点化到 `packages/paths.js`（纯新增导出，契约面允许加法；不 bump CONTRACT_VERSION），`cli/export.js` 与 `cli/resource-status.js` 改为消费 paths.js。注意依赖方向：paths.js 保持零内含重依赖。
2. **registry 判定正则两份**（server/static.js、cli/assets.js）：paths.js 导出 `isRegistryPath(rel)` 单源，两处消费。
3. **`resolveResourceFile` 同名两名**：paths.js 是契约面名字不动；把 server/static.js 的内部同名函数改为不歧义的命名（如 `resolveStaticFile`），全量核对该文件内消费点。
4. 不做：fetch 超时三份（语义不同）、pack-release 自建 zip（有意自足）、dirFingerprint 跨包（C3/C4 分属，收益低）——在代码注释或报告中说明保留理由。

门禁：run-all 全绿 + contract + dep-graph + CLI 抽验（`doctor --json` 五项、`export --json --offline` 一行清单、`serve --detach --json`/`--stop`；OPEN_PPTD_HOME 指临时目录）。

## 4. 通用

- commit：conventional + 中文主题，每工项一个 commit，独立过门禁。
- 注释一律英文（§2 规范）；字符串里的中文产品文案不动。
- 报告：每项的定性（行为保持 / 有意修复）、自测真实结论、发现的新问题。
