# 组件测试项目

统一存放**针对不同类型组件的专项测试项目**，每个目录是一个完整的 PPTD 项目（含 `deck.pptd` + `pages/`），可直接 serve 到编辑器验证预览，再从网页导出 PPTX 验证 PowerPoint 渲染。

| 项目 | 覆盖组件 | 说明 |
|---|---|---|
| `text/` | text（富文本/公式/渐变/阴影/对齐/布局/图标） | 阶段 A：官方 text 格式对齐全特性验证 |

## 使用

```bash
# 启动编辑器并挂载某个测试项目
node bin/open-pptd.js serve --project tests/projects/text
```

新增测试项目：按组件建目录（如 `shape/`、`chart/`、`table/`），写 `deck.pptd` + `pages/*.page`，在此表登记一行。
