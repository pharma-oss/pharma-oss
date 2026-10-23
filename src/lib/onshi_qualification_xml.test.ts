import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OnshiXmlError,
  assertCharacterCodeMatches,
  decodeOnshiXml,
  parseOnshiQualificationXml,
  parseXmlDocument
} from './onshi_qualification_xml';

// 公式の仕様書は未入手。項目名と値の意味は、公開されている無料ソフトの実装・サンプルから読み取った形式(本文は架空の人物)。
interface SampleOptions {
  segment?: string;
  status?: string;
  validity?: string;
  charCode?: string;
  extraResult?: boolean;
  resultBody?: string;
  declaration?: string;
}

function buildSampleXml(options: SampleOptions = {}): string {
  const {
    segment = '1',
    status = '1',
    validity,
    charCode = '0',
    extraResult = false,
    declaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    resultBody = `
        <InsuredCardClassification>01</InsuredCardClassification>
        <Name>検証 花子</Name>
        <NameKana>ｹﾝｼｮｳ ﾊﾅｺ</NameKana>
        <Sex1>2</Sex1>
        <Birthdate>19850315</Birthdate>
        <InsurerName>架空健康保険組合</InsurerName>
        <InsurerNumber>01234567</InsurerNumber>
        <InsuredCardSymbol>１２３</InsuredCardSymbol>
        <InsuredIdentificationNumber>456</InsuredIdentificationNumber>
        <InsuredBranchNumber>1</InsuredBranchNumber>
        <PersonalFamilyClassification>1</PersonalFamilyClassification>
        <InsuredCardValidDate>20240401</InsuredCardValidDate>
        <InsuredCardExpirationDate>20990331</InsuredCardExpirationDate>`
  } = options;
  const result = `<ResultOfQualificationConfirmation>${resultBody}</ResultOfQualificationConfirmation>`;
  return `${declaration}
<XmlMsg>
  <MessageHeader>
    <ProcessExecutionTime>20261023091530</ProcessExecutionTime>
    <QualificationConfirmationDate>20261023</QualificationConfirmationDate>
    <MedicalInstitutionCode>1311234567</MedicalInstitutionCode>
    <ReferenceClassification>1</ReferenceClassification>
    <SegmentOfResult>${segment}</SegmentOfResult>
    <CharacterCodeIdentifier>${charCode}</CharacterCodeIdentifier>
  </MessageHeader>
  <MessageBody>
    <ProcessingResultStatus>${status}</ProcessingResultStatus>
    ${validity ? `<QualificationValidity>${validity}</QualificationValidity>` : ''}
    <ResultList>${result}${extraResult ? result : ''}</ResultList>
  </MessageBody>
</XmlMsg>`;
}

function expectError(action: () => unknown, code: string) {
  assert.throws(action, (error: unknown) => error instanceof OnshiXmlError && error.code === code, `expected ${code}`);
}

describe('parseOnshiQualificationXml', () => {
  it('reads the fields reception needs from a normal result', () => {
    const result = parseOnshiQualificationXml(buildSampleXml());
    assert.equal(result.name, '検証 花子');
    assert.equal(result.nameKana, 'ケンショウ ハナコ', 'half-width kana is normalized to full-width');
    assert.equal(result.birthDate, '1985-03-15');
    assert.equal(result.sex, 'female');
    assert.equal(result.insurerNumber, '01234567');
    assert.equal(result.insuredCardSymbol, '123', 'full-width digits are normalized');
    assert.equal(result.insuredIdentificationNumber, '456');
    assert.equal(result.insuredBranchNumber, '01', 'a one-digit branch number is padded to two digits');
    assert.equal(result.header.processExecutionTime, '2026-10-23 09:15:30');
    assert.equal(result.header.referenceClassification, '1');
    assert.equal(result.insuredCardValidDate, '2024-04-01');
  });

  it('does not invent a burden ratio when the card does not state one', () => {
    assert.equal(parseOnshiQualificationXml(buildSampleXml()).burdenRatioPercent, undefined);
  });

  it('takes the burden ratio from the late-elderly ratio or the elderly recipient certificate only', () => {
    const koki = parseOnshiQualificationXml(buildSampleXml({
      resultBody: '<Name>検証 太郎</Name><Sex1>1</Sex1><Birthdate>19450101</Birthdate><InsuredPartialContributionRatio>010</InsuredPartialContributionRatio>'
    }));
    assert.equal(koki.burdenRatioPercent, 10);
    const kourei = parseOnshiQualificationXml(buildSampleXml({
      resultBody: '<Name>検証 次郎</Name><Sex1>1</Sex1><Birthdate>19500101</Birthdate><ElderlyRecipientCertificateInfo><ElderlyRecipientContributionRatio>030</ElderlyRecipientContributionRatio></ElderlyRecipientCertificateInfo>'
    }));
    assert.equal(kourei.burdenRatioPercent, 30);
    const odd = parseOnshiQualificationXml(buildSampleXml({
      resultBody: '<Name>検証 三郎</Name><Sex1>1</Sex1><Birthdate>19500101</Birthdate><InsuredPartialContributionRatio>025</InsuredPartialContributionRatio>'
    }));
    assert.equal(odd.burdenRatioPercent, undefined, 'a ratio that is not 10/20/30 is not trusted');
  });

  it('stops while the result is still being processed or ended abnormally', () => {
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ segment: '2' })), 'result_not_final');
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ segment: '9' })), 'result_error');
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ status: '2' })), 'result_error');
  });

  it('stops when the qualification is not valid', () => {
    for (const validity of ['2', '3', '4', '5']) {
      expectError(() => parseOnshiQualificationXml(buildSampleXml({ validity })), 'qualification_invalid');
    }
    assert.equal(parseOnshiQualificationXml(buildSampleXml({ validity: '1' })).name, '検証 花子');
  });

  it('refuses a file with several people instead of picking the first one', () => {
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ extraResult: true })), 'result_multiple');
  });

  it('refuses a file with no qualification and a file that is not a result message', () => {
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ resultBody: '' }).replace(/<ResultOfQualificationConfirmation>[\s\S]*<\/ResultOfQualificationConfirmation>/, '')), 'result_not_found');
    expectError(() => parseOnshiQualificationXml('<Other><A>1</A></Other>'), 'field_invalid');
  });

  it('rejects impossible dates, malformed numbers and unknown codes', () => {
    const base = '<Name>検証 花子</Name><Sex1>2</Sex1>';
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ resultBody: `${base}<Birthdate>19850231</Birthdate>` })), 'field_invalid');
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ resultBody: `${base}<Birthdate>1985-03-15</Birthdate>` })), 'field_invalid');
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ resultBody: `${base}<Birthdate>19850315</Birthdate><InsurerNumber>12-34</InsurerNumber>` })), 'field_invalid');
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ resultBody: `<Name>検証 花子</Name><Sex1>9</Sex1><Birthdate>19850315</Birthdate>` })), 'field_invalid');
    expectError(() => parseOnshiQualificationXml(buildSampleXml({ resultBody: `<Sex1>2</Sex1><Birthdate>19850315</Birthdate>` })), 'field_invalid');
  });

  it('does not let a missing insurer number pass as an empty string', () => {
    const result = parseOnshiQualificationXml(buildSampleXml({ resultBody: '<Name>検証 花子</Name><Sex1>2</Sex1><Birthdate>19850315</Birthdate>' }));
    assert.equal(result.insurerNumber, undefined);
  });
});

