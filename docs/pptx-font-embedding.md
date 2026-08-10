# PPTX 字体嵌入完整实现手册（open-pptd）

> 本文档是字体嵌入功能的**唯一实现依据**，所有结论均经 PowerPoint COM 实测验证（非网络资料转述）。
> 状态：协议与格式已完全确认，待集成 writer。
> 验证手段：PowerPoint COM 打开 → `$pres.Fonts` 集合识别嵌入字体 + `SaveAs` 重存后解包检查子集化产物（铁证级，见 §9）。
> 金标准样本：`ppt-fonts.pptx`（用户 PowerPoint 原生生成：得意黑子集 30KB + 思源黑体 13.9MB，saveSubsetFonts=1）。

---

## 目录

1. 结论速览
2. 四步注册（PPTX 包内改动）
3. EOT v2.2 字节格式（fntdata 内部）
4. TTF/OTF 表解析（EOT 头部字段来源）
5. 金标准样本实测数值
6. 嵌入权限（fsType）
7. 坑清单（全部实测踩过）
8. 格式接受矩阵（实测证据链）
9. 验证方法（PowerShell COM + 解包检查）
10. 浏览器预览方案（FontFace）
11. 实现方案（open-pptd 集成设计）
12. 子集化 / WOFF / 许可证注意事项
13. 参考资料

---

## 1. 结论速览

- PPTX 嵌入字体 = 在 ZIP 包加 `.fntdata` 字体部件 + **4 处 XML 注册**（§2），任一缺失/位置错误 → 字体被忽略或文件打不开
- fntdata 内部格式：**EOT v2.2 封装 + 明文（未压缩）TTF/OTF FontData**——这是 LibreOffice 的生产级做法，PowerPoint 完整支持（实测重存子集化成功）
- EOT 封装是**纯字节拼接**：读 TTF 的 OS/2/head/name 表 → 填固定头 → 拼原始字体字节，零依赖可实现
- PowerPoint 原生写入的是 EOT + ILRE 压缩（微软专有），**无需复刻压缩**；PowerPoint 读取时明文/压缩都支持
- 纯明文 TTF 直写 fntdata（无 EOT 头）PowerPoint 也能读，但 EOT 封装兼容面最广（LibreOffice/规范同款），推荐
- 嵌入前必须检查 fsType 嵌入权限（§6），Restricted 字体拒绝嵌入
- 浏览器不支持 EOT：预览用 `FontFace` 加载原始 TTF/OTF，导出才做 EOT 封装

---

## 2. 四步注册（PPTX 包内改动）

### ① 字体数据部件 `ppt/fonts/fontN.fntdata`

- 命名 `font1.fntdata`、`font2.fntdata`…（PowerPoint 原生命名，跨页全局递增）
- 内容 = EOT v2.2 字节（§3）
- 同一字体的 Regular/Bold/Italic/BoldItalic 可各存一个部件，也可多个 embeddedFont 槽引用同一部件（PowerPoint 对未用到的槽不校验）

### ② `[Content_Types].xml` — Default 声明

```xml
<Default Extension="fntdata" ContentType="application/x-fontdata"/>
```

**⚠️ 必须插在 `<Types xmlns="...">` 开始标签之后**（即根元素下第一个子元素）。插到 XML 声明后/根元素前 = 非法 XML（根元素前不允许其他元素），PowerPoint 直接拒绝打开（HRESULT 0x80CB9110）。实测踩过：`str.replace('<Types xmlns=', default + '<Types xmlns=', 1)` 会把 Default 插到根元素前 → 必炸。

正确插入（定位 `<Types` 开始标签的 `>` 之后）：
```js
const m = ct.indexOf("<Types") + ct.slice(ct.indexOf("<Types")).indexOf(">") + 1;
ct = ct.slice(0, m) + '<Default Extension="fntdata" ContentType="application/x-fontdata"/>' + ct.slice(m);
```

### ③ `ppt/_rels/presentation.xml.rels` — font 关系

```xml
<Relationship Id="rId7"
  Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font"
  Target="fonts/font1.fntdata"/>
```

