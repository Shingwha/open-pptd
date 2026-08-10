# 公式转换差异记录（KNOWN DIFFS）

`scripts/test-formula.mjs` 对比 `editor/core/mathml2omml.js` 输出与微软官方
`MML2OMML.XSL` 固化参考（`tests/formula/fixtures/omml-ai/`）。

**当前状态：204/204 全部字节级一致，无已知差异。**

## 历史修复记录（2025-08，语料固化时发现并修复）

新语料（204 个，含矩阵变体 / aligned / xrightarrow / mpadded / 根号）暴露了
旧语料（172 个）未覆盖的 6 个边角差异，全部修复：

| # | 用例 | 根因 | 修复 |
|---|------|------|------|
| 114 | `\vdots` 矩阵 | `mPadded` 的 `fFull` 正则判定与官方 `FFull` 不同（"0em" 应判 zero）；且官方 `MPadded` 的 `<m:e>` 不调 `CreateArgProp` | `fFull` 重写为官方逻辑（含非零数字→full，数字全零→zero，无数字→full）；`mPadded` 的 e 去掉 argPr |
| 116 | aligned 空单元格 | `mTable` 空 `mtd` 输出 `<m:e></m:e>`，官方 lxml 自闭合 | 单元格改用 `wrapEl`（空 → `<m:e/>`） |
| 142/143 | `\xrightarrow` | KaTeX 输出 `mpadded width="+0.6em"`，官方判 full（不输出属性），旧判定输出 `zeroWid` | `fFull` 重写（同上） |
| 193 | fenced 空分组 | `writeFenced` 空分隔组 `<m:e></m:e>` | `wrapEl` 自闭合 |
| 195 | 矩阵内根号 | `msqrt`/`menclose(radical)` 的 `<m:deg>` 未调 `CreateArgProp` | deg 内补 `argProp`，空时自闭合 |

## 背景：为什么参考输出可信

`omml-ai/` 由本机 Office 的官方 `MML2OMML.XSL`（`C:/Program Files/Microsoft
Office/root/Office16/MML2OMML.XSL`）经 `tests/formula/formula-oracle.py` 生成，
即 PowerPoint 导出公式的真实行为。KaTeX MathML（`mml/`）由仓库内
`editor/vendor/katex.mjs` 生成，与编辑器运行时同源。
