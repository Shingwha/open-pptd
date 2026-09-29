// ============================================================================
// app/shot.js — 无头截图模式（?shot=1，open-pptd render 使用）
// ----------------------------------------------------------------------------
// 跳过全部编辑器 UI，把每页直接绘制进一个 deck 自身尺寸的裸容器（size 缺省
// 960×540）——与编辑器预览同一条绘制管线（layout → renderer/page.js paintPage +
// 同一份字体文件 + 同一 imageMap）。
// 对外契约（供 packages/renderer/headless/shoot.js 的 CDP 驱动）：
//   window.__pptdShot = { count, goto(index), width, height }
//   window.pptdReady("ready")   = 当前页绘制完成、画面稳定，可截图
//                                （CDP Runtime.addBinding 注入；非 CDP 环境自动跳过）
//   window.pptdReady("error")   = 初始化失败
//   document.title === "PPTD_READY" / "PPTD_ERROR" 保留为可观测量（人工/走查用）
// 正常打开编辑器（无 ?shot=1 参数）时本模块不会被加载。
// ============================================================================

import { createEditorState } from "./state.js";
import { createIo } from "./project/io.js";
import { httpSource } from "./project/source.js";
import { SHOT_READY_TITLE, deckSize } from "../../packages/model/index.js";
import { renderPage } from "../../packages/renderer/index.js";

export const READY_TITLE = SHOT_READY_TITLE;

// CDP 就绪绑定名（与 packages/renderer/headless/cdp.js 的 READY_BINDING 同名约定；
// 此处不得 import headless 模块——那是 Node 专用链路）。
const READY_BINDING = "pptdReady";

/** 触发 CDP 就绪事件（addBinding 注入的全局函数；非 CDP 环境不存在 → 静默跳过）。 */
function notifyReady(payload = "ready") {
  try {
    if (typeof window[READY_BINDING] === "function") window[READY_BINDING](payload);
  } catch {
    /* 绑定不可用（手动打开 ?shot=1）：仅靠 document.title 观测 */
  }
}

export async function initShot(deckUrl) {
  try {
    return await runShot(deckUrl);
  } catch (err) {
    notifyReady("error");
    throw err;
  }
}

async function runShot(deckUrl) {
  if (!deckUrl) throw new Error("shot 模式需要 ?deck= 参数");
  document.documentElement.classList.add("shot-mode");

  // 最小装配：state + io（仅用加载/字体/图片管线；view 用空桩，UI 全部隐藏。
  // refreshPage 为 finishLoad 渐进加载所调用，桩上必须存在）
  const { state } = createEditorState();
  // 只读单源：截图模式固定走 HTTP（loadDeck 传入 deckUrl 作为读取 hint）
  const io = createIo({ state, view: { render() {}, refreshPage() {} }, source: httpSource({}) });

  const root = document.createElement("div");
  root.id = "shot-root";
  document.body.appendChild(root);
  root.style.cssText = "position:fixed;left:0;top:0;overflow:hidden;background:#fff;";

  /** 绘制一页并等待画面稳定：字体就绪 + 图片解码 + 双 rAF（图表 animation:false 同步绘制）。 */
  async function render(index) {
    const page = state.deck.pages[index];
    renderPage(root, page, state.deck, state.theme, { imageMap: state.imageMap, iconMap: state.iconMap });
    const imgs = [...root.querySelectorAll("img")];
    await Promise.all([
      document.fonts.ready,
      ...imgs.map((img) =>
        img.complete && img.naturalWidth > 0 ? Promise.resolve() : img.decode().catch(() => {})
      ),
    ]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function goto(index) {
    const i = Math.max(0, Math.min(state.deck.pages.length - 1, index));
    await render(i);
    document.title = READY_TITLE;
    notifyReady("ready"); // CDP 就绪事件（替代 title 轮询）
    return i;
  }

  await io.loadDeck(deckUrl, { silent: true });
  // 容器 = deck 自身尺寸（size 缺省/非法时回退 960×540），支持任意画布比例（如 3:4 海报）
  const [deckW, deckH] = deckSize(state.deck);
  root.style.width = `${deckW}px`;
  root.style.height = `${deckH}px`;
  window.__pptdShot = { count: state.deck.pages.length, goto, width: deckW, height: deckH };
  await goto(0); // 首页就绪后 CDP 才开始逐页驱动
}