- 追加在 `</Relationships>` 前，Id 不得与现有冲突（rIdN 数字递增最稳）
- 无 `TargetMode="External"`

### ④ `ppt/presentation.xml` — 两处

**4a. 根元素加属性**（PowerPoint 原样）：
```xml
<p:presentation ... embedTrueTypeFonts="1" saveSubsetFonts="1">
```
- `saveSubsetFonts` 可选（=1 表示文件里是子集化字体；全量嵌入时可写 `saveSubsetFonts="0"` 或不写）

**4b. `<p:embeddedFontLst>` — 位置严格：`<p:notesSz .../>` 之后**（schema 顺序：sldMasterIdLst → sldIdLst → sldSz → notesSz → **embeddedFontLst** → defaultTextStyle）：

```xml
<p:embeddedFontLst>
  <p:embeddedFont>
    <p:font typeface="得意黑" pitchFamily="2" charset="-122"/>
    <p:italic r:id="rId3"/>
  </p:embeddedFont>
  <p:embeddedFont>
    <p:font typeface="思源黑体" panose="020B0500000000000000" pitchFamily="34" charset="-122"/>
    <p:regular r:id="rId4"/>
  </p:embeddedFont>
</p:embeddedFontLst>
```

结构规则：
- 每个 `<p:embeddedFont>` = 一个 `<p:font>`（描述）+ 若干变体槽（各含 r:id 指向字体部件关系）
- `<p:font>` 属性：`typeface` **必填**（字体家族名，列表内唯一）；`panose`/`pitchFamily`/`charset` 可选——**建议不写 panose**（见 §7 坑 3）
- 变体槽：`<p:regular>` `<p:bold>` `<p:italic>` `<p:boldItalic>`，按需声明，每个 r:id 引用一个字体部件
- 只嵌入 Regular 时只写 `<p:regular>`

---

## 3. EOT v2.2 字节格式（fntdata 内部）

全字段**小端**（除 FontData 内部为 TTF 大端）。布局：

```
┌────────┬──────┬──────────────────────────────────────────────┐
│ offset │ size │ 字段                                          │
├────────┼──────┼──────────────────────────────────────────────┤
│ 0      │ 4    │ EOTSize (u32) = 整个文件字节数（含 FontData） │
│ 4      │ 4    │ FontDataSize (u32) = 尾部字体数据字节数       │
│ 8      │ 4    │ Version (u32) = 0x00020002                    │
│ 12     │ 4    │ Flags (u32)，见下表                          │
│ 16     │ 10   │ FontPANOSE，复制自 OS/2 表 offset+32          │
│ 26     │ 1    │ Charset（Windows 字符集，中文 = 0x86(-122)，西文 = 0）│
│ 27     │ 1    │ Italic = OS/2.fsSelection bit0                │
│ 28     │ 4    │ Weight = OS/2.usWeightClass（400/700…）       │
│ 32     │ 2    │ fsType = OS/2.fsType（嵌入权限，§6）          │
│ 34     │ 2    │ MagicNumber = 0x504C（"LP"）                  │
│ 36     │ 16   │ UnicodeRange1-4 = OS/2.ulUnicodeRange1-4      │
│ 52     │ 8    │ CodePageRange1-2 = OS/2.ulCodePageRange1-2    │
│ 60     │ 4    │ CheckSumAdjustment = head 表 offset+8         │
│ 64     │ 16   │ Reserved1-4 = 全 0                            │
│ 80     │ 2    │ Padding1 = 0x0000                             │
│ 82     │ 2+   │ FamilyNameSize + FamilyName（name ID=1）       │
│        │ 2    │ Padding2 = 0x0000                             │
│        │ 2+   │ SubfamilyNameSize + SubfamilyName（name ID=2）│
│        │ 2    │ Padding3 = 0x0000                             │
│        │ 2+   │ VersionNameSize + VersionName（name ID=5）    │
│        │ 2    │ Padding4 = 0x0000                             │
│        │ 2+   │ FullFontNameSize + FullFontName（name ID=4）  │
│        │ 2    │ Padding5 = 0x0000                             │
│        │ 2    │ RootStringSize = 0                            │
│        │ 4    │ RootStringCheckSum = 0x50475342（"BSGP"）     │
│        │ 4    │ EUDCCodePage = 0x000004E4                     │
│        │ 2    │ Padding6 = 0x0000                             │
│        │ 2    │ SignatureSize = 0                             │
│        │ 4    │ EUDCFlags = 0                                 │
│        │ 4    │ EUDCFontSize = 0                              │
│        │ N    │ FontData = 原始 TTF/OTF 字节（全量或子集）     │
└────────┴──────┴──────────────────────────────────────────────┘
```

