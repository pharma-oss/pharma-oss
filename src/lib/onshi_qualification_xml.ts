// オンライン資格確認等システムの「資格確認結果」XMLを読む。
//
// 資格確認端末(顔認証付きカードリーダー)は、マイナンバーカードで資格確認した結果を XML ファイルとして連携フォルダへ出す。
// ここはその XML を読んで、受付に必要な項目だけを取り出す純粋関数群(ファイルは触らない)。
//
// 【形式の出どころ】 公式の「オンライン資格確認等システム外部インターフェイス仕様書」(医療機関等ONS、非公開)は未入手。
// 項目名・コード表・日付形式は、公開されている無料ソフトの実装と実サンプルから読み取った(2026-10-23):
//   - hangilc/myclinic-ts packages/onshi-result (資格確認結果の型・コード表)
//   - YUKI-ENT/MynaReception docs (face XML の構造と実サンプルに基づく照合規則)
// どちらもライセンス表記が無いため、コードは写さず、形式(項目名・値の意味)だけを使っている。
// 公式仕様書または実機の出力ファイルでの突合が済むまでは「実機未確認」として扱うこと(docs/user_manual.md)。

export class OnshiXmlError extends Error {
  readonly code: OnshiXmlErrorCode;

  constructor(code: OnshiXmlErrorCode, message: string) {
    super(message);
    this.name = 'OnshiXmlError';
    this.code = code;
    Object.setPrototypeOf(this, OnshiXmlError.prototype);
  }
}

export type OnshiXmlErrorCode =
  | 'xml_malformed'
  | 'xml_forbidden_construct'
  | 'xml_too_large'
  | 'result_not_final'
  | 'result_error'
  | 'result_not_found'
  | 'result_multiple'
  | 'qualification_invalid'
  | 'field_invalid'
  | 'encoding_mismatch';

// ------------------------------------------------------------------
// 最小限のXMLパーサ。外部実体・DTDは使えない(禁止して即エラー)。
// ------------------------------------------------------------------

export interface XmlElement {
  name: string;
  children: XmlElement[];
  text: string;
}

const MAX_XML_CHARS = 4 * 1024 * 1024;
const MAX_XML_DEPTH = 32;
const MAX_XML_ELEMENTS = 20000;
const NAME_PATTERN = /[A-Za-z_][A-Za-z0-9_.\-:]*/y;
const ATTRIBUTE_PATTERN = /\s+[A-Za-z_][A-Za-z0-9_.\-:]*\s*=\s*(?:"[^"<]*"|'[^'<]*')/y;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

const PREDEFINED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function decodeEntities(raw: string): string {
  return raw.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);/g, (_match, body: string) => {
    if (body.startsWith('#')) {
      const codePoint = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isInteger(codePoint) || codePoint < 0x20 || codePoint > 0x10ffff) {
        throw new OnshiXmlError('xml_malformed', 'XMLの文字参照が正しくありません。');
      }
      return String.fromCodePoint(codePoint);
    }
    const replacement = PREDEFINED_ENTITIES[body];
    if (replacement === undefined) {
      throw new OnshiXmlError('xml_forbidden_construct', 'XMLに定義されていない実体参照が含まれています。');
    }
    return replacement;
  });
}

