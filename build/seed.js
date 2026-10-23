// 예시 기록(seed.sql)을 만든다. 실제 기록이 아니라 화면을 보여 주려고 지어낸 데이터다.
// 실행: node build/seed.js → seed.sql  (npm run seed 가 로컬 D1 에 넣는 것까지 한다)
const fs = require('fs');
const path = require('path');

// 페이지와 같은 학습코드 체계: 과목 · 레벨 · 호 · 주 · 차시
const SUBJ = ['KO', 'MA', 'EN'];
const MONTHS = ['01', '02', '03', '04', '05', '06'];
const CODES = [];
MONTHS.forEach(m => SUBJ.forEach(s => {
  for (let l = 1; l <= 3; l++) for (let w = 1; w <= 4; w++) for (let st = 1; st <= 3; st++)
    CODES.push({ code: s + 'L' + l + 'M' + m + 'W' + w + 'S' + st, s, m: +m, l, w, st });
}));

// 늘 같은 결과가 나오게 고정 씨앗
let seed = 20261023;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = a => a[Math.floor(rnd() * a.length)];

const TABLET_FRAME = [
  '활동 중 프레임 약간 감소', '활동 중 프레임 감소', 'Lottie 재생 중 프레임 감소', 'Lottie 재생 중 프레임 크게 감소',
  '영상 재생 중 프레임 감소', '드래그 중 프레임 간혹 감소', '화면 전환 중 프레임 감소 (활동 진행 어려움)',
  '아웃트로 재생 중 프레임 감소', '활동 진입 시 프레임 감소 (심각)'
];
const BOARD_FRAME = ['활동 중 프레임 약간 감소', '영상 재생 중 프레임 간혹 감소'];
const OTHER = [
  ['내레이션', '내레이션이 늦게 나옴'], ['사운드', '소리가 겹쳐서 나옴'], ['사운드', '효과음이 나오지 않음'],
  ['터치', '드래그가 매끄럽지 않음'], ['화면', '화면이 잘려서 보임'], ['기타', '진입 로딩이 오래 걸림']
];
const at = (day, n) => new Date(Date.UTC(2026, 9, day, 0, 0, 0) + n * 61000).toISOString();

// 어디까지 봤는지: 태블릿은 1~4호, 전자칠판은 1~2호와 3호 한글
const tabletSeen = c => c.m <= 3 || (c.m === 4 && c.s !== 'EN');
const boardSeen = c => c.m <= 2 || (c.m === 3 && c.s === 'KO');

const issues = {}, checkedTablet = {}, checkedBoard = {};
let n = 0;
CODES.forEach(c => {
  n++;
  const blank = { memo: '', types: [] };
  const doc = { code: c.code, tablet: { ...blank }, board: { ...blank }, resolved: false };
  if (tabletSeen(c)) {
    const r = rnd();
    if (r < 0.13) doc.tablet = { types: ['프레임'], memo: pick(TABLET_FRAME) };
    else if (r < 0.16) { const [t, memo] = pick(OTHER); doc.tablet = { types: [t], memo }; }
  }
  if (boardSeen(c)) {
    const r = rnd();
    if (r < 0.04) doc.board = { types: ['프레임'], memo: pick(BOARD_FRAME) };
    else if (r < 0.06) { const [t, memo] = pick(OTHER); doc.board = { types: [t], memo }; }
  }
  // 말하기 모듈(KO/SpeakWord, 페이지의 예시 MOD 와 같은 규칙)은 전자칠판에서 음성 인식 문제
  const k = (c.w - 1) * 3 + (c.st - 1);
  const speak = c.s === 'KO' && k !== 0 && !(c.m === 4 && k === 7) && !(c.m >= 5 && k % 4 === 2) && (k + c.l) % 7 === 4;
  if (boardSeen(c) && speak && c.l <= 2)
    doc.board = { types: ['마이크'], memo: '서버 음성 인식 모드에서 말한 낱말을 정확히 못 알아들음' };
  const hasT = doc.tablet.memo !== '', hasB = doc.board.memo !== '';
  if (hasT || hasB) {
    doc.resolved = rnd() < 0.12;
    doc.updatedAt = at(20 + Math.floor(n / 220), n);
    issues[c.code] = doc;
  }
  if (tabletSeen(c) && !hasT) checkedTablet[c.code] = { code: c.code, at: at(20 + Math.floor(n / 220), n) };
  if (boardSeen(c) && !hasB) checkedBoard[c.code] = { code: c.code, at: at(22, n) };
});

const general = {
  gdemo01: {
    devices: ['태블릿'], types: ['프레임'], scope: '전체',
    memo: '가이드 영상 재생 중 프레임 감소\n아웃트로 재생 중 프레임 감소',
    resolved: false, createdAt: at(20, 10), updatedAt: at(21, 30)
  },
  gdemo02: {
    devices: ['전자칠판'], types: ['마이크'], scope: '마이크 쓰는 액티비티',
    memo: '음성 인식이 말한 낱말을 정확히 못 알아들음 (예: "사과"라고 하면 "사가"로 인식)\n서버 음성 인식 모드에서만 그런 것으로 보임',
    resolved: false, createdAt: at(22, 5), updatedAt: at(22, 9)
  },
  gdemo03: {
    devices: ['태블릿', '전자칠판'], types: ['기타'], scope: '앱 첫 실행',
    memo: '앱을 처음 열 때 로딩이 20초 넘게 걸림',
    resolved: true, createdAt: at(20, 2), updatedAt: at(21, 3)
  }
};

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const rows = [];
const put = (col, docs) => Object.entries(docs).forEach(([id, body]) =>
  rows.push('INSERT OR REPLACE INTO docs(col,id,body,updated_at) VALUES(' + [col, id, JSON.stringify(body), body.updatedAt || body.at || at(23, 0)].map(q).join(',') + ');'));
put('issues', issues);
put('checked_tablet', checkedTablet);
put('checked_board', checkedBoard);
put('general', general);
rows.push("INSERT INTO meta(k,v) VALUES('rev',1) ON CONFLICT(k) DO UPDATE SET v=v+1;");

fs.writeFileSync(path.join(__dirname, '..', 'seed.sql'), rows.join('\n') + '\n');
console.log('seed.sql — 문제', Object.keys(issues).length, '· 태블릿 확인', Object.keys(checkedTablet).length,
  '· 전자칠판 확인', Object.keys(checkedBoard).length, '· 공통', Object.keys(general).length);
