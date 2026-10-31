#!/usr/bin/env node
// ============================================================================
// tests/regression/font-library.mjs — global font library regression (W6)
// ----------------------------------------------------------------------------
// Self-running (lead wires it into tests/run-all.mjs after merge):
//   node tests/regression/font-library.mjs
//
// No real font bytes are required: imports use a minimal sfnt header plus an
// explicit family. Coverage (work order #9):
//   · user library on a temp home: importFile/importUrl/list/read/remove,
//     index.json shape, atomic writes, duplicate keys/files, safe names
//   · resolve order: user -> built-in registry -> system -> missing
//   · provider integration: createFsResourceProvider fontBytes/fontStatus
//     (user/ready, builtin/ready+fetchable, system, missing) and byte equality
//   · global subset metadata, built-in read-only, invalid payloads/URLs
// ============================================================================

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FontLibraryError,
  createFontLibrary,
  safeFontFileName,
} from "../../packages/model/index.js";
import { createFileFontLibrary, fontLibraryPaths } from "../../packages/server/font-library.js";
import { createFsResourceProvider } from "../../packages/server/runtime-node.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}
function checkEq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? "" : `实际=${JSON.stringify(actual)} 期望=${JSON.stringify(expected)}`);
}
async function throwsCode(name, fn, code) {
  try {
    await fn();
    check(name, false, "未抛出");
  } catch (err) {
    check(name, err?.code === code, `${err?.code || err?.name}: ${err?.message}`);
  }
}

// Minimal sfnt-ish payload (TrueType magic); parseFontInfo throws, so importFile
// takes the explicit family. Tests never need real 8 MB fonts.
const FONT = new Uint8Array([0x00, 0x01, 0x00, 0x00, 1, 2, 3, 4, 5, 6, 7, 8]);
const FONT2 = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 9, 9, 9, 9]); // "OTTO"

const home = mkdtempSync(join(tmpdir(), "open-pptd-font-test-"));
function memLibrary() {
  const user = [];
  const bytes = new Map();
  const registry = {
    fonts: [
      { key: "Builtin One", family: "Builtin Family", file: "BuiltinOne.ttf", url: "https://example.com/b.ttf", license: "OFL", size: 10, subset: true },
    ],
    systemFonts: [{ key: "System One", family: "System Family", platform: "Windows", style: "regular" }],
  };
  return createFontLibrary({
    listUser: async () => user,
    saveUser: async (entry, data) => { bytes.set(entry.key, data); const i = user.findIndex((e) => e.key === entry.key); if (i >= 0) user[i] = entry; else user.push(entry); return entry; },
    removeUser: async (key) => { const i = user.findIndex((e) => e.key === key); if (i < 0) return false; user.splice(i, 1); bytes.delete(key); return true; },
    readUser: async (entry) => bytes.get(entry.key) || null,
    readBuiltinRegistry: async () => registry,
    readBuiltinBytes: async () => FONT,
  });
}

