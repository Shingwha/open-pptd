# 测试

测试分四层：**自动回归**（`regression/`，npm test 机器验证）、**组件测试项目**（`projects/`，导出回归 + PowerPoint 人工验证）、**E2E**（`e2e/`，真实浏览器）、**诊断工具**（`tools/`，人工排障，不进回归）。

```
tests/
  run-all.mjs            一键回归入口（npm test）
  lib/                   测试共享辅助
    run.js               子进程执行（run-all 用）
    unzip.js             极简 ZIP 读取器（回归读 pptx 部件）
  regression/            自动回归（纯 Node，全部进 npm test）
    dep-graph.mjs        架构守门：依赖方向 + 环境全局扫描（v3）
    validate.mjs         校验器 + check 命令 + 导出闸门
    background-size.mjs  背景图 cover 裁剪随 deck.size
    color-consistency.mjs  预览/导出颜色一致性
    theme-presets.mjs    主题预设一致性（themes.md/代码/行为）
    preset-shapes.mjs    预置形状全量回归（187 prst + custGeom + XML 良构）
    package-integrity.mjs  PPTX 包内引用一致性（也被 run-all 逐项目调用）
    formula.mjs          公式转换回归（204 用例 vs 微软官方 XSLT 固化参考）
    icon.mjs             图标导出回归（SVG 嵌入，预览=导出同源）
    line.mjs             线条导出回归（多点曲线 xfrm + smooth 末锚点）
    handle-io.mjs        本地项目句柄读写（mock 句柄）
    export-media.mjs     项目包图片完整性
  fixtures/
    formula/             公式语料：formulas.txt（204 用例）+ omml-ai/（官方固化参考）
                         + mml/（KaTeX 中间产物，不入库，npm run test:fixtures 生成）
  projects/              组件测试项目（每组件一个，run-all 自动发现并导出回归；
                         也可 serve 到编辑器人工验证预览 + 导出）
    text/                文字：富文本 / 公式混排 / 渐变 / 阴影 / 对齐 / 布局 / 图标 /
                         颜色体系 / 字体体系（8 页）
    shape/               形状：ECMA-376 全部 187 种预置 + 自定义路径 custGeom（8 页）
    line/                线条：sharp / round / smooth + 箭头 + 颜色变体（2 页）
    image/               图片：crop → fit → cropShape 全管线（1 页）
    icon/                图标：bs:/fas:/far:/fab: + 颜色/渐变变体（2 页）
    table/               表格：样式 / 边框 / 对齐 / 合并 / 填充 / 字体 / 颜色（9 页）
    chart/               图表：bar/pie/line/area/scatter 等 21 页全类型
    notes/               备注：演讲者备注 + 文本（5 页）
    font-embed/          字体嵌入：字库全字体卡片（7 页，缺字体只警告不嵌入）
    <项目>/reference/    PowerPoint 官方结构基准（人工制作，对照用，不进回归）
    <项目>/out/          导出产物（iso-* 隔离页 / check-* 全量，gitignore）
  tools/                 诊断工具（人工排障用，不进 npm test）
    isolate.mjs          逐组件逐页隔离导出（定位 PowerPoint 弹「修复」）
    dump-formula-mml.mjs 公式语料 → KaTeX MathML（npm run test:fixtures）
    ui-shots.mjs         界面截图走查（编辑器/画廊 × 桌面/窄屏 → tests/ui-shots-out/）
  e2e/                   真实浏览器（需本机 Chrome/Edge，CDP 驱动）
    render.mjs           渲染冒烟：无头渲染逐页 PNG（npm run test:render）
    incremental-load.mjs 渐进加载：写入中的项目逐页显示（npm run test:incremental）
```

## 一键回归

```bash
npm run test:fixtures   # 首次：生成公式语料的 KaTeX 中间产物（tests/fixtures/formula/mml/，不入库）
npm test                # 一键回归
```

流程：`tests/projects/` 自动发现全部组件项目并导出（产物到 `<项目>/out/check-<项目>.pptx`）→ 逐产物过包一致性 → 跑 `regression/` 全部套件。

