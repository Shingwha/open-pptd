# tests/contract — 包级公共契约测试

这一组测试冻结 **契约 4（包级入口）**：`packages/*/index.js` barrel 的导出名、
`CONTRACT_VERSION`、以及 `contract.json` 与 `package.json` 的 `exports` 口径一致性。

与 `tests/regression/` 的区别：`tests/regression/` 验**运行时行为**（导出 PPTX、
渲染、依赖方向）；`tests/contract/` 只验**对外接口形状**，跑得很快，不需要示例项目，
也不产生产物。它**不**由 `tests/run-all.mjs` 拉起（run-all 只收 `tests/regression/`
清单），需单独或按需执行。

## 运行

```sh
node tests/contract/public-api.mjs
```

退出码 0 = 契约成立；非 0 = 契约被破坏（会逐条打印缺失的导出名或口径漂移）。

## 覆盖

1. 五个已存在 barrel（model / renderer / writer / server / cli）的导出名与类型齐全
   （清单 = spec `docs/specs/01-engine-api.md` T1，即 `integration-plan.md` 附录 D.1）；
   并抽查 `chart` / `icons` / `fonts` / `bytes` / `renderers` / `xml` / `parts` / `text`
   命名空间内的点名成员。
2. `packages/index.js` 的 `CONTRACT_VERSION === 2`，且与 `contract.json` 的
   `contractVersion` 一致。
3. `contract.json` 可解析；`entries` 与 `package.json` `exports` 的对应条目**双向**
   一一对应（任一侧多出/缺失都失败）；`bin` 两侧一致。
4. model / renderer / writer 三个双端 barrel 的源文件不含 `node:` / 裸 `fs` /
   `window.` / `document.` / `headless/`（浏览器安全约束，与 dep-graph 互补）。

## 已知的待落地跳过（SKIP）

`contract.json` 的 `editor` / `paths` / `config` 三个条目指向的文件由 A2 (W1)、A3 (W2)
陆续落地。文件尚不存在时本测试打印 `SKIP` 而非失败；三个文件都落地后，lead 在
W1.5/W2 把这三项由 SKIP **收紧为 FAIL**（删掉 `pending` 分支即可）。