try {
  console.log("== 1. 内置 registry 列表 ==");
  const lib = createFileFontLibrary({ home });
  {
    checkEq("fontLibraryPaths 指向 user 目录", fontLibraryPaths({ home }).userDir, join(home, "assets", "fonts", "user"));
    const builtinOnly = await lib.list();
    check("list 默认只含内置 + 用户（无系统）", builtinOnly.length > 0 && builtinOnly.every((f) => f.source === "builtin"));
    const withSystem = await lib.list({ includeSystem: true });
    check("includeSystem 追加系统字体", withSystem.some((f) => f.source === "system"));
    const first = builtinOnly[0];
    check("内置条目字段完整", typeof first.key === "string" && typeof first.family === "string" && /\.(ttf|otf)$/i.test(first.file) && first.subset === true);
    check("内置主题读数 >= 20", builtinOnly.length >= 20, `${builtinOnly.length} 种`);
  }

  console.log("\n== 2. importFile / list / read / remove（临时 home）==");
  {
    const entry = await lib.importFile(FONT, { family: "User Font", license: "Test License" });
    checkEq("importFile family", entry.family, "User Font");
    checkEq("importFile source", entry.source, "user");
    checkEq("importFile size", entry.size, FONT.length);
    checkEq("importFile 默认 subset=true", entry.subset, true);
    check("字体文件落盘", existsSync(join(home, "assets", "fonts", "user", entry.file)));
    const index = JSON.parse(readFileSync(join(home, "assets", "fonts", "user", "index.json"), "utf8"));
    checkEq("index version", index.version, 1);
    checkEq("index 含导入条目", index.fonts[0].key, "User Font");
    const read = await lib.read(entry);
    checkEq("read 字节一致", Array.from(read), Array.from(FONT));
    checkEq("list 含用户字体", (await lib.list()).filter((f) => f.source === "user").length, 1);
    checkEq("resolve 用户字体", (await lib.resolve("User Font")).source, "user");

    const second = await lib.importFile(FONT2, { family: "Second Font", key: "second-key", file: "custom.otf", subset: false });
    checkEq("importFile 自定义 key/file", [second.key, second.file, second.subset], ["second-key", "custom.otf", false]);

    const conflict = await lib.importFile(FONT, { family: "Third Font", file: "custom.otf" });
    checkEq("同名文件自动改名", conflict.file, "custom-2.otf");

    const updatedBytes = new Uint8Array([...FONT, 42]);
    const updated = await lib.importFile(updatedBytes, { family: "User Font" });
    checkEq("同 key 重新导入覆盖", updated.size, updatedBytes.length);
    checkEq("同 key 重新导入字节更新", Array.from(await lib.read(updated)), Array.from(updatedBytes));
    checkEq("同 key 不新增条目", (await lib.list()).filter((f) => f.source === "user").length, 3);

    checkEq("safeFontFileName 拒绝目录", safeFontFileName("../../evil.ttf"), "evil.ttf");
    checkEq("safeFontFileName 拒绝无扩展", safeFontFileName("noext"), null);

    await throwsCode("空字节", () => lib.importFile(new Uint8Array(), { family: "X" }), "ERR_FONT_INVALID");
    await throwsCode("非 sfnt", () => lib.importFile(new Uint8Array([1, 2, 3, 4]), { family: "X" }), "ERR_FONT_INVALID");
    await throwsCode("TTC 集合不支持", () => lib.importFile(new Uint8Array([0x74, 0x74, 0x63, 0x66, 0, 0, 0, 0]), { family: "X" }), "ERR_FONT_INVALID");
    await throwsCode("缺 family 且无法解析", () => lib.importFile(FONT), "ERR_FONT_INVALID");

    await lib.remove("Second Font");
    check("remove 删除文件", !existsSync(join(home, "assets", "fonts", "user", "custom.otf")));
    checkEq("remove 后 resolve=null", await lib.resolve("Second Font"), null);
    await throwsCode("remove 不存在", () => lib.remove("Second Font"), "ERR_FONT_NOT_FOUND");
  }

  console.log("\n== 3. importUrl（注入 fetch）==");
  {
    const urlLib = createFileFontLibrary({
      home,
      fetchBytes: async (url) => {
        if (url.includes("fail")) throw new Error("network down");
        return FONT2;
      },
    });
    const entry = await urlLib.importUrl("https://example.com/fonts/UrlFont.otf", { family: "Url Font" });
    checkEq("URL 导入 source=url", entry.source, "url");
    checkEq("URL 文件名从路径推导", entry.file, "UrlFont.otf");
    checkEq("URL 导入可读", (await urlLib.read(entry))?.length, FONT2.length);
    await throwsCode("非 http(s) URL", () => urlLib.importUrl("file:///tmp/x.ttf", { family: "X" }), "ERR_FONT_INVALID");
    await throwsCode("下载失败", () => urlLib.importUrl("https://example.com/fail.ttf", { family: "X" }), "ERR_FONT_FETCH");
  }

  console.log("\n== 4. resolve 顺序：user → builtin → system → missing ==");
  {
    const shadow = await lib.importFile(FONT, { family: "MiSans" });
    checkEq("用户字体遮蔽同名内置", (await lib.resolve("MiSans")).source, "user");
    checkEq("用户字体 file 指向用户库", (await lib.resolve("MiSans")).file, shadow.file);
    await lib.remove("MiSans");
    checkEq("删除用户字体后回落到内置", (await lib.resolve("MiSans")).source, "builtin");

    const builtin = (await lib.list())[0];
    checkEq("按内置 family 命中", (await lib.resolve(builtin.family)).source, "builtin");
    const system = (await lib.list({ includeSystem: true })).find((f) => f.source === "system");
    checkEq("系统字体仅声明", (await lib.resolve(system.family)).source, "system");
    checkEq("系统字体无字节", await lib.read(system.family), null);
    checkEq("未知 family -> null", await lib.resolve("No Such Font 12345"), null);

    await throwsCode("remove 内置只读", () => lib.remove(builtin.family), "ERR_FONT_BUILTIN_READONLY");
    await throwsCode("remove 系统只读", () => lib.remove(system.family), "ERR_FONT_BUILTIN_READONLY");
  }

  console.log("\n== 5. ResourceProvider 接入（用户库优先 / 字节一致）==");
  {
    const entry = (await lib.list()).find((f) => f.family === "User Font");
    const provider = createFsResourceProvider({ baseDir: home, fontLibrary: lib });
    checkEq("provider fontStatus 用户字体 = ready", await provider.fontStatus({ family: "User Font" }), "ready");
    checkEq("provider fontBytes 与库字节一致", Array.from(await provider.fontBytes({ family: "User Font" })), Array.from(await lib.read(entry)));
    checkEq("provider 缺失字体 = missing", await provider.fontStatus({ family: "No Such Font 12345" }), "missing");
    const system = (await lib.list({ includeSystem: true })).find((f) => f.source === "system");
    checkEq("provider 系统字体 = system", await provider.fontStatus({ family: system.family }), "system");
    const inv = await provider.inventory();
    check("inventory.fonts 含用户与系统来源", inv.fonts.some((f) => f.source === "user") && inv.fonts.some((f) => f.source === "system"));
  }
  {
    // Built-in ready vs fetchable with a memory library (no real home dependency)
    const mem = memLibrary();
    const provider = createFsResourceProvider({ fontLibrary: mem });
    checkEq("builtin 有字节 = ready", await provider.fontStatus({ family: "Builtin Family" }), "ready");
    checkEq("builtin 字节可读", Array.from(await provider.fontBytes({ family: "Builtin Family" })).length, FONT.length);
    checkEq("system = system", await provider.fontStatus({ family: "System Family" }), "system");
    const noBytes = createFontLibrary({
      listUser: async () => [],
      saveUser: async (e) => e,
      removeUser: async () => true,
      readUser: async () => null,
      readBuiltinRegistry: async () => ({ fonts: [{ key: "B", family: "Builtin No Bytes", file: "b.ttf", url: "https://x/b.ttf", subset: true }], systemFonts: [] }),
      readBuiltinBytes: async () => null,
    });
    const p2 = createFsResourceProvider({ fontLibrary: noBytes });
    checkEq("builtin 无字节有 url = fetchable", await p2.fontStatus({ family: "Builtin No Bytes" }), "fetchable");
    checkEq("builtin 无字节 = null", await p2.fontBytes({ family: "Builtin No Bytes" }), null);
  }

  console.log("\n== 6. 索引损坏与错误码 ==");
  {
    writeFileSync(join(home, "assets", "fonts", "user", "index.json"), "{broken", "utf8");
    const listed = await lib.list();
    check("索引损坏时 list 回退内置库", listed.every((f) => f.source === "builtin"));
    await throwsCode("索引损坏时导入报 ERR_FONT_INDEX", () => lib.importFile(FONT, { family: "After Corrupt" }), "ERR_FONT_INDEX");
    const err = new FontLibraryError("ERR_FONT_INVALID", "x");
    check("FontLibraryError 带 code", err.code === "ERR_FONT_INVALID" && err instanceof Error);
  }
} finally {
  rmSync(home, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n结果: ${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
if (failed.length) {
  for (const f of failed) console.error(`  ✗ ${f.name}`);
  process.exit(1);
}
