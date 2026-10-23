// 기기 QA 보드 — 기록 저장소 (Cloudflare Worker + D1)
// 로그인 없이 링크를 가진 사람이 보고 고친다 (팀 안에서 링크로 나눠 쓰는 용도). 고치기 전 기록은 페이지가 history 에 남긴다.
// 문서 하나 = docs 한 줄 (col, id, body). 바뀔 때마다 meta.rev 를 올려서 페이지는 /api/ver 만 자주 본다.

const COLS = new Set(['issues', 'checked_tablet', 'checked_board', 'general', 'history']);
const LIVE = ['issues', 'checked_tablet', 'checked_board', 'general']; // history 는 /api/all 에 안 실음
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
const MAX_BODY = 32 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

async function rev(db) {
  const r = await db.prepare("SELECT v FROM meta WHERE k='rev'").first();
  return r ? Number(r.v) : 0;
}
const bump = db => db.prepare("INSERT INTO meta(k,v) VALUES('rev',1) ON CONFLICT(k) DO UPDATE SET v=v+1");

async function api(req, env, path) {
  const db = env.DB;
  if (req.method === 'GET' && path === '/api/ver') return json({ rev: await rev(db) });
  if (req.method === 'GET' && path === '/api/all') {
    const { results } = await db
      .prepare(`SELECT col,id,body FROM docs WHERE col IN (${LIVE.map(() => '?').join(',')})`)
      .bind(...LIVE)
      .all();
    const out = Object.fromEntries(LIVE.map(c => [c, {}]));
    for (const r of results) out[r.col][r.id] = JSON.parse(r.body);
    return json({ rev: await rev(db), at: new Date().toISOString(), data: out });
  }

  const m = path.match(/^\/api\/doc\/([a-z_]+)\/([^/]+)$/);
  if (!m) return json({ error: 'not_found' }, 404);
  const [, col, rawId] = m;
  const id = decodeURIComponent(rawId);
  if (!COLS.has(col) || !ID.test(id)) return json({ error: 'invalid_argument' }, 400);

  if (req.method === 'PUT') {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'invalid_argument' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'invalid_argument' }, 400);
    await db.batch([
      db
        .prepare(
          'INSERT INTO docs(col,id,body,updated_at) VALUES(?,?,?,?) ON CONFLICT(col,id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at'
        )
        .bind(col, id, JSON.stringify(body), new Date().toISOString()),
      bump(db)
    ]);
    return json({ ok: true, rev: await rev(db) });
  }
  if (req.method === 'DELETE') {
    await db.batch([db.prepare('DELETE FROM docs WHERE col=? AND id=?').bind(col, id), bump(db)]);
    return json({ ok: true, rev: await rev(db) });
  }
  return json({ error: 'method_not_allowed' }, 405);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url.pathname);
      } catch (e) {
        return json({ error: 'unavailable', detail: String(e && e.message) }, 503);
      }
    }
    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'no-cache');
    return out;
  }
};
