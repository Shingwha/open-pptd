// 扫描未使用的具名 import（按行匹配 import 语句；兼容 CRLF）
const fs = require("fs");
const files = process.argv.slice(2);
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split("\n").map((l) => l.replace(/\r$/, ""));
  const body = lines.filter((l) => !/^import\s/.test(l)).join("\n")
    .replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  for (const l of lines) {
    const m = l.match(/^import\s+\{([^}]+)\}\s+from\s+"([^"]+)";?$/);
    if (!m) continue;
    for (const n of m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp("\\b" + esc + "\\b").test(body)) console.log(f + ": UNUSED " + n + " (from " + m[2] + ")");
    }
  }
}
