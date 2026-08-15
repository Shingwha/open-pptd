#!/usr/bin/env node
// ============================================================================
// export-media.mjs — 项目包图片完整性回归
// ----------------------------------------------------------------------------
// 修复回归：保存过一次后图片元素引用 media/ 相对路径（非 data:），导出 zip /
// 部署模式 zip 保存必须按 imageMap 里的 dataURL 补齐字节，否则包里缺 media/。
// 覆盖：
//   1. mediaFilesOfDeck（导出 zip 用）：内嵌 dataURL + 已落盘化相对路径 两类都出文件
//   2. persistDataUrlImages（保存/zip 保存用）：同上，且重写内嵌 src / 更新映射
// ============================================================================

import { mediaFilesOfDeck, createImageStore } from "../editor/app/project/images.js";

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
          { elementId: "img-new", elementType: "image", src: PNG_A }, // 刚上传（内嵌）
          { elementId: "img-old", elementType: "image", src: "media/img-old.png" }, // 保存过（相对路径）
          { elementId: "txt", elementType: "text", src: "media/nope.png" }, // 非图片元素不受影响
        ],
      },
    ],
  };
}

// 1) 导出 zip 路径（快照 + imageMap）
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
  const files = mediaFilesOfDeck(sampleDeck(), {}); // imageMap 缺失：只出内嵌那张
  log("导出：imageMap 缺失时仅内嵌图", files.length === 1 && files[0].path === "media/img-new.png");
}

// 2) 保存路径（createImageStore 真实实现）
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