describe('parseXmlDocument', () => {
  it('refuses DTDs and entity declarations', () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY x "boom">]><a>&x;</a>';
    expectError(() => parseXmlDocument(bomb), 'xml_forbidden_construct');
    expectError(() => parseXmlDocument('<a>&unknown;</a>'), 'xml_forbidden_construct');
  });

  it('rejects malformed documents', () => {
    expectError(() => parseXmlDocument('<a><b></a></b>'), 'xml_malformed');
    expectError(() => parseXmlDocument('<a>'), 'xml_malformed');
    expectError(() => parseXmlDocument('<a/><b/>'), 'xml_malformed');
    expectError(() => parseXmlDocument('text<a/>'), 'xml_malformed');
    expectError(() => parseXmlDocument('<a>\u0001</a>'), 'xml_malformed');
  });

  it('decodes predefined entities, character references, CDATA and comments', () => {
    const root = parseXmlDocument('<?xml version="1.0"?><!-- c --><a x="1"><b>&lt;&amp;&#65;&#x42;</b><c><![CDATA[<raw>]]></c><d/></a>');
    assert.equal(root.children[0].text, '<&AB');
    assert.equal(root.children[1].text, '<raw>');
    assert.equal(root.children[2].name, 'd');
  });

  it('limits size and nesting', () => {
    expectError(() => parseXmlDocument(`<a>${'x'.repeat(5 * 1024 * 1024)}</a>`), 'xml_too_large');
    const deep = '<a>'.repeat(40) + '</a>'.repeat(40);
    expectError(() => parseXmlDocument(deep), 'xml_too_large');
  });
});

describe('decodeOnshiXml and assertCharacterCodeMatches', () => {
  it('decodes UTF-8 files, with or without a BOM', () => {
    const xml = buildSampleXml();
    const utf8 = new TextEncoder().encode(xml);
    assert.equal(decodeOnshiXml(utf8).encoding, 'utf-8');
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]);
    assert.ok(decodeOnshiXml(withBom).text.includes('検証 花子'));
  });

  it('decodes a Shift_JIS file that declares Shift_JIS', () => {
    // 「マイナ」をShift_JISにしたバイト列を含む最小のXML
    const prefix = new TextEncoder().encode('<?xml version="1.0" encoding="Shift_JIS"?><a>');
    const sjis = new Uint8Array([0x83, 0x7d, 0x83, 0x43, 0x83, 0x69]);
    const suffix = new TextEncoder().encode('</a>');
    const decoded = decodeOnshiXml(new Uint8Array([...prefix, ...sjis, ...suffix]));
    assert.equal(decoded.encoding, 'shift_jis');
    assert.ok(decoded.text.includes('マイナ'));
  });

  it('refuses garbled text instead of repairing it', () => {
    // UTF-8として宣言されているのに、中身がShift_JISのバイト列
    const prefix = new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><a>');
    const sjis = new Uint8Array([0x83, 0x7d, 0x83, 0x43]);
    expectError(() => decodeOnshiXml(new Uint8Array([...prefix, ...sjis, ...new TextEncoder().encode('</a>')])), 'encoding_mismatch');
    expectError(() => decodeOnshiXml(new TextEncoder().encode('<?xml version="1.0" encoding="EUC-JP"?><a/>')), 'encoding_mismatch');
  });

  it('checks the header character code against the real encoding', () => {
    const result = parseOnshiQualificationXml(buildSampleXml({ charCode: '1' }));
    expectError(() => assertCharacterCodeMatches(result, 'utf-8'), 'encoding_mismatch');
    assertCharacterCodeMatches(result, 'shift_jis');
    assertCharacterCodeMatches(parseOnshiQualificationXml(buildSampleXml({ charCode: '0' })), 'utf-8');
  });
});
