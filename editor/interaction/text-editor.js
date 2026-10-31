// ============================================================================
// interaction/text-editor.js — minimal text content dialog (editor-ux §4.1)
// ----------------------------------------------------------------------------
// Double-clicking a text element (or creating one and double-clicking) opens a
// light dialog. Kept fields: content (raw rich-text DSL / formulas, no WYSIWYG),
// font (font library / theme / system groups), size, horizontal + vertical
// alignment, color (every theme token + hex/alpha) and bold / italic.
// Removed with 3.0: line-height, letter-spacing, margin-top, highlight,
// text direction, style presets, auto-wrap, font-management entry.
//
// Transactions: the first commit snapshots (beginChange); close calls onDone
// which re-renders and ends the dialog session (one undo step per session).
// ============================================================================

import * as ui from "../ui.js";
import { showDialog } from "./dialogs/base.js";
import { themeSwatches } from "./fields.js";
import { resolveColor } from "../../packages/model/index.js";

const ALIGN_OPTIONS = [
  ["left", "左对齐"],
  ["center", "居中"],
  ["right", "右对齐"],
  ["justify", "两端对齐"],
  ["distributed", "分散对齐"],
];
const VALIGN_OPTIONS = [
  ["top", "顶部"],
  ["middle", "居中"],
  ["bottom", "底部"],
];
const SIZE_PRESETS = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

/**
 * Open the text content editor.
 * @param {object} el text element (model object)
 * @param {object} opts { theme, fontOptions, beginChange, onChange, onDone }
 *   theme: theme object or getter; fontOptions: () => [[value,label],…];
 *   beginChange: idempotent per-dialog snapshot; onChange: light repaint;
 *   onDone: session end (full render)
 */
export function openTextEditor(el, { theme, fontOptions, beginChange, onChange, onDone } = {}) {
  const themeOf = typeof theme === "function" ? theme : () => theme;
  const content = () => (el.content ||= {});
  /** Apply one edit: snapshot once per session, then mutate + light repaint. */
  const commit = (fn) => {
    beginChange?.();
    fn();
    onChange?.();
  };

  const body = document.createElement("div");
  body.className = "text-editor";

  // -- Content (raw DSL: <p>/<span>/<strong> and \(LaTeX\) survive round trips) --
  const gContent = ui.group("内容");
  gContent.appendChild(
    ui.field(
      "文字",
      ui.textInput(
        el.content?.text || "",
        (v) => commit(() => (content().text = v)),
        {
          rows: 6,
          placeholder: "文本内容… 支持 <p>/<strong>/<u> 标签与 \\(LaTeX\\) 公式",
        }
      )
    )
  );
  body.appendChild(gContent);

  // -- Typography: font / size / bold / italic --
  const gType = ui.group("字体与字号");
  const fontSel = ui.selectInput(fontOptions?.() || [["", "默认"]], el.content?.fontFamily || "", (v) =>
    commit(() => {
      if (v) content().fontFamily = v;
      else delete content().fontFamily;
    })
  );
  gType.appendChild(ui.field("字体", fontSel));

  const sizeRow = document.createElement("div");
  sizeRow.className = "prop-grid";
  const sizeInput = ui.numInput(el.content?.fontSize || 18, (v) => {
    if (v >= 6) commit(() => (content().fontSize = v));
  }, { min: 6, step: 1 });
  sizeRow.appendChild(ui.cell("字号", sizeInput));
  const sizeSel = ui.selectInput(
    [["", "常用档位"], ...SIZE_PRESETS.map((n) => [String(n), `${n}px`])],
    SIZE_PRESETS.includes(el.content?.fontSize) ? String(el.content.fontSize) : "",
    (v) => {
      if (!v) return;
      const n = Number(v);
      sizeInput.value = String(n);
      commit(() => (content().fontSize = n));
    }
  );
  sizeRow.appendChild(ui.cell("档位", sizeSel));
  gType.appendChild(sizeRow);

  const styleRow = document.createElement("div");
  styleRow.className = "prop-checks";
  styleRow.append(
    ui.checkbox("粗体", !!el.content?.bold, (v) => commit(() => (content().bold = v))),
    ui.checkbox("斜体", !!el.content?.italic, (v) => commit(() => (content().italic = v)))
  );
  gType.appendChild(styleRow);
  body.appendChild(gType);

  // -- Alignment: horizontal + vertical (TextContent.align = [h, v]) --
  const gAlign = ui.group("对齐");
  const alignRow = document.createElement("div");
  alignRow.className = "prop-grid";
  const alignNow = () => (Array.isArray(el.content?.align) ? el.content.align : ["left", "top"]);
  alignRow.appendChild(
    ui.cell(
      "水平",
      ui.selectInput(ALIGN_OPTIONS, alignNow()[0] || "left", (v) =>
        commit(() => (content().align = [v, alignNow()[1] || "top"]))
      )
    )
  );
  alignRow.appendChild(
    ui.cell(
      "垂直",
      ui.selectInput(VALIGN_OPTIONS, alignNow()[1] || "top", (v) =>
        commit(() => (content().align = [alignNow()[0] || "left", v]))
      )
    )
  );
  gAlign.appendChild(alignRow);
  body.appendChild(gAlign);

  // -- Color: every theme token (standard + custom) in the popover, hex/alpha in the input --
  const gColor = ui.group("颜色");
  gColor.appendChild(
    ui.field(
      "文字颜色",
      ui.colorField(el.content?.color || "$text", (v) => commit(() => (content().color = v)), {
        resolve: (val) => resolveColor(themeOf(), val),
        swatches: themeSwatches(themeOf()),
      })
    )
  );
  body.appendChild(gColor);

  const hint = document.createElement("div");
  hint.className = "prop-hint";
  hint.textContent = "粘贴富文本或 LaTeX 公式会原样保存；样式由主题与文字编辑器的字段决定。";
  body.appendChild(hint);

  const done = () => onDone?.();
  showDialog("文字编辑", body, { doneText: "完成", onDone: done, onClose: done });
}
