# W3a-B handoff · 测试工具去重

> 分支 `feat/3.1-w3a-tests`，起点 `main 7393b31`；Windows + Git Bash + Node v24.21.0；本机 Chrome；零新增依赖。改动仅 `tests/**`（不含 golden/fixtures/projects）与 handoff，未触碰生产代码。

## A. 自测真实输出（开工前 → 完工后，断言数不变）

```text
# 基线（7393b31，开工前；先跑 dump-formula-mml 后 run-all 才满 39）
$ node tests/tools/dump-formula-mml.mjs → KaTeX MathML 生成: 204/204
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/skill/run.mjs → 101/101 通过 ✅（warnings 0）
$ node tests/skill/zip.mjs → 10/10 通过 ✅
$ node tests/export/run.mjs → export: 56/56 通过 ✅
$ node tests/regression/parity-png.mjs → 22/22 通过
$ node tests/e2e/render.mjs → render 冒烟测试 9/9 通过
$ node tests/regression/font-library.mjs → 63/63；theme-library 66/66
$ node tests/runtime/run.mjs → 93/93；tests/docs/run.mjs 35/35
$ node tests/tools/parity-baseline.mjs → 4 渲染 + tables 24 + text frames 68（工具无断言）

# 完工（最终代码重跑）
$ node tests/run-all.mjs → 结果: 39/39 通过 ✅
$ node tests/skill/run.mjs → 101/101 通过 ✅（warnings 0）
$ node tests/skill/zip.mjs → 10/10 通过 ✅
$ node tests/export/run.mjs → export: 56/56 通过 ✅
$ node tests/regression/parity-png.mjs → 22/22 通过
$ node tests/e2e/render.mjs → render 冒烟测试 9/9 通过
$ node tests/regression/font-library.mjs → 63/63；theme-library 66/66
$ node tests/runtime/run.mjs → 93/93；tests/docs/run.mjs 35/35
```

指标/断言语义对照：export 56 条与 parity 22 条全部原样通过，scale2 指标数值与基线逐个相同（p1 0.2752 / p2 0.1759、edge energy 2.084 / 0.97 等）；render 9 条含 scale=2 右下角 colors=12；runtime/font/theme/docs/skill 断言数均未增减。

## B. 实现、复用、偏差与坑

**ZIP（`tests/lib/unzip.js`）**：新增 `readZipEntries`（中央目录元数据：name/size/compSize/method/localOff），EOCD 扫描限定 22+65535 字节；`readZip/readText/unzip` 支持 method 0（store）与 8（deflate，`inflateRawSync`），其他 method 明确报错。`tests/skill/zip.mjs` 删除本地中央目录解析，改为复用 `readZipEntries`（原导出仅本文件使用，grep 零外部消费者）。其余 ZIP 测试（export/run、browser-export、image-alpha、package-integrity、preset-shapes、table-facts、measure-consistency）自动获得 deflate 能力。已用合成 deflate ZIP 手工验证（name/size/compSize/method/内容均正确）。

**PNG（`tests/tools/golden-lib.mjs`）**：`decodePng` 增补 colorType 4（灰度+alpha），导出 `PNG_CHANNELS`、`paeth`，新增并导出 `chartRegionSample`（含 region 字段，兼容 parity-baseline 原输出）与 `edgeEnergy`（不支持格式返回 0；sample 返回 `{supported:false}`）。`tests/export/run.mjs`、`tests/regression/parity-png.mjs`、`tests/tools/parity-baseline.mjs`、`tests/e2e/render.mjs` 删除各自解码器/指标副本并复用；render 仍用 `PNG_CHANNELS` + IHDR 保留原 SKIP 分支。四个调用方共删约 300 行重复解码逻辑。

