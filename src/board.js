import {escapeHtml as e, linkifyText, canEdit} from './core.js';
const states = {pending:'승인 대기',approved:'공개',rejected:'반려·공개 중단'};
const date = value => new Date(value).toLocaleString('ko-KR');
const must = result => {if(result.error) throw result.error; return result.data;};
const $ = selector => document.querySelector(selector);
const SIZE = 20;
export function boardUrl(name, values = {}) {
  return `#${name}?${new URLSearchParams(Object.entries(values).filter(([,v]) => v !== '' && v != null))}`;
}
const head = `<div class="board-heading"><span class="eyebrow">OUR COMMUNITY</span><h1>동산 게시판</h1><p class="muted">함께 나누고 싶은 학교 이야기, 게시판에 남겨보세요.<br>게시글은 편집자·관리자 승인 후 공개됩니다.<br>답변은 로그인한 회원 누구나 작성할 수 있으며 즉시 공개됩니다.</p><nav class="actions" aria-label="게시판 메뉴"><a class="button" href="#board">공개 게시글</a><a class="button" href="#board-write">글쓰기</a><a class="button" href="#board-mine">내 게시글·답변</a></nav></div>`;
function pager(page,count) {
  return count>SIZE ? `<div class="pagination"><button id="board-prev" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${Math.ceil(count/SIZE)}</span><button id="board-next" ${(page+1)*SIZE>=count?'disabled':''}>다음 →</button></div>` : '';
}
function card(row,kind,review=false,canDelete=false) {
  const id = kind==='post'?row.id:row.post_id;
  return `<article class="board-card"><span class="tag">${kind==='post'?'게시글':'답변'} · ${states[row.status]}</span><h2><a href="${boardUrl('board-post',{id})}">${e(kind==='post'?row.title:'게시글에 남긴 답변')}</a></h2><p class="muted">${e(row.author_name)} · ${date(row.created_at)}</p><div class="body-text">${linkifyText(row.body)}</div>${row.review_note?`<p class="notice">심사 메모: ${e(row.review_note)}</p>`:''}${review?`<a class="button" href="${boardUrl('board-post',{id})}">게시글 전체 보기</a><form class="board-review form" data-kind="${kind}" data-id="${row.id}" data-version="${row.version}"><label>심사 메모<textarea name="note" maxlength="1000" rows="2" placeholder="반려·공개 중단 이유를 남겨 주세요."></textarea></label><div class="actions">${row.status!=='approved'?'<button class="primary" name="decision" value="approve">승인·복구</button>':''}<button name="decision" value="reject">${row.status==='approved'?'공개 중단':'반려'}</button></div></form>`:''}${canDelete&&kind==='reply'?`<div class="actions"><button class="board-delete" data-id="${row.id}" data-version="${row.version}">답변 삭제</button></div>`:''}</article>`;
}
export async function boardView({name,params,content,client,session,profile,isCurrent,go,action,notify}) {
  content.className='wrap board-content';
  if(!client){content.innerHTML=head+'<div class="notice">게시판을 준비 중입니다.</div>';return;}
  const eligible=!profile?.membership_status||profile.membership_status==='approved';
  const admin=eligible&&profile?.role==='admin';
  const moderator=eligible&&canEdit(profile);
  const member=!!session&&eligible;
  if(name==='board-review'&&params.get('kind')==='reply'&&!admin){content.innerHTML='<p class="notice">관리자만 게시판 답변을 관리할 수 있습니다.</p>';return;}
  if(name==='board-review'&&!moderator){content.innerHTML='<div class="notice">편집자와 관리자만 접근할 수 있습니다.</div>';return;}
  if(['board-write','board-mine'].includes(name)&&!member){content.innerHTML=head+'<p class="notice">로그인 후 이용해 주세요.</p><a class="button primary" href="#login">로그인</a>';return;}
  function bindReviews(){
    if(admin)content.querySelectorAll('.board-delete').forEach(button=>button.addEventListener('click',()=>{
      if(!window.confirm('이 답변을 삭제할까요? 삭제하면 복구할 수 없습니다.'))return;
      action(async()=>{
        must(await client.rpc('delete_wiki_board_reply',{p_id:button.dataset.id,p_version:Number(button.dataset.version)}));
        notify('답변을 삭제했습니다.');go(location.hash);
      },button.closest('article'));
    }));
    content.querySelectorAll('.board-review').forEach(form=>form.addEventListener('submit',event=>{
      event.preventDefault();
      const approve=event.submitter?.value==='approve';
      action(async()=>{
        must(await client.rpc('review_wiki_board',{p_kind:form.dataset.kind,p_id:form.dataset.id,p_approve:approve,p_note:new FormData(form).get('note'),p_version:Number(form.dataset.version)}));
        go(location.hash);
      },form);
    }));
  }
  if(name==='board-write'){
    content.innerHTML=head+`<section class="board-compose"><h2>글쓰기</h2><form id="board-post-form" class="form"><label>제목<input name="title" maxlength="120" required></label><label>게시글 내용<textarea name="body" maxlength="4000" rows="9" required placeholder="학교생활과 관련한 게시글을 적어 주세요. 개인정보는 적지 마세요."></textarea></label><p class="muted">최대 4000자 · 24시간에 10건까지 · 제출 후 수정할 수 없으니 내용을 확인해 주세요.</p><button class="primary">게시글 승인 요청</button></form></section>`;
    $('#board-post-form').addEventListener('submit',event=>{
      event.preventDefault();const form=event.currentTarget,fields=new FormData(form);
      action(async()=>{
        const id=must(await client.rpc('submit_wiki_board_post',{p_title:fields.get('title'),p_body:fields.get('body')}));
        go(boardUrl('board-post',{id}));
      },form);
    });return;
  }
  if(name==='board-post'){
    const row=must(await client.from('wiki_board_posts').select('*').eq('id',params.get('id')).maybeSingle());
    if(!isCurrent())return;
    if(!row){content.innerHTML=head+'<div class="notice">게시글을 찾을 수 없거나 아직 공개되지 않았습니다.</div>';return;}
    const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
    const result=await client.from('wiki_board_replies').select('*',{count:'exact'}).eq('post_id',row.id).order('created_at').order('id').range(page*SIZE,page*SIZE+SIZE-1);
    const replies=must(result),count=result.count||0;
    if(!isCurrent())return;
    if(page>0&&page*SIZE>=count){go(boardUrl(name,{id:row.id,p:Math.max(0,Math.ceil(count/SIZE)-1)}));return;}
    content.innerHTML=head+card(row,'post',moderator&&(row.status==='pending'||admin))+`<section class="board-replies"><h2>답변 <span class="muted">${count}개</span></h2><p class="muted">답변은 작성 즉시 공개됩니다.${admin?' 관리자는 공개 중단된 답변도 볼 수 있습니다.':''}</p>${replies.map(reply=>card(reply,'reply',admin,admin)).join('')||'<div class="empty">아직 보이는 답변이 없습니다.</div>'}${pager(page,count)}</section>${row.status==='approved'?(member?'<section class="board-compose"><h2>답변하기</h2><form id="board-reply-form" class="form"><label>답변 내용<textarea name="body" maxlength="4000" rows="6" required></textarea></label><p class="muted">작성 즉시 공개됩니다. 최대 4000자 · 24시간에 30건까지 · 게시 후 수정할 수 없습니다.</p><button class="primary">답변 게시</button></form></section>':(session?'<p class="notice">회원가입 승인 후 답변을 작성할 수 있습니다. <a href="#verify">회원 인증 확인</a></p>':'<p class="notice">답변을 작성하려면 <a href="#login">로그인</a>해 주세요.</p>')):'<p class="notice">공개된 게시글에만 답변할 수 있습니다.</p>'}`;
    bindReviews();
    $('#board-prev')?.addEventListener('click',()=>go(boardUrl(name,{id:row.id,p:page-1})));
    $('#board-next')?.addEventListener('click',()=>go(boardUrl(name,{id:row.id,p:page+1})));
    $('#board-reply-form')?.addEventListener('submit',event=>{
      event.preventDefault();const form=event.currentTarget;
      action(async()=>{
        must(await client.rpc('submit_wiki_board_reply',{p_post_id:row.id,p_body:new FormData(form).get('body')}));
        go(boardUrl('board-post',{id:row.id}));
      },form);
    });return;
  }
  const mine=name==='board-mine',review=name==='board-review';
  const kind=(mine||review)&&params.get('kind')==='reply'?'reply':'post';
  const replyManage=review&&kind==='reply';
  const allowedStatuses=replyManage?['approved','rejected']:['pending','approved','rejected'];
  const status=review&&allowedStatuses.includes(params.get('status'))?params.get('status'):(replyManage?'approved':'pending');
  const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
  const query=(params.get('q')||'').trim().slice(0,120);
  const values={kind,q:query,...(review?{status}:{})};
  let request=client.from(kind==='post'?'wiki_board_posts':'wiki_board_replies').select('*',{count:'exact'}).order('created_at',{ascending:review}).order('id');
  if(mine)request=request.eq('author_id',session.user.id);
  else request=request.eq('status',review?status:'approved');
  if(query)request=request.ilike(kind==='post'?'title':'body',`%${query.replace(/[\\%_]/g,c=>`\\${c}`)}%`);
  const result=await request.range(page*SIZE,page*SIZE+SIZE-1),rows=must(result),count=result.count||0;
  if(!isCurrent())return;
  if(page>0&&page*SIZE>=count){go(boardUrl(name,{...values,p:Math.max(0,Math.ceil(count/SIZE)-1)}));return;}
  content.innerHTML=head+`<section><h2>${mine?'내 게시글·답변':review?(replyManage?'게시판 답변 관리':'게시판 게시글 승인'):'공개 게시글'}</h2>${mine||review?`<nav class="actions"><a class="button ${kind==='post'?'primary':''}" href="${boardUrl(name,{kind:'post',status})}">게시글</a>${mine||admin?`<a class="button ${kind==='reply'?'primary':''}" href="${boardUrl(name,{kind:'reply',status})}">${review?'답변 관리':'답변'}</a>`:''}</nav>`:''}<form id="board-search" class="search board-search"><input name="q" aria-label="${kind==='post'?'게시글 제목':'답변 내용'} 검색" placeholder="${kind==='post'?'게시글 제목':'답변 내용'} 검색" maxlength="120" value="${e(query)}"><button class="primary">검색</button>${query?'<button type="button" id="board-clear">초기화</button>':''}</form>${review?`<label>심사 상태<select id="board-status">${!replyManage?`<option value="pending" ${status==='pending'?'selected':''}>승인 대기</option>`:''}<option value="approved" ${status==='approved'?'selected':''}>공개 중</option><option value="rejected" ${status==='rejected'?'selected':''}>반려·공개 중단</option></select></label>`:''}<p class="muted">${count}건${replyManage?' · 관리자만 답변을 공개 중단·복구·삭제할 수 있습니다.':mine?' · 대기·반려된 게시글은 본인과 편집자·관리자만 볼 수 있습니다.':''}</p>${rows.map(row=>card(row,kind,review&&((kind==='post'&&moderator&&(row.status==='pending'||admin))||(kind==='reply'&&admin)),admin)).join('')||'<div class="empty">조건에 맞는 게시물이 없습니다.</div>'}${pager(page,count)}</section>`;
  bindReviews();
  $('#board-search').addEventListener('submit',event=>{event.preventDefault();go(boardUrl(name,{...values,q:String(new FormData(event.currentTarget).get('q')||'').trim()}));});
  $('#board-clear')?.addEventListener('click',()=>go(boardUrl(name,{...values,q:''})));
  $('#board-status')?.addEventListener('change',event=>go(boardUrl(name,{...values,status:event.currentTarget.value})));
  $('#board-prev')?.addEventListener('click',()=>go(boardUrl(name,{...values,p:page-1})));
  $('#board-next')?.addEventListener('click',()=>go(boardUrl(name,{...values,p:page+1})));
}
