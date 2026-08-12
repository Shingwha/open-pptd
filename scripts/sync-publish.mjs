#!/usr/bin/env node
// ============================================================================
// sync-publish.mjs — 把 main 的"运行时白名单"文件同步到 publish 分支
// ----------------------------------------------------------------------------
// publish 分支 = SkillHub 发布用精简分支（112 文件，低于 200 限制），
// 只含 skill 运行时必需文件；main 上的开发内容（tests/ 测试、assets/icons
// 源 SVG、docs/、scripts/ 生成工具）不进入 publish。
//
// 用法:
//   node scripts/sync-publish.mjs          # 同步到本地 publish 分支（不推送）
//   node scripts/sync-publish.mjs --push   # 同步并推送到发布目标仓库
// 前置条件: 在 main 分支、工作树干净。
// ============================================================================

import { execSync } from "node:child_process";

// ---- 推送目标：SkillHub 导入的是这个仓库的默认分支 ----
// 每个目标: { remote: git remote 名, src: 本地分支, dst: 远端分支 }
const PUSH_TARGETS = [
  { remote: "publish-repo", src: "publish", dst: "main" }, // 独立发布仓库 open-pptd-publish
];

// ---- 白名单：发布分支包含的文件/目录（与 publish 分支创建时一致）----
const WHITELIST = [
  ".gitignore",
  "README.md",
  "README.en.md",
  "SKILL.md",
  "index.html",
  "package.json",
  "bin",
  "lib",
  "editor",
  "references",
  "assets/fonts/registry.json",
  "tests/package-integrity.mjs",
  "tests/util",
  "scripts/sync-publish.mjs",
];

const run = (cmd) =>
  execSync(cmd, { stdio: "inherit", cwd: process.cwd(), encoding: "utf8" });
const runq = (cmd) =>
  execSync(cmd, { stdio: "pipe", cwd: process.cwd(), encoding: "utf8" }).trim();

// 前置检查
const branch = runq("git branch --show-current");
if (branch !== "main") {
  console.error(`✗ 请在 main 分支运行（当前: ${branch}）`);
  process.exit(1);
}
const dirty = runq("git status --porcelain");
if (dirty) {
  console.error("✗ 工作树不干净，请先提交或 stash");
  process.exit(1);
}
if (!runq("git rev-parse --verify publish").length) {
  console.error("✗ 本地不存在 publish 分支，请先创建（见 README 或 git checkout --orphan publish）");
  process.exit(1);
}

const mainSha = runq("git rev-parse --short main");
const push = process.argv.includes("--push");

console.log(`▶ 同步 main@${mainSha} → publish`);
run("git checkout publish");

try {
  // 清空 publish 工作区与索引，再从 main 拉取白名单（白名单之外一律不留）
  run("git rm -rf . --quiet");
  run(`git checkout main -- ${WHITELIST.join(" ")}`);
  run("git add -A");

  const changed = runq("git status --porcelain");
  if (!changed) {
    console.log("✓ publish 已是最新，无变化");
  } else {
    run(`git commit -q -m "sync publish from main@${mainSha}"`);
    console.log(`✓ 已提交 ${runq("git rev-parse --short HEAD")}`);
  }
  // 推送独立于“是否有新提交”：--push 时即使无变化也执行（保证远端与本地 publish 一致）
  if (push) {
    for (const t of PUSH_TARGETS) {
      const remoteExists = runq(`git remote get-url ${t.remote}`);
      if (!remoteExists) {
        console.error(`✗ 未配置 git remote ${t.remote}，跳过（添加: git remote add ${t.remote} <url>）`);
        continue;
      }
      run(`git push ${t.remote} ${t.src}:${t.dst}`);
      console.log(`✓ 已推送 ${t.remote}/${t.dst}`);
    }
  } else {
    console.log("! 未推送（加 --push 推送）");
  }
} finally {
  run("git checkout main -q");
}
