// page/qa-board.html(편집 화면)에 보기 모드와 저장소를 끼워 public/index.html 을 만든다.
// 실행: node build/make.js
const fs = require('fs');
const path = require('path');
const here = __dirname;
const read = f => fs.readFileSync(path.join(here, f), 'utf8');
let h = fs.readFileSync(path.join(here, '..', 'page', 'qa-board.html'), 'utf8');

const must = (cond, what) => { if (!cond) throw new Error('찾지 못함: ' + what); };
const swap = (from, to, what) => { must(h.includes(from), what); h = h.replace(from, to); };

h = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n' + h;
swap('</style>\n', read('report.css') + '</style>\n</head>\n<body>\n', '</style>');
swap('<div id="app">', read('report.html') + '<div id="app" hidden>', '#app');
// 편집 화면 머리에 연결 상태와 보기 모드 버튼
swap('<h1>기기 QA 보드</h1>', '<div class="editbar"><h1>기기 QA 보드</h1><span class="sync" data-sync>연결 중</span></div><button type="button" class="modebtn" id="toView" hidden>보기 모드</button>', 'h1');
// 화면 그리기: 보기 모드면 현황 보고만
swap('  function render(){\n', '  function render(){\n    if(viewMode){renderReport();return;}\n', 'render()');
// 저장소 자리에 보기 모드 + 저장소(Cloudflare D1)
const a = h.indexOf('  /* ---------- storage ---------- */');
const b = h.indexOf('  init();\n})();');
must(a > 0 && b > a, 'storage 구간');
h = h.slice(0, a) + read('report.js') + read('tail.js') + h.slice(b + '  init();\n})();'.length);
h = h.replace(/<\/script>\s*$/, '</script>\n</body>\n</html>\n');

fs.mkdirSync(path.join(here, '..', 'public'), { recursive: true });
fs.writeFileSync(path.join(here, '..', 'public', 'index.html'), h);
console.log('public/index.html', h.length, 'bytes');