**名字串格式**：`[2B size][UTF-16LE 字符串][2B padding=0]`，其中 size = 字符串字节数 **+ 2（含结尾 `\0`）**，字符串本身以 `\0` 结尾（PowerPoint 原样如此）。例：family='得意黑\0' → size=10（'得意黑'=6B + '\0\0'=2B）？实测：'得意黑\x00' UTF-16LE = 8 字节，size 字段 = 8。取 name 表 Windows/UCS-2/en-US 记录（§4）。

**Flags 取值**（微软 t2embed 位定义，实测样本验证）：

| 值 | 含义 | 使用方 |
|---|---|---|
| 0x00000000 | 明文无压缩 | **我们的写入值（推荐）** |
| 0x00000001 | SUBSET（子集化） | 子集化时与 ILRE 同用（PowerPoint 得意黑样本 = 0x5） |
| 0x00000002 | TTCOMPRESSED（MicroType Express 压缩） | 不用 |
| 0x00000004 | ILRE 压缩 | PowerPoint 原生（等线/思源样本 = 0x4） |
| 0x00000008 | XORENCRYPTDATA（EOT 规范位） | 不用 |
| 0x10000000 | XORENCRYPTDATA（t2embed 位） | 不用 |

> 注意 EOT 规范（W3C）与微软 t2embed.h 的 Flags 位定义不一致（0x4 在 W3C 是 EMBEDEUDC、在 t2embed 是 ILRE）。实测 PowerPoint 写 0x4/0x5，即采用 t2embed 位定义。我们写 0 即可。

**EOTSize 与 FontDataSize 计算**：头部+字符串区长度 = fd_offset；`FontDataSize = 字体字节数`；`EOTSize = fd_offset + FontDataSize`。

---

## 4. TTF/OTF 表解析（EOT 头部字段来源）

零依赖解析，只需读三个表：

### 4.1 表目录（sfnt 头）

```
offset 0  : 魔数（TTF=0x00010000 大端 / OTF(CFF)=0x4F54544F "OTTO"）
offset 4  : numTables (u16 BE)
offset 12 : 表记录数组，每条 16B：
            tag(4B ASCII) + checksum(4B) + offset(4B BE) + length(4B BE)
```

### 4.2 OS/2 表（版本 0-4 兼容）

| 相对偏移 | 大小 | 字段 |
|---|---|---|
| +4  | 2  | usWeightClass（→ EOT Weight） |
| +8  | 2  | fsType（→ EOT fsType，§6） |
| +32 | 10 | panose[10]（→ EOT FontPANOSE） |
| +42 | 16 | ulUnicodeRange1-4（4×u32 BE，→ EOT UnicodeRange） |
| +62 | 2  | fsSelection（bit0 = Italic → EOT Italic） |
| +78 | 8  | ulCodePageRange1-2（2×u32 BE，→ EOT CodePageRange） |

### 4.3 head 表

| 相对偏移 | 大小 | 字段 |
|---|---|---|
| +8 | 4 | checkSumAdjustment（u32 BE，→ EOT CheckSumAdjustment） |

### 4.4 name 表

```
offset+0  : format (u16)
offset+2  : count (u16)
offset+4  : stringOffset (u16)   ← 字符串区相对 name 表头的偏移
offset+6  : 记录数组，每条 12B：
            platformID(u16) + encodingID(u16) + languageID(u16) + nameID(u16) + length(u16) + offset(u16)
```

字符串实际位置 = name 表偏移 + stringOffset + 记录内 offset，编码 UTF-16BE。

