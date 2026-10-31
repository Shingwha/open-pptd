# decisions · 3.0 决策、理由与取舍

> 本文记录已拍板事项。后续波次不得重新讨论；若要改，先改本文件并说明影响波次。

## A. 总体架构

### D1 组件化 + 单壳
- **决定**：`createPreview`（预览）与 `createEditor`（最小编辑）分离；编辑器自包含、实例级服务；画廊/编辑器/headless 共用一套壳与 runtime；单壳 Home/Editor。
- **理由**：当前 `createEditor` 依赖静态骨架/全局 dom/dialog/toast，宿主必须复制 index.html；同页双实例冲突；画廊/编辑器两套壳造成重复 loader/菜单/主题。
- **代价**：改动大；skeleton/CSS/DOM 作用域/销毁路径全要重做；一次性 golden 稳定性风险。
- **取舍**：不做“隐藏高级编辑/双模式”；不保留旧的页面级 createEditor 兼容层。

### D2 一套运行时与导出
- **决定**：ProjectRuntime + ResourceProvider + ExportService 为唯一核心；浏览器/CLI/server 只做 source/provider/backend/sink adapter。
- **理由**：当前 loader/export/zip/字体/图片解析有 3–4 套；图表 DPR、字体 portability、bundle 语义都因多路径漂移。
- **代价**：新包/依赖边/接口；所有入口都要迁移。
- **取舍**：不保留旧 `renderPage`/`autoGrowTexts`（3.0 删除）；不保留 CLI 程序化旧函数名。

### D3 TypeManifest 唯一类型清单
- **决定**：类型由 manifest 定义；render/toXml 分片懒加载；schema/layout hooks；只有 text/table/chart 有 contentEditor；group 为 composite。
- **理由**：新增类型现在要改 ELEMENT_TYPES/validate/layout/pptd-io/canvas/types/index/writer/render；writer 被预览静态加载；group 注释与实现漂移。
- **代价**：registry/validate/layout/renderer/writer/editor 协同改；懒加载边界要测。
- **取舍**：不保留 menu/create/props/quickbar 字段；不从 model 再拆更多包。

### D4 无兼容
- **决定**：contract 3.0；删旧 CLI/别名/深路径/`./internal/*`/旧 API；不写 shim。
- **理由**：用户明确要求代码简洁、架构清晰，不留兼容层。
- **代价**：下游/脚本需要一次性迁移；旧 skill clone URL 改用 release zip。
- **取舍**：允许旧 deck 数据可读，但不做自动升级/旧 API 转发。

## B. 渲染、度量、表格

### D5 纯函数度量统一
- **决定**：预览/headless/CLI/check/gallery/golden 全部用 `fontMetricsMeasure`；删除 DOM measure。
- **理由**：编辑器 DOM 精修 vs 导出纯函数造成文字行高/换行不一致；用户明确选择纯函数。
- **代价**：预览可能与 DOM 有轻微误差；靠 safety factor/overflow 警告。
- **取舍**：不做双模式；不保留 `editor/app/view/dom-measure.js` 或 measure adapter 桩。

### D6 表格高度唯一 totalHeight
- **决定**：`tableFacts.totalHeight` 是视觉/选框/writer 的唯一高度；`bounds.h` 只作 rowHeights 比例种子；无 rowHeights = 内容高。
- **理由**：当前 layout.frame / renderer box / writer a:ext / table-editor 四个高度；表格编辑器和属性面板语义不一致。
- **代价**：行为变化；旧 deck 无 rowHeights 且 bounds 较高时表格会缩到内容高；golden 需 rebaseline。
- **取舍**：不采用 max(bounds,totalHeight) 留空白；不固定 bounds。

### D7 rowSpan 平均补差
- **决定**：先算基础行高与非跨行内容；跨行单元格算所需高度与跨度内已有高度差；平均分给跨度行；整数一次取整；padding 只算一次。
- **理由**：当前 measureCell/rowSpan + 逐行 ceil 会多算/少算；合并表容易偏高/像素漂移。
- **代价**：合并表行高变化；需 golden/PPTX 手验。
- **取舍**：不把超额全部给最后一行；不按比例分配。

### D8 表格 golden 自动 rebaseline
- **决定**：表格修复后一次性自动接受新基线；脚本生成 diff 报告 + 结构 sanity（页数/尺寸/空白/失败即中止）；第二遍零差异。
- **理由**：用户选择自动接受，不逐页人工确认；表格修复预期改变一批页面。
- **代价**：可能吸收同批回归；靠 sanity + 二次稳定性 + git 历史。
- **取舍**：不做人工逐页签字；不做长期 whitelist。

### D9 预览/导出保真
- **决定**：预览/PNG 是图像基准；PPTX 原生可编辑导出；PPTX 单向；不做图片版 PPTX。
- **理由**：PPTX 与 DOM 是两套渲染器，像素级承诺不成立；用户接受单向 fork。
- **代价**：原生图表/文字在 PPTX 可能有差异；需组件项目手验。
- **取舍**：不用整页栅格化 PPTX；不做 PPTX 回写。

