import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import iconv from 'iconv-lite';

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
         return downloadFile(response.headers.location as string, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
         reject(new Error(`Failed to download, status code: ${response.statusCode}`));
         return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Check if a drug is generic based on YJ code or common generic prefixes
function checkIsGeneric(name: string, yjCode?: string): boolean {
  if (name.includes('【般】') || name.startsWith('般）') || name.startsWith('【般】')) {
    return true;
  }
  if (yjCode && yjCode.length >= 12) {
    // In YJ code, if the 10th character is '1', it is often brand name.
    // If it is '0' or '2' or later, it is often generic.
    // Alternatively, check brand name flag or common generic maker suffixes in Japan.
    const makerChar = yjCode.charAt(9);
    const brandType = yjCode.charAt(11);
    // Generic drug YJ Code pattern often ends with non-1 or matches generic class
    if (brandType === '2' || brandType === '3' || brandType === '4') {
      return true;
    }
  }
  // Common generic manufacturer names in brackets
  const genericMakers = ['東和', '日医工', '沢井', 'サワイ', 'トーワ', 'タイヨー', '武田テバ', 'サンド', 'マイラン', 'あすか', '杏林', '高田', 'タカタ', 'ファイファイ', '明治', 'アメル', '大興', 'ケミファ', 'JG'];
  for (const maker of genericMakers) {
    if (name.includes(`「${maker}」`) || name.includes(`(${maker})`)) {
      return true;
    }
  }
  return false;
}

// Identify high-risk drugs based on therapeutic category in YJ code (first 4 digits)
function checkIsHighRisk(yjCode?: string): boolean {
  if (!yjCode || yjCode.length < 4) return false;
  const category = yjCode.substring(0, 4);
  const highRiskCategories = [
    '3959', // Immunosuppressants
    '4291', // Oncology drugs
    '2115', // Digitalis preparations
    '2119', // Antiarrhythmics (certain types)
    '3339', // Anticoagulants (e.g., Warfarin)
    '3969', // Diabetes medications (Insulins / sulfonylureas)
    '1124', // Certain psychotropics / antiepileptics
    '1139'  // Antiepileptics
  ];
  return highRiskCategories.includes(category);
}

async function main() {
  console.log('Starting Official Drug Master verified Import...');

  const tmpDir = path.resolve(process.cwd(), 'tmp_drug_master');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // SSK Drug Master ALL Zip (2026 March Version for Reiwa 8 / 2026)
  const zipUrl = 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/r06/kihonmasta_04.files/y_r07_ALL20260317.zip';
  const zipPath = path.resolve(tmpDir, 'drug_master.zip');

  console.log(`Downloading official SSK master data from ${zipUrl}...`);
  try {
    await downloadFile(zipUrl, zipPath);
  } catch (e) {
    console.error('Failed to download from SSK. Trying alternative fallback...', e);
    const fallbackZipUrl = 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/r06/kihonmasta_04.files/y_r06_ALL20250318.zip';
    await downloadFile(fallbackZipUrl, zipPath);
  }

  console.log('Download complete. Extracting ZIP...');
  execSync(`unzip -o ${zipPath} -d ${tmpDir}`);

  const files = fs.readdirSync(tmpDir);
  const csvFile = files.find(f => f.toLowerCase().endsWith('.csv'));

  if (!csvFile) {
    throw new Error('CSV file not found in the extracted zip.');
  }

  const csvPath = path.resolve(tmpDir, csvFile);
  console.log(`Extracting official CSV file: ${csvFile}`);

  const csvBuffer = fs.readFileSync(csvPath);
  const csvContent = iconv.decode(csvBuffer, 'Shift_JIS');

  const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
  console.log(`Parsed ${lines.length} lines from master CSV.`);

  const localDbPath = path.resolve(process.cwd(), 'src/lib/data/drugs.json');
  let currentLocalDb: any[] = [];
  if (fs.existsSync(localDbPath)) {
    currentLocalDb = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
  }
  console.log(`Loaded ${currentLocalDb.length} existing local drug records.`);

  const localDrugsMap = new Map<string, any>();
  for (const drug of currentLocalDb) {
    if (drug.code) localDrugsMap.set(drug.code, drug);
  }

  let importedCount = 0;
  let updatedCount = 0;

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 3) continue;

    const code = cols[2].replace(/"/g, '').trim();
    if (!code || code.length !== 9 || code.startsWith('6300100')) {
      continue; // Skip non-drug codes or invalid formats
    }

    // SSK CSV column mapping
    const name = (cols[4] || '').replace(/"/g, '').trim();
    const yjCode = (cols[31] || '').replace(/"/g, '').trim();
    const priceStr = (cols[11] || '0').replace(/"/g, '').trim();
    const price = parseFloat(priceStr) || 0;
    const categoryCode = (cols[13] || '').replace(/"/g, '').trim();
    const abolishDate = (cols[33] || '').replace(/"/g, '').trim();

    const isNarcotic = categoryCode === '1';
    const isPsychotropic = categoryCode === '5';
    const isPoisonous = categoryCode === '2';
    const isGeneric = checkIsGeneric(name, yjCode);
    const isHighRisk = checkIsHighRisk(yjCode);

    // Compute isAbolished dynamically
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // e.g. "20260605"
    const isAbolished = cols[0].replace(/"/g, '').trim() === '9' || (abolishDate && abolishDate !== '0' && abolishDate !== '99999999' && abolishDate <= todayStr);

    const genericName = name.replace(/「.*?」|（.*?）/g, '').replace(/【般】/g, '').trim();
    const documentUrl = yjCode ? `https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/${yjCode}` : undefined;

    const drugData = {
      code,
      name,
      yjCode: yjCode || undefined,
      isGeneric,
      genericName: genericName || name,
      isAbolished,
      price,
      stockQuantity: localDrugsMap.get(code)?.stockQuantity || 0,
      isNarcotic: isNarcotic || undefined,
      isPsychotropic: isPsychotropic || undefined,
      isPoisonous: isPoisonous || undefined,
      isHighRisk: isHighRisk || undefined,
      documentUrl
    };

    if (localDrugsMap.has(code)) {
      const existing = localDrugsMap.get(code);
      // Merge properties safely
      localDrugsMap.set(code, {
        ...existing,
        ...drugData,
        stockQuantity: existing.stockQuantity || 0
      });
      updatedCount++;
    } else {
      localDrugsMap.set(code, drugData);
      importedCount++;
    }
  }

  const updatedList = Array.from(localDrugsMap.values());
  console.log(`Writing ${updatedList.length} updated drug records to drugs.json...`);
  fs.writeFileSync(localDbPath, JSON.stringify(updatedList, null, 2), 'utf8');

  console.log('\n--- MASTER IMPORT SUCCESS ---');
  console.log(`Total Drug Master Records: ${updatedList.length}`);
  console.log(`Newly Imported: ${importedCount}`);
  console.log(`Updated / Merged: ${updatedCount}`);
  console.log('------------------------------\n');

  // Cleanup
  console.log('Cleaning up temporary files...');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Finished master import successfully.');
}

main().catch(console.error);