取值规则：**platformID=3（Windows）、encodingID=1（UCS-2）、languageID=0x409（en-US）优先**，找不到则取任意平台第一条；nameID 对应：1=FamilyName、2=SubfamilyName、4=FullFontName、5=Version。转 UTF-16LE 写入 EOT（保留结尾 `\0`，size 含 `\0`）。

---

## 5. 金标准样本实测数值

PowerPoint 原生生成的 EOT 头（用于对照自检）：

| 字段 | 得意黑 font1 | 思源黑体 font2 | 等线 font1（重存） |
|---|---|---|---|
| EOTSize | 30235 | 13941274 | 9528800 |
| FontDataSize | 30027 | 13940992 | 9528602 |
| Version | 0x00020002 | 0x00020002 | 0x00020002 |
| Flags | 0x5（SUBSET+ILRE） | 0x4（ILRE） | 0x4 |
| PANOSE | 全 0 | — | 02010600030101010101 |
| Charset | 134 (-122) | 134 | 134 |
| Italic | 255 | 0 | 0 |
| Weight | 400 | 400 | 400 |
| fsType | 0x8 | 0x0 | 0x8 |
| FamilyName | '得意黑\0' | '思源黑体\0' | '等线\0' |
| Subfamily | 'Regular\0' | 'Regular\0' | 'Regular\0' |
| FullName | 'Smiley Sans Oblique' | 'Source Han Sans SC' | 'DengXian Regular' |
| fd_offset | 208 | 282 | — |

对应 embeddedFontLst（PowerPoint 原生）：
- 得意黑：`<p:font typeface="得意黑" pitchFamily="2" charset="-122"/><p:italic r:id="rId3"/>`（**无 panose**，因为 PANOSE 全零）
- 思源黑体：`<p:font typeface="思源黑体" panose="020B0500000000000000" pitchFamily="34" charset="-122"/><p:regular r:id="rId4"/>`
- 等线：`<p:font typeface="等线" panose="02010600030101010101" pitchFamily="2" charset="-122"/><p:regular r:id="rId3"/><p:bold r:id="rId4"/>`

观察：`<p:font>` 的 panose/pitchFamily/charset 与 EOT 头对应字段一致（PowerPoint 写全）；得意黑 PANOSE 全零 → p:font 不写 panose。**我们的写入策略：p:font 只写 typeface（+可选 pitchFamily/charset），不写 panose——实测通过且最安全。**

---

## 6. 嵌入权限（fsType，OS/2 表 +8）

| 值 | 含义 | 可否嵌入 |
|---|---|---|
| 0x0000 | Installable（可安装） | ✅（思源样本） |
| 0x0002 | **Restricted（受限）** | ❌ **禁止嵌入——实现时必须拒绝并明确报错** |
| 0x0004 | Preview & Print | ✅（只读嵌入） |
| 0x0008 | Editable（可编辑嵌入） | ✅（等线、得意黑样本） |

> ⚠️ 曾有一份外部资料把 0x0002 和 0x0008 的说明写反，以本表 + W3C EOT 规范为准。
> 另注意 `0x0100`（No subsetting）位：置位时不得子集化，全量嵌入即可。
> 无 OS/2 表的旧字体按最宽松（可嵌入）处理。

---

## 7. 坑清单（全部实测踩过）