### D10 PNG 双浏览器后端 + DPR
- **决定**：保留 foreignObject + headless 两条浏览器后端，但共用 ExportService/RenderBackend；`pixelRatio=scale` 在首帧前确定；headless setDeviceScaleFactor 后重绘 page 0。
- **理由**：静态站需要 foreignObject；CLI/本地需要 headless；当前第 1 页图表 DPR 错误。
- **代价**：两条 rasterize 实现仍存在；需 parity 测试。
- **取舍**：Office/WPS 原生渲染后移；不引入第三套 browserless 渲染器；不删 foreignObject。

## C. 主题与字体

### D11 主题库完整快照
- **决定**：主题库存 `colors + textStyles + tableStyles` 完整快照；内置 10 palette 展开为完整主题；用户主题 `~/.open-pptd/themes/*.json`；应用不是活引用。
- **理由**：当前只有 10 个颜色 preset，无保存/复用；textStyles/tableStyles 无法随主题复用；用户要像资源一样复用。
- **代价**：主题 UI v1 只细修颜色，text/table 样式随存但不做可视化编辑器；主题切换可能带入样式。
- **取舍**：不做 colors-only；不做主题活链接；不做样式编辑器（后移）。

### D12 应用主题：替换 + 保留引用
- **决定**：主题覆盖当前 colors/textStyles/tableStyles；扫描 deck 仍引用的缺失 token/style，从旧主题保留；未引用旧项丢弃；报告 preserved；可撤销。
- **理由**：AI deck 常用 `$gold` 等自定义 token；纯替换会断引用；纯合并会积累旧 token。
- **代价**：实现引用扫描；主题切换不是字面全替换。
- **取舍**：不做“每次都问覆盖/合并”；不保留所有旧 token。

### D13 自定义颜色令牌
- **决定**：颜色列表支持任意 token；添加/编辑/删除；删除被引用 token 警告/阻止；所有颜色选择器读取全部 token。
- **理由**：当前固定 17 key，AI deck 的 `$gold` 等不可见、不可加；用户明确痛点。
- **代价**：token key 校验/usage 扫描；重命名引用更新后移。
- **取舍**：不做重命名批量改引用（3.0 后移）；不限制固定 key 集。

### D14 字体全局库
- **决定**：内置 registry + 用户字体导入 home（复制字节+元数据）；deck.fonts 只引用 family；浏览器/CLI 同一库；字体嵌入全局设置。
- **理由**：当前每 deck 字体库不可复用；local font 不落盘、CLI 不可用；per-font embed/subset chip 和导出对话框重复控制。
- **代价**：本地 server 依赖；静态站只用内置库；用户字体 license/体积；项目包不含字体。
- **取舍**：不做每 deck 独立字体库；不做项目包携带字体；不做 per-font embed chip。

### D15 Design 面板
- **决定**：顶栏“设计”一个入口，tabs 主题/字体/外观；外观（明暗）从 deck 主题分离；导出对话框只保留全局字体嵌入 + 子集/完整。
- **理由**：当前字体/配色两个 popover，配色面板混明暗；命名/操作迷惑。
- **代价**：新面板/样式；删除旧两个面板。
- **取舍**：不做独立字体管理弹窗；不做每字体 chip。

## D. 编辑器最小集

### D16 保留功能
- **决定**：单选/多选/框选、拖动/缩放/旋转、智能参考线、删除、undo/redo；文字内容+基础排版+颜色；表格内容+结构+基础颜色；图表数据/类型/系列+系列色；新增文字/表格/图表；页面单页前插/后插/前移/后移/置顶/置底/删除 + 拖拽排序；保存/导出/放映/live reload/明暗。
- **理由**：AI 生成 + 人类 last-mile；完全只读不实用；完全编辑器是屎山；保留高频、低复杂操作。
- **代价**：canvas/selection/history 仍在；不是最简只读。
- **取舍**：不保留完整旧编辑器；不做 read-only 版本。

### D17 删除功能
- **决定**：组合/取消组合、对齐/分布按钮、层级、复制粘贴/原地复制、透明度/翻转、属性面板、快捷条、元素右键菜单、旧字体/主题/页面背景面板、表格/图表样式面板、行列尺寸、形状/线条/图片/图标内容编辑与新增、备注/预检/zip 导入/AI UI/shape text UI、页面多选/批量/复制页。
- **理由**：AI/PPTX 可做；保留会拖回大量状态/手势/UI/兼容。
- **代价**：部分 last-mile 需 AI/PPTX。
- **取舍**：智能参考线保留；对齐/分布命令不保留；group 成员按普通元素。

