// ============================================================================
// packages/config.js — 用户级配置（契约 5）
// ----------------------------------------------------------------------------
//   config.json 位于 `paths.home`，带 `version` 字段（允许用户手改）。
//   readConfig()  默认值合并 + 逐版本迁移（version 缺失补 1）
//   writeConfig() 浅合并写回，**保留未知键**，原子写（tmp → rename）
//
// 读三级/写一级同样适用于配置：配置只读/写 home 一处，包内不含用户配置。
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "./paths.js";

/** 当前配置 schema 版本（缺失时补齐为此值）。 */
export const CONFIG_VERSION = 1;

/** 默认配置（新键在此登记；下游按需读取，未知键原样保留）。 */
export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  // 导出前置体检是否默认自动补齐缺失字体（默认 false：导出默认只体检，
  // 避免 CI/agent 环境意外触发数十 MB 下载；`open-pptd ensure` 默认补齐）。
  autoFetch: false,
});

/**
 * 读取配置：文件缺失/损坏 → 默认值；逐版本迁移（缺 version 补 1）。
 * @returns {object} 合并后的配置（含未知键）
 */
export function readConfig() {
  let raw = {};
  try {
    const parsed = JSON.parse(readFileSync(paths.config, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = {}; // 文件缺失或 JSON 损坏 → 默认值（不抛错，doctor/导出链路不应因配置受损而中断）
  }
  const cfg = { ...DEFAULT_CONFIG, ...raw };
  if (typeof cfg.version !== "number") cfg.version = CONFIG_VERSION;
  return cfg;
}

/**
 * 浅合并写回（保留未知键），原子落盘。
 * @param {object} patch
 * @returns {object} 写回后的完整配置
 */
export function writeConfig(patch = {}) {
  const next = { ...readConfig(), ...patch };
  const dest = paths.config;
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = join(dirname(dest), `.config.${process.pid.toString(36)}${Date.now().toString(36)}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
    renameSync(tmp, dest);
  } catch (err) {
    try { if (existsSync(tmp)) rmSync(tmp, { force: true }); } catch { /* 清理失败不掩盖原错误 */ }
    throw err;
  }
  return next;
}
