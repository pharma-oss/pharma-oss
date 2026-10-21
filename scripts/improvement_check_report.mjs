// SW-C の調査表(分類表)の「確かめた引用」と「ファイル:行」を、HEAD で機械的に照合する。
// docs/gemini_continuous_improvement_guide.md の §4.2(SW-C)と §11 を参照。
//
//   node scripts/improvement_check_report.mjs <分類表.md>
//
// 表は 7 列(# / 場所 / catch の中 / 呼び出し元 / 確かめた引用 / 判定 / 通知が要るときの分類と症状)。
// やること:
//   1. 4 列目・5 列目の `git grep -nF -e "語" HEAD` (N件) を HEAD で実行し直し、N が出力の行数(wc -l)と一致するか確かめる。
//      0 件は「存在しない文字列を引用している」。
//   2. 表中の src/...:行 の参照について、ファイルの実在と行番号の範囲を確かめる。
//   3. 「呼び出し元」列の src/...:行 が、その行の引用 grep の識別子(関数名・定数名)を含むかを調べ、含まない行を「要目視」で出す。
//      ここは疑いを出すだけ(同じ関数の中の行を引くだけの行や、画面の表示行は誤検出になる)。要目視の行は 1 か所ずつ開いて確かめる。
//      呼び出し元は `git grep -nw -e 関数名 -- src` で洗い出し、テスト以外の行を sed -n で開いて、本当にその関数を呼んでいる行だけを書く。
//   4. 「## 要目視の行の確認」の節: 3 で出た行を、1 行ずつ『その行の中身』を引用して確かめたかを調べる。節の各項目に
//      「#番号 src/...:行」と、その行に実在する文字列を『』で囲んだ引用を書く(引用が実際の行に含まれないと未確認として失敗)。
//      行番号が古い(ファイルが動いた)・関数を呼んでいない行を「正しい」と書いても、引用した中身で食い違いが分かる。
//   5. 「場所」列の src/...:行 の行に catch があるか(無ければ失敗。場所は catch の行を指す決まり)。
// 1・2・4・5 に 1 件でも問題があれば終了コード 1。報告を出す前に、0 件になるまで直す。
// 注意: 件数と行が合っていても、その行の説明(通知しているか・捨てているか)が正しいとは限らない。呼び出し元を開いて読むのは人。
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const report = process.argv[2];
if (!report) {
  console.error('usage: node scripts/improvement_check_report.mjs <report.md>');
  process.exit(2);
}
const rows = fs.readFileSync(report, 'utf8').split('\n').filter((l) => /^\| *\d+ *\|/.test(l));

// 1. 引用の件数
let total = 0;
let mismatched = 0;
const badRows = new Set();
const grepRe = /`git grep (?:-[a-zA-Z]+ )*(?:-e )?"((?:[^"\\]|\\.)*)"(?: HEAD)?`\s*\((\d+)件\)/g;
for (const l of rows) {
  const num = l.match(/^\| *(\d+)/)[1];
  grepRe.lastIndex = 0;
  let m;
  while ((m = grepRe.exec(l))) {
    total++;
    const phrase = m[1].replace(/\\"/g, '"');
    const claimed = Number(m[2]);
    let out = '';
    try {
      out = execFileSync('git', ['grep', '-nF', '-e', phrase, 'HEAD'], { encoding: 'utf8' });
    } catch (e) {
      out = e.stdout || '';
    }
    const actual = out.split('\n').filter(Boolean).length;
    if (claimed !== actual) {
      mismatched++;
      badRows.add(num);
      console.log(`#${num} 件数が違う: 表=${claimed} 実測(wc -l)=${actual} <${phrase.slice(0, 70)}>`);
    }
  }
}
console.log(`quoted greps checked=${total} mismatched=${mismatched} rows=${[...badRows].join(',')}`);

// 2. ファイル:行の実在
let refs = 0;
const missing = new Map();
const outOfRange = [];
const refRe = /(src\/[A-Za-z0-9_\-./[\]]+\.(?:tsx?|css)):(\d+)/g;
for (const l of rows) {
  const num = l.match(/^\| *(\d+)/)[1];
  refRe.lastIndex = 0;
  let m;
  while ((m = refRe.exec(l))) {
    refs++;
    const file = m[1];
    const line = Number(m[2]);
    if (!fs.existsSync(file)) {
      if (!missing.has(file)) missing.set(file, []);
      missing.get(file).push(`#${num}:${line}`);
      continue;
    }
    const length = fs.readFileSync(file, 'utf8').split('\n').length;
    if (line > length) outOfRange.push(`#${num} ${file}:${line} (ファイルは ${length} 行)`);
  }
}
console.log(`file:line refs checked=${refs}`);
console.log('missing files:', [...missing.entries()].map(([f, v]) => `${f} <- ${v.join(',')}`).join('\n') || 'none');
console.log('out of range:', outOfRange.join('\n') || 'none');

// 3. 呼び出し元の行が、引用した識別子を含むか(疑いを出すだけ)
const suspects = [];
const quoteRe = /"((?:[^"\\]|\\.)*)"/g;
const callerRe = /(src\/[A-Za-z0-9_\-./[\]]+\.(?:tsx?|css)):(\d+(?:\s*,\s*\d+)*)/g;
for (const l of rows) {
  const cells = l.split('|').map((s) => s.trim());
  const num = cells[1];
  const callerCell = cells[4] || '';
  const citeCell = cells[5] || '';
  const idents = [];
  quoteRe.lastIndex = 0;
  let q;
  while ((q = quoteRe.exec(citeCell))) if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(q[1])) idents.push(q[1]);
  if (idents.length === 0) continue;
  callerRe.lastIndex = 0;
  let c;
  while ((c = callerRe.exec(callerCell))) {
    let lines;
    try {
      lines = fs.readFileSync(c[1], 'utf8').split('\n');
    } catch {
      continue;
    }
    for (const n of c[2].split(',').map((x) => Number(x.trim()))) {
      const text = lines[n - 1] || '';
      if (!idents.some((id) => text.includes(id))) {
        suspects.push({ num, file: c[1], line: n, text, label: `#${num} ${c[1]}:${n}  [${text.trim().slice(0, 70)}]  (引用した識別子: ${idents.join(', ')})` });
      }
    }
  }
}
console.log(`caller lines not mentioning any quoted identifier (要目視): ${suspects.length}`);
for (const sp of suspects) console.log('  ' + sp.label);

