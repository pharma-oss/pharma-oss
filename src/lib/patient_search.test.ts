import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPatientSearchQuery, extractPatientHintsFromQuery, searchPatients, type SearchablePatient } from '@/lib/patient_search';

const patients: SearchablePatient[] = [
  { patientId: 'p1', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1985-03-15', insuranceInfo: { provider: '06139999', number: '記号12 番号345' } },
  { patientId: 'p2', name: '山田 花子', kana: 'ヤマダ ハナコ', birthDate: '1990-01-01', insuranceInfo: { number: '12345678' } },
  { patientId: 'p3', name: '鈴木 一郎', kana: 'スズキ イチロウ', birthDate: '1985-03-15' },
  { patientId: 'p4', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1962-11-30' },
  { patientId: 'p5', name: '佐藤 次郎', kana: '', birthDate: '1985-12-01' }
];

const ids = (query: string, limit?: number) => searchPatients(patients, query, limit).map((match) => match.patient.patientId);

describe('searchPatients: 生年月日', () => {
  it('半角8桁の数字で同じ生年月日の患者を探せる', () => {
    assert.deepEqual(ids('19850315').sort(), ['p1', 'p3']);
  });

  it('区切り付き・年月日付きの入力も同じ日付として探せる', () => {
    assert.deepEqual(ids('1985-03-15').sort(), ['p1', 'p3']);
    assert.deepEqual(ids('1985/3/15').sort(), ['p1', 'p3']);
    assert.deepEqual(ids('1985年3月15日').sort(), ['p1', 'p3']);
  });

  it('全角数字の8桁でも探せる', () => {
    assert.deepEqual(ids('１９８５０３１５').sort(), ['p1', 'p3']);
  });

  it('実在しない日付の8桁は生年月日として扱わない(2月30日)', () => {
    assert.deepEqual(ids('19850230'), []);
  });

  it('入力途中の数字(4桁以上)は生年月日の先頭として探し、3桁以下は条件にしない', () => {
    assert.deepEqual(ids('1985').sort(), ['p1', 'p3', 'p5']);
    assert.deepEqual(ids('198503').sort(), ['p1', 'p3']);
    assert.deepEqual(ids('198'), []);
  });
});

describe('searchPatients: 氏名・フリガナ', () => {
  it('氏名の一部で探せ、空白の有無・全角半角を区別しない', () => {
    assert.deepEqual(ids('太郎').sort(), ['p1', 'p4']);
    assert.deepEqual(ids('山田太郎').sort(), ['p1', 'p4']);
    assert.deepEqual(ids('山田　太郎').sort(), ['p1', 'p4']);
  });

  it('フリガナは、ひらがな・カタカナ・半角カナのどれでも探せる', () => {
    assert.deepEqual(ids('やまだ').sort(), ['p1', 'p2', 'p4']);
    assert.deepEqual(ids('ヤマダ').sort(), ['p1', 'p2', 'p4']);
    assert.deepEqual(ids('ﾔﾏﾀﾞ').sort(), ['p1', 'p2', 'p4']);
    assert.deepEqual(ids('すずき'), ['p3']);
  });

  it('フリガナが空の患者は氏名だけで探せる', () => {
    assert.deepEqual(ids('佐藤'), ['p5']);
  });
});

describe('searchPatients: 組み合わせ', () => {
  it('氏名と生年月日8桁を空白で区切ると、両方に当てはまる患者だけに絞る', () => {
    assert.deepEqual(ids('山田 19850315'), ['p1']);
    // 同姓同名でも、生年月日で別の人を選び分けられる
    assert.deepEqual(ids('山田 太郎 19621130'), ['p4']);
  });

  it('氏名と生年月日の両方が合う候補は低リスク、同姓同名が複数いて生年月日が無いと高リスクで警告する', () => {
    const [both] = searchPatients(patients, '山田 19850315');
    assert.equal(both.risk, 'low');
    assert.equal(both.warning, undefined);

    const sameName = searchPatients(patients, '山田太郎');
    assert.deepEqual(sameName.map((match) => match.risk), ['high', 'high']);
    assert.match(sameName[0].warning ?? '', /同姓同名/);
  });

  it('一致した理由を返す', () => {
    const [match] = searchPatients(patients, '山田 19850315');
    assert.deepEqual(match.reasonLabels, ['氏名一致', '生年月日一致']);
    assert.equal(searchPatients(patients, 'ヤマダ ハナコ')[0].reasonLabels[0], 'フリガナ一致');
  });

  it('氏名が完全に一致する患者、先頭が一致する患者、一部が一致する患者の順に並べる', () => {
    const ranked: SearchablePatient[] = [
      { patientId: 'includes', name: '山田 太郎', birthDate: '1970-01-01' },
      { patientId: 'startsWith', name: '太郎丸 一', birthDate: '1970-01-02' },
      { patientId: 'exact', name: '太郎', birthDate: '1970-01-03' }
    ];
    assert.deepEqual(searchPatients(ranked, '太郎').map((match) => match.patient.patientId), ['exact', 'startsWith', 'includes']);
  });
});

describe('searchPatients: 保険者番号', () => {
  it('保険者番号の先頭(4桁以上)で探せる', () => {
    assert.deepEqual(ids('06139'), ['p1']);
    assert.deepEqual(ids('12345678'), ['p2']);
  });
});

describe('searchPatients: 全部に合う患者がいないとき', () => {
  it('一部だけ合う患者を、高リスクと警告つきで返す(処方箋の誤読で二重登録しないための安全網)', () => {
    const result = searchPatients(patients, '山田 大郎 19850315');
    assert.ok(result.length > 0);
    assert.ok(result.every((match) => match.matchKind === 'partial'));
    assert.ok(result.every((match) => match.risk === 'high'));
    assert.match(result[0].warning ?? '', /一部だけ/);
    // 生年月日も「山田」も合う山田太郎(1985)が先頭
    assert.equal(result[0].patient.patientId, 'p1');
  });

  it('全部に合う患者がいるときは、一部だけ合う患者を混ぜない', () => {
    const result = searchPatients(patients, '山田 19850315');
    assert.ok(result.every((match) => match.matchKind === 'all'));
  });

  it('条件が1つで、誰にも合わなければ空', () => {
    assert.deepEqual(ids('存在しない名前'), []);
  });
});

describe('searchPatients: 入力が空・件数', () => {
  it('空白だけ・空の入力は何も返さない', () => {
    assert.deepEqual(ids(''), []);
    assert.deepEqual(ids('   '), []);
  });

  it('件数の上限を守る', () => {
    assert.equal(ids('山田', 2).length, 2);
  });
});

describe('buildPatientSearchQuery', () => {
  it('氏名と生年月日を空白で連ねる。片方だけでも、空でも崩れない', () => {
    assert.equal(buildPatientSearchQuery({ name: ' 山田 太郎 ', birthDate: '1985-03-15' }), '山田 太郎 1985-03-15');
    assert.equal(buildPatientSearchQuery({ name: '山田 太郎' }), '山田 太郎');
    assert.equal(buildPatientSearchQuery({ birthDate: '1985-03-15' }), '1985-03-15');
    assert.equal(buildPatientSearchQuery({}), '');
  });

  it('作った文字列で、元の患者が見つかる', () => {
    const query = buildPatientSearchQuery({ name: '山田 太郎', birthDate: '1985-03-15' });
    assert.deepEqual(ids(query), ['p1']);
  });
});

describe('extractPatientHintsFromQuery', () => {
  it('検索欄の文字から氏名と生年月日を取り出す(生年月日は8桁・区切り付きのどちらでも YYYY-MM-DD)', () => {
    assert.deepEqual(extractPatientHintsFromQuery('山田 太郎 19850315'), { name: '山田 太郎', birthDate: '1985-03-15' });
    assert.deepEqual(extractPatientHintsFromQuery('1985/3/15 やまだ'), { name: 'やまだ', birthDate: '1985-03-15' });
  });

  it('生年月日だけ・氏名だけでも取り出せ、数字の途中入力(1985)は氏名に混ぜない', () => {
    assert.deepEqual(extractPatientHintsFromQuery('19850315'), { name: '', birthDate: '1985-03-15' });
    assert.deepEqual(extractPatientHintsFromQuery('山田'), { name: '山田', birthDate: '' });
    assert.deepEqual(extractPatientHintsFromQuery('山田 1985'), { name: '山田', birthDate: '' });
    assert.deepEqual(extractPatientHintsFromQuery(''), { name: '', birthDate: '' });
  });
});
