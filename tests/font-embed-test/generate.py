#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成字体嵌入测试项目 tests/font-embed-test/
=============================================
把 assets/fonts/ 全部注册字体放进一个 PPTD deck(每页 4 个字体卡片),
卡片内容:
  - 标题: 展示名 + 注册族名(用该字体渲染 → 中文缺失会当场回退, 可见)
  - 样本: 高频常用字句子(用该字体渲染)
  - 诊断: 覆盖统计 + 该字体缺失的常用字(用霞鹜新晰黑渲染, 保证可读)
导出后打开 deck.pptx 可直观看到每个字体的嵌入与回退情况。
用法: python tests/font-embed-test/generate.py
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.normpath(os.path.join(HERE, "..", ".."))
REG = json.load(open(os.path.join(SKILL, "assets", "fonts", "registry.json"), encoding="utf-8"))
sys.path.insert(0, os.path.join(SKILL, "tests"))
from fontTools.ttLib import TTFont  # noqa: E402

# ---- 覆盖统计(与 font-audit.py 一致) ----
def gb2312_levels():
    l1, l2 = [], []
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("gb2312")
            except Exception:
                continue
            if 0xB0 <= hi <= 0xD7:
                l1.append(ch)
            elif 0xD8 <= hi <= 0xF7:
                l2.append(ch)
    return l1, l2

L1, L2 = gb2312_levels()
SAMPLE = "中文常用字样本：科技改变生活，创新驱动未来。2024 年我们在人工智能领域取得重大突破！"

def coverage(path):
    f = TTFont(path)
    cmap = f.getBestCmap()
    miss1 = [c for c in L1 if ord(c) not in cmap]
    f.close()
    return miss1

# ---- 收集字体信息 ----
fonts = []
for ent in REG["fonts"]:
    path = os.path.join(SKILL, "assets", "fonts", ent["file"])
    if not os.path.exists(path):
        fonts.append({**ent, "missing_file": True, "miss1": []})
        continue
    fonts.append({**ent, "missing_file": False, "miss1": coverage(path)})

fonts.sort(key=lambda e: (len(e["miss1"]) == 0, e["key"]))  # 有问题的排前面
N = len(fonts)
print(f"共 {N} 个字体")

# ---- 生成 deck.pptd ----
fonts_yaml = "\n".join(
    f"  {k}: {{ family: \"{e['family']}\" }}" for k, e in
    ((f["key"], f) for f in fonts)
)
pages = "\n".join(f"  - pages/{i+1}_test.page" for i in range((N + 3) // 4))

deck = f"""version: v2
title: "字体嵌入测试"
size: [960, 540]
fonts:
{fonts_yaml}
theme:
  colors:
    primary: "#1646B8"
    accent: "#FF4F87"
    bg: "#FAF7F0"
    text: "#171512"
    muted: "#8A8272"
    line: "#E2DAC8"
    success: "#2A7D4F"
    warning: "#F1A51B"
    danger: "#C8102E"
    primarySoft: "#EDE7D8"
    primaryTint: "#C9D4F0"
    primaryDeep: "#0D2A6E"
    accent3: "#F1A51B"
    accent4: "#4A90D9"
    accent5: "#7B4FA8"
    accent6: "#2A6E72"
pages:
{pages}
"""
os.makedirs(os.path.join(HERE, "pages"), exist_ok=True)
open(os.path.join(HERE, "deck.pptd"), "w", encoding="utf-8").write(deck)

# ---- 生成页面 ----
def verdict(f):
    if f["missing_file"]:
        return "文件缺失", "$danger"
    n = len(f["miss1"])
    if n == 0:
        return "一级常用字全覆盖 ✓", "$success"
    if n < 2000:
        return f"✗ 缺 {n} 个常用字(日文向?)", "$danger"
    return "✗ 西文专用(不支持中文)", "$warning"

CARDS = [(40, 44), (490, 44), (40, 284), (490, 284)]  # 2x2
for pi in range((N + 3) // 4):
    group = fonts[pi * 4:(pi + 1) * 4]
    els = []
    els.append(f"""  - elementId: hdr
    elementType: text
    bounds: [40, 12, 700, 24]
    content:
      fontFamily: "LXGW Neo XiHei"
      fontSize: 13
      bold: true
      color: "$muted"
      letterSpacing: 2
      text: "FONT EMBEDDING TEST  /  字体嵌入测试  /  PAGE {pi+1:02d} / {((N+3)//4):02d}\"""")
    for ci, f in enumerate(group):
        x, y = CARDS[ci]
        v, vcol = verdict(f)
        miss = "".join(f["miss1"][:40]) + ("…" if len(f["miss1"]) > 40 else "")
        miss_line = f"缺字(嵌入后回退): {miss}" if f["miss1"] else "覆盖: 一级汉字全覆盖"
        els.append(f"""  - elementId: card-{ci}
    elementType: shape
    bounds: [{x}, {y}, 430, 220]
    shapeName: rect
    fill: {{type: solid, color: "$primarySoft"}}
    border: {{style: solid, width: 1, color: "$line"}}""")
        els.append(f"""  - elementId: name-{ci}
    elementType: text
    bounds: [{x+16}, {y+12}, 400, 26]
    content:
      fontFamily: "{f['family']}"
      fontSize: 15
      bold: true
      color: "$text"
      text: "{f['key']}  /  {f['family']}\"""")
        els.append(f"""  - elementId: verdict-{ci}
    elementType: text
    bounds: [{x+16}, {y+40}, 400, 20]
    content:
      fontFamily: "LXGW Neo XiHei"
      fontSize: 11
      bold: true
      color: "{vcol}"
      text: "{v}\"""")
        els.append(f"""  - elementId: sample-{ci}
    elementType: text
    bounds: [{x+16}, {y+64}, 398, 56]
    content:
      fontFamily: "{f['family']}"
      fontSize: 12
      color: "$text"
      lineHeight: 1.4
      text: "{SAMPLE}\"""")
        els.append(f"""  - elementId: diag-{ci}
    elementType: text
    bounds: [{x+16}, {y+128}, 398, 80]
    content:
      fontFamily: "LXGW Neo XiHei"
      fontSize: 10
      color: "$muted"
      lineHeight: 1.5
      text: "{miss_line}\"""")
    page = "pageType: generic\nbackground:\n  type: solid\n  color: \"$bg\"\nelements:\n" + "\n".join(els) + "\n"
    open(os.path.join(HERE, "pages", f"{pi+1}_test.page"), "w", encoding="utf-8").write(page)

print(f"已生成 deck.pptd + {((N+3)//4)} 个页面 → {HERE}")