1. **CT Default 插错位置 = 文件直接打不开**（0x80CB9110）。必须插在 `<Types ...>` 标签之后，不能插在根元素前。见 §2②。
2. **`<p:embeddedFontLst>` 位置必须在 notesSz 之后**（schema 顺序），插在 defaultTextStyle 前且前面有 customShowLst 等时等同位置错误。
3. **`<p:font>` 的 panose 属性与 EOT 头 PANOSE 不一致 → 字体被静默丢弃**。骨架残留 Inter 的 panose（02000503020000020004）配得意黑全零 PANOSE 的 EOT → 打开后 embeddedFontLst 消失。**规避：p:font 不写 panose 属性**（用户原生样本得意黑即如此，实测通过）。
4. **文档中必须有 run 实际使用该字体**（`<a:rPr><a:latin typeface="得意黑"/><a:ea .../><a:cs .../></a:rPr>`）。只声明 embeddedFontLst 而文档无 run 引用 → PowerPoint 打开时丢弃声明，并**自动嵌入文档实际使用的字体**（雅黑/等线，10MB 级全量）。writer 侧天然满足（deck 声明字体 → 所有相关 run 写 typeface），但实现时注意：**slideMaster/theme 默认字体不要用嵌入字体**（PowerPoint 会把主题字体也当"使用中"字体嵌入——实测重存时雅黑被自动嵌入，因为 theme fontScheme 是雅黑）。
5. **不要在"手工构造的骨架文件"上验证**（t3.pptx + 脚本注入）：PowerPoint 对它的行为不可预测（打开不报错但丢弃一切嵌入声明），无法区分"格式错"还是"骨架错"。**验证/开发一律基于 PowerPoint 原生生成的文件或我们的 writer 完整输出**。
6. **PowerPoint 不校验 EOT 尾部字段**（RootStringCheckSum=0、EUDCCodePage=0 的错值也能打开），但 LibreOffice 可能校验——按规范写：0x50475342 / 0x4E4。
7. **fntdata 用非 ASCII 路径/文件名**：PowerPoint COM 打开带中文路径文件时 bash→PowerShell 传参会乱码（实测），测试脚本一律用 ASCII 路径。
8. **PowerShell 控制台输出中文乱码**：`[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` + 结果写 UTF-8 文件再读。
9. **rId 命名**：用数字递增（rId7 起），不要用 `rIdFont1` 这类（未验证 PowerPoint 是否接受非数字 Id，无必要冒险）。
10. **同一字体多槽**（regular+bold）可指向同一部件，也可分开；PowerPoint 重存时会按需拆分（bold 槽→bold 字体部件）。我们全量嵌入时**每槽一个部件文件最稳**（与 PowerPoint 原生一致）。

---

## 8. 格式接受矩阵（实测证据链）

| # | 测试 | fntdata 内容 | 结果 |
|---|---|---|---|
| F1 | 用户样本 base，替换 font1 | EOT 头（PowerPoint 原生 0x5）+ 明文得意黑 TTF | ✅ Fonts 识别 + 重存保留 |
| F2 | 同上 | EOT 头 + flags 改 0 + 明文 TTF | ✅ 同上 |
| F3 | 同上 | **纯明文 TTF（无 EOT 头）** | ✅ 同上（最简方案也通） |
| W1 | open-pptd 完整输出 + run 用得意黑 | EOT 头 + 明文 TTF | ✅ Fonts=[得意黑] + 重存 OK |
| W3 | 同上 | 纯明文 TTF | ✅ 同上 |
| Z1/Z3 | open-pptd 输出但 run 用雅黑 | 同上 | ⚠️ 打开 OK 但字体被丢（坑 4） |
| A-D | 手工骨架 + 注入 | EOT 明文/混淆/XOR 变体 | ❌ 全部失败——**骨架污染，结论不可信，弃用** |
| E/E2 | 骨架 + PowerPoint 原生 EOT + 修 panose | 原生数据 | ❌ 仍失败（骨架问题，未定位） |
| B1-B4 | open-pptd + 逐步注入 | CT 位置错误 | ❌ 0x80CB9110（坑 1） |

**结论**：F/W 系列（基于真实文件）证明 EOT+明文 与 纯明文 均被 PowerPoint 完整解码；B 系列定位 CT 坑；E 系列证明"骨架验证法"本身不可靠。

---

## 9. 验证方法（开发时必用）

