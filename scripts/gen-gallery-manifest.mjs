#!/usr/bin/env node
// scripts/gen-gallery-manifest.mjs — write examples/manifest.json for the static Pages build.
// Scans examples/ with the same server/gallery.js scanner the local Home uses.
// Usage: node scripts/gen-gallery-manifest.mjs [examplesDir]

import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "../packages/server/gallery.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const examplesDir = process.argv[2] ? resolve(process.argv[2]) : join(root, "examples");

const manifest = buildManifest(examplesDir);
const out = join(examplesDir, "manifest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`✓ 已生成 ${out}（${manifest.entries.length} 套）`);
for (const e of manifest.entries) {
  console.log(`  · ${e.id}  ${e.title}（${e.pages} 页${e.tags.length ? " · " + e.tags.join("/") : ""}）`);
}
