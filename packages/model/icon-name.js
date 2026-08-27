// ============================================================================
// icon-name.js — 官方 iconName 解析（"style:name" 格式）
// ----------------------------------------------------------------------------
// 官方规范：iconName = "style:name"（Font Awesome 7.x：fas/far/fab）。
// v2 实现：图标库保留本地化 Bootstrap Icons（ICONS），值格式统一官方风格：
//   - "bs:check"   → Bootstrap 图标（本库扩展命名空间）
//   - "fas:house"  → 官方 FA 格式：查 FA→Bootstrap 映射表，命中渲染近似图标
// 未知图标返回 null（预览占位框、导出跳过）；非法格式（无 style 前缀）视为未知。
// ============================================================================

import { ICONS } from "./icon-library.js";

/** FA → Bootstrap 近似图标映射（常见图标；命名高度重合的 FA 键直接映射）。 */
export const FA_TO_BS = {
  "house": "house", "home": "house", "heart": "heart", "star": "star",
  "gear": "gear", "cog": "gear", "gears": "gear-wide-connected", "magnifying-glass": "search",
  "search": "search", "user": "person", "users": "people", "user-group": "people",
  "circle-user": "person-circle", "envelope": "envelope", "phone": "telephone", "camera": "camera",
  "images": "images", "file": "file-text", "folder": "folder", "folder-open": "folder2-open",
  "link": "link-45deg", "lock": "lock", "unlock": "unlock", "key": "key",
  "trash": "trash", "trash-can": "trash", "pen": "pencil", "pencil": "pencil",
  "eye": "eye", "eye-slash": "eye-slash", "bell": "bell", "bookmark": "bookmark-star",
  "calendar": "calendar", "clock": "clock", "stopwatch": "stopwatch", "flag": "flag",
  "trophy": "trophy", "medal": "award", "award": "award", "gem": "gem",
  "fire": "fire", "bolt": "lightning-charge", "zap": "lightning-charge", "sun": "sun",
  "moon": "moon", "cloud": "cloud", "droplet": "droplet", "globe": "globe-americas",
  "location-dot": "geo-alt", "map-pin": "pin-map", "map": "map", "compass": "compass",
  "building": "building", "bank": "bank", "landmark": "bank", "credit-card": "credit-card",
  "money-bill": "cash", "sack-dollar": "cash-stack", "percent": "percent", "calculator": "calculator",
  "chart-line": "graph-up", "chart-column": "bar-chart", "chart-pie": "pie-chart", "chart-bar": "bar-chart",
  "chart-area": "graph-up-arrow", "list": "list-ul", "list-ul": "list-ul", "check": "check",
  "check-double": "check2-all", "xmark": "x", "x": "x", "plus": "plus",
  "minus": "dash", "circle-check": "check-circle", "circle-check-regular": "check-circle", "circle-info": "info-circle",
  "circle-question": "question-circle", "circle-exclamation": "exclamation-circle", "triangle-exclamation": "exclamation-triangle", "message": "chat-square-text",
  "share-nodes": "share", "share": "share", "arrow-right": "arrow-right", "arrow-left": "arrow-left",
  "arrow-up": "arrow-up", "arrow-down": "arrow-down", "arrow-right-long": "arrow-right", "arrow-left-long": "arrow-left",
  "arrow-up-long": "arrow-up", "arrow-down-long": "arrow-down", "chevron-right": "chevron-right", "chevron-left": "chevron-left",
  "chevron-up": "chevron-up", "chevron-down": "chevron-down", "angle-right": "chevron-right", "angle-left": "chevron-left",
  "angle-up": "chevron-up", "angle-down": "chevron-down", "caret-down": "chevron-down", "caret-up": "chevron-up",
  "caret-left": "chevron-left", "caret-right": "chevron-right", "rotate": "arrow-repeat", "arrows-rotate": "arrow-repeat",
  "refresh": "arrow-repeat", "download": "download", "upload": "upload", "print": "printer",
  "copy": "files", "clipboard": "clipboard-check", "paste": "clipboard-data", "file-export": "box-arrow-up-right",
  "external-link": "box-arrow-up-right", "battery-full": "battery-full", "wifi": "wifi", "signal": "wifi",
  "tv": "display", "laptop": "laptop", "computer": "display", "mobile-screen": "phone",
  "tablet-screen": "tablet", "microchip": "cpu", "pause": "pause-circle", "stop": "stop-circle",
  "forward": "forward", "volume-high": "volume-up", "music": "music-note", "headphones": "headset",
  "microphone": "mic", "podcast": "mic", "wrench": "wrench", "hammer": "hammer",
  "screwdriver-wrench": "tools", "screwdriver": "tools", "rocket": "rocket-takeoff", "plane": "send",
  "paper-plane": "send", "airplane": "send", "book": "journal-text", "book-open": "journal-text",
  "heart-pulse": "activity", "activity": "activity", "pulse": "activity", "shield": "shield-check",
  "shield-halved": "shield-shaded", "lock-open": "unlock", "fingerprint": "fingerprint", "scale-balanced": "bank",
  "balance-scale": "bank", "gavel": "hammer", "legal": "bank", "chalkboard-user": "person-badge",
  "chalkboard": "display", "person-chalkboard": "person-badge", "seedling": "flower1", "water": "droplet",
  "basketball": "trophy", "futbol": "trophy", "baseball": "trophy", "volleyball": "trophy",
  "heart-crack": "heart", "heart-regular": "heart", "star-regular": "star", "thumbs-up": "hand-thumbs-up",
  "thumbs-down": "hand-thumbs-down", "bars-staggered": "list-check", "filter": "funnel", "sliders": "sliders",
  "phone-volume": "telephone", "mobile": "phone", "hourglass": "hourglass-split", "timer": "stopwatch",
  "alarm-clock": "alarm", "bell-regular": "bell", "calendar-day": "calendar-date", "calendar-check": "calendar-check",
  "sack-dollar": "cash-stack", "dollar-sign": "currency-dollar", "euro-sign": "currency-euro", "yen-sign": "currency-yen",
  "cny-sign": "currency-yen", "hand-holding-dollar": "cash", "chart-simple": "graph-up", "chart-gantt": "bar-chart-steps",
  "chart-scatter": "graph-up", "chart-pie-slice": "pie-chart", "warehouse": "building", "factory": "building",
  "industry": "building", "hotel": "building", "heart-pulse": "activity", "fire-extinguisher": "fire",
  "shield-virus": "shield-check", "person-dress": "person", "people-group": "people", "user-plus": "person-plus",
  "user-check": "person-check", "user-tie": "person-badge", "user-doctor": "person-badge", "user-nurse": "person-badge",
  "user-secret": "person", "address-book": "journal-text", "building-columns": "bank", "university": "bank",
  "landmark": "bank", "vault": "safe", "box": "box", "box-open": "box-seam",
  "cube": "box", "layer-group": "layers", "laptop-code": "laptop", "file-lines": "file-text",
  "file-excel": "file-spreadsheet", "file-csv": "file-spreadsheet", "file-export": "box-arrow-up-right", "folder-tree": "folder",
  "flag-regular": "flag", "flag-checkered": "flag", "earth-americas": "globe-americas", "globe-regular": "globe",
  "lightbulb": "lightbulb", "lightbulb-regular": "lightbulb", "lightbulb-on": "lightbulb-fill", "flashlight": "lightbulb-fill",
  "gauge-high": "speedometer", "gauge": "speedometer", "tachometer": "speedometer", "gauge-simple": "speedometer",
  "meteor": "star", "signal-strong": "wifi", "bridge": "building", "helicopter": "send",
  "jet-fighter": "send", "rocket-regular": "rocket-takeoff", "space-shuttle": "rocket-takeoff", "shuttle-space": "rocket-takeoff",
  "star-of-david": "star-half", "cross": "plus", "church": "building", "mosque": "building",
  "synagogue": "building", "kaaba": "building", "crosshairs": "bullseye", "bullseye-regular": "bullseye",
  "location-arrow": "send", "location-pin": "geo-alt", "map-location-dot": "geo-alt", "map-pin-regular": "pin-map",
  "map-location": "geo-alt", "compass-regular": "compass", "compass-drafting": "compass", "pencil-regular": "pencil",
  "pen-regular": "pencil", "pen-clip": "pencil", "square-root-variable": "percent", "infinity": "infinity",
  "greater-than": "chevron-right", "less-than": "chevron-left", "greater-than-equal": "chevron-right", "less-than-equal": "chevron-left",
  "divide": "dash", "plus-minus": "plus", "xmark-regular": "x", "check-regular": "check",
  "circle-arrow-right": "arrow-right-circle", "circle-arrow-left": "arrow-left-circle", "circle-arrow-up": "arrow-up-circle", "circle-arrow-down": "arrow-down-circle",
  "circle-chevron-right": "arrow-right-circle", "circle-chevron-left": "arrow-left-circle", "circle-chevron-up": "arrow-up-circle", "circle-chevron-down": "arrow-down-circle",
  "circle-right": "arrow-right-circle", "circle-left": "arrow-left-circle", "circle-up": "arrow-up-circle", "circle-down": "arrow-down-circle",
  "circle-xmark": "x-circle", "square-poll-vertical": "bar-chart", "square-poll-horizontal": "bar-chart", "square-person-confined": "person",
  "square-heart": "heart", "chess-board": "grid", "building-flag": "building", "building-lock": "building",
  "building-shield": "building", "building-user": "building", "city": "building", "hotel-regular": "building",
  "box-regular": "box", "box-open-regular": "box-seam", "box-archive": "archive", "archive": "archive",
  "tray-arrow-up": "upload", "tray-arrow-down": "download", "cloud-arrow-up": "cloud-arrow-up", "cloud-arrow-down": "cloud-arrow-down",
  "laptop-mobile": "laptop", "mobile-screen-regular": "phone", "mobile-screen-button": "phone", "tablet-screen-button": "tablet",
  "tablet-regular": "tablet", "tv-regular": "display", "projector": "display", "circle-play": "play-circle",
  "play-regular": "play-circle", "circle-pause": "pause-circle", "pause-regular": "pause-circle", "circle-stop": "stop-circle",
  "stop-regular": "stop-circle", "forward-regular": "forward", "gauge-simple-high": "speedometer", "gauge-high-regular": "speedometer",
  "phone-missed": "telephone", "phone-office": "telephone", "fax": "printer", "print-regular": "printer",
  "clipboard-user": "person-badge", "clipboard-pen": "clipboard-data", "clipboard-question": "clipboard-check", "compass-drafting-regular": "compass",
  "expand": "arrows-expand", "compress": "arrows-collapse", "arrows-turn-to-dots": "arrow-repeat", "arrows-spin": "arrow-repeat",
  "house-chimney-window": "house", "house-crack": "house", "house-fire": "house", "house-flag": "house",
  "house-laptop": "laptop", "house-signal": "wifi", "house-tree": "house", "house-user": "house",
  "home-regular": "house", "house-regular": "house", "person-shelter": "person", "tent": "moon-stars",
  "tents": "moon-stars", "campground": "moon-stars", "fire-regular": "fire", "fire-flame-curved": "fire",
  "fire-flame-simple": "fire", "flame": "fire", "burn": "fire", "campfire": "fire",
  "smoking-ban": "ban", "no-smoking": "ban", "ban-regular": "ban", "bottle-water": "droplet",
  "glass-water": "droplet", "leafy-green": "flower1", "drum": "music-note", "guitar": "music-note",
  "violin": "music-note", "piano": "music-note", "saxophone": "music-note", "trumpet": "music-note",
  "drum-regular": "music-note", "microphone-stand": "mic", "headphones-simple": "headset", "ear-listen": "headset",
  "ear-deaf": "headset", "volume-regular": "volume-up", "speaker": "volume-up", "speaker-regular": "volume-up",
  "waveform": "activity", "wave-square": "activity", "heartbeat": "activity", "activity-regular": "activity",
  "star-half-stroke": "star-half", "star-half-regular": "star-half", "star-of-life": "star", "staff-snake": "activity",
  "hospital-user": "person-badge", "x-ray": "activity", "radiology": "activity", "children": "people",
  "people-roof": "people", "person-circle-plus": "person-plus", "person-circle-check": "person-check", "bookmark-regular": "bookmark-star",
  "bookmark-regular-regular": "bookmark-star", "library": "journal-text", "books": "journal-text", "castle": "building",
  "fort": "building", "dumbbell": "activity", "basketball-regular": "trophy", "baseball-regular": "trophy",
  "football": "trophy", "rugby": "trophy", "volleyball-regular": "trophy", "table-tennis-paddle-ball": "trophy",
  "tennis-ball": "trophy", "golf-ball-tee": "trophy", "bowling-ball": "trophy", "futbol-regular": "trophy",
  "medal-regular-regular-regular": "award", "hourglass-half": "hourglass-split", "timer-regular": "stopwatch", "alarm-clock-regular": "alarm",
  "calendar-days": "calendar-date", "bell-exclamation": "bell", "bell-ring": "bell-fill", "bell-school": "bell",
  "envelope-circle-arrow-right": "envelope", "envelope-paper-plane": "send", "paper-plane-regular": "send", "send-regular": "send",
  "share-square": "share", "retweet": "arrow-repeat", "reply-regular": "reply", "forward-regular-regular": "forward",
  "chain": "link-45deg", "print-regular-regular": "printer", "file-invoice": "file-text", "file-invoice-dollar": "file-text",
  "file-signature": "file-text", "file-contract": "file-text", "file-shield": "file-text", "file-lock": "file-text",
  "file-magnifying-glass": "file-text", "file-magnifying-glass-regular": "file-text", "folder-closed": "folder", "folder-closed-regular": "folder",
  "folder-video": "folder", "folder-music": "folder", "folder-film": "folder", "folder-gear": "folder",
  "folder-heart": "folder", "folder-tree-regular": "folder", "trash-arrow-down": "trash", "trash-can-arrow-up": "trash",
  "trash-can-arrow-down": "trash", "trash-can-clock": "trash", "trash-clock": "trash", "recycle": "arrow-repeat",
  "warning": "exclamation-triangle", "warning-regular": "exclamation-triangle", "shower": "droplet", "soap": "droplet",
  "hand-holding-droplet": "droplet", "hand-holding-water": "droplet", "spa": "flower1", "flower": "flower1",
  "flower-regular": "flower1", "flower-daffodil": "flower1", "flower-tulip": "flower1", "seedling-regular-regular": "flower1",
  "cloud-regular-regular": "cloud", "tint-slash": "droplet", "water-regular": "droplet", "water-arrow-up": "cloud-arrow-up",
  "water-arrow-down": "cloud-arrow-down", "parachute-box": "box", "flag-pennant": "flag", "flag-usa": "flag",
  "flag-regular-regular-regular": "flag", "clock-rotate-left": "clock-history", "history": "clock-history", "people-arrows": "people",
  "people-carry-box": "people", "people-pulling": "people", "people-robbery": "people", "people-line": "people",
  "person-arrow-up-from-line": "person", "person-arrow-down-to-line": "person", "person-arrow-up-right-from-square": "person", "person-arrow-down-right-from-square": "person",
  "person-booth": "person", "person-cane": "person", "person-carry-box": "person", "person-chalkboard-regular": "person-badge",
  "person-circle-info": "person", "person-dolly-empty": "person", "person-dots-from-line": "person", "person-dress-burst": "person",
  "person-exclamation": "person", "person-falling": "person", "person-falling-burst": "person", "person-half-dress": "person",
  "person-harassing": "person", "person-military-pointing": "person", "person-military-rifle": "person", "person-military-to-person": "person",
  "person-pin": "person", "person-rays": "person", "person-rifle": "person", "person-seat": "person",
  "person-seat-reclined": "person", "person-sign": "person", "person-simple": "person", "person-standing": "person",
  "person-stairs": "person", "person-through-window": "person", "tent-arrow-left-right": "moon-stars", "tent-arrow-turn-left": "moon-stars",
  "tent-arrows-down": "moon-stars", "tent-regular": "moon-stars", "tents-regular": "moon-stars", "house-chimney-user": "house",
  "house-circle-check": "house", "house-circle-exclamation": "house", "house-circle-xmark": "house", "house-crack-regular-regular": "house",
  "money-bill-wave": "cash", "money-bill-wave-regular": "cash", "money-bill-transfer": "cash", "money-bill-trend-up": "graph-up-arrow",
  "money-bill-wheat": "cash", "money-check": "cash", "money-check-dollar": "cash", "money-check-dollar-regular": "cash",
  "money-check-regular": "cash", "hand-holding-usd": "cash", "hand-holding-circle-dollar": "cash", "glass-water-droplet": "droplet",
  "bottle-droplet": "droplet", "bottle-regular": "droplet", "jug-detergent": "droplet", "pump-soap": "droplet",
  "hand-holding-droplet-regular": "droplet", "trash-can-xmark": "trash", "trash-can-undo": "trash", "trash-undo": "trash",
  "arrow-down-to-water": "cloud-arrow-down", "water-ladder": "droplet", "bolt-lightning": "lightning-charge", "bolt-regular-regular": "lightning-charge",
  "shooting-star": "star", "shooting-star-regular": "star", "comet": "star", "manat-sign": "currency-dollar",
  "nisisign": "currency-dollar", "shekel-sign": "currency-dollar", "baht-sign": "currency-dollar", "rial-sign": "currency-dollar",
  "lira-sign": "currency-dollar", "hryvnia-sign": "currency-dollar", "tenge-sign": "currency-dollar", "guarani-sign": "currency-dollar",
  "austral-sign": "currency-dollar", "cedi-sign": "currency-dollar", "colon-sign": "currency-dollar", "cruzeiro-sign": "currency-dollar",
  "dong-sign": "currency-dollar", "florin-sign": "currency-dollar", "franc-sign": "currency-dollar", "kips-sign": "currency-dollar",
  "kip-sign": "currency-dollar", "ruble-sign": "currency-dollar", "bridge-circle-exclamation": "building", "bridge-circle-xmark": "building",
  "bridge-lock": "building", "bridge-water": "building", "bridge-regular-regular": "building", "arrow-trend-up": "graph-up-arrow",
  "arrow-trend-down": "graph-down"
};

/**
 * 解析官方 iconName（"style:name"）→ 本地 Bootstrap 图标 key（ICONS）。
 * @param {string} iconName
 * @returns {string|null} ICONS 的 key；未知返回 null（渲染占位、导出跳过）
 */
export function resolveIconName(iconName) {
  if (typeof iconName !== "string" || !iconName) return null;
  const idx = iconName.indexOf(":");
  if (idx < 0) return null; // 官方格式必须带 style 前缀（fas:/far:/fab:/bs:）
  const style = iconName.slice(0, idx).toLowerCase();
  const name = iconName.slice(idx + 1);
  if (style === "fas" || style === "far" || style === "fab") {
    return FA_TO_BS[name] || null;
  }
  // bs: 或其他命名空间 → 直接查本地库
  return ICONS[name] ? name : null;
}
