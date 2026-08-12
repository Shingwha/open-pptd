#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
open-pptd 内置字体库覆盖体检
============================
对 assets/fonts/ 下全部字体做统一排查:
  - 常用字覆盖: GB2312 一级(3755) / 二级(3008) / 常用中文标点 / ASCII
  - 嵌入属性:   sfnt 版本(TrueType 可子集化 / CFF 全量嵌入)、fsType 嵌入许可、
                字重(决定 regular/bold 槽位)、name 表族名(嵌入注册名)
判定:
  - 一级缺字 = 0 且标点全 → 中文支持良好
  - 一级缺字 <= 20 → 有少量缺字(简体独有字形等), 标题慎用
  - 一级缺字 > 20  或 一级覆盖率 < 90% → 中文支持差(日文/西文向), 简体中文 PPT 不可用
用法: python tests/font-audit.py [字体目录]
"""
import glob, os, sys, json
from fontTools.ttLib import TTFont

LIB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "assets", "fonts")

# ---------- 常用字集 ----------
def gb2312_levels():
    l1, l2 = [], []
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                ch = bytes([hi, lo]).decode("gb2312")
            except Exception:
                continue
            if 0xB0 <= hi <= 0xD7:   # 16-55 区: 一级汉字
                l1.append(ch)
            elif 0xD8 <= hi <= 0xF7:  # 56-87 区: 二级汉字
                l2.append(ch)
    return l1, l2

L1, L2 = gb2312_levels()
PUNCT = "，。！？：；、（）《》「」『』“”‘’—…·￥【】〔〕％＋－×÷＝＜＞＃＆＊＠"
ASCII = "".join(chr(i) for i in range(0x20, 0x7F))

def audit2(path):
    f = TTFont(path)
    cmap = f.getBestCmap()
    fam16 = f["name"].getDebugName(16) or ""
    fam1 = f["name"].getDebugName(1) or ""
    fam = fam16 or fam1
    # 读 sfnt 版本
    with open(path, "rb") as fh:
        sfnt = fh.read(4)
    vers = {b"\x00\x01\x00\x00": "TrueType(可子集化)", b"OTTO": "CFF(全量嵌入)", b"true": "TrueType"}.get(sfnt, sfnt.hex())
    fsType = f["OS/2"].fsType if "OS/2" in f else 0
    fsmap = {0: "Installable✓", 2: "Restricted✗", 4: "PreviewPrint△", 8: "Editable✓"}
    weight = f["OS/2"].usWeightClass if "OS/2" in f else 400
    slot = "bold" if weight >= 700 else "regular"
    miss1 = [c for c in L1 if ord(c) not in cmap]
    miss2 = [c for c in L2 if ord(c) not in cmap]
    missp = [c for c in PUNCT if ord(c) not in cmap]
    missa = [c for c in ASCII if ord(c) not in cmap]
    f.close()
    cov1 = (len(L1) - len(miss1)) / len(L1)
    if len(miss1) == 0 and not missp: verdict = "✓ 中文支持良好"
    elif len(miss1) <= 20: verdict = "△ 少量缺字(简体独有字形)"
    elif cov1 >= 0.90: verdict = "✗ 中文支持差"
    else: verdict = "✗✗ 几乎不支持中文"
    return {
        "file": os.path.basename(path), "family": fam, "version": vers,
        "fsType": fsmap.get(fsType, hex(fsType)), "weight": weight, "slot": slot,
        "l1_miss": len(miss1), "l2_miss": len(miss2), "l1_cov": cov1,
        "punct_miss": len(missp), "ascii_miss": len(missa),
        "miss1_ex": "".join(miss1[:12]), "verdict": verdict,
    }

rows = []
for path in sorted(glob.glob(os.path.join(LIB, "*.ttf")) + glob.glob(os.path.join(LIB, "*.otf"))):
    if os.path.basename(path) == "registry.json":
        continue
    try:
        rows.append(audit2(path))
    except Exception as e:
        rows.append({"file": os.path.basename(path), "error": str(e)})

print(f"{'字体文件':<28}{'注册族名':<28}{'格式':<16}{'嵌入许可':<14}{'字重':<6}{'槽位':<9}{'一级缺':<6}{'二级缺':<6}{'覆盖率':<8}{'标点缺':<6}{'判定'}")
print("-" * 170)
for r in rows:
    if "error" in r:
        print(f"{r['file']:<28} 读取失败: {r['error']}")
        continue
    print(f"{r['file']:<28}{r['family']:<28}{r['version']:<16}{r['fsType']:<14}{r['weight']:<6}{r['slot']:<9}{r['l1_miss']:<6}{r['l2_miss']:<6}{r['l1_cov']*100:>5.1f}%  {r['punct_miss']:<6}{r['verdict']}")
    if r["l1_miss"]:
        print(f"{'':<28}{'':<28}  一级缺字示例: {r['miss1_ex']}")

print()
print(f"一级汉字总数 {len(L1)}, 二级汉字总数 {len(L2)}, 常用标点 {len(PUNCT)} 个, ASCII {len(ASCII)} 个")
bad = [r for r in rows if "error" not in r and r["verdict"].startswith("✗")]
warn = [r for r in rows if "error" not in r and r["verdict"].startswith("△")]
print(f"\n结论: {len(bad)} 个字体中文支持差, {len(warn)} 个有少量缺字")
for r in bad:
    print(f"  ✗ {r['family']} ({r['file']}) 一级缺 {r['l1_miss']} 字, 覆盖率 {r['l1_cov']*100:.1f}%")
for r in warn:
    print(f"  △ {r['family']} ({r['file']}) 一级缺 {r['l1_miss']} 字: {r['miss1_ex']}")