export function parseXmlDocument(source: string): XmlElement {
  if (source.length > MAX_XML_CHARS) throw new OnshiXmlError('xml_too_large', 'XMLファイルが大きすぎます。');
  const xml = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (FORBIDDEN_CONTROL_CHARS.test(xml)) throw new OnshiXmlError('xml_malformed', 'XMLに使えない制御文字が含まれています。');

  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let elementCount = 0;
  let index = 0;

  const fail = (message: string): never => {
    throw new OnshiXmlError('xml_malformed', message);
  };

  while (index < xml.length) {
    if (xml[index] !== '<') {
      const next = xml.indexOf('<', index);
      const end = next === -1 ? xml.length : next;
      const rawText = xml.slice(index, end);
      index = end;
      const current = stack[stack.length - 1];
      if (current) current.text += decodeEntities(rawText);
      else if (rawText.trim() !== '') fail('XMLのルート要素の外に文字があります。');
      continue;
    }

    if (xml.startsWith('<?', index)) {
      const end = xml.indexOf('?>', index + 2);
      if (end === -1) fail('XML宣言が閉じていません。');
      index = end + 2;
      continue;
    }
    if (xml.startsWith('<!--', index)) {
      const end = xml.indexOf('-->', index + 4);
      if (end === -1) fail('XMLのコメントが閉じていません。');
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', index)) {
      const end = xml.indexOf(']]>', index + 9);
      const current = stack[stack.length - 1];
      if (end === -1 || !current) fail('XMLのCDATAが正しくありません。');
      else current.text += xml.slice(index + 9, end);
      index = end + 3;
      continue;
    }
    if (xml.startsWith('<!', index)) {
      // <!DOCTYPE ...> や <!ENTITY ...>: 外部実体の読み込みや実体展開による攻撃を避けるため受け付けない
      throw new OnshiXmlError('xml_forbidden_construct', 'XMLにDTD・実体宣言が含まれています。');
    }

    if (xml.startsWith('</', index)) {
      NAME_PATTERN.lastIndex = index + 2;
      const nameMatch = NAME_PATTERN.exec(xml);
      if (!nameMatch) return fail('XMLの終了タグが正しくありません。');
      let cursor = NAME_PATTERN.lastIndex;
      while (/\s/.test(xml[cursor] ?? '')) cursor += 1;
      if (xml[cursor] !== '>') return fail('XMLの終了タグが閉じていません。');
      const open = stack.pop();
      if (!open || open.name !== nameMatch[0]) return fail('XMLの開始タグと終了タグが対応していません。');
      index = cursor + 1;
      if (stack.length === 0) {
        if (xml.slice(index).replace(/<!--[\s\S]*?-->/g, '').trim() !== '') fail('XMLのルート要素の後に内容があります。');
        return root as XmlElement;
      }
      continue;
    }

    NAME_PATTERN.lastIndex = index + 1;
    const nameMatch = NAME_PATTERN.exec(xml);
    if (!nameMatch) return fail('XMLの開始タグが正しくありません。');
    let cursor = NAME_PATTERN.lastIndex;
    for (;;) {
      ATTRIBUTE_PATTERN.lastIndex = cursor;
      const attribute = ATTRIBUTE_PATTERN.exec(xml);
      if (!attribute) break;
      cursor = ATTRIBUTE_PATTERN.lastIndex;
    }
    while (/\s/.test(xml[cursor] ?? '')) cursor += 1;
    const selfClosing = xml[cursor] === '/';
    if (selfClosing) cursor += 1;
    if (xml[cursor] !== '>') return fail('XMLの開始タグが閉じていません。');
    index = cursor + 1;

    elementCount += 1;
    if (elementCount > MAX_XML_ELEMENTS) throw new OnshiXmlError('xml_too_large', 'XMLの要素数が多すぎます。');
    const element: XmlElement = { name: nameMatch[0], children: [], text: '' };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else if (root) return fail('XMLのルート要素が複数あります。');
    else root = element;

    if (!selfClosing) {
      stack.push(element);
      if (stack.length > MAX_XML_DEPTH) throw new OnshiXmlError('xml_too_large', 'XMLの入れ子が深すぎます。');
    } else if (stack.length === 0) {
      if (xml.slice(index).replace(/<!--[\s\S]*?-->/g, '').trim() !== '') fail('XMLのルート要素の後に内容があります。');
      return element;
    }
  }

  return fail('XMLのルート要素が閉じていません。');
}

function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((candidate) => candidate.name === name);
}