// 4. 要目視の節: 3 で出た各行が、『実際の行の中身』の引用つきで確かめられているか
const collapse = (t) => t.replace(/\s+/g, ' ').trim();
const reportText = fs.readFileSync(report, 'utf8');
const sectionMatch = reportText.match(/^## 要目視の行の確認[^\n]*\n([\s\S]*?)(?=^## |^---\s*$|(?![\s\S]))/m);
const section = sectionMatch ? sectionMatch[1] : '';
const sectionItems = section.split('\n').filter((l) => /^\s*(?:\d+\.|[-*])\s/.test(l));
const unverified = [];
for (const sp of suspects) {
  const actual = collapse(sp.text);
  const item = sectionItems.find((l) => l.includes(`#${sp.num}`) && l.includes(`${sp.file}:${sp.line}`));
  if (!item) {
    unverified.push(`#${sp.num} ${sp.file}:${sp.line}  要目視の節に項目が無い [実際の行: ${actual.slice(0, 60)}]`);
    continue;
  }
  const quotes = [...item.matchAll(/『([^』]+)』/g)].map((m) => collapse(m[1])).filter((q) => q.length >= 3);
  if (quotes.length === 0) {
    unverified.push(`#${sp.num} ${sp.file}:${sp.line}  行の中身の引用(『…』)が無い [実際の行: ${actual.slice(0, 60)}]`);
  } else if (!quotes.some((q) => actual.includes(q))) {
    unverified.push(`#${sp.num} ${sp.file}:${sp.line}  引用が実際の行に無い(行番号が古い疑い) 引用=${quotes[0].slice(0, 40)} / 実際の行: ${actual.slice(0, 60)}`);
  }
}
console.log(`要目視の行の確認(行の中身の引用つき) 未確認: ${unverified.length} / ${suspects.length}`);
for (const u of unverified) console.log('  ' + u);

// 5. 「場所」列の行に catch があるか
const notCatch = [];
for (const l of rows) {
  const cells = l.split('|').map((s) => s.trim());
  const num = cells[1];
  const placeRe = /(src\/[A-Za-z0-9_\-./[\]]+\.(?:tsx?|css)):(\d+)/g;
  let pm;
  while ((pm = placeRe.exec(cells[2] || ''))) {
    let lines;
    try {
      lines = fs.readFileSync(pm[1], 'utf8').split('\n');
    } catch {
      continue;
    }
    const text = lines[Number(pm[2]) - 1] || '';
    if (!/catch/.test(text)) notCatch.push(`#${num} ${pm[1]}:${pm[2]}  [${text.trim().slice(0, 60)}]`);
  }
}
console.log(`「場所」の行に catch が無い: ${notCatch.length}`);
for (const n of notCatch) console.log('  ' + n);

process.exit(mismatched > 0 || missing.size > 0 || outOfRange.length > 0 || unverified.length > 0 || notCatch.length > 0 ? 1 : 0);