**扩展约定**：
- 新增组件测试项目 → 在 `tests/projects/` 放 `<名称>/deck.pptd` + `pages/`，run-all 自动收编，无需改任何代码。
- 新增自动回归 → 在 `tests/regression/` 放一个 `.mjs`（零依赖、退出码表成败），并在 `run-all.mjs` 的 `suites` 加一行。

## 组件测试项目（需要 PowerPoint 人工验证）

```bash
# 启动编辑器并挂载某个组件项目
node bin/open-pptd.js serve --project tests/projects/table
# 浏览器打开输出的 URL → 检查预览 → 网页导出 → PowerPoint 打开
```

验证要点：**无修复弹窗** + 渲染与预览一致。改完任何"效果类"代码必须跑这一步（预览对不代表导出对，schema 违规会被 PowerPoint 静默修复）。

### 各项目覆盖点

| 项目 | 页面 | 覆盖 |
|---|---|---|
| text | 1_cover | 深底 + 渐变标题 |
| | 2_richtext | 富文本标签全家桶（strong/em/u/s/sup/sub/ul/ol/a） |
| | 3_formula | LaTeX 公式混排（行内 + 独占段 + 对齐） |
| | 4_layout | 布局字段（align/wrap/textDirection/默认值） |
| | 5_effects | 元素级变换（rotation/opacity/flip）+ 文字装饰 |
| | 6_icons | 富文本内嵌图标 |
| | 7_colors | 颜色体系：9 个主题色引用 / HEX6 / HEX8 透明度 / span 内联色 / 背景高亮 / 双渐变 |
| | 8_fonts | 字体体系：官方字体清单 / {latin,ea} 分工 / span 内联字体 / 字号字重组合 |
| table | 01-table | $default 基础（蓝表头/斑马/浅灰边框） |
| | 02-styles | 多套 tableStyles（compact/colorful）对比 |
| | 03-borders | BorderSpec 四边独立 / 虚线点线 / null 清除 / 分类样式外框 / 单元格级覆盖 |
| | 04-align | CellStyle.align 水平×垂直 + 单元格级覆盖 |
| | 05-merge | rowSpan/colSpan 合并（官方省略规则） |
| | 06-fills | Table.fill 整表 / 单元格内联（含渐变）/ 主题引用填充 / 富文本单元格 |
| | 07-fonts | cellStyle.fontFamily / {latin,ea} / 分类样式字体 / span 内联 |
| | 08-colors | 主题色文字 / HEX6 / HEX8 / 背景高亮 / 装饰组合 |
| icon | 01-icon | 四种图标库（bs/fas/far/fab）+ 渐变 |
| | 02-colors | 主题色引用 / HEX8 透明度 / 多渐变 / 深浅底叠放 |
| line | 01-curve | 直线/斜线/箭头/sharp/round/smooth |
| | 02-colors | 主题色 / 虚线点线 / 宽度 / 箭头颜色 / 折线颜色 / HEX8 |
| shape | 01-07 | 187 种预置形状全量（7 页布局） |
| | 08-custom | 自定义路径 custGeom（M/L/C/A 全命令 + 整圆拆分） |
| chart | 01-21 | 全部图表类型 + 坐标轴 / 副轴 / 颜色 / 属性变体 |
| notes | 01-05 | 演讲者备注 / 文本混排 / 备注与图表组合 |
| font-embed | 1-7 | 字库全字体卡片（嵌入与回退情况，PowerPoint 打开肉眼核对） |

## 弹修复定位法

```bash
node tests/tools/isolate.mjs
```

把每个项目的每一页单独导出为 `tests/projects/<项目>/out/iso-<项目>-NN.pptx`，
用户逐个用 PowerPoint 打开：弹修复的文件 → 对应项目页面的组件就是问题源
（形状类可再跑 `tests/regression/preset-shapes.mjs` 的产物二分）。

## E2E（真实浏览器，需 Chrome/Edge）

```bash
npm run test:render           # 渲染冒烟（无头逐页 PNG：数量/尺寸/非空/进程可退出）
npm run test:incremental      # 渐进加载（写入中的项目逐页显示 + SSE 刷新 + 坏页占位）
```