function childText(element: XmlElement | undefined, name: string): string | undefined {
  const value = child(element, name)?.text.trim();
  return value ? value : undefined;
}

// ------------------------------------------------------------------
// 資格確認結果
// ------------------------------------------------------------------

export type OnshiSex = 'male' | 'female' | 'other';

export interface OnshiQualificationResult {
  header: {
    processExecutionTime?: string;
    qualificationConfirmationDate?: string;
    medicalInstitutionCode?: string;
    /** 1: マイナンバーカード / 2: 被保険者証情報 */
    referenceClassification?: string;
    characterCodeIdentifier?: string;
  };
  /** 券面記載の氏名 */
  name: string;
  /** 券面記載の氏名カナ(全角に正規化済み) */
  nameKana?: string;
  /** YYYY-MM-DD */
  birthDate: string;
  sex?: OnshiSex;
  insurerNumber?: string;
  insurerName?: string;
  insuredCardSymbol?: string;
  insuredIdentificationNumber?: string;
  /** 2桁の枝番 */
  insuredBranchNumber?: string;
  /** 1: 本人 / 2: 家族 などの区分コード */
  personalFamilyClassification?: string;
  /** 被保険者証が有効な最初の日・最後の日 (YYYY-MM-DD) */
  insuredCardValidDate?: string;
  insuredCardExpirationDate?: string;
  /** 券面から確実に分かる負担割合(10/20/30)。後期高齢者の割合、または高齢受給者証の割合だけ。 */
  burdenRatioPercent?: number;
}

const SEGMENT_OF_RESULT_NORMAL = '1';
const SEGMENT_OF_RESULT_PROCESSING = '2';
const PROCESSING_RESULT_STATUS_NORMAL = '1';
const QUALIFICATION_VALIDITY_LABELS: Record<string, string> = {
  '1': '有効',
  '2': '無効',
  '3': '無効（新しい資格あり）',
  '4': '該当資格なし',
  '5': '複数該当'
};
const SEX_BY_CODE: Record<string, OnshiSex> = { '1': 'male', '2': 'female', '3': 'other' };
const VALID_BURDEN_RATIOS = new Set([10, 20, 30]);

function toIsoDate(value: string | undefined, field: string, required: boolean): string | undefined {
  if (value === undefined) {
    if (required) throw new OnshiXmlError('field_invalid', `${field}がありません。`);
    return undefined;
  }
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (!match) throw new OnshiXmlError('field_invalid', `${field}の形式が正しくありません。`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) {
    throw new OnshiXmlError('field_invalid', `${field}が実在しない日付です。`);
  }
  return `${year}-${month}-${day}`;
}

