#!/usr/bin/env node
// tests/regression/save-atomic.mjs — atomic save + revision conflicts.
// 1. server /api/save: stale expectedRevision → 409 ERR_REVISION_CONFLICT with currentRevision;
//    success returns the new revision; nothing is written on 409.
// 2. server atomic batch: a rename failure restores written files, never half-writes the manifest.
// 3. memorySource / directoryHandleSource revision updates; writeFiles rolls back the written prefix.
// Pure Node (mock File System Access handles); run: node tests/regression/save-atomic.mjs

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../packages/server/index.js";
import { projectRevision } from "../../packages/runtime/index.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

const tmpRoot = mkdtempSync(join(tmpdir(), "pptd-save-atomic-"));

// Helpers.
function diskProject(dir, { title = "初始", page = "pageType: content\nelements: []\n" } = {}) {
  mkdirSync(join(dir, "pages"), { recursive: true });
  writeFileSync(
    join(dir, "deck.pptd"),
    `version: v2\ntitle: ${title}\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n`
  );
  writeFileSync(join(dir, "pages", "1.page"), page);
  writeFileSync(join(dir, "pages", "2.page"), page);
}

function diskRevision(dir) {
  const manifestText = readFileSync(join(dir, "deck.pptd"), "utf8");
  const pageFiles = new Map();
  for (const rel of ["pages/1.page", "pages/2.page"]) {
    try {
      pageFiles.set(rel, readFileSync(join(dir, rel), "utf8"));
    } catch {
      /* absent page */
    }
  }
  return projectRevision({ manifestText, pageFiles });
}

