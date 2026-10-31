# handoff 目录

worker 在每波分支的最后一个 commit 写 `handoff/W<N>-<agent>.md`，格式按 spec-team SKILL 的 Handoff 协议：

- A. 自动事实：`git diff --stat <base>..HEAD`、公开接口签名、基线命令真实结果。
- B. 只存在于脑子里的东西：与 spec 偏差、坑、隐含约束、下一波必须注意的点。
- C. 指针：关键文件:行号、commit、稳定区。

本目录当前为空；W1 尚未派工。lead 合并后按需读取点名的 handoff，不把全部历史 handoff 塞给后续波次。
