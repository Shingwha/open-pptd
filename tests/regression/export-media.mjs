#!/usr/bin/env node
// ============================================================================
// export-media.mjs — project package image integrity regression
// ----------------------------------------------------------------------------
// After a project has been saved once, image elements reference media/ relative
// paths (not data:). Export zip / deploy zip must therefore complete the bytes from
// the imageMap's dataURL, otherwise media/ is missing from the package.
// Covers:
//   1. mediaFilesOfDeck (export / zip): both embedded dataURL and persisted relative paths emit a file
//   2. persistDataUrlImages (save / zip save): same, plus rewriting embedded src and updating the map
// ============================================================================

import { mediaFilesOfDeck, createImageStore } from "../../editor/app/project/images.js";

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

const PNG_A = `data:image/png;base64,${btoa("picture-a")}`;
const PNG_B = `data:image/png;base64,${btoa("picture-b")}`;

function sampleDeck() {
  return {
    pages: [
      {
        elements: [
          { elementId: "img-new", elementType: "image", src: PNG_A }, // freshly uploaded (embedded)
          { elementId: "img-old", elementType: "image", src: "media/img-old.png" }, // already saved (relative path)
          { elementId: "txt", elementType: "text", src: "media/nope.png" }, // non-image element is unaffected
        ],
      },
    ],
  };
}

// 1) Export / zip path (snapshot + imageMap)
{
  const snapshot = sampleDeck();
  const files = mediaFilesOfDeck(snapshot, { "media/img-old.png": PNG_B });
  const paths = files.map((f) => f.path).sort();
  log("导出：内嵌 + 相对路径都进包", JSON.stringify(paths) === JSON.stringify(["media/img-new.png", "media/img-old.png"]), paths.join(", "));
  log("导出：内嵌 src 重写为 media 路径", snapshot.pages[0].elements[0].src === "media/img-new.png");
  log("导出：相对路径 src 保持", snapshot.pages[0].elements[1].src === "media/img-old.png");
  log("导出：字节正确", atob(files.find((f) => f.path === "media/img-old.png").b64) === "picture-b");
}
{
  const files = mediaFilesOfDeck(sampleDeck(), {}); // imageMap missing: only the embedded one is emitted
  log("导出：imageMap 缺失时仅内嵌图", files.length === 1 && files[0].path === "media/img-new.png");
}

// 2) Save path (real createImageStore implementation)
{
  const state = { deck: sampleDeck(), imageMap: { "media/img-old.png": PNG_B } };
  const images = createImageStore(state);
  const files = images.persistDataUrlImages();
  const paths = files.map((f) => f.path).sort();
  log("保存：两类图片都有文件条目", JSON.stringify(paths) === JSON.stringify(["media/img-new.png", "media/img-old.png"]), paths.join(", "));
  log("保存：内嵌 src 重写 + 预览映射更新", state.deck.pages[0].elements[0].src === "media/img-new.png" && state.imageMap["media/img-new.png"] === PNG_A);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
