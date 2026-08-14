// ============================================================================
// app/view/zoom-ctl.js — 缩放控件拖拽换位
// ----------------------------------------------------------------------------
// 默认停靠画布底部中央（styles.css 的 left:50%/bottom 定位）；拖动控件空白处
// （含百分比标签）可移到舞台任意位置，避免遮挡画布内容。
// 位置按舞台宽高比例存 localStorage（跨窗口尺寸 / 设备恢复都合理），并始终
// clamp 在舞台内不会丢失；双击百分比标签恢复默认停靠位。
// ============================================================================

const POS_KEY = "pptd.zoomCtlPos";

export function makeZoomCtlDraggable(stage, ctl) {
  if (!stage || !ctl) return;

  /** 设置为显式坐标定位（接管 CSS 停靠样式），并 clamp 进舞台保持完整可见。 */
  function place(left, top) {
    const x = Math.min(stage.clientWidth - ctl.offsetWidth, Math.max(0, left));
    const y = Math.min(stage.clientHeight - ctl.offsetHeight, Math.max(0, top));
    ctl.style.left = `${x}px`;
    ctl.style.top = `${y}px`;
    ctl.style.right = "auto";
    ctl.style.bottom = "auto";
    ctl.style.transform = "none";
    ctl.classList.add("docked");
  }

  function save() {
    const r = ctl.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    try {
      localStorage.setItem(
        POS_KEY,
        JSON.stringify({
          fx: (r.left - s.left) / Math.max(1, s.width),
          fy: (r.top - s.top) / Math.max(1, s.height),
        })
      );
    } catch {
      /* 隐私模式等写入失败忽略 */
    }
  }

  // 恢复上次位置（比例 × 当前舞台尺寸，再 clamp）
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy)) {
      place(saved.fx * stage.clientWidth, saved.fy * stage.clientHeight);
    }
  } catch {
    /* 损坏数据忽略 */
  }

  ctl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return; // 缩放按钮：正常点击，不进入拖拽
    const s = stage.getBoundingClientRect();
    const r = ctl.getBoundingClientRect();
    const offX = e.clientX - r.left;
    const offY = e.clientY - r.top;
    // 首次拖动：从停靠样式（left:50% + translateX(-50%) + bottom）切换为显式坐标
    place(r.left - s.left, r.top - s.top);
    ctl.classList.add("dragging");
    try {
      ctl.setPointerCapture(e.pointerId);
    } catch {
      /* 捕获失败仍可用窗口级 move 兜底，忽略 */
    }
    e.preventDefault(); // 阻止文本选择
    const onMove = (ev) => {
      place(ev.clientX - s.left - offX, ev.clientY - s.top - offY);
    };
    const onUp = () => {
      ctl.classList.remove("dragging");
      ctl.removeEventListener("pointermove", onMove);
      ctl.removeEventListener("pointerup", onUp);
      ctl.removeEventListener("pointercancel", onUp);
      save();
    };
    ctl.addEventListener("pointermove", onMove);
    ctl.addEventListener("pointerup", onUp);
    ctl.addEventListener("pointercancel", onUp);
  });

  // 双击百分比标签：恢复默认停靠（画布底部中央）
  ctl.querySelector(".zoom-label")?.addEventListener("dblclick", () => {
    ctl.style.left = "";
    ctl.style.top = "";
    ctl.style.right = "";
    ctl.style.bottom = "";
    ctl.style.transform = "";
    ctl.classList.remove("docked");
    try {
      localStorage.removeItem(POS_KEY);
    } catch {
      /* 忽略 */
    }
  });

  // 窗口尺寸变化：自定义位置重新 clamp 进舞台（停靠态不动）
  window.addEventListener("resize", () => {
    if (!ctl.classList.contains("docked")) return;
    const r = ctl.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    place(r.left - s.left, r.top - s.top);
  });
}
