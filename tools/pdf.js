// 보기 모드를 A4 PDF 로 뽑는다 (메일에 붙일 현황 보고용).
// 헤드리스 Chrome 을 DevTools 프로토콜로 몰아 인쇄 미디어·밝은 테마로 바꾸고 Page.printToPDF 를 부른다.
// 실행: node tools/pdf.js <주소> <저장할.pdf> [배율=0.8]
//   CHROME 환경 변수로 Chrome 경로를 바꿀 수 있다. Node 22 이상 (전역 WebSocket).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [url, out, scaleArg] = process.argv.slice(2);
if (!url || !out) { console.error('사용법: node tools/pdf.js <주소> <저장할.pdf> [배율]'); process.exit(2); }
const scale = +(scaleArg || 0.8);
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9333;
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-pdf-'));
const ch = spawn(chrome, ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let tabs;
  for (let i = 0; i < 40; i++) {
    try { tabs = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); if (tabs.find(t => t.type === 'page')) break; } catch {}
    await sleep(250);
  }
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0;
  const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { media: 'print', features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  // A4 인쇄 폭(약 711px)을 배율로 나눈 폭에서 화면을 그려야 PDF 의 두 칸 배치가 화면과 같아진다
  await send('Emulation.setDeviceMetricsOverride', { width: Math.round(711 / scale), height: Math.round(1040 / scale), deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  // 첫 동기화(/api/all)와 그리기를 기다림
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const r = await send('Runtime.evaluate', { expression: '/실시간/.test(document.querySelector("[data-sync]")?.textContent||"")', returnByValue: true });
    if (r.result.result.value) break;
  }
  await sleep(500);
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, scale, displayHeaderFooter: false });
  fs.writeFileSync(out, Buffer.from(pdf.result.data, 'base64'));
  console.log('PDF', out);
  ws.close();
  ch.kill();
  process.exit(0);
})().catch(e => { console.error(e); ch.kill(); process.exit(1); });