```powershell
# test_fonts.ps1 —— 检测嵌入字体是否被 PowerPoint 识别并正确解码
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Get-Process POWERPNT -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$pp = New-Object -ComObject PowerPoint.Application
$pres = $null
try {
  $pres = $pp.Presentations.Open('C:\pptf-test\X.pptx', $true, $false, $false)
  Start-Sleep -Milliseconds 800
  Write-Host "Fonts.Count = $($pres.Fonts.Count)"     # 解码成功的嵌入字体才会出现
  for ($i = 1; $i -le $pres.Fonts.Count; $i++) {
    Write-Host "  Font[$i].Name = $($pres.Fonts.Item($i).Name)"
  }
  $pres.SaveAs('C:\pptf-test\resave.pptx', 24)        # 重存：解码成功才保留/重写字体
} catch { Write-Host "OPEN FAIL: $($_.Exception.Message)" }
if ($pres) { try { $pres.Close() } catch {} }
$pp.Quit()
```

判定标准（三重）：
1. **打开不报错**（0x80CB9110 = 包结构损坏，多为 CT/XML 错误）
2. **`$pres.Fonts` 包含目标字体名**（未解码的嵌入声明不会出现在集合里）
3. **重存后解包**：`embeddedFontLst` 保留该字体，且 fntdata 被 PowerPoint 重写（子集化后变小 / 结构变化）——这是"真正解码成功"的铁证

解包检查：
```bash
unzip -o X.pptx -d out && grep -o '<p:embeddedFontLst>.*</p:embeddedFontLst>' out/ppt/presentation.xml
```

Python EOT 头快速校验（解析时对照 §3 布局）：
```python
import struct
d = open('font1.fntdata','rb').read()
eot_size, fd_size, ver, flags = struct.unpack('<IIII', d[:16])
assert ver == 0x20002 and d[34:36] == b'\x4c\x50'   # MagicNumber 0x504C LE
assert eot_size == len(d) and d[-fd_size:][:4] in (b'\x00\x01\x00\x00', b'OTTO')
```

---

## 10. 浏览器预览方案（预览=导出一致性）

- 浏览器**不支持 EOT**：预览必须加载原始 TTF/OTF
- 预览流程（渲染器）：`fetch(字体URL) → arrayBuffer → new FontFace(familyName, arrayBuffer) → document.fonts.add(face)`，或 `new FontFace(name, 'url(...)')` + `load()`
- 渲染器 CSS 仍然只写 `font-family:"<family>"`，与现有 `resolveFont` 链路不变——注册的 FontFace 名 = 字体 family 名即可
- 导出流程：同一字体字节 → EOT 封装 → fntdata 部件。字形数据同源 → 两端渲染一致
- 系统已装该字体时：PowerPoint 用系统字体、浏览器用 FontFace——两者字形相同（同一字体文件），无冲突
- 本地字体文件（`<input type="file">`）：`file.arrayBuffer()` 拿字节，`new FontFace(name, buffer)` 注册预览（不需要 Blob URL，避开 CORS 问题）
- 字体字节来源统一抽象：`{ bytes, family, weight, italic }`，浏览器（fetch/File）与 Node（fs）两端各自实现加载器
- **子集化在浏览器端是重操作**（中文字体数百 ms）：放 Worker 或异步进度提示；Node 端同步即可

---

## 11. 实现方案（open-pptd 集成设计）

### 11.1 新模块

**`editor/core/fonts.js`**（纯逻辑，浏览器/Node 双端共用）：
```
parseTtf(bytes) → { os2:{weight,fsType,panose,unicodeRanges,codepageRanges,italic}, head:{checkSumAdjustment}, names:{1,2,4,5} }
checkEmbeddable(os2) → ok / { error: 'Restricted' }
buildEot(ttfBytes, flags=0) → Uint8Array   // EOT v2.2 封装，Flags=0（全量）或 0x1（子集），明文 FontData
collectTextChars(deck) → Set<string>     // 全部文本（text/table/chart/formula）去重
subsetFont(bytes, chars) → Uint8Array   // 自研 font-subset.js（§12.3）；CFF 字体抛错由调用方回退全量
```

**`editor/vendor/subset-font.mjs` + `editor/vendor/harfbuzzjs/`**（vendoring，BSD-3）：子集化唯一第三方依赖，浏览器/Node 双端加载（§12.3）

### 11.2 writer 改动

