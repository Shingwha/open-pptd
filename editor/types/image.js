// editor/types/image.js — image element UI boundary (local picking + create)
// PPT export only supports PNG / JPEG / GIF; the picker rejects other formats before
// any element is written. Save/export persists the inline dataURL through the single
// media seam (app/project/images.js persistDataUrlImages) — no second copy of that logic.

import { svgIcon } from "../ui.js";
import { nextElementId, registerType } from "../../packages/model/index.js";

/** MIME types PowerPoint packages reliably (SVG/WebP corrupt the export). */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/jpg"]);
const ACCEPT = ".png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif";
const UNSUPPORTED = "仅支持 PNG / JPG / GIF 图片（PPT 兼容格式）";

/** Default image model: fixed 320×200 box, complete picture visible (contain). */
function createImage(src, opts = {}) {
  if (!src) return null;
  const w = Number.isFinite(opts.w) && opts.w > 0 ? opts.w : 320;
  const h = Number.isFinite(opts.h) && opts.h > 0 ? opts.h : 200;
  return {
    elementId: nextElementId("image"),
    elementType: "image",
    src,
    bounds: [330, 160, w, h],
    fit: { mode: "contain" },
  };
}

/** Format gate: the declared MIME decides; an empty MIME falls back to the file extension. */
function isSupportedImage(file) {
  if (IMAGE_TYPES.has(file.type)) return true;
  return !file.type && /\.(png|jpe?g|gif)$/i.test(file.name || "");
}

function notifyUnsupported(ui) {
  if (ui?.toast?.show) ui.toast.show(UNSUPPORTED, "danger");
  else if (ui?.dialogs?.alert) ui.dialogs.alert(UNSUPPORTED);
  else console.warn(`[image] ${UNSUPPORTED}`);
}

/**
 * Local image picking (browser only). Reads a supported file as a dataURL and adds it
 * through `api.addImage`; unsupported formats only show a notice (no half element).
 * @param {{api: object, ui?: object}} deps editor api + instance ui services
 * @returns {boolean} whether the picker was opened
 */
export function pickLocalImage({ api, ui } = {}) {
  if (typeof document === "undefined" || !api?.addImage) return false;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ACCEPT;
  input.hidden = true;
  const cleanup = () => input.remove();
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) {
      cleanup();
      return;
    }
    if (!isSupportedImage(file)) {
      notifyUnsupported(ui);
      cleanup();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      cleanup();
      if (typeof reader.result === "string" && reader.result.startsWith("data:image/")) {
        api.addImage(reader.result);
      } else {
        ui?.toast?.show("图片读取失败", "danger");
      }
    };
    reader.onerror = () => {
      cleanup();
      ui?.toast?.show(`图片读取失败: ${reader.error?.message || "未知错误"}`, "danger");
    };
    reader.readAsDataURL(file);
  });
  input.addEventListener("cancel", cleanup, { once: true });
  (document.body || document.documentElement).appendChild(input);
  input.click();
  return true;
}

registerType({
  type: "image",
  label: "图片",
  addIcon: svgIcon(
    '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-4 3.5 3 3.5-4 2 2"/>'
  ),
  addHint: "本地 PNG / JPG / GIF",
  create: createImage,
});
