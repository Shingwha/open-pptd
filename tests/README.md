# 测试

| 命令 | 内容 | 依赖 |
|---|---|---|
| `npm test` | 公式转换回归：`mathml2omml` 输出 vs 微软官方 `MML2OMML.XSL` 固化参考，逐字符一致 | 无（用固化的 `formula/fixtures/`） |
| `npm run test:smoke` | 浏览器 E2E：画廊懒加载 / 缓存行为 / 编辑器加载（CDP 驱动 Chrome） | 本机 Chrome（可用 `SMOKE_CHROME` 指定路径） |
| `npm run test:fixtures` | 重新生成公式夹具（KaTeX MathML） | 无 |

## 目录结构

```
tests/
├── README.md
├── smoke-cache.mjs        # 浏览器冒烟（画廊/缓存/编辑器）
└── formula/               # 公式转换回归
    ├── test-formula.mjs        # 回归测试入口（对比 fixtures/omml-ai/）
    ├── dump-formula-mml.mjs    # formulas.txt → fixtures/mml/（KaTeX）
    ├── formula-oracle.py       # 官方 MML2OMML.XSL oracle（生成/刷新参考输出）
    └── fixtures/
        ├── formulas.txt        # 204 个 LaTeX 用例（# 注释，每行一个）
        ├── mml/                # KaTeX MathML 输出（mml-01.xml …）
        ├── omml-ai/            # 官方 XSLT 参考输出（01.xml …，字节级黄金基线）
        └── KNOWN-DIFFS.md      # 差异记录（当前 204/204 全绿，历史修复存档）
```

## 重新生成公式参考（改语料后）

1. 编辑 `formula/fixtures/formulas.txt`（新增/修改用例）
2. `npm run test:fixtures` —— 重新生成 `mml/`（需 204/204 全部 KaTeX 可解析）
3. `python tests/formula/formula-oracle.py --batch tests/formula/fixtures/mml tests/formula/fixtures/omml-ai`
   —— 用本机 Office 的官方 XSLT 刷新参考输出（需安装 Office + python lxml）
4. `npm test` —— 确认转换器与官方参考一致

注意：`omml-ai/` 是黄金基线（官方行为），`mml/` 是输入。日常开发改转换器只需跑 `npm test`，不需要 Office。

## 新增已知差异的流程

若转换器与官方存在尚未修复的差异（记录见 `KNOWN-DIFFS.md`），在
`test-formula.mjs` 的 `KNOWN_DIFFS` Map 登记用例序号——该用例降级为警告
不阻断，修复转换器后移除登记即可转正。
