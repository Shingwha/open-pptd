#!/usr/bin/env python3
# ============================================================================
# formula-oracle.py — 用微软官方 MML2OMML.XSL 生成基准输出（oracle）
# ----------------------------------------------------------------------------
# 用法:
#   python tests/formula/formula-oracle.py <mml-file>      # stdout
#   python tests/formula/formula-oracle.py <mml-file> <out.xml>
#   python tests/formula/formula-oracle.py --batch <mml-dir> <out-dir>
#
# 依赖: python lxml + 本机 Office（MML2OMML.XSL 随 Office 安装）
# 用途: 重新生成 tests/formula/fixtures/omml-ai/ 官方参考（固化的回归基线）
# 日常回归不需要本脚本（scripts/test-formula.mjs 直接用固化参考）。
# ============================================================================

import sys, re, os
from lxml import etree

XSLT_CANDIDATES = [
    r'C:/Program Files/Microsoft Office/root/Office16/MML2OMML.XSL',
    r'C:/Program Files (x86)/Microsoft Office/root/Office16/MML2OMML.XSL',
    os.path.expandvars(r'%ProgramFiles%\Microsoft Office\root\Office16\MML2OMML.XSL'),
    os.path.expandvars(r'%ProgramFiles(x86)%\Microsoft Office\root\Office16\MML2OMML.XSL'),
]

def load_transform():
    for p in XSLT_CANDIDATES:
        if os.path.exists(p):
            return etree.XSLT(etree.parse(p))
    sys.stderr.write('MML2OMML.XSL not found (Office 未安装？)\n')
    sys.exit(2)

def convert(transform, mml_str):
    m = re.search(r'<math[^>]*>.*?</math>', mml_str, re.S)
    if not m:
        raise ValueError('no <math> found')
    return str(transform(etree.fromstring(m.group(0))))

def main():
    if len(sys.argv) < 2:
        sys.stderr.write(__doc__)
        sys.exit(1)
    transform = load_transform()
    if sys.argv[1] == '--batch':
        in_dir, out_dir = sys.argv[2], sys.argv[3]
        os.makedirs(out_dir, exist_ok=True)
        files = sorted(f for f in os.listdir(in_dir) if f.endswith('.xml'))
        ok = 0
        for f in files:
            mml = open(os.path.join(in_dir, f), encoding='utf-8').read()
            try:
                out = convert(transform, mml)
                open(os.path.join(out_dir, f), 'w', encoding='utf-8').write(out)
                ok += 1
            except Exception as e:
                print(f'FAIL {f}: {e}')
        print(f'官方 XSLT 输出: {ok}/{len(files)} -> {out_dir}')
        return
    mml = open(sys.argv[1], encoding='utf-8').read()
    out = convert(transform, mml)
    if len(sys.argv) > 2:
        open(sys.argv[2], 'w', encoding='utf-8').write(out)
        print('written', sys.argv[2])
    else:
        sys.stdout.write(out)

if __name__ == '__main__':
    main()