- **`editor/writer/font.js`**（新）：`buildFontParts(fonts, registry)` → `{ fntdataParts, embeddedFontLstXml, rels }`；按 `{family, weight, italic}` 去重
- **`editor/writer/pptx.js`**：`buildPptx(deck, options)` 增加字体收集：`options.fontFiles = { [family]: Uint8Array }`（浏览器预读）或 `options.root`（Node 按相对路径读 `fonts/` 目录）；zip 加 `ppt/fonts/fontN.fntdata`
- **`editor/writer/parts.js`**：
  - `buildContentTypes` 增加 fntdata Default（**插在 `<Types>` 标签后**，坑 1）
  - `buildPresentationRels` 增加 font 关系（rId 续号）
  - `buildPresentation` 增加 `embedTrueTypeFonts="1"` + `embeddedFontLst`（notesSz 后，坑 2）+ 按模式写 `saveSubsetFonts`（子集化=1）

### 11.3 deck 语法（manifest fonts 升级，呼应 theme.js 预留扩展点）

```yaml
fonts:
  title: { family: 得意黑, file: fonts/SmileySans-Oblique.ttf }   # 本地
  body:  { family: 思源黑体, url: https://cdn.jsdelivr.net/.../SourceHanSansSC-Regular.otf }  # 网络
```

- `normalizeFonts` 已支持对象项（取 `.name`）——改为取 `.family`（name 语义即 family）
- 渲染链路 `resolveFont` 消费的仍是字符串 family 名，**签名不变**
- 嵌入触发：deck 级 fonts 项带 `file`/`url` → 收集 → 校验 fsType → EOT → 注册
- 元素级 `fontFamily` 覆盖不受影响（嵌入与否只看 deck 声明）

### 11.4 编辑器 UI（可选后续）

- 字体下拉：`document.fonts.check('16px "Family"')` 检测系统已装；已嵌入项目字体高亮
- 字体管理对话框：添加本地文件（File API）或 URL → 写入 deck manifest

---

## 12. 子集化（实测全链路验证通过 ✅）/ WOFF / 许可证

### 12.1 结论

**子集化可行且已实测验证**：字体 → 子集化（只留文档用到的字符）→ EOT 封装 → 嵌入 PPTX → PowerPoint 完整识别并渲染。

### 12.2 实测数据

| 字体 | 全量 | fonttools 子集（18 字符测试文本） | subset-font JS 子集 | 备注 |
|---|---|---|---|---|
| 得意黑（TrueType） | 2,629,764 | 5,872 | 7,776 | 渲染像素级 0 差异 |
| 思源黑体 SC（CFF/OTTO） | 16,437,608 | 8,772 | — | CFF 子集 fonttools 支持 |

- 子集收益取决于文本量：用户真实样本（大量文本）思源子集 = 13.9MB；小文本场景几十 KB
- **CFF（OTTO）字体子集化可行**（fonttools 与 harfbuzz 均支持），但自研 CFF 子集化器成本极高（CharStrings INDEX / FDArray / Subrs 重建），不推荐自研

### 12.3 纯 JS 子集化方案（选定）：**自研子集化器（已实现并全链路验证）**

- **已实现 `editor/core/font-subset.js`（原型：font-explore/src/subset.js，~300 行）**：零依赖 TTF（TrueType 轮廓）子集化器，与 fontTools 金标准对照**逐字节一致**（21/21 字符轮廓坐标完全相同），PowerPoint 渲染与全量嵌入**像素级 0 差异**
- 表处理策略：
  - 保留表：`OS/2 cmap glyf head hhea hmtx loca maxp name post`
  - 丢弃表：GDEF/GPOS/GSUB（布局特性，中文 kerning 影响小）、vhea/vmtx、kern、DSIG（修改后签名失效必须删）
  - cmap 输出 format 4（BMP 段式，delta/rangeOffset 混合）+ format 12（非 BMP），platform 0/3 双子表（fontTools 同款）
  - glyph 重排：.notdef→0，其余按原 glyph ID 升序；composite 组件递归收集 + 组件 ID 重写
  - 表按 tag 排序、4 字节对齐、逐表 checksum + head.checkSumAdjustment = 0xB1B0AFBA - 总和
