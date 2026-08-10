# 测试

测试分三类：**组件测试项目**（人工验证）、**自动回归**（机器验证）、**E2E**（真实浏览器）。

```
tests/
  projects/          组件测试项目（每组件一个，可 serve 到编辑器验证预览 + 导出）
    text/            文字：富文本 / 公式混排 / 渐变 / 阴影 / 对齐 / 布局 / 图标（6 页）
    shape/           形状：ECMA-376 全部 187 种预置 + 自定义路径 custGeom（8 页）
    line/            线条：sharp / round / smooth 曲线 + 箭头
    image/           图片：crop → fit → cropShape 全管线
    icon/            图标：bs: / fas: / far: / fab:
    table/           表格
    chart/           图表：bar / pie
  reference/         PowerPoint 参考文件（官方结构基准，人工制作/生成）
    test-text.pptx   用户用 PowerPoint 手工制作：文字官方结构
    test-shape.pptx  用户用 PowerPoint 手工制作：25 个形状 + 手绘 custGeom
    test-shapes-all.pptx  python-pptx 全量基准（scripts/gen-reference-shapes.py 生成）
  fixtures/
    formula/         公式转换回归语料（204 个 LaTeX 用例 + 微软官方 XSLT 参考输出）
  e2e/               真实浏览器（Chrome/Edge CDP）测试：画廊缓存 / 渐进加载 / 实时刷新
  run-all.mjs        一键回归（导出全部项目 + 包一致性 + 颜色 + 形状 + 公式 + 图标）
  isolate.mjs        逐组件逐页隔离导出（定位 PowerPoint 弹「修复」）
  package-integrity.mjs  包内引用一致性（rels/rId/Content_Types）
  color-consistency.mjs  预览/导出颜色一致性
  preset-shapes.mjs      预置形状全量回归（187 prst 名 + custGeom 结构 + XML 良构）
  formula/test-formula.mjs  公式转换回归（204 用例 vs 微软官方 XSLT）
  icon/test-icon.mjs       图标导出回归
  util/unzip.js      zip 解包辅助（回归测试读 pptx 部件）
  util/run.js        子进程执行辅助（run-all 用）
```

## 一键回归

```bash
node tests/run-all.mjs
```

覆盖：全部组件项目导出 → 包内引用一致性 → 颜色两端一致性 → 预置形状全量 → 公式 204 用例 → 图标导出。

## 组件测试项目（需要 PowerPoint 人工验证）

```bash
# 启动编辑器并挂载某个组件项目
node bin/open-pptd.js serve --project tests/projects/shape
# 浏览器打开输出的 URL → 检查预览 → 网页导出 → PowerPoint 打开
```

验证要点：**无修复弹窗** + 渲染与预览一致。改完任何"效果类"代码必须跑这一步（预览对不代表导出对，schema 违规会被 PowerPoint 静默修复）。

## PowerPoint 弹「修复」定位法

```bash
node tests/isolate.mjs   # 每个项目每页导出为一个独立 PPTX → tests/out/iso-<项目>-NN.pptx
```

逐个用 PowerPoint 打开：**哪个文件弹修复 → 对应项目页面的组件就是问题源**。需要更细拆分时，用 `tests/projects/shape` + `tests/preset-shapes.mjs`（每页 30 个形状）二分。

## PowerPoint 参考文件比对法

OOXML 的结构细节（子元素顺序、单位、命名空间包装）仅凭规范容易写错，因此用**官方文件比对法**：

1. 用 PowerPoint 手工制作「目标效果」的样例（或 `scripts/gen-reference-shapes.py` 用 python-pptx 批量生成），命名 `test-<特性>.pptx` 放到 `tests/reference/`，口头告知
   - 注意：**PowerPoint 需关闭**（存在 `~$` 锁文件说明还没存完）
2. 解包（`python + zipfile` 或 `tests/util/unzip.js`）读 `ppt/slides/slide1.xml`，与 `editor/writer/` 输出逐字节对照
3. 修复 → `node tests/run-all.mjs` 回归

**已知的关键结构结论（防回归，勿回退，详见 HANDOFF.md §2.3）：**

| 特性 | 正确结构 |
|---|---|
| 标注引线可见性 | 形状需 `p:style`（lnRef idx=1）；spPr 里出现 `a:ln`（含 noFill）会覆盖 lnRef 导致引线消失 |
| 预置形状 avLst | 未显式设置 adjustments 时输出空 `<a:avLst/>`（PowerPoint 只写非默认值） |
| custGeom 命令 | `a:moveTo/a:lnTo/a:arcTo/a:cubicBezTo` 必须带 `a:` 前缀（漏前缀 → 形状不可见） |
| 图片预载 | 扩展名正则必须带捕获组（`/\\.([a-z0-9]+)$/i`） |