**test-utils（新增 `tests/lib/test-utils.js`）**：导出 `results`、`check`、`checkEq`（原始值 Object.is、对象/数组 JSON 比较）、`throwsCode`、`withTempDir`（sync/async 回调，自动清理）、`walk`。替换 7 个套件的本地实现：export/run（check/checkEq）、font-library 与 theme-library（check/checkEq/throwsCode/withTempDir）、runtime/run（check/checkEq，保留其 predicate 版 throws）、docs/run 与 skill/run（check 别名 ok、walk、results 汇总）、parity-png（check/results）。各套件不再维护本地 PASS/FAIL 计数器。

**未使用 import**：删除 `render.mjs` 的 existsSync/statSync/inflateSync、`color-consistency.mjs` 的 readdirSync、`icon.mjs` 的 loadIconRegistry、`parity-png.mjs` 的 readFileSync/inflateSync、`theme-library.mjs` 的 readFileSync/createThemeStore/mkdtempSync/tmpdir、`type-manifest.mjs` 的 loadRenderTypes、`parity-baseline.mjs` 的 readdirSync/inflateSync。

**偏差（需 lead 知悉）**：① export/run 原 `checkEq` 为严格 `===`，共享版对原始值用 Object.is、对对象用 JSON——其 9 处调用全为原始值，等价；② 共享 `chartRegionSample` 固定带 `region`，export/parity 断言只读 distinctColors/nonWhiteRatio，parity-baseline 原输出本就含 region，故输出形状不变；③ skill/zip 不再导出 `readZipEntries`（内部专用，无外部引用）；④ golden-lib 解码错误为 throw，调用方按原语义转 SKIP/unsupported。未改任何断言、fixtures、golden、projects、run-all。
**坑**：`inflateRawSync` 而非 inflate（ZIP 为 raw deflate）；DataView 必须带 byteOffset 处理 Buffer.subarray；golden-lib 返回字段是 `data`（原副本为 `pixels`），调用方已统一；parity-baseline 手工运行会重写 fixture（PNG 哈希存在既有非确定性），已 `git checkout` 恢复，未入库。

## C. 文件 / commit 指针

| commit | message |
|---|---|
| `a827739` | test(lib): 新增共享断言/临时目录/遍历工具 |
| `f147aab` | test(lib): 统一 ZIP 读取并支持 store/deflate |
| `d06507a` | test(tools): PNG 解码与图表区域指标收敛到 golden-lib |
| `faf5fa4` | test(regression): 字体/主题/运行时/文档/技能套件复用共享测试工具 |
| `3541c73` | test(regression): 删除未使用 import |
| （本提交） | docs(w3a-b): 写 W3a-B 交接 |

新增：`tests/lib/test-utils.js`。修改：`tests/lib/unzip.js`、`tests/tools/{golden-lib,parity-baseline}.mjs`、`tests/export/run.mjs`、`tests/regression/{parity-png,font-library,theme-library,color-consistency,icon,type-manifest}.mjs`、`tests/runtime/run.mjs`、`tests/docs/run.mjs`、`tests/skill/{run,zip}.mjs`、`tests/e2e/render.mjs`。未改 `packages/**`、`editor/**`、`tests/golden/**`、`tests/fixtures/**`、`tests/projects/**`、`tests/run-all.mjs`、`package.json`。
**探索审计（只读）**：工单/`ref/repo-map.md`/`W2-worker.md`；`tests/lib/{unzip,run}.js`、`tests/tools/{golden-lib,golden-render,golden-diff,parity-baseline}.mjs`、`tests/{export/run,e2e/render,skill/run,skill/zip,docs/run,runtime/run,regression/{parity-png,font-library,theme-library,color-consistency,icon,type-manifest}}.mjs`、`tests/run-all.mjs`、`packages/writer/zip.js`；未全仓重读，未触碰主检出与其他 worktree。
**未决**：`packages/cli/assets.js` 仍有生产侧 `readZipEntries`（属 A 组生产代码，未越界修改，可作为 A 组后续候选）；e2e/render 的调色板/16-bit PNG 仍走 SKIP（原行为）；test-utils 的 `results` 为模块级单例，假设一进程一套件（run-all 满足）。
