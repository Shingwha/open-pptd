// ============================================================================
// tests/regression/icon.mjs — 图标回归（Font Awesome Free，SVG 嵌入，预览=导出同源）
// ----------------------------------------------------------------------------
// 数据：tests/fixtures/icons/<style>/*.svg（vendor 的 FA SVG，git 跟踪，CI 离线确定）；
//       解析走 assets/icons/registry.json（元数据入库）。
// 覆盖：解析（三前缀/别名/bs: 已移除）、SVG 归一化（剥注释/currentColor）、
//       fill 注入（solid/HEX8/线性/径向/三停渐变）、宽 viewBox、导出结构
//       （media 计数 / svgBlip 官方 ext / rels / Content_Types）、未知图标跳过聚合。
// 运行：node tests/regression/icon.mjs
// ============================================================================

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadIconRegistry, resolveIconName, normalizeIconSvg, STYLE_DIRS } from "../../packages/model/icon-fa.js";
import { iconSvgBody, iconToSvg, normalizeIconFill } from "../../packages/model/icon-svg.js";
import { loadIconDefs } from "../../packages/writer/icon.js";
import { buildPptx } from "../../packages/writer/pptx.js";
import { DEFAULT_THEME } from "../../packages/model/theme.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const FIXTURE_DIR = join(__dirname, "..", "fixtures", "icons");
const ICON_LIB_DIR = join(ROOT, "assets", "icons");

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

const registry = JSON.parse(readFileSync(join(ICON_LIB_DIR, "registry.json"), "utf8"));

/** fixture 解析：loadIconDefs 的 loadIconSvg 注入（vendor 包直读）。 */
const loadFixtureSvg = async (hit) => {
  try {
    return readFileSync(join(FIXTURE_DIR, hit.dir, `${hit.name}.svg`), "utf8");
  } catch {
    return null;
  }
};

console.log("== 1. 注册表与解析（三前缀 / 别名 / 移除的命名空间） ==");
ok(registry.counts.fas > 1000 && registry.counts.far > 100 && registry.counts.fab > 300,
  `registry 计数合理（fas ${registry.counts.fas} / far ${registry.counts.far} / fab ${registry.counts.fab}）`);
ok(String(registry.faVersion).startsWith("7."), `FA 版本 ${registry.faVersion}`);
ok(resolveIconName("fas:house", registry)?.name === "house", "fas:house → house");
ok(resolveIconName("fas:home", registry)?.name === "house", "别名 home → house");
ok(resolveIconName("fab:github", registry)?.dir === "brands", "fab:github → brands 目录");
ok(resolveIconName("far:rocket", registry) === null, "far:rocket → null（免费库无 regular 样式）");
ok(resolveIconName("fas:nonexistent-xyz", registry) === null, "未知名 → null");
ok(resolveIconName("bs:check", registry) === null, "bs:check → null（bs: 命名空间已移除）");
ok(resolveIconName("house", registry) === null, "无前缀 → null");
ok(resolveIconName("fas:", registry) === null, "空前缀名 → null");

console.log("== 2. SVG 归一化（剥注释 / currentColor / viewBox） ==");
{
  const text = readFileSync(join(FIXTURE_DIR, "solid", "arrows-left-right.svg"), "utf8");
  const def = normalizeIconSvg(text, { w: 576, h: 512 });
  ok(def.w >= 576 && def.h >= 512, `宽图标 viewBox 覆盖声明框（${def.w}×${def.h}，越界自动扩展）`);
  ok(!def.inner.includes("<!--"), "版权注释已剥除");
  ok(!def.inner.includes("currentColor"), "fill=currentColor 已剥除");
  ok(def.inner.includes("<path"), "path 保留");
  const noMeta = normalizeIconSvg(text, null);
  ok(noMeta && noMeta.w >= 576, "无 hit 时从 viewBox 文本回退解析（含扩展）");
  ok(normalizeIconSvg("<not-svg/>", null) === null, "非 SVG → null");
  // 内容越界扩展：FA fire 路径 y 从 -26.4 起，viewBox 必须扩到完全包含（否则尖端被裁）
  const fire = normalizeIconSvg(readFileSync(join(FIXTURE_DIR, "solid", "fire.svg"), "utf8"), { w: 448, h: 512 });
  ok(fire.vy < 0 && fire.h > 512 && fire.vx === 0, `fire 越界扩展（vy=${fire.vy}, h=${fire.h}）`);
  const houseVb = normalizeIconSvg(readFileSync(join(FIXTURE_DIR, "solid", "house.svg"), "utf8"), { w: 512, h: 512 });
  ok(houseVb.vx === 0 && houseVb.vy === 0 && houseVb.w === 512 && houseVb.h === 512, "未越界图标保持声明框");
}

