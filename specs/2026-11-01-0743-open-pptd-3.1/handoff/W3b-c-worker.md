# W3b-C handoff · 注释整理（runtime / export / server / cli / barrels）

> 分支 `feat/3.1-w3b-c`，起点 `main b60f4f0`；Windows + Git Bash + Node v24.21.0；零新增依赖。
> 写入范围：`git diff --name-only b60f4f0..HEAD` 49 文件，全部命中 C 组白名单；`tests/**`、`contract.json`、`package.json`、`tests/run-all.mjs`、`skill/**` 零 diff。

## A. 自测真实输出

```text
基线（b60f4f0，先跑 dump-formula-mml 后 run-all 才满 39）与完工各跑一遍，结果一致：
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/cli/surface.mjs → 结果: 72/72 通过 ✅
$ node tests/regression/dep-graph.mjs → ✓ 依赖方向与环境全局检查通过
$ node tests/contract/public-api.mjs → 结果: 契约通过 ✅

# 逐文件 node --check（49 个 .js）：syntax-fail:0
# 代码行门禁（只允许注释/空行）：
$ git diff -U0 b60f4f0..HEAD | grep -E '^[+-][^+-]' | grep -vE '^[+-][[:space:]]*(//|/\*|\*|$)' → 空输出
# marker 扫描（\bW\d+\b/RP-C/\bM1-6\b/spec 09/editor-ux/\bD\d+\b/contract 4|5/2.x/§）→ 空；
#   仅保留 12 个合同入口各一行 “Contract 3.0 entry”。>20 行 banner 扫描 → 空。
# 49 个文件头均为 3–6 行。

# CLI 抽验（与 b60f4f0 的 git archive 快照逐项对照）：
$ node bin/open-pptd.js --help → exit 0，stdout 19 行，stderr 0 B；diff 与基线 identical
$ node bin/open-pptd.js check examples/ev-range/deck.pptd --json → exit 0，stdout 1 行，stderr 0 B
  diff 与基线 identical（summary {"errors":0,"warnings":2,"pages":17,"strict":false}）
$ node bin/open-pptd.js doctor --json → exit 0，stdout 1 行，stderr 0 B
  除 paths.packageRoot / resourceRoots（随检出位置天然不同）外与基线 JSON 完全一致，ok=true
```

## B. 改动、保留与偏差

**批量结构**
- 49 个文件：12 个合同入口/barrel（root、model/renderer/writer/runtime/export/server/cli/measure/layout、paths、config），runtime 10，export 5，server 12，cli 12。
- 文件头统一压到 3–6 行：删 `// ====` 横幅与 `// ----` 头部装饰线；保留用途、真实不变量、安全/原子写/修订冲突约束。
- 删除历史/设计编号全部复述：`W3/W6/W9/W10`、`RP-C`、`M5`、`D6/D14/D.1`、`spec 3.0`、`interfaces.md §2/§3/§4/§5/§6/§14`、`theme-font.md §6/§8`、`Contract 5`、`2.x`、`contract entry 4`。
- 修复过期说明：config “contract 5” → 当前；server “unchanged from earlier versions” 删除；report “frozen for W3 → W9/W10 / Extensions this wave” 改为字段清单；resolve 的 W6 themeLibrary 钩子句删除（并从 @param 删除未使用项）；runtime-node “D14 / W6/W3 scope” 删除；server 的 “RP-C / M5 / W6” 删除；assets 的 GitHub release 长 URL 改为一句来源说明；bundle 的 “export-project archive mode / Historical” 修正为 CLI 约定；renderer 的 “2.x adapters are gone” 删除；layout 的 D6 改为语义说明。
- 保留的公共 JSDoc（逐项核对仍在）：ProjectSource / ProjectFiles / SourceFile / ResourceProvider / FontRef / Project / ResolvedProject / CheckReport / ExportReport / RenderBackend / RenderBackendFactory typedef；revision 的 FNV-1a 双通道/长度前缀说明；atomicWriteFile 的 tmp→rename；save 的 409/回滚/遍历防护；themes/fonts 的 loopback/上限/只读；CLI 五命令、stderr 人类文本、`--json` 单行 stdout、退出码约定；png 的 pages/scale/命名/backend 注入；zip/OOXML 说明属 writer 组，不在本组。
- 冗余统计：本组注释行 1494 → 1131（删 363 行，24%）；`git diff --stat` 净 -349 行（237+/586-）。

**偏差 / 需 lead 知悉**
1. config.js 与 layout/index.js 头部补了 “Contract 3.0 entry open-pptd/{config,layout}”，与其余 10 个合同入口一致（仅注释）。
2. export/report.js 的字段说明由分项列表压成 2 行，字段名全部保留；`check?` 等 additive 语义未变。
3. `server/export-image.js` 的内联注释 “legacy same-site” 保留（属请求来源判断的 why，非 wave 编号）。
4. 未改任何代码/字符串/类型/缩进逻辑；用户可见文案（含 bin.js 中 “3.0”、错误消息）逐字未动。

## C. 文件 / commit / 探索审计

| commit | message | 文件 |
|---|---|---|
| `9eb8cb2` | docs(comments): 精简包入口与合同 barrel 头部注释 | root + 9 barrels + paths + config（12） |
| `5f55e45` | docs(comments): 精简 runtime/export 模块头部与过期说明 | runtime 10 + export 5（14） |
| `9d99a96` | docs(comments): 精简 server/cli 模块头部与历史标记 | server 12 + cli 12（23） |
| （本文件） | docs(w3b-c): 写 W3b-C 交接 | handoff |

**探索审计（只读）**：工单 04-W3b、`ref/repo-map.md`、handoff/W3a-a、W3a-b；逐文件通读本组 49 个文件；对照 `contract.json` 的 12 entries、`tests/contract/public-api.mjs`、`tests/cli/surface.mjs`、dep-graph 豁免表；基线/完工各跑 run-all + surface + dep-graph + contract；用 `git archive b60f4f0` 临时快照对比 `--help` / `check --json` / `doctor --json`。未全仓重读，未触碰主检出、其他 worktree、tests 数据与 skill。
**未决**：无。注释规则内的历史 marker 在本组已清零；其他组文件未扫描/未修改。
