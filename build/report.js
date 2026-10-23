  /* ---------- 보기 모드 (현황 보고) ---------- */
  // 기기 전환 없이 태블릿·전자칠판을 한 화면에
  const rstate=Object.assign({subj:'ALL',month:'ALL',type:'ALL',done:false,q:''},ls.get('qa.rfilters',{}),{q:''});
  const keepR=()=>ls.set('qa.rfilters',{subj:rstate.subj,month:rstate.month,type:rstate.type,done:rstate.done});
  const refOpen=new Set(ls.get('qa.refOpen',[])||[]);
  const p2=n=>String(n).padStart(2,'0');
  const DEVK=DEVS.map(([k])=>k);
  // 한 기기 기준 상태: 문제(미해결) / 해결 / 이상 없음 / 같은 모듈 / 미검수
  function statusOn(code,dev){
    if(issueOn(code,dev))return norm(issues[code]).resolved?'done':'bad';
    if(checked[dev][code])return 'ok';
    if(sameModuleRef(code,dev))return 'same';
    return 'none';
  }
  // 두 기기를 합친 상태 (어느 한쪽이라도 문제면 문제)
  function statusAll(code){
    const s=DEVK.map(k=>statusOn(code,k));
    for(const x of ['bad','done','ok','same'])if(s.includes(x))return x;
    return 'none';
  }
  function tally(list,dev){
    const t={bad:0,done:0,ok:0,same:0,none:0};
    list.forEach(c=>t[statusOn(c.code,dev)]++);
    // 진행 숫자는 직접 확인한 것. 나머지는 '같은 모듈' 한 칸으로 (나눠 보이면 헷갈린다고 해서)
    t.total=list.length;t.direct=t.bad+t.done+t.ok;t.checked=t.direct;t.rest=t.total-t.direct;
    return t;
  }
  // 막대는 한 색 계열 두 칸: 진하게 직접 확인, 옅게 같은 모듈. 문제 수는 막대에 섞지 않고 숫자로 따로
  const stackHTML=t=>{const w=n=>(n/t.total*100).toFixed(2)+'%';
    return '<div class="stack" role="img" aria-label="직접 확인 '+t.direct+', 같은 모듈 '+t.rest+'">'+
      '<i class="st-direct" style="width:'+w(t.direct)+'"></i><i class="st-same" style="width:'+w(t.rest)+'"></i></div>';};
  const issueTypes=it=>{const d=norm(it);return fixTypes(DEVK.flatMap(k=>d[k].types));};
  const issueDevs=code=>DEVS.filter(([k])=>issueOn(code,k));
  const pct=(a,b)=>b?(a/b*100).toFixed(1)+'%':'0%';

  function buildReportFilters(){
    $('rSubj').innerHTML=[['ALL','전체'],...SUBJ].map(([v,n])=>'<button type="button" data-v="'+v+'">'+n+'</button>').join('');
    $('rMonth').innerHTML='<option value="ALL">모든 호</option>'+SHOWN.map(m=>'<option value="'+m+'">'+hoLabel(m)+'</option>').join('');
    $('rType').innerHTML='<option value="ALL">모든 유형</option>'+TYPES.map(t=>'<option value="'+t+'">'+t+'</option>').join('');
    $('rSubj').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;rstate.subj=b.dataset.v;keepR();renderReport();});
    $('rMonth').addEventListener('change',e=>{rstate.month=e.target.value;keepR();renderReport();});
    $('rType').addEventListener('change',e=>{rstate.type=e.target.value;keepR();renderReport();});
    $('rDone').addEventListener('change',e=>{rstate.done=e.target.checked;keepR();renderReport();});
    $('rQ').addEventListener('input',e=>{rstate.q=e.target.value;renderReport();});
    $('rGrid').addEventListener('click',e=>{const b=e.target.closest('.cell');if(!b)return;
      rstate.month=b.dataset.m;rstate.subj=b.dataset.s;rstate.type='ALL';keepR();renderReport();
      $('rListSec').scrollIntoView({behavior:'smooth',block:'start'});});
    $('rList').addEventListener('click',e=>{if(!e.target.closest('[data-rclear]'))return;
      Object.assign(rstate,{subj:'ALL',month:'ALL',type:'ALL',q:''});$('rQ').value='';keepR();renderReport();});
    $('rRef').addEventListener('toggle',e=>{const d=e.target;if(!d.dataset||!d.dataset.ref)return;d.open?refOpen.add(d.dataset.ref):refOpen.delete(d.dataset.ref);ls.set('qa.refOpen',[...refOpen]);},true);
  }

  function renderReport(){
    updateSyncLabel();
    // PDF(인쇄)에서만 보이는 기준 시각 — 메일로 보낼 때 언제 자료인지 알 수 있게
    {const d=new Date(),p=n=>String(n).padStart(2,'0');
      document.querySelectorAll('[data-printdate]').forEach(el=>el.textContent=d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+' 기준');}
    [...$('rSubj').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===rstate.subj));
    $('rMonth').value=rstate.month;$('rType').value=rstate.type;$('rDone').checked=rstate.done;
    if(mode==='loading'){$('rKpi').innerHTML='<div class="kpi"><span class="k-label">불러오는 중</span></div>';return;}

    // 요약: 진행(기기별 한 줄씩) · 해결 안 된 문제 · 공통 현상
    const codesWith=Object.keys(issues).filter(c=>BY_CODE[c]&&DEVK.some(k=>issueOn(c,k)));
    const open=codesWith.filter(c=>!norm(issues[c]).resolved);
    const solved=codesWith.length-open.length;
    const gOpen=Object.values(generals).filter(g=>!g.resolved).length;
    const prow=([k,name])=>{const t=tally(CODES,k);
      return '<div class="prow"><div class="p-line"><span class="p-dev">'+name+'</span><span class="p-num"><b>'+t.checked+'</b> / '+t.total+'</span><span class="p-pct">'+pct(t.checked,t.total)+'</span></div>'+stackHTML(t)+
        '<div class="p-sub">직접 확인 <b>'+t.direct+'</b> · 같은 모듈 <b>'+t.rest+'</b></div></div>';};
    $('rKpi').innerHTML=
      '<div class="kpi kpi-prog"><span class="k-label">직접 검수한 학습코드</span>'+DEVS.map(prow).join('')+
        '<div class="legend"><span class="lg-direct">직접 확인</span><span class="lg-same">같은 모듈</span></div>'+
        '<p class="p-note">같은 모듈: 같은 모듈(같은 화면 구성·코드)을 쓰는 다른 학습코드에서 확인한 것</p></div>'+
      '<div class="kpi bad"><span class="k-label">해결 안 된 문제</span><span class="k-num">'+open.length+'<small>건</small></span>'+
        // 기기별 수를 더하면 전체보다 커서, 두 기기 모두 나온 수를 같이 적음
        '<span class="k-foot">'+DEVS.map(([k,name])=>name+' '+open.filter(c=>issueOn(c,k)).length).join(' · ')+'<br>(두 기기 모두 '+open.filter(c=>DEVK.every(k=>issueOn(c,k))).length+'건)'+(solved?' · 해결 '+solved:'')+'</span></div>'+
      '<div class="kpi"><span class="k-label">공통 현상</span><span class="k-num">'+gOpen+'<small>건</small></span><span class="k-foot">여러 액티비티에 걸친 현상</span></div>';

    // 호 × 과목 표: 칸마다 문제 수 + 기기별 진행 막대 두 줄
    $('rGrid').innerHTML='<div class="gridwrap"><table class="grid"><thead><tr><th scope="col">호</th>'+SUBJ.map(([,n])=>'<th scope="col">'+n+'</th>').join('')+'</tr></thead><tbody>'+
      SHOWN.map(m=>'<tr><th scope="row">'+hoLabel(m).replace('(','<small>(')+'</small></th>'+SUBJ.map(([s])=>{
        const list=CODES.filter(c=>c.m===m&&c.s===s);
        const n=list.filter(c=>issues[c.code]&&!norm(issues[c.code]).resolved&&DEVK.some(k=>issueOn(c.code,k))).length;
        const any=DEVK.some(k=>tally(list,k).checked);
        return '<td><button type="button" class="cell" data-m="'+m+'" data-s="'+s+'">'+
          '<span class="c-top">'+(n?'<span class="c-bad">문제 <b>'+n+'</b></span>':any?'<span class="c-ok">문제 없음</span>':'<span class="c-zero">아직</span>')+'</span>'+
          DEVS.map(([k,name])=>{const t=tally(list,k);return '<span class="c-dev"><span class="c-lab">'+name+'<em>'+t.checked+'/'+t.total+'</em></span>'+stackHTML(t)+'</span>';}).join('')+
        '</button></td>';
      }).join('')+'</tr>').join('')+'</tbody></table></div>';

    // 유형 분포 (해결 안 된 것, 두 기기 합쳐 학습코드 기준)
    const tc={};open.forEach(c=>issueTypes(issues[c]).forEach(x=>tc[x]=(tc[x]||0)+1));
    const tmax=Math.max(1,...Object.values(tc));
    const trows=TYPES.filter(x=>tc[x]).sort((a,b)=>tc[b]-tc[a]);
    $('rTypesSec').hidden=!trows.length;
    $('rTypes').innerHTML='<div class="types">'+trows.map(x=>'<div class="trow"><span>'+x+'</span><span class="tbar"><i style="width:'+(tc[x]/tmax*100).toFixed(1)+'%"></i></span><span class="tnum">'+tc[x]+'</span></div>').join('')+'</div>';

    // 공통 현상
    const gl=Object.entries(generals).map(([id,g])=>Object.assign({},g,{id}))
      .sort((a,b)=>(a.resolved===b.resolved?0:a.resolved?1:-1)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    $('rGenSec').hidden=!gl.length;
    $('rGen').innerHTML='<div class="gcards">'+gl.map(g=>'<article class="rg'+(g.resolved?' done':'')+'"><div class="rc-tags">'+
      (g.resolved?'<span class="tag ok">해결</span>':'')+(g.devices||[]).map(v=>'<span class="tag dev">'+esc(v)+'</span>').join('')+
      fixTypes(g.types||[]).map(v=>'<span class="tag'+(g.resolved?' ok':'')+'">'+esc(v)+'</span>').join('')+'</div>'+
      (g.scope?'<div class="rg-scope">범위 · '+esc(g.scope)+'</div>':'')+(g.memo?'<p>'+g.memo.split('\n').map(memoLineHTML).join('\n')+'</p>':'')+
      '<div class="rc-meta">'+fmtDate(g.updatedAt)+'</div></article>').join('')+'</div>';

    // 학습코드별 문제 (두 기기 합쳐서, 기기는 카드 안에서 구분)
    const q=rstate.q.trim().toUpperCase().replace(/\s+/g,'');
    const filtered=rstate.subj!=='ALL'||rstate.month!=='ALL'||rstate.type!=='ALL'||!!q;
    const rows=CODES.filter(c=>{
      if(!issueDevs(c.code).length)return false;const d=norm(issues[c.code]);
      if(!rstate.done&&d.resolved)return false;
      if(rstate.subj!=='ALL'&&c.s!==rstate.subj)return false;
      if(rstate.month!=='ALL'&&c.m!==rstate.month)return false;
      if(rstate.type!=='ALL'&&!issueTypes(issues[c.code]).includes(rstate.type))return false;
      if(q&&!c.code.includes(q)&&!(d.tablet.memo+'\n'+d.board.memo).toUpperCase().replace(/\s+/g,'').includes(q))return false;
      return true;
    });
    const groups=[];let cur=null;
    // 호로 나누고 그 안을 과목별로 (호·과목 조합마다 제목이 반복되면 보기 불편하다고 해서)
    rows.forEach(c=>{if(!cur||cur.m!==c.m){cur={m:c.m,c,n:0,subs:[]};groups.push(cur);}
      let sub=cur.subs[cur.subs.length-1];if(!sub||sub.s!==c.s){sub={s:c.s,rows:[]};cur.subs.push(sub);}sub.rows.push(c);cur.n++;});
    const devBlock=(d,k,name)=>{if(!devHas(d,k))return '';const lines=d[k].memo.split('\n').map(s=>s.trim()).filter(Boolean);
      return '<div class="rc-dev"><span class="rc-devname">'+name+'</span>'+(lines.length?'<ul>'+lines.map(l=>'<li>'+memoLineHTML(l)+'</li>').join('')+'</ul>':'<span class="none">'+esc(fixTypes(d[k].types).join('·'))+'</span>')+'</div>';};
    const card=c=>{const d=norm(issues[c.code]);const dref=DEVK.map(k=>directRef(c.code,k)).find(Boolean);
      return '<article class="rc'+(d.resolved?' done':'')+'"><div class="rc-head"><span class="rc-codewrap"><span class="rc-code">'+c.code+'</span>'+hwTags(c.code)+'</span>'+
        '<span class="rc-date">'+fmtDate(d.updatedAt||issues[c.code].updatedAt)+'</span></div>'+
        '<div class="rc-meta">레벨 '+c.l+' · '+c.w+'주 '+c.st+'차시 · 모듈 '+esc(modLabel(MOD[c.code]))+'</div>'+
        '<div class="rc-tags">'+(d.resolved?'<span class="tag ok">해결</span>':'')+issueTypes(issues[c.code]).map(x=>'<span class="tag'+(d.resolved?' ok':'')+'">'+x+'</span>').join('')+
          (dref?'<span class="tag direct" title="같은 모듈을 '+dref+'에서 봤지만 따로 검수함">같은 모듈 · 직접 검수</span>':'')+'</div>'+
        DEVS.map(([k,name])=>devBlock(d,k,name)).join('')+'</article>';};
    $('rList').innerHTML='<p class="rcount"><b>'+rows.length+'</b>건'+(filtered?' · 조건에 맞는 것 <button type="button" class="linkbtn" data-rclear>조건 지우기</button>':'')+'</p>'+
      (groups.length?groups.map(g=>'<div class="rgroup"><h3>'+hoLabel(g.c.m)+'<span class="n">'+g.n+'건</span></h3>'+
        g.subs.map(sb=>'<div class="rsubj"><h4><span class="sub '+sb.s+'">'+SUBJ_NAME[sb.s]+'</span><span class="n">'+sb.rows.length+'건</span></h4>'+
          '<div class="rcards">'+sb.rows.map(card).join('')+'</div></div>').join('')+'</div>').join('')
        :'<div class="rempty">'+(codesWith.length?'조건에 맞는 문제가 없습니다.':'아직 기록된 문제가 없습니다.')+'</div>');

    // 참고: 카메라·마이크, 같은 모듈 직접 검수, 표시 설명
    const chip=code=>'<span class="cchip s-'+({bad:'bad',done:'ok',ok:'ok',same:'same',none:'none'})[statusAll(code)]+'">'+code+'</span>';
    const hw={};CODES.forEach(c=>{const v=DEVICE[c.code];if(!v)return;const kind=(v.includes('C')?'C':'')+(v.includes('M')?'M':'');
      const k=kind+'|'+modLabel(MOD[c.code]);(hw[k]=hw[k]||[]).push(c.code);});
    const ord=['CM','C','M'];
    const hwRows=Object.entries(hw).sort((a,b)=>ord.indexOf(a[0].split('|')[0])-ord.indexOf(b[0].split('|')[0])||a[0].localeCompare(b[0]));
    const hwN=Object.values(hw).reduce((s,l)=>s+l.length,0);
    const drs=[];CODES.forEach(c=>DEVS.forEach(([k,name])=>{const r=directRef(c.code,k);if(r)drs.push([c.code,r,name,issueOn(c.code,k)?'문제 기록':'이상 없음']);}));
    const det=(id,title,inner)=>'<details class="rref" data-ref="'+id+'"'+(refOpen.has(id)?' open':'')+'><summary>'+title+'</summary><div class="rref-in">'+inner+'</div></details>';
    $('rRef').innerHTML=
      det('hw','카메라·마이크 쓰는 학습코드 · '+hwN+'개','<p class="rnote">학습 중 카메라('+hwPill('C')+')나 마이크('+hwPill('M')+')를 켜는 코드입니다. 기기 권한 팝업과 장치 인식을 함께 봐야 합니다. 점 색은 검수 상태입니다(두 기기 중 하나라도 문제면 빨강).</p>'+
        hwRows.map(([k,list])=>'<div class="mrow"><span class="m-name">'+hwPill(k.split('|')[0])+'<small>'+esc(k.split('|')[1])+' 모듈 · '+list.length+'개</small></span><span class="codes">'+list.map(chip).join('')+'</span></div>').join(''))+
      det('direct','같은 모듈인데 직접 검수한 코드 · '+drs.length+'건','<p class="rnote">같은 모듈을 앞 코드에서 이미 봤지만 넘기지 않고 따로 확인한 코드입니다.</p>'+
        (drs.length?'<div class="gridwrap"><table class="dtable"><thead><tr><th>학습코드</th><th>먼저 본 코드</th><th>기기</th><th>결과</th></tr></thead><tbody>'+
          drs.map(([c,r,dn,res])=>'<tr><td>'+c+'</td><td>'+r+'</td><td>'+dn+'</td><td>'+res+'</td></tr>').join('')+'</tbody></table></div>':'<p class="rnote">아직 없습니다.</p>'))+
      det('legend','표시 설명','<div class="rc-tags"><span class="tag">프레임</span><span class="rnote">문제 유형 (빨강 = 해결 안 됨)</span></div>'+
        '<div class="rc-tags"><span class="tag ok">해결</span><span class="rnote">해결된 문제</span></div>'+
        '<div class="rc-tags"><span class="tag direct">같은 모듈 · 직접 검수</span><span class="rnote">같은 모듈을 이미 봤지만 따로 확인함</span></div>'+
        '<div class="rc-tags">'+hwPill('C')+'<span class="rnote">카메라 사용</span>'+hwPill('M')+'<span class="rnote">마이크 사용</span>'+hwPill('CM')+'<span class="rnote">둘 다</span></div>');
  }

