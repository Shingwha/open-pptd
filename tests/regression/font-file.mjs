#!/usr/bin/env node
// tests/regression/font-file.mjs — font byte validation (transport + sfnt header).
// A font is usable when its bytes arrive complete and start with a valid sfnt header.
// Registry `size` is advisory only: comparing it forever marked valid fonts "stale"
// after an upstream re-release (Hedvig Letters Sans: registry 80700 vs upstream 80828).
// Usage: node tests/regression/font-file.mjs

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSfntMagic, readFontMagic, verifyFontBytes } from "../../packages/cli/font-file.js";

let pass = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    return;
  }
  fails.push(`${name}${detail ? " — " + detail : ""}`);
}

const ttf = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x80]);
const otf = Buffer.concat([Buffer.from("OTTO", "latin1"), Buffer.alloc(12)]);
const appleTrue = Buffer.concat([Buffer.from("true", "latin1"), Buffer.alloc(12)]);

// ---- sfnt magic ----
check("TTF 0x00010000 是 sfnt", isSfntMagic(ttf));
check("OTTO 是 sfnt", isSfntMagic(otf));
check('"true" 是 sfnt', isSfntMagic(appleTrue));
check("HTML 错误页不是 sfnt", !isSfntMagic(Buffer.from("<!doctype html>")));
check("过短 buffer 不是 sfnt", !isSfntMagic(Buffer.from([0x00, 0x01])));
check("空 buffer 不是 sfnt", !isSfntMagic(null));

// ---- verifyFontBytes: transport completeness + format ----
check("完整字体 + 匹配 Content-Length", verifyFontBytes(ttf, { contentLength: ttf.length }).ok);
check("无 Content-Length（chunked）也接受", verifyFontBytes(ttf).ok);
check(
  "传输截断被拒绝",
  verifyFontBytes(ttf.subarray(0, 6), { contentLength: 8 }).ok === false &&
    /传输不完整/.test(verifyFontBytes(ttf.subarray(0, 6), { contentLength: 8 }).reason)
);
check("非字体字节被拒绝", verifyFontBytes(Buffer.from("<html>not a font</html>")).ok === false);
check("空响应被拒绝", verifyFontBytes(Buffer.alloc(0)).ok === false);

// ---- readFontMagic: 4-byte probe ----
const dir = mkdtempSync(join(tmpdir(), "pptd-font-file-"));
try {
  const p = join(dir, "a.ttf");
  writeFileSync(p, ttf);
  check("readFontMagic 读取 4 字节", isSfntMagic(readFontMagic(p)));
  check("readFontMagic 短文件返回 null", readFontMagic(join(dir, "short.ttf")) === null);
  writeFileSync(join(dir, "short.ttf"), Buffer.from([0x00]));
  check("readFontMagic 1 字节文件返回 null", readFontMagic(join(dir, "short.ttf")) === null);
  check("readFontMagic 不存在返回 null", readFontMagic(join(dir, "missing.ttf")) === null);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (fails.length) {
  console.error("✗ 字体文件校验回归失败：");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log(`字体文件校验：${pass} 项通过 ✅`);