### D18 页面操作
- **决定**：单页操作；`insertPage(at)`；`＋` 插当前页后；页面菜单前插/后插/前移/后移/置顶/置底/删除；保留拖拽排序；无页面多选/批量/复制页。
- **理由**：当前加页只能末尾追加，缩略条无页面菜单；用户明确需要前插/移动。
- **代价**：需要新菜单/API；缩略条拖拽修复。
- **取舍**：不做批量页操作；不做复制页。

### D19 颜色范围
- **决定**：文字、表格单元格字色/填充、图表系列；形状填充/边框、页面背景、主题色不编辑。
- **理由**：最小编辑器聚焦内容；形状/页面/主题交给 AI。
- **代价**：形状不能改色；需 AI。
- **取舍**：不增加通用颜色面板。

## E. 图片资产

### D20 资产分类与优先级
- **决定**：证据/数据/概念/结构/品牌五类；原始资料优先；简单指标可原生重绘；生成只做表达。
- **理由**：论文严谨性；避免生成假数据/假图；用户明确原图优先。
- **代价**：Agent 需文档解析工具；复杂图提取/核对成本。
- **取舍**：不全部原生重绘；不全部原图；混合。

### D21 生图/搜图授权
- **决定**：只有 image-gen 工具存在且需要非证据视觉时问一次，默认否；搜图独立询问，默认否；敏感资料不外传；学术默认不用 stock/生图；商业可选装饰；品牌/poster 可为主。
- **理由**：用户要求工具存在才问；隐私/学术风险；避免无意义访谈。
- **代价**：工具探测/条件流程；生成质量/一致性需 prompt family/QA。
- **取舍**：不每 deck 都问；不默认允许；不生成证据/logo/真人/产品。

### D22 透明图片
- **决定**：PNG alpha 端到端；WebP/SVG→PNG；native alpha > key-color > rembg > base-color；浅/深底检查；加透明 PNG 回归测试，不改引擎除非失败。
- **理由**：透明素材在 PPT 中更好；PPT 只支持 PNG/JPEG/GIF；引擎按字节嵌入 PNG。
- **代价**：抠图质量/工具依赖；大图体积。
- **取舍**：不用 JPEG 透明；不默认 base-color 假透明；学术证据图不抠背景。

## F. Skill / Docs

### D23 Skill 回归主仓
- **决定**：`skill/` 子目录；release skill zip；外部仓归档；skill 与 3.0 并行、一起发；无 2.x 兼容。
- **理由**：用户要一起维护；外部仓 drift guard/双写成本；内容与命令易漂移。
- **代价**：安装方式改 release zip；外部 clone 停止。
- **取舍**：不做外部镜像（可后续按需）；不保留旧 skill 仓。

### D24 Skill 结构/模板
- **决定**：精简 SKILL.md；refs 拆 format/elements/charts/design/quality/shapes/images；6 kits；4 套视觉体系；page recipes + 关键 fragments；无固定 deck；无 calibration demo 在 skill；不生成证据。
- **理由**：固定 deck 同质化；纯 prose 导致 AI 现场发明/花哨；用户要质量下限+变化。
- **代价**：kit/recipe 设计工作量大；fragments 校验复杂。
- **取舍**：不做完整 starter deck；不保留 8 scenario 长文/12 风格/全字体色表；不做 skill 内 demo。

### D25 视觉体系
- **决定**：academic / executive / editorial / instructional；academic/executive 克制内容优先；editorial 只品牌/poster；取消 12 风格菜单。
- **理由**：当前 academic 默认 ETH 海报、business 默认 editorial emotion/motif，导致不学术/AI 味。
- **代价**：品牌/创意以外的表达自由度降低；用户自定义风格仍需支持。
- **取舍**：不保留 dark-tech/brutalist/poster-pop 等作为 academic/business 默认。

### D26 Docs 只留 release
- **决定**：主仓 docs 只保留 `release-workflow.md` + `docs/images/`；删除 embedding/image-generation/archive/DSH/旧 specs；代码/测试引用改 contract/tests/README；skill 是内容唯一源。
- **理由**：用户要清理；避免多份漂移；DSH 不再适配。
- **代价**：下游无独立 embedding 文档；旧链接失效；代码注释需改。
- **取舍**：不保留 archive/历史 spec；不保留 DSH；不把 embedding 移入 skill。

## G. 后移/拒绝清单

- 后移：Office/WPS PNG、browserless PNG、图片版 PPTX、shape text、备注编辑、编辑器内预检、zip 导入、AI 协作 UI、自动保存、内联文本编辑、页面批量/复制、组合/对齐分布/层级/复制粘贴、形状/图片/图标内容编辑、主题样式可视化编辑器、项目包字体、WebP/SVG 原生、Dsh。
- 拒绝：固定 deck 模板、完整 read-only 前端、保留旧 CLI/API/深路径、DOM 量度、image-based PPTX、外部 skill 双写、每次 deck 都问生图。
