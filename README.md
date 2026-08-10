# open-pptd v2 — PPTD 编辑器 + PPTX 导出器

本地运行的演示文稿工具链：**网页编辑器 → PPTD 项目 → 标准 PPTX 导出**。
严格对照官方 PPTD 格式（Kimi 官方编辑器同源，规范见 `references/pptd.md`），
导出的 PPTX 与 PowerPoint 原生结构一致（打开零修复弹窗、渲染与预览一致）。

- **零依赖**：仅需 Node.js v18+，无需 npm install
- 预览（浏览器）= 导出（PowerPoint）：单一定义、双消费者
- 编辑器 `serve --project` 挂载任意项目目录，改文件实时刷新，网页内直接保存回磁盘

## 快速开始

```bash
# 1. 创建项目目录（deck.pptd + pages/*.page + media/）
mkdir -p my-deck/pages my-deck/media

# 2. 命令行导出 PPTX / 项目包（pptd+pages+media 打包 zip）
node bin/open-pptd.js export my-deck/deck.pptd -o out.pptx
node bin/open-pptd.js export-project my-deck/deck.pptd -o project.zip

# 3. 启动网页编辑器实时预览（--project 挂载到 /project/）
node bin/open-pptd.js serve --project my-deck --port 55173
# 浏览器打开启动时打印的链接
```

格式规范：`references/pptd.md`（字段表/约束/示例，**一切格式决策的唯一依据**）、`shapes.md`（187 种预置形状）、`fonts.md`（字体清单）。

## 目录结构

```
open-pptd/
├── HANDOFF.md                # 交接文档：当前状态 / 测试流程 / 下一步任务
├── bin/open-pptd.js          # CLI（serve / export / export-project）
├── lib/                      # 本地服务器（静态 + SSE 实时刷新 + 保存写回）+ 导出逻辑
├── editor/                   # 网页编辑器（纯前端，无后端依赖）
│   ├── core/                 #   数据模型 / 富文本 / 主题 / 几何 / 图标库
│   ├── writer/               #   PPTX writer（OOXML 生成，与 PowerPoint 结构对齐）
│   ├── renderer/             #   预览渲染（与 writer 同源）
│   ├── types/                #   元素类型注册表（text/shape/line/image/icon/table/chart）
│   └── app/                  #   编辑器装配（状态/视图/IO/工具栏）
├── assets/icons/             # Bootstrap Icons 源（192 个 SVG，scripts/gen-icons.mjs 生成内置库）
├── references/
│   ├── official/             #   官方规范源（pptd.md / shapes.md / fonts.md / slides_categories.md）
│   └── font-embedding.md     #   PPTX 字体嵌入实现手册（PowerPoint COM 实测结论）
├── scripts/                  # 构建脚本（图标库 / 预置几何 / 参考文件生成）
├── tests/                    # 测试（见 tests/README.md：组件项目 + 一键回归 + E2E）
└── package.json
```

## 测试

```bash
npm test                      # 一键回归：导出全部组件项目 + 包一致性 + 颜色 + 形状全量 + 公式 + 图标
npm run test:live             # 项目模式 E2E（SSE 实时刷新 + 保存写回磁盘，需 Chrome）
npm run test:incremental      # 渐进加载 E2E（写入中的项目逐页显示，需 Chrome）
```

详见 `tests/README.md`。

## 当前状态（详见 HANDOFF.md）

- ✅ 阶段 A：text 组件严格对齐官方格式（富文本 DSL / LaTeX 公式混排 / 渐变 / 阴影 / 主题色）
- ✅ 阶段 C1：shape 187 种预置 + 自定义路径 custGeom、line curve、image crop/cropShape
- ⬜ 阶段 B：theme / tableStyles 官方化（manifest theme 内联对象、fonts 槽迁移）

## License

MIT