console.log("== 3. fill 注入（solid / HEX8 / 渐变） ==");
{
  const def = normalizeIconSvg(readFileSync(join(FIXTURE_DIR, "solid", "house.svg"), "utf8"), { w: 512, h: 512 });
  const solid = normalizeIconFill(DEFAULT_THEME, "$primary");
  ok(iconSvgBody(def, solid).includes(`fill="${DEFAULT_THEME.colors.primary}"`), "solid：主题令牌解析注入");
  const hex8 = normalizeIconFill(DEFAULT_THEME, { type: "solid", color: "#DC262699" });
  ok(iconSvgBody(def, hex8).includes('fill="#DC262699"'), "HEX8 透明度保留");
  const grad = normalizeIconFill(DEFAULT_THEME, {
    type: "gradient", gradientType: "linear", angle: 45,
    stops: [{ position: 0, color: "$primary" }, { position: 1, color: "$accent" }],
  });
  const gradBody = iconSvgBody(def, grad, "g1");
  ok(gradBody.includes('<linearGradient id="g1"') && gradBody.includes('fill="url(#g1)"'), "线性渐变 defs + url 引用");
  const rad = iconSvgBody(def, normalizeIconFill(DEFAULT_THEME, {
    type: "gradient", gradientType: "radial",
    stops: [{ position: 0, color: "#FFFFFF" }, { position: 1, color: "#2563EB" }],
  }), "g2");
  ok(rad.includes('<radialGradient id="g2"') && rad.includes('cx="50%"'), "径向渐变");
  const three = iconSvgBody(def, normalizeIconFill(DEFAULT_THEME, {
    type: "gradient", gradientType: "linear", angle: 0,
    stops: [{ position: 0, color: "#111111" }, { position: 0.5, color: "#222222" }, { position: 1, color: "#333333" }],
  }), "g3");
  ok((three.match(/<stop /g) || []).length === 3, "三停渐变 stop 数");
}

console.log("== 4. 预览 = 导出（同一 iconSvgBody 同源） ==");
{
  const def = normalizeIconSvg(readFileSync(join(FIXTURE_DIR, "brands", "github.svg"), "utf8"), { w: 512, h: 512 });
  const fill = normalizeIconFill(DEFAULT_THEME, { type: "solid", color: "#1F2937" });
  const file = iconToSvg(def, fill);
  ok(file.startsWith('<svg viewBox="0 0 512 512"') && file.trimEnd().endsWith("</svg>"), "iconToSvg 完整文件（自身 viewBox）");
  ok(file.includes(iconSvgBody(def, fill)), "文件体 = 预览 body（同源）");
}

console.log("== 5. loadIconDefs（vendor 集合 / 编辑器预读缓存优先） ==");
{
  const icons = ["fas:house", "fas:home", "fab:github", "far:heart", "fas:arrows-left-right"];
  const deck = { pages: [{ elements: icons.map((n, i) => ({ elementId: `e${i}`, elementType: "icon", iconName: n, bounds: [0, 0, 10, 10] })) }] };
  const r = await loadIconDefs(deck, { iconRegistry: registry, loadIconSvg: loadFixtureSvg });
  ok(r.defs.size === 5 && r.skipped.length === 0, "5 个名字全部命中（含别名 home）");
  ok(r.defs.get("fas:home").inner === r.defs.get("fas:house").inner, "别名与主名共享同一 def");
  ok(r.defs.get("fas:arrows-left-right").w >= 576, "宽图标 w ≥ 576（含越界扩展）");
  // 编辑器预读缓存（iconDefs）优先：loadIconSvg 不可达也能命中
  const r2 = await loadIconDefs(deck, { iconRegistry: registry, loadIconSvg: async () => null, iconDefs: Object.fromEntries(r.defs) });
  ok(r2.defs.size === 5 && r2.skipped.length === 0, "iconDefs 预读缓存直接命中");
}

