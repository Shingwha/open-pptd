# 测试

测试分三类：**组件测试项目**（人工验证）、**自动回归**（机器验证）、**E2E**（真实浏览器）。

```
tests/
  projects/            组件测试项目（每组件一个，可 serve 到编辑器验证预览 + 导出）
    text/              文字：富文本 / 公式混排 / 渐变 / 阴影 / 对齐 / 布局 / 图标 /
                       颜色体系 / 字体体系（8 页）
    shape/             形状：ECMA-376 全部 187 种预置 + 自定义路径 custGeom（8 页）
    line/              线条：sharp / round / smooth + 箭头 + 颜色变体（2 页）
    image/             图片：crop → fit → cropShape 全管线（1 页）
    icon/              图标：bs:/fas:/far:/fab: + 颜色/渐变变体（2 页）
    table/             表格：样式 / 边框 / 对齐 / 合并 / 填充 / 字体 / 颜色（8 页）
    chart/             图表：bar / pie（2 页）
    <项目>/out/        该项目的导出产物（iso-* 隔离页 / check-* 全量，gitignore）
  reference/           PowerPoint 参考文件（官方结构基准，人工制作/生成）
    test-text.pptx     用户用 PowerPoint 手工制作：文字官方结构
    test-shape.pptx    用户用 PowerPoint 手工制作：25 个形状 + 手绘 custGeom
    test-shapes-all.pptx  python-pptx 全量基准（scripts/gen-reference-shapes.py 生成）
  fixtures/
    formula/           公式转换回归语料（204 个 LaTeX 用例 + 微软官方 XSLT 参考输出）
                       其中 mml/（KaTeX 中间产物）不入库，clone 后先 npm run test:fixtures 生成
  e2e/                 真实浏览器（Chrome/Edge CDP）测试：渐进加载 / 实时刷新
  run-all.mjs          一键回归（导出全部项目 + 包一致性 + 颜色 + 形状 + 公式 + 图标）
  isolate.mjs          逐组件逐页隔离导出（定位 PowerPoint 弹「修复」）
  package-integrity.mjs  包内引用一致性（rels/rId/Content_Types）
  color-consistency.mjs  预览/导出颜色一致性
  preset-shapes.mjs      预置形状全量回归（187 prst 名 + custGeom 结构 + XML 良构）
  formula/test-formula.mjs  公式转换回归（204 用例 vs 微软官方 XSLT）
  icon/test-icon.mjs       图标导出回归
  util/unzip.js        zip 解包辅助（回归测试读 pptx 部件）
  util/run.js          子进程执行辅助（run-all 用）
```

## 一键回归

```bash
npm run test:fixtures   # 首次：生成公式语料的 KaTeX 中间产物（tests/formula/fixtures/mml/，不入库）
npm test                # 一键回归（导出全部项目 + 包一致性 + 颜色 + 形状 + 公式 + 图标）
```

覆盖：全部组件项目导出（产物到 `tests/projects/<项目>/out/check-<项目>.pptx`）→ 包内引用一致性 → 颜色两端一致性 → 预置形状全量 → 公式 204 用例 → 图标导出。

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
| shape | 01-07 | 187 种预置形状全量（8 页布局） |
| | 08-custom | 自定义路径 custGeom（M/L/C/A 全命令 + 整圆拆分） |
| chart | 01-bar / 02-pie | 柱状 / 饼图 |

## 弹修复定位法

```bash
node tests/isolate.mjs
```

把每个项目的每一页单独导出为 `tests/projects/<项目>/out/iso-<项目>-NN.pptx`，
用户逐个用 PowerPoint 打开：弹修复的文件 → 对应项目页面的组件就是问题源
（形状类可再跑 `tests/preset-shapes.mjs` 的 8 页产物二分）。

## E2E（真实浏览器，需 Chrome/Edge）

```bash
npm run test:live             # SSE 实时刷新 + 保存写回磁盘
npm run test:incremental      # 渐进加载（写入中的项目逐页显示）
```
