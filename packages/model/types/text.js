// packages/model/types/text.js — text element type descriptor (manifest metadata).
// id/label/schema/layoutKey/contentEditor only; render/toXml live in the renderer/writer
// shards, content editor UI in the editor. Never imports style-spec.js (cycle).

export const textType = {
  id: "text",
  label: "文字",
  layoutKey: "text",
  contentEditor: true,
  schema(el) {
    // content = TextContent object (.text is rich text; YAML parses 01/2024 into a number, which is allowed)
    if (!el.content || typeof el.content !== "object" || el.content.text == null || String(el.content.text).trim() === "") {
      return [{ message: "text 元素缺 content.text（或为空）" }];
    }
    return [];
  },
};