console.log("== 6. buildPptx 全量导出（fixture 页） ==");
{
  // 收集 fixture 全集：<style>/<name>.svg
  const icons = [];
  for (const style of Object.keys(STYLE_DIRS)) {
    for (const f of readdirSync(join(FIXTURE_DIR, STYLE_DIRS[style]))) {
      if (f.endsWith(".svg")) icons.push(`${style}:${f.replace(/\.svg$/, "")}`);
    }
  }
  ok(icons.length >= 20, `fixture 集合 ${icons.length} 个（fas/far/fab 三风格）`);

  const pages = [{
    elements: icons.map((iconName, i) => ({
      elementId: `ic-${i}`,
      elementType: "icon",
      iconName,
      bounds: [(i % 10) * 90 + 20, Math.floor(i / 10) * 90 + 20, 56, 56],
      fill: { type: "solid", color: i % 2 ? "#2563EB" : "$text" },
    })),
  }];
  const deck = { title: "icon-regression", size: [960, 540], theme: DEFAULT_THEME, fonts: {}, pages };
  const skippedByCb = [];
  const bytes = await buildPptx(deck, {
    iconRegistry: registry,
    loadIconSvg: loadFixtureSvg,
    onIconSkipped: (list) => skippedByCb.push(...list),
  });
  ok(bytes.length > 10000 && skippedByCb.length === 0, `PPTX 生成（${(bytes.length / 1024).toFixed(0)}KB），零跳过`);

  // 结构断言：解 zip 找 media/*.svg 与 slide1（writer 产物 store/deflate 双方法）
  const { unzipSync } = await import("node:zlib");
  const zipEntries = {};
  {
    const buf = Buffer.from(bytes);
    let off = 0;
    while (off < buf.length - 4) {
      if (buf.readUInt32LE(off) !== 0x04034b50) break; // local file header
      const method = buf.readUInt16LE(off + 8);
      const size = buf.readUInt32LE(off + 18);
      const nameLen = buf.readUInt16LE(off + 26);
      const extraLen = buf.readUInt16LE(off + 28);
      const name = buf.slice(off + 30, off + 30 + nameLen).toString("utf8");
      const dataStart = off + 30 + nameLen + extraLen;
      const data = buf.slice(dataStart, dataStart + size);
      zipEntries[name] = method === 8 ? unzipSync(data) : data;
      off = dataStart + size;
    }
  }
  const media = Object.keys(zipEntries).filter((n) => n.startsWith("ppt/media/") && n.endsWith(".svg"));
  ok(media.length === icons.length, `media SVG 数 ${media.length} = fixture 数 ${icons.length}`);
  const slide1 = zipEntries["ppt/slides/slide1.xml"].toString("utf8");
  ok((slide1.match(/asvg:svgBlip/g) || []).length === icons.length, "svgBlip 数 = 图标数（官方 ext uri）");
  // xfrm fit 矩形：fire（448×544 瘦高）在 56×56 bounds 内实绘宽应 < 56px（533400 EMU）——防 PPT 非等比拉伸回归
  {
    const fireIdx2 = icons.indexOf("fas:fire");
    const pics = slide1.split("<p:pic>").slice(1);
    const firePic = pics.find((p) => p.includes(`name="ic-${fireIdx2}"`));
    const ext = firePic && firePic.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    ok(!!ext && Number(ext[1]) < 711200 && Number(ext[2]) === 711200, `fire xfrm 为 fit 矩形（cx=${ext && ext[1]} < 满 711200，cy 满）`);
  }
  ok(slide1.includes("{96DAC541-7B7A-43D3-8B79-37D633B846F1}"), "MS-OI29500 SVG 扩展 uri");
  const ct = zipEntries["[Content_Types].xml"].toString("utf8");
  ok(ct.includes('Extension="svg"'), "Content_Types 声明 svg");
  // 抽样：solid 图标 fill 注入 + 自身 viewBox；宽图标 viewBox 保留（元素顺序 = media 编号顺序）
  const sampleIdx = icons.indexOf("fas:house");
  const expectedFill = (sampleIdx % 2 ? "#2563EB" : DEFAULT_THEME.colors.text).toUpperCase(); // 与上方 fill 交替逻辑一致
  const houseSvg = zipEntries[`ppt/media/image${sampleIdx + 1}.svg`].toString("utf8");
  ok(houseSvg.toUpperCase().includes(`FILL="${expectedFill}"`) && houseSvg.startsWith('<svg viewBox="0 0 512 512" width="512" height="512"'), "fas:house 导出（fill 注入 + viewBox + 显式宽高）");
  const wideIdx = icons.indexOf("fas:arrows-left-right");
  const wideSvg = zipEntries[`ppt/media/image${wideIdx + 1}.svg`].toString("utf8");
  const wideVb = wideSvg.match(/viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/);
  ok(wideVb && Number(wideVb[3]) >= 576 && Number(wideVb[4]) >= 512, "宽图标 viewBox ≥ 声明框（保留完整几何）");
  ok(!wideSvg.includes("currentColor") && !wideSvg.includes("<!--"), "导出 SVG 已归一化");
}

console.log("== 7. 未知图标：跳过 + onIconSkipped 聚合 ==");
{
  const deck = {
    title: "icon-unknown", size: [960, 540], theme: DEFAULT_THEME, fonts: {},
    pages: [{ elements: [
      { elementId: "u1", elementType: "icon", iconName: "fas:nonexistent-xyz", bounds: [10, 10, 50, 50], fill: { type: "solid", color: "#000000" } },
      { elementId: "u2", elementType: "icon", iconName: "bs:check", bounds: [80, 10, 50, 50], fill: { type: "solid", color: "#000000" } },
      { elementId: "ok1", elementType: "icon", iconName: "fas:house", bounds: [150, 10, 50, 50], fill: { type: "solid", color: "#000000" } },
    ] }],
  };
  const skipped = [];
  const bytes = await buildPptx(deck, {
    iconRegistry: registry, loadIconSvg: loadFixtureSvg,
    onIconSkipped: (list) => skipped.push(...list),
  });
  ok(bytes.length > 0, "未知图标不阻断导出");
  ok(skipped.length === 2 && skipped.every((s) => s.reason === "unknown-name"),
    "onIconSkipped 聚合 2 条（fas:nonexistent-xyz / bs:check 均 unknown-name）");
  const xml = Buffer.from(bytes).toString("latin1");
  ok(!xml.includes('name="u1"') && !xml.includes('name="u2"'), "跳过元素的 p:pic 不入 slide XML");
  ok(xml.includes('name="ok1"'), "有效图标正常导出");
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