// 1+2) server /api/save: 409 + atomic rollback + success revision.
{
  const dir = join(tmpRoot, "server");
  diskProject(dir);
  const server = await startServer({ port: 0, projectRoot: dir, liveReload: false });
  const base = `http://127.0.0.1:${server.address().port}`;
  const saveUrl = `${base}/api/save`;
  const manifest = `version: v2\ntitle: 新标题\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n`;
  const page1 = "pageType: cover\nelements: []\n";
  try {
    const initialRevision = diskRevision(dir);
    const stale = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [
          { path: "deck.pptd", content: manifest },
          { path: "pages/1.page", content: page1 },
        ],
        expectedRevision: "rev-stale",
      }),
    });
    const staleBody = await stale.json();
    check(
      "server 409 冲突码与 currentRevision",
      stale.status === 409 &&
        staleBody?.ok === false &&
        staleBody?.error?.code === "ERR_REVISION_CONFLICT" &&
        staleBody?.error?.currentRevision === initialRevision,
      JSON.stringify({ status: stale.status, code: staleBody?.error?.code })
    );
    check(
      "server 409 不写盘",
      readFileSync(join(dir, "deck.pptd"), "utf8").includes("初始") &&
        readFileSync(join(dir, "pages", "1.page"), "utf8") !== page1
    );

    const ok = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [
          { path: "deck.pptd", content: manifest },
          { path: "pages/1.page", content: page1 },
        ],
        expectedRevision: initialRevision,
      }),
    });
    const okBody = await ok.json();
    check(
      "server 保存成功返回新 revision",
      ok.status === 200 && okBody?.ok === true && typeof okBody.revision === "string" && okBody.revision !== initialRevision,
      JSON.stringify({ status: ok.status, count: okBody?.count })
    );
    check("server opening files written", readFileSync(join(dir, "pages", "1.page"), "utf8") === page1);
    check("server new revision matches disk", okBody.revision === diskRevision(dir));

    // ---- atomic failure: pages/2.page is a directory → its rename must fail ----
    const beforeManifest = readFileSync(join(dir, "deck.pptd"), "utf8");
    const beforePage1 = readFileSync(join(dir, "pages", "1.page"), "utf8");
    const badPage2 = join(dir, "pages", "2.page");
    rmSync(badPage2, { force: true });
    mkdirSync(badPage2);
    const fail = await fetch(saveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [
          { path: "pages/1.page", content: "pageType: content\nelements: [{bad: true}]\n" },
          { path: "pages/2.page", content: "pageType: content\nelements: []\n" },
          { path: "deck.pptd", content: "version: v2\ntitle: 半写\ndraft\n" },
        ],
        // unconditional write: the pages/2.page directory also changes the on-disk
        // revision, so this test focuses on the atomic rollback path
      }),
    });
    const failBody = await fail.json().catch(() => ({}));
    check("server 失败返回 500", fail.status === 500 && failBody?.ok === false, JSON.stringify({ status: fail.status }));
    check("server 失败回滚已写页", readFileSync(join(dir, "pages", "1.page"), "utf8") === beforePage1);
    check("server 失败未写 manifest", readFileSync(join(dir, "deck.pptd"), "utf8") === beforeManifest);
    check(
      "server 失败无 tmp 残留",
      !readdirNames(join(dir, "pages")).some((n) => n.endsWith(".tmp"))
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function readdirNames(dir) {
  try {
    return [...readdirSync(dir)];
  } catch {
    return [];
  }
}

// 3) editor memorySource: conflict + success revision.
{
  const { memorySource } = await import("../../editor/app/project/source.js");
  const source = memorySource({
    files: {
      "deck.pptd": "version: v2\ntitle: 内存\npages:\n  - pages/1.page\n",
      "pages/1.page": "pageType: content\nelements: []\n",
    },
  });
  const first = await source.read();
  check("memorySource read 返回 revision", typeof first.revision === "string" && first.revision.startsWith("rev-"));
  await source.write([{ path: "pages/1.page", text: "pageType: cover\nelements: []\n" }]);
  let conflict = null;
  try {
    await source.write([{ path: "pages/1.page", text: "pageType: content\nelements: []\n" }], {
      expectedRevision: first.revision,
    });
  } catch (err) {
    conflict = err;
  }
  check(
    "memorySource 冲突抛 RevisionConflictError",
    conflict?.code === "ERR_REVISION_CONFLICT" && conflict?.currentRevision === source.lastRevision
  );
  const second = await source.read();
  const count = await source.write([{ path: "pages/1.page", text: "pageType: section\nelements: []\n" }], {
    expectedRevision: second.revision,
  });
  const third = await source.read();
  check(
    "memorySource 成功后 revision 更新",
    count === 1 && third.revision !== second.revision && source.lastRevision === third.revision
  );
}

// 4+5) directoryHandleSource + handle-io.writeFiles (mock File System Access).
const notFound = () => Object.assign(new Error("NotFoundError"), { name: "NotFoundError", code: 8 });

class MockFile {
  constructor(name, content = "", { failClose = false } = {}) {
    this.kind = "file";
    this.name = name;
    this._content = content;
    this.failClose = failClose;
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
        if (self.failClose) throw new Error(`模拟写入失败: ${self.name}`);
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
    const f = new MockFile(name);
    this.children.set(name, f);
    return f;
  }
  async removeEntry(name) {
    if (!this.children.has(name)) throw notFound();
    this.children.delete(name);
  }
  async queryPermission() {
    return "granted";
  }
  async requestPermission() {
    return "granted";
  }
}

function mockProject(title = "句柄", extra = {}) {
  const dir = new MockDir("项目");
  dir.children.set(
    "deck.pptd",
    new MockFile("deck.pptd", `version: v2\ntitle: ${title}\nsize: [960, 540]\npages:\n  - pages/1.page\n`)
  );
  const pages = new MockDir("pages");
  pages.children.set("1.page", new MockFile("1.page", "pageType: content\nelements: []\n", extra));
  dir.children.set("pages", pages);
  return dir;
}

{
  const { directoryHandleSource } = await import("../../editor/app/project/source.js");
  const dir = mockProject();
  const source = directoryHandleSource(dir);
  const first = await source.read();
  check("directoryHandle read 返回 revision", typeof first.revision === "string" && first.revision.startsWith("rev-"));

  dir.children.get("pages").children.get("1.page")._content = "pageType: section\nelements: []\n"; // external edit
  let conflict = null;
  try {
    await source.write([{ path: "pages/1.page", text: "pageType: cover\nelements: []\n" }], {
      expectedRevision: first.revision,
    });
  } catch (err) {
    conflict = err;
  }
  check(
    "directoryHandle 冲突抛 RevisionConflictError",
    conflict?.code === "ERR_REVISION_CONFLICT" && typeof conflict?.currentRevision === "string"
  );

  const second = await source.read();
  const count = await source.write([{ path: "pages/1.page", text: "pageType: cover\nelements: []\n" }], {
    expectedRevision: second.revision,
  });
  const third = await source.read();
  check(
    "directoryHandle 成功后 revision 更新",
    count === 1 && third.revision !== second.revision && source.lastRevision === third.revision
  );
}

{
  const { writeFiles } = await import("../../editor/app/project/handle-io.js");
  const dir = mockProject("回滚");
  const beforeDeck = dir.children.get("deck.pptd")._content;
  const beforePage = dir.children.get("pages").children.get("1.page")._content;
  // page1 closes fine, page2 fails on close → prefix (deck/page1/page2) must restore
  dir.children.get("pages").children.set("2.page", new MockFile("2.page", "old-2", { failClose: true }));
  let threw = null;
  try {
    await writeFiles(dir, [
      { path: "deck.pptd", content: "version: v2\ntitle: 半写\n" },
      { path: "pages/1.page", content: "pageType: cover\nelements: []\n" },
      { path: "pages/2.page", content: "new-2" },
    ]);
  } catch (err) {
    threw = err;
  }
  check("writeFiles 失败抛出", !!threw);
  check("writeFiles 回滚 manifest", dir.children.get("deck.pptd")._content === beforeDeck);
  check("writeFiles 回滚已写页", dir.children.get("pages").children.get("1.page")._content === beforePage);
  check("writeFiles 回滚失败页", dir.children.get("pages").children.get("2.page")._content === "old-2");
}

try {
  rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  /* cleanup failure does not change the result */
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
