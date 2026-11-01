# W3b-E handoff · 注释整理（scripts / tests）

> 分支 `feat/3.1-w3b-e`，起点 `3179728`（W3b-D 合并后）；Windows 10.0.28120 + Git Bash + Node 24；零新增依赖。
> 写入范围 `scripts/**` + `tests/**`（不含 fixtures/golden/projects 数据、不含 formula 相关文件），
> 共 55 文件 + 本 handoff；其余文件零 diff；未 merge/push/tag，未碰主检出与其他 worktree。

## A. 自测真实输出

```text
基线（3179728，先跑 dump-formula-mml 补不入库 fixture）：run-all 39/39；skill 101/101；
  zip 10/10；cli 72/72；export 56/56；docs 35/35；e2e render 9/9。
完工（HEAD a6fcc6c）：
  node tests/run-all.mjs              → 结果: 39/39 通过 ✅
  node tests/skill/run.mjs            → 结果: 101/101 通过 ✅（warnings recorded: 0）
  node tests/skill/zip.mjs            → 结果: 10/10 通过 ✅
  node tests/cli/surface.mjs          → 结果: 72/72 通过 ✅
  node tests/export/run.mjs           → export: 56/56 通过 ✅
  node tests/docs/run.mjs             → 结果: 35/35 通过 ✅
  node tests/e2e/render.mjs           → ✓ render 冒烟测试 9/9 通过
  node tests/regression/dep-graph.mjs → 扫描 231 文件/785 import；✓ 依赖方向与环境全局检查通过
  node tests/contract/public-api.mjs  → 结果: 契约通过 ✅
  逐文件 node --check（55 个 .js/.mjs）→ 0 失败
  代码行门禁：git diff -U0 3179728..HEAD -- scripts tests | grep ... → 0 行（空输出）
```

**冗余统计**：注释行 1,512 → 824（−688，−45.5%）；diff `+420 / −1,108`；删除纯装饰分隔线约
110 行；无 >20 行注释块；文件头最大 6 行（未改的 formula 两文件除外）。

| commit | message |
|---|---|
| `7abbe69` | docs(scripts): 整理生成与打包脚本注释为功能说明 |
| `7533dc9` | docs(tests): 整理 regression 套件注释与文件头 |
| `a6fcc6c` | docs(tests): 整理 e2e 与门禁套件注释，移除历史编号 |
| （本文件） | docs(w3b-e): 写 W3b-E 注释整理交接 |

## B. 偏差 / 取舍 / 必须知道

1. **formula 相关文件按 spec 排除，未动**：`tests/regression/formula.mjs`、`tests/tools/dump-formula-mml.mjs`
   保持原样（含 `// ====` banner 与 spec 09 头）；本组剩余 banner 仅在这两个文件，需 lead 单独授权。
2. **字符串中的历史编号按红线保留**（7 行，扫描命中但非注释）：`gen-font-metrics.mjs:253` 的 JSON
   `note`（spec 09 T1）；`contract/public-api.mjs` 三条 console 标签（W1.5 / 契约 5·W2·A3 /
   spec 09 T5）；`layout.mjs:54`、`measure-consistency.mjs:85` 的测试名（D6）；
   `golden-render.mjs:67` 的 manifest `renderer` 值（spec 09 T2）。改字符串会改测试输出/生成物，故保留。
3. **头部压缩**：部分文件把 `Run:`/`Usage:` 并入首行（长行）以满足 3–6 行上限；运行方式、
   浏览器依赖、SKIP 条件均保留。
4. **逐文件 + 一次受控清理**：先逐文件改头部/正文，再用“只匹配整行 `// ----...`”的行过滤删除
   110 行分隔线，随后 55 文件全部 `node --check`；期间误触 formula 两文件已还原，最终零 formula diff。
5. 行尾：`tests/tools/ui-shots.mjs` 在 worktree 为 LF，其余 CRLF；均按原样保留，无整文件改写。
6. 保留的复杂说明：golden-lib PNG 解码/哈希、lib/unzip store+deflate、save-atomic 原子回滚、
   resource-paths 并发/pid/registry 遮蔽、browser-export 第 4 次下载限制与 foreignObject 回退、
   export/run scale2 像素指标；固定端口 9241/9247/9341–9345 与临时目录说明均保留。
7. **过期说明修复**：golden-lib 头 colorType 2/6 → 实际 0/2/4/6；theme-presets 头 17 键 → 16 键
   （断言字符串仍写 17）；dep-graph 双端包注释扩为全部 DUAL_END_PKGS；run-all 删除 “contract 4”；
   golden-render/parity 删除旧 2.x 对比叙事；save-atomic/docs/skill 删除已完成编号与旧命令措辞。

## C. 关键文件 / 稳定区 / 审计

- `tests/lib/{test-utils,unzip}.js`、`tests/tools/golden-lib.mjs`：公共断言、ZIP 读取、PNG 解码/哈希契约，
  头部 4–5 行，JSDoc 全保留。
- `tests/regression/dep-graph.mjs`：跨包边表与双端纯净度规则完整（ALLOWED_CROSS 未改）。
- `tests/regression/{save-atomic,resource-paths,export-media}.mjs`：原子写/回滚、home→package 解析、
  媒体落包语义只改注释。
- `tests/e2e/{preview-shell,editor-ops,editor-minimal,page-ops}.mjs`：DOM 契约与 CDP 端口说明保留，
  W7/W8/W9/editor-ux/spec 编号已清。
- `tests/{contract/public-api,cli/surface,docs/run,export/run,runtime/run,skill/run,skill/zip}.mjs`：
  门禁/套件头部统一 2–6 行；断言与字符串未动。稳定区：`scripts/gen-*`、`tests/regression/*` 小套件、
  `tests/tools/{isolate,ui-shots}`。
- **探索审计（只读）**：spec 04、ref/repo-map、handoff/W3b-a/b/d；逐文件读本组 55 个已改文件与
  2 个 formula 文件头部；另读 `packages/writer/zip.js`、`packages/export/index.js`、`contract.json`。
  未改本组之外任何文件。