function toIsoDateTime(value: string | undefined): string | undefined {
  const match = value ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}` : undefined;
}

function toBurdenRatio(value: string | undefined): number | undefined {
  if (!value || !/^\d{1,3}$/.test(value)) return undefined;
  const ratio = Number(value);
  return VALID_BURDEN_RATIOS.has(ratio) ? ratio : undefined;
}

function normalizeKana(value: string | undefined): string | undefined {
  // 半角カナ(ﾔﾏﾀﾞ ﾀﾛｳ)を全角カナ(ヤマダ タロウ)にそろえる
  return value ? value.normalize('NFKC').trim() : undefined;
}

export function parseOnshiQualificationXml(xml: string): OnshiQualificationResult {
  const root = parseXmlDocument(xml);
  if (root.name !== 'XmlMsg') throw new OnshiXmlError('field_invalid', '資格確認結果のXML(XmlMsg)ではありません。');

  const header = child(root, 'MessageHeader');
  const body = child(root, 'MessageBody');
  if (!header || !body) throw new OnshiXmlError('field_invalid', '資格確認結果にヘッダーまたは本文がありません。');

  const segment = childText(header, 'SegmentOfResult');
  if (segment === SEGMENT_OF_RESULT_PROCESSING) {
    throw new OnshiXmlError('result_not_final', '資格確認の処理がまだ終わっていません。少し待ってからもう一度読み取ってください。');
  }
  if (segment !== SEGMENT_OF_RESULT_NORMAL) {
    // エラー本文(ErrorMessage)には患者情報が入ることがあるので、画面には出さない
    throw new OnshiXmlError('result_error', `資格確認がエラー終了しています(結果区分 ${segment ?? '不明'})。資格確認端末の画面で確認してください。`);
  }
  if (childText(body, 'ProcessingResultStatus') !== PROCESSING_RESULT_STATUS_NORMAL) {
    throw new OnshiXmlError('result_error', '資格確認の結果がエラーです。資格確認端末の画面で確認してください。');
  }

  const validity = childText(body, 'QualificationValidity');
  if (validity !== undefined && validity !== '1') {
    throw new OnshiXmlError(
      'qualification_invalid',
      `資格が有効ではありません(${QUALIFICATION_VALIDITY_LABELS[validity] ?? `区分 ${validity}`})。資格確認端末の画面で確認してください。`
    );
  }

  const resultList = child(body, 'ResultList');
  const results = (resultList?.children ?? []).filter((element) => element.name === 'ResultOfQualificationConfirmation');
  if (results.length === 0) throw new OnshiXmlError('result_not_found', '資格確認結果に資格情報がありません。');
  if (results.length > 1) {
    throw new OnshiXmlError('result_multiple', '資格確認結果に複数の資格情報があります。先頭を選ばずに止めています。資格確認端末の画面で確認してください。');
  }
  const result = results[0];

  const name = childText(result, 'Name');
  if (!name) throw new OnshiXmlError('field_invalid', '資格確認結果に氏名がありません。');

  const insurerNumber = childText(result, 'InsurerNumber');
  if (insurerNumber !== undefined && !/^\d{6,8}$/.test(insurerNumber)) {
    throw new OnshiXmlError('field_invalid', '保険者番号の形式が正しくありません。');
  }
  const branch = childText(result, 'InsuredBranchNumber');
  if (branch !== undefined && !/^\d{1,2}$/.test(branch)) {
    throw new OnshiXmlError('field_invalid', '被保険者番号の枝番の形式が正しくありません。');
  }

  const sexCode = childText(result, 'Sex1');
  if (sexCode !== undefined && !(sexCode in SEX_BY_CODE)) {
    throw new OnshiXmlError('field_invalid', '性別の区分が正しくありません。');
  }

  const burdenRatioPercent = toBurdenRatio(childText(result, 'InsuredPartialContributionRatio'))
    ?? toBurdenRatio(childText(child(result, 'ElderlyRecipientCertificateInfo'), 'ElderlyRecipientContributionRatio'));

  return {
    header: {
      processExecutionTime: toIsoDateTime(childText(header, 'ProcessExecutionTime')),
      qualificationConfirmationDate: toIsoDate(childText(header, 'QualificationConfirmationDate'), '資格確認日', false),
      medicalInstitutionCode: childText(header, 'MedicalInstitutionCode'),
      referenceClassification: childText(header, 'ReferenceClassification'),
      characterCodeIdentifier: childText(header, 'CharacterCodeIdentifier')
    },
    name,
    nameKana: normalizeKana(childText(result, 'NameKana')),
    birthDate: toIsoDate(childText(result, 'Birthdate'), '生年月日', true) as string,
    ...(sexCode ? { sex: SEX_BY_CODE[sexCode] } : {}),
    ...(insurerNumber ? { insurerNumber } : {}),
    ...(childText(result, 'InsurerName') ? { insurerName: childText(result, 'InsurerName') } : {}),
    ...(childText(result, 'InsuredCardSymbol') ? { insuredCardSymbol: childText(result, 'InsuredCardSymbol')!.normalize('NFKC') } : {}),
    ...(childText(result, 'InsuredIdentificationNumber') ? { insuredIdentificationNumber: childText(result, 'InsuredIdentificationNumber')!.normalize('NFKC') } : {}),
    ...(branch ? { insuredBranchNumber: branch.padStart(2, '0') } : {}),
    ...(childText(result, 'PersonalFamilyClassification') ? { personalFamilyClassification: childText(result, 'PersonalFamilyClassification') } : {}),
    ...(toIsoDate(childText(result, 'InsuredCardValidDate'), '被保険者証の有効開始日', false)
      ? { insuredCardValidDate: toIsoDate(childText(result, 'InsuredCardValidDate'), '被保険者証の有効開始日', false) }
      : {}),
    ...(toIsoDate(childText(result, 'InsuredCardExpirationDate'), '被保険者証の有効終了日', false)
      ? { insuredCardExpirationDate: toIsoDate(childText(result, 'InsuredCardExpirationDate'), '被保険者証の有効終了日', false) }
      : {}),
    ...(burdenRatioPercent !== undefined ? { burdenRatioPercent } : {})
  };
}

// ------------------------------------------------------------------
// 文字コード
// ------------------------------------------------------------------

export type OnshiXmlEncoding = 'utf-8' | 'shift_jis';

const CHARACTER_CODE_BY_IDENTIFIER: Record<string, OnshiXmlEncoding> = { '0': 'utf-8', '1': 'shift_jis' };

function encodingFromLabel(label: string): OnshiXmlEncoding | null {
  const normalized = label.trim().toLowerCase().replace(/_/g, '-');
  if (normalized === 'utf-8' || normalized === 'utf8') return 'utf-8';
  if (['shift-jis', 'shiftjis', 'sjis', 'windows-31j', 'cp932', 'ms932', 'x-sjis'].includes(normalized)) return 'shift_jis';
  return null;
}

/**
 * ファイルのバイト列をXML宣言どおりの文字コードで復号する。
 * 宣言と中身が合わない場合に黙って直さず、エラーにする(文字化けしたまま氏名を受付へ入れないため)。
 */
export function decodeOnshiXml(bytes: Uint8Array): { text: string; encoding: OnshiXmlEncoding } {
  const hasUtf8Bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const headBytes = bytes.subarray(hasUtf8Bom ? 3 : 0, Math.min(bytes.length, 256));
  const head = Array.from(headBytes, (byte) => String.fromCharCode(byte)).join('');
  const declaration = /^\s*<\?xml[^>]*?\sencoding\s*=\s*["']([^"']+)["']/i.exec(head);
  const declared = declaration ? encodingFromLabel(declaration[1]) : 'utf-8';
  if (!declared) throw new OnshiXmlError('encoding_mismatch', `XMLの文字コード(${declaration?.[1]})に対応していません。`);
  if (hasUtf8Bom && declared !== 'utf-8') throw new OnshiXmlError('encoding_mismatch', 'XMLの文字コードの宣言とファイルの先頭(BOM)が一致しません。');

  try {
    const text = new TextDecoder(declared, { fatal: true, ignoreBOM: false }).decode(bytes);
    return { text, encoding: declared };
  } catch {
    throw new OnshiXmlError('encoding_mismatch', 'XMLを宣言された文字コードで読めませんでした(文字化けのおそれ)。');
  }
}

/** ヘッダーの CharacterCodeIdentifier(0: UTF-8, 1: Shift_JIS)と、実際に復号した文字コードが一致するか。 */
export function assertCharacterCodeMatches(result: OnshiQualificationResult, encoding: OnshiXmlEncoding): void {
  const identifier = result.header.characterCodeIdentifier;
  if (identifier === undefined) return;
  const expected = CHARACTER_CODE_BY_IDENTIFIER[identifier];
  if (!expected || expected !== encoding) {
    throw new OnshiXmlError('encoding_mismatch', '資格確認結果の文字コード指定とファイルの文字コードが一致しません。');
  }
}