- 自研要点/坑（全部实测）：
  1. **short loca 要求 glyph 数据 2 字节对齐**：long loca 允许奇数偏移（实测原字体 25B glyph），short 格式截断丢字节——写入前 pad 1 字节（fontTools 同款）
  2. 表目录 length 写原始长度（不含 4 字节对齐 padding），否则 fontTools 报 "extra bytes at the end of head"
  3. cmap idRangeOffset 公式：`segCount*2 + 本段前 glyphIdArray 字节数 - 段索引*2`（偏移从 idRangeOffset 数组起点算）
  4. 测试脚本注意 CRLF 行尾（Windows write 工具）
- **CFF（OTTO）字体**：自研 CFF 子集化成本极高（CharStrings INDEX/FDArray/Subrs 重建），**决策：CFF 字体回退全量嵌入**——`subsetTtf()` 检测 sfnt 魔数非 `0x00010000` 时抛错，调用方回退 `buildEot(全量)`。思源黑体（CFF）全量 16.4MB 直接嵌入，兼容性不受影响
- 备选（未采用）：npm `subset-font`（BSD-3，22KB + harfbuzzjs WASM 1.2MB）质量与 fontTools 一致，但违反零依赖哲学；自研已验证同等质量，优先自研

### 12.4 子集化嵌入的写入参数

- EOT Flags 加 `0x1`（SUBSET 位），presentation 加 `saveSubsetFonts="1"`（全量嵌入不写该属性或写 0）
- 流程：收集 deck 全部文本字符（含表格/图表文本）→ 去重 → `subsetTtf()`（TrueType）或回退全量（CFF）→ buildEot → 4 处注册
- 校验：子集后字符集必须覆盖收集的字符（自研器保证）；渲染一致性由字形同源保证

### 12.5 WOFF / 许可证

- **WOFF/WOFF2 不能直接嵌入**（PPTX 只认 TTF/OTF）；subset-font 的 targetFormat 支持从 WOFF 输入转换，但首选直接拿 TTF/OTF 原版（Google Fonts / jsDelivr npm 包提供）
- **许可证**：OFL（SIL Open Font License）允许嵌入文档再分发——思源黑体/思源宋体、霞鹜文楷（LXGW WenKai）、Noto 系列均 OFL，**可嵌入**；微软雅黑/宋体/黑体等 Windows 商业字体**不可再分发嵌入**（仅系统使用）。嵌入前在 UI/文档中标注来源与许可
- 字体注册表（后续）：`{ key, family, category: sans|serif|hand|mono|display, styles:[...], license, url }`——为"好看的衬线字体"等主题字体需求提供推荐组合（思源宋体→学术/复古、霞鹜文楷→新中式…）

---

## 13. 参考资料

- MS-OI29500 §2.1.32（Font Part）：https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/ea097c57-5794-4624-b08e-017b47051b1d
- MS-OI29500 §2.1.1100（embeddedFontLst）：https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/fb2ecab1-17a1-4552-bac3-8df949321ba8
- W3C Embedded OpenType (EOT) File Format（2008，字段与 fsType 权威）：https://www.w3.org/submissions/2008/03/
- LibreOffice EOTConverter（EOT 封装生产级实现）：`vcl/source/font/EOTConverter.cxx`
- LibreOffice PPTX 字体嵌入导出：`sd/source/filter/eppt/pptx-epptooxml.cxx`
- Open XML SDK FontPartType（.fntdata/.ttf/.odttf）：https://learn.microsoft.com/zh-cn/dotnet/api/documentformat.openxml.packaging.fontparttype
- 微软：如何在 Office 中嵌入字体：https://support.microsoft.com/en-gb/office/embed-fonts-in-documents-or-presentations-cb3982aa-ea76-4323-b008-86670f222dbc
- 实测金标准样本：用户桌面 `ppt-fonts.pptx`（PowerPoint 原生：得意黑子集 + 思源黑体）

---

*本文档由实测生成：2026-08-09。验证环境：Windows + PowerPoint（COM），样本：用户 ppt-fonts.pptx（得意黑/思源黑体）、PowerPoint COM 生成的等线/Inter 样本、open-pptd writer 输出。*
