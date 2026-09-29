#!/usr/bin/env node
// ============================================================================
// handle-io.mjs — local project handle read/write regression (pure Node, mock handles)
// ----------------------------------------------------------------------------
// Every handle-io.js function depends only on the handle interface
// (getFileHandle/getDirectoryHandle/getFile/createWritable), so an in-memory mock
// covers it fully:
//   1. readProject: manifest + pages, missing-page tolerance, error when deck.pptd is absent
//   2. hasDeck light check
//   3. writeFiles: text / nested directories / base64 media write-back
//   4. fingerprint: stable, changes after a write (basis for the live-refresh poll)
// ============================================================================

import { readProject, hasDeck, writeFiles, fingerprint } from "../../editor/app/project/handle-io.js";

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// ---------------------------------------------------------------- in-memory mock handles
const notFound = () => Object.assign(new Error("NotFoundError"), { name: "NotFoundError", code: 8 });

class MockFile {
  constructor(name, content) {
    this.kind = "file";
    this.name = name;
    this._content = content;
    this.mtime = Date.now();
  }
  async getFile() {
    const content = this._content;
    const bytes = new TextEncoder().encode(content);
    return { text: async () => content, arrayBuffer: async () => bytes.buffer, lastModified: this.mtime, size: bytes.length };
  }
  async createWritable() {
    const chunks = [];
    const self = this;
    return {
      async write(chunk) {
        chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      },
      async close() {
        self._content = chunks.join("");
        self.mtime = Date.now();
      },
    };
  }
}

class MockDir {
  constructor(name) {
    this.kind = "directory";
    this.name = name;
    this.children = new Map();
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    const c = this.children.get(name);
    if (c) {
      if (c.kind !== "directory") throw new TypeError("not a directory");
      return c;
    }
    if (!create) throw notFound();
    const d = new MockDir(name);
    this.children.set(name, d);
    return d;
  }
  async getFileHandle(name, { create = false } = {}) {
    const c = this.children.get(name);
    if (c) {
      if (c.kind !== "file") throw new TypeError("not a file");
      return c;
    }
    if (!create) throw notFound();
    const f = new MockFile(name, "");
    this.children.set(name, f);
    return f;
  }
  async queryPermission() { return "granted"; }
  async requestPermission() { return "granted"; }
  async isSameEntry(other) { return other === this; }
}

/** Build a minimal project directory: deck.pptd + pages/1.page. */
function makeProject({ extraManifestPages = [] } = {}) {
  const dir = new MockDir("测试项目");
  const pageList = ["pages/1.page", ...extraManifestPages].map((p) => `  - ${p}`).join("\n");
  dir.children.set("deck.pptd", new MockFile("deck.pptd", `version: v2\ntitle: 句柄测试\nsize: [960, 540]\npages:\n${pageList}\n`));
  const pages = new MockDir("pages");
  pages.children.set("1.page", new MockFile("1.page", "pageType: content\nelements: []\n"));
  dir.children.set("pages", pages);
  return dir;
}

// ---------------------------------------------------------------- 1) readProject
{
  const dir = makeProject();
  const { manifestText, pageTexts, missing } = await readProject(dir);
  log("readProject 读 manifest + 页面", manifestText.includes("句柄测试") && pageTexts.get("pages/1.page")?.includes("pageType") && missing === 0);

  const dir2 = makeProject({ extraManifestPages: ["pages/2.page"] }); // listed in manifest but missing on disk
  const r2 = await readProject(dir2);
  log("readProject 缺页容忍（missing 计数）", r2.missing === 1 && r2.pageTexts.size === 1);

  const empty = new MockDir("空文件夹");
  let threw = false;
  try {
    await readProject(empty);
  } catch (err) {
    threw = err.message.includes("deck.pptd");
  }
  log("readProject 无 deck.pptd 报错", threw);

  log("hasDeck 轻校验", (await hasDeck(dir)) === true && (await hasDeck(empty)) === false);
}

// ---------------------------------------------------------------- 2) writeFiles
{
  const dir = makeProject();
  const b64 = btoa("hello"); // mimics persistDataUrlImages' {path, b64}
  const count = await writeFiles(dir, [
    { path: "deck.pptd", content: "version: v2\ntitle: 改后\npages:\n  - pages/1.page\n  - pages/9.page\n" },
    { path: "pages/9.page", content: "pageType: content\nelements: []\n" }, // nested directory already exists
    { path: "media/img.png", content: null, b64 }, // nested directory absent + binary
  ]);
  const manifest = await dir.children.get("deck.pptd").getFile();
  const imgFile = await dir.children.get("media").children.get("img.png").getFile();
  log("writeFiles 写回（文本/嵌套/base64）", count === 3 && (await manifest.text()).includes("改后") && (await imgFile.text()) === "hello");
}

// ---------------------------------------------------------------- 3) fingerprint
{
  const dir = makeProject();
  const fp1 = await fingerprint(dir);
  const fp2 = await fingerprint(dir);
  log("fingerprint 稳定", fp1 === fp2 && fp1.startsWith("deck|"));

  await writeFiles(dir, [{ path: "pages/1.page", content: "pageType: cover\n" }]);
  const fp3 = await fingerprint(dir);
  log("fingerprint 写入后变化", fp3 !== fp1);

  const empty = new MockDir("空");
  log("fingerprint 无项目降级", (await fingerprint(empty)) === "no-deck");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
