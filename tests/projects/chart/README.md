# 图表回归 deck（tests/projects/chart）

24 页覆盖全部 13 种图表类型与属性组合，`npm test` 的「导出 + 包一致性 chart」项与
双端对照（浏览器 render vs PowerPoint COM）都以本 deck 为基准语料。

## 已知两端差异定案（接受项，勿再当 bug 排查）

预览 = ECharts canvas（或 SSR 矢量图），导出 = 原生 OOXML / chartEx。下列差异是
权衡后**决定接受**的，报告类似现象时先对表，不要重新排查：

| # | 差异 | 定案 |
|---|---|---|
| 1 | 数值轴自动范围：ECharts nice-number vs PowerPoint 算法不同 | 不写死 min/max，保数据可编辑+自适应语义（pptd.md §Chart）；显式配置 min/max 时两端一致 |
| 2 | 雷达值轴刻度：PPT 显示刻度数字，预览不显示；类目排布方向两端相反 | 接受，ECharts radar 与 PPT 固有差异 |
| 3 | ~~气泡尺寸两端差~~ 已修复：写值归一化 + bubbleScale 反解，语义单源 `spec.bubble`（model/chart/spec.js） | — |
| 4 | treemap 瓦片切分算法不同（ECharts squarify vs PPT），块边界/纵横向或有差 | 聚合语义已同源，接受 |
| 5 | ~~深色瓦片标签不可读~~ 已修复：按瓦片亮度自动选深/浅字色（预览逐节点；导出走 cs:dataLabel 槽） | — |
| 6 | ~~瀑布色板两端不同~~ 已修复：`waterfallColorOf` 单源（配置优先、缺省主题色板） | — |
| 7 | ~~股价图图例展开为 开盘/最高/最低/收盘（非系列名）~~ 已对齐：预览同样展开 OHLC 图例条目（helper 系列 + legend.data），叠加均线未配 marker 时导出显式写 symbol none（抑制 PPT 平台默认 ✕）。图例**图标**两端不同：预览彩色方块，PPT 纯文字（ser marker=none 时 PPT 不绘制图标；写可见 marker 会把标记画到 K 线图上，实验后放弃） | 图标差异接受 |
| 8 | 图例 bottom + manualLayout：PowerPoint 图例带与底部让位带内容多时互相挤 | 页面层规避（图例挪 top）；模型级修法列为候选（波及全部 legend-bottom 预览像素） |

其他平台事实（chartEx 结构限制、OOXML 深坑）记录在 writer 代码触发点的注释里：
`packages/writer/chart/chartex.js`、`frame.js`、`chartex-style.js`、`ser.js`。

## 新增回归页

页面文件放 `pages/` 后**必须在 deck.pptd 的 pages: 清单登记**（不会自动发现）；
双端截图锁形态后更新上表（若涉及新差异）。
