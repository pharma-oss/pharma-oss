#!/usr/bin/env node
/**
 * scripts/buildUsageMaster.mjs
 * 厚生労働省の電子処方箋用法マスタ（xlsx）から TypeScript 用法マスタを生成するスクリプト。
 * 外部 npm 依存なし（Python 3 の標準ライブラリ zipfile / xml.etree を利用）。
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const xlsxPath = resolve(rootDir, 'artifacts/mhlw-usage-master/001056865_yoho_master.xlsx');
const outputPath = resolve(rootDir, 'src/lib/master-data/usage_options.ts');

const pythonScript = `
import zipfile, re, sys, json, xml.etree.ElementTree as ET

xlsx_path = sys.argv[1]
z = zipfile.ZipFile(xlsx_path)
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'

# 1. sharedStrings.xml の読み込み（<rPh>ルビを除外して本文のみ抽出）
shared = []
try:
    sroot = ET.fromstring(z.read('xl/sharedStrings.xml'))
    for si in sroot:
        parts = []
        for child in si:
            if child.tag == NS + 't':
                parts.append(child.text or '')
            elif child.tag == NS + 'r':
                for t in child.findall(NS + 't'):
                    parts.append(t.text or '')
        shared.append(''.join(parts))
except KeyError:
    pass

# 2. シートの特定（251101以降 本体）
rels = {}
for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels')):
    rels[r.get('Id')] = r.get('Target').lstrip('/')
wb = ET.fromstring(z.read('xl/workbook.xml'))

sheet_target = None
for sh in wb.iter(NS + 'sheet'):
    name = sh.get('name')
    if '251101以降' in name and 'レイアウト' not in name:
        target = rels[sh.get(RNS + 'id')]
        if not target.startswith('xl/'):
            target = 'xl/' + target
        sheet_target = target
        break

if not sheet_target:
    sys.exit('Main sheet not found')

def col_index(ref):
    m = re.match(r'([A-Z]+)', ref)
    n = 0
    for ch in m.group(1):
        n = n * 26 + (ord(ch) - 64)
    return n - 1

# 3. 行データのパース
sheet_root = ET.fromstring(z.read(sheet_target))
rows = []
for row in sheet_root.iter(NS + 'row'):
    cells = {}
    for c in row.iter(NS + 'c'):
        ref = c.get('r') or ''
        t = c.get('t')
        v = c.find(NS + 'v')
        isel = c.find(NS + 'is')
        if t == 's' and v is not None:
            val = shared[int(v.text)]
        elif t == 'inlineStr' and isel is not None:
            val = ''.join(x.text or '' for x in isel.iter(NS + 't'))
        elif v is not None:
            val = v.text
        else:
            val = ''
        if ref:
            cells[col_index(ref)] = (val or '').strip()
    if cells:
        width = max(cells) + 1
        rows.append([cells.get(i, '') for i in range(width)])

# rows[0] は項番（1〜19）
# rows[1], rows[2] はヘッダ
data_rows = rows[3:]

parsed = []
for r in data_rows:
    if not r or not r[0]:
        continue
    prescription_code = r[0]
    base_cat = r[1]
    timing = r[5]
    name = r[7]
    end_date = r[10]
    code_kind_raw = r[11]
    supp_as_needed = r[12]
    supp_time = r[14]
    supp_site = r[16]
    kana = r[17]
    rece_code = r[18]

    # 使用終了日が 99999999 以外（廃止済み）は除外
    if end_date != '99999999':
        continue
    # 基本用法区分 4（注入、28件）は取り込まない（§3.5-2）
    if base_cat == '4':
        continue

    category = None
    if base_cat == '1':
        category = 'as_needed' if timing == '5' else 'internal'
    elif base_cat == '2':
        category = 'external'
    elif base_cat == '3':
        category = 'injection'

    site_map = {'0': 'none', '1': 'optional', '2': 'lateral', '3': 'required'}
    site = site_map.get(supp_site, 'none')

    parsed.append({
        'code': rece_code,
        'label': name,
        'prescriptionCode': prescription_code,
        'category': category,
        'kana': kana,
        'supplement': {
            'asNeededCondition': supp_as_needed == '1',
            'administrationTime': supp_time == '1',
            'site': site,
        },
        'codeKind': 'guide' if code_kind_raw == '1' else 'standard'
    })

print(json.dumps(parsed, ensure_ascii=False))
`;

console.log(`Reading ${xlsxPath}...`);
const fileBuffer = readFileSync(xlsxPath);
const sha256 = createHash('sha256').update(fileBuffer).digest('hex');

const resultJson = execFileSync('python3', ['-c', pythonScript, xlsxPath], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024
});

const records = JSON.parse(resultJson);
console.log(`Parsed ${records.length} records from xlsx.`);

const tsContent = `// 厚生労働省 電子処方箋用法マスタ（251101以降版）
// 出典: https://www.mhlw.go.jp/stf/denshishohousen_shizai_00001.html
// 元ファイル: 001056865_yoho_master.xlsx (SHA-256: ${sha256})
// 生成日: 2026-09-06
// 本ファイルは scripts/buildUsageMaster.mjs により自動生成されています。手動編集しないでください。

import type { ElectronicUsageOption } from './types';

export const ELECTRONIC_USAGE_OPTIONS: ElectronicUsageOption[] = (${JSON.stringify(records, null, 2)} as unknown as ElectronicUsageOption[]);
`;

writeFileSync(outputPath, tsContent, 'utf8');
console.log(`Successfully generated ${outputPath}`);
