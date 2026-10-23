  /* ---------- 보기 / 편집 전환 ---------- */
  function applyMode(){
    document.body.classList.toggle('viewing',viewMode);
    $('app').hidden=viewMode;$('report').hidden=!viewMode;
    $('toEdit').hidden=false;$('toView').hidden=false;
    if(viewMode)$('backBtn').hidden=true;else updateBack();
    render();
  }
  async function setViewMode(v){
    if(v&&dirty()&&!(await save(draft.code)))return;
    viewMode=v;ls.set('qa.viewMode',v);if(v){openCode=null;draft=null;}
    applyMode();window.scrollTo(0,0);
  }
  $('toEdit').addEventListener('click',()=>setViewMode(false));
  $('toView').addEventListener('click',()=>setViewMode(true));

  /* ---------- storage (Cloudflare D1) ---------- */
  // 로그인 없이 위 버튼으로 보기 ↔ 편집. 처음 여는 기기는 보기 모드
  let viewMode=true, lastSync=null, syncErr=false;
  function updateSyncLabel(){
    const t=syncErr?'연결 끊김 · 다시 시도 중':lastSync?'실시간 · '+p2(lastSync.getHours())+':'+p2(lastSync.getMinutes())+':'+p2(lastSync.getSeconds())+' 확인':'연결 중';
    document.querySelectorAll('[data-sync]').forEach(el=>{el.textContent=t;el.classList.toggle('bad',syncErr);});
  }
  function makeDb(){
    const subs={},errs=[];let rev=-1,data=null,busy=null;
    const snapOf=c=>({docs:Object.entries((data&&data[c])||{}).map(([id,b])=>({id,exists:true,data:()=>b}))});
    function pull(force){
      if(busy)return busy;
      busy=(async()=>{
        try{
          if(!force&&data){
            const v=await (await fetch('/api/ver',{cache:'no-store'})).json();
            if(v.rev===rev){lastSync=new Date();if(syncErr){syncErr=false;banner('');}updateSyncLabel();return;}
          }
          const r=await fetch('/api/all',{cache:'no-store'});if(!r.ok)throw new Error('all '+r.status);
          const a=await r.json();rev=a.rev;data=a.data;lastSync=new Date();
          if(syncErr){syncErr=false;banner('');}
          Object.keys(subs).forEach(c=>subs[c].forEach(cb=>cb(snapOf(c))));
          updateSyncLabel();
        }catch(e){syncErr=true;updateSyncLabel();errs.forEach(f=>f(e));}
        finally{busy=null;}
      })();
      return busy;
    }
    async function write(method,c,id,body){
      const r=await fetch('/api/doc/'+c+'/'+encodeURIComponent(id),{method,cache:'no-store',
        headers:{'content-type':'application/json'},body:method==='PUT'?JSON.stringify(body):undefined});
      if(!r.ok){const e=new Error('write '+r.status);e.code=r.status===403?'invalid_argument':r.status===413?'quota_exceeded':'unavailable';throw e;}
      // 내가 쓴 것은 바로 반영. 다음 확인 때 서버 전체로 다시 맞춤
      if(data&&data[c]){if(method==='PUT')data[c][id]=body;else delete data[c][id];}
    }
    return {pull,collection(name){return {
      doc:id=>({set:b=>write('PUT',name,id,b),delete:()=>write('DELETE',name,id)}),
      onSnapshot(cb,err){(subs[name]=subs[name]||[]).push(cb);if(err)errs.push(err);if(data)cb(snapOf(name));}
    };}};
  }
  async function init(){
    buildFilters();buildReportFilters();
    viewMode=ls.get('qa.viewMode',true)!==false;
    applyMode();
    const db=makeDb();
    col=db.collection('issues');hcol=db.collection('history');
    ccols={tablet:db.collection('checked_tablet'),board:db.collection('checked_board')};
    ['tablet','board'].forEach(dev=>ccols[dev].onSnapshot(snap=>{
      const next={};snap.docs.forEach(d=>{if(d.exists)next[d.id]=d.data();});
      checked[dev]=next;rerenderSoon();
    }));
    col.onSnapshot(snap=>{
      const next={};snap.docs.forEach(d=>{if(d.exists)next[d.id]=d.data();});
      issues=next;
      if(draft&&!dirty()&&!typing())draft=null; // 손대지 않은 입력칸은 새 저장 내용으로 다시 채움
      rerenderSoon();
    },()=>{banner('저장소에 연결하지 못하고 있습니다. 잠시 뒤 다시 시도합니다. 지금 적는 내용은 연결되면 저장하세요.');});
    gcol=db.collection('general');
    gcol.onSnapshot(snap=>{
      const next={};snap.docs.forEach(d=>{if(d.exists)next[d.id]=d.data();});
      generals=next;rerenderSoon();
    });
    await db.pull(true);
    mode='db';render();
    // 화면을 보고 있는 동안 8초마다 바뀐 게 있는지 확인 (바뀌었을 때만 전체를 받음)
    setInterval(()=>{if(document.visibilityState==='visible')db.pull(false);},8000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')db.pull(false);});
    window.addEventListener('focus',()=>db.pull(false));
    window.addEventListener('online',()=>db.pull(true));
  }
  init();
})();
