import {escapeHtml as e, linkifyText, canEdit} from './core.js';
const states = {pending:'승인 대기',approved:'공개',rejected:'반려·공개 중단'};
const date = value => new Date(value).toLocaleString('ko-KR');
const must = result => {if(result.error) throw result.error; return result.data;};
const $ = selector => document.querySelector(selector);
const SIZE = 20;
export function qnaUrl(name, values = {}) {
  return `#${name}?${new URLSearchParams(Object.entries(values).filter(([,v]) => v !== '' && v != null))}`;
}
const head = `<div class="qna-heading"><span class="eyebrow">ASK OUR COMMUNITY</span><h1>동산 Q&amp;A</h1><p class="muted">궁금한 학교생활, 동산인에게 물어보세요.<br>질문은 편집자·관리자 승인 후 공개됩니다.<br>답변은 로그인한 회원 누구나 작성할 수 있으며 즉시 공개됩니다.</p><nav class="actions" aria-label="Q&A 메뉴"><a class="button" href="#qna">공개 질문</a><a class="button" href="#qna-ask">질문하기</a><a class="button" href="#qna-mine">내 질문·답변</a></nav></div>`;
function pager(page,count) {
  return count>SIZE ? `<div class="pagination"><button id="qna-prev" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${Math.ceil(count/SIZE)}</span><button id="qna-next" ${(page+1)*SIZE>=count?'disabled':''}>다음 →</button></div>` : '';
}
function card(row,kind,review=false,canDelete=false) {
  const id = kind==='question'?row.id:row.question_id;
  return `<article class="qna-card"><span class="tag">${kind==='question'?'질문':'답변'} · ${states[row.status]}</span><h2><a href="${qnaUrl('qna-question',{id})}">${e(kind==='question'?row.title:'질문에 남긴 답변')}</a></h2><p class="muted">${e(row.author_name)} · ${date(row.created_at)}</p><div class="body-text">${linkifyText(row.body)}</div>${row.review_note?`<p class="notice">심사 메모: ${e(row.review_note)}</p>`:''}${review?`<a class="button" href="${qnaUrl('qna-question',{id})}">질문 전체 보기</a><form class="qna-review form" data-kind="${kind}" data-id="${row.id}" data-version="${row.version}"><label>심사 메모<textarea name="note" maxlength="1000" rows="2" placeholder="반려·공개 중단 이유를 남겨 주세요."></textarea></label><div class="actions">${row.status==='pending'?'<button class="primary" name="decision" value="approve">승인·공개</button>':''}<button name="decision" value="reject">${row.status==='approved'?'공개 중단':'반려'}</button></div></form>`:''}${canDelete&&kind==='answer'?`<div class="actions"><button class="qna-delete" data-id="${row.id}" data-version="${row.version}">답변 삭제</button></div>`:''}</article>`;
}
export async function qnaView({name,params,content,client,session,profile,isCurrent,go,action,notify}) {
  content.className='wrap qna-content';
  if(!client){content.innerHTML=head+'<div class="notice">Q&A는 Supabase가 연결된 실제 서비스에서 사용할 수 있습니다.</div>';return;}
  const admin=profile?.role==='admin';
  const moderator=canEdit(profile);
  const member=!!session;
  if(name==='qna-review'&&params.get('kind')==='answer'&&!admin&&moderator){go('#qna-review');return;}
  if(name==='qna-review'&&!moderator){content.innerHTML='<div class="notice">편집자와 관리자만 접근할 수 있습니다.</div>';return;}
  if(['qna-ask','qna-mine'].includes(name)&&!member){content.innerHTML=head+'<p class="notice">로그인 후 이용해 주세요.</p><a class="button primary" href="#login">로그인</a>';return;}
  function bindReviews(){
    if(admin)content.querySelectorAll('.qna-delete').forEach(button=>button.addEventListener('click',()=>{
      if(!window.confirm('이 답변을 삭제할까요? 삭제하면 복구할 수 없습니다.'))return;
      action(async()=>{
        must(await client.rpc('delete_wiki_answer',{p_id:button.dataset.id,p_version:Number(button.dataset.version)}));
        notify('답변을 삭제했습니다.');go(location.hash);
      },button.closest('article'));
    }));
    content.querySelectorAll('.qna-review').forEach(form=>form.addEventListener('submit',event=>{
      event.preventDefault();
      const approve=event.submitter?.value==='approve';
      action(async()=>{
        must(await client.rpc('review_wiki_qna',{p_kind:form.dataset.kind,p_id:form.dataset.id,p_approve:approve,p_note:new FormData(form).get('note'),p_version:Number(form.dataset.version)}));
        go(location.hash);
      },form);
    }));
  }
  if(name==='qna-ask'){
    content.innerHTML=head+`<section class="qna-compose"><h2>질문하기</h2><form id="qna-question-form" class="form"><label>제목<input name="title" maxlength="120" required></label><label>질문 내용<textarea name="body" maxlength="4000" rows="9" required placeholder="학교생활과 관련한 질문을 적어 주세요. 개인정보는 적지 마세요."></textarea></label><p class="muted">최대 4000자 · 24시간에 10건까지 · 제출 후 수정할 수 없으니 내용을 확인해 주세요.</p><button class="primary">질문 승인 요청</button></form></section>`;
    $('#qna-question-form').addEventListener('submit',event=>{
      event.preventDefault();const form=event.currentTarget,fields=new FormData(form);
      action(async()=>{
        const id=must(await client.rpc('submit_wiki_question',{p_title:fields.get('title'),p_body:fields.get('body')}));
        go(qnaUrl('qna-question',{id}));
      },form);
    });return;
  }
  if(name==='qna-question'){
    const row=must(await client.from('wiki_questions').select('*').eq('id',params.get('id')).maybeSingle());
    if(!isCurrent())return;
    if(!row){content.innerHTML=head+'<div class="notice">질문을 찾을 수 없거나 아직 공개되지 않았습니다.</div>';return;}
    const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
    const result=await client.from('wiki_answers').select('*',{count:'exact'}).eq('question_id',row.id).order('created_at').order('id').range(page*SIZE,page*SIZE+SIZE-1);
    const answers=must(result),count=result.count||0;
    if(!isCurrent())return;
    if(page>0&&page*SIZE>=count){go(qnaUrl(name,{id:row.id,p:Math.max(0,Math.ceil(count/SIZE)-1)}));return;}
    content.innerHTML=head+card(row,'question',moderator&&(row.status==='pending'||(admin&&row.status==='approved')))+`<section class="qna-answers"><h2>답변 <span class="muted">${count}개</span></h2><p class="muted">답변은 작성 즉시 공개됩니다.${moderator?' 편집자와 관리자는 모든 상태의 답변을 볼 수 있습니다.':''}</p>${answers.map(answer=>card(answer,'answer',false,admin)).join('')||'<div class="empty">아직 보이는 답변이 없습니다.</div>'}${pager(page,count)}</section>${row.status==='approved'?(member?'<section class="qna-compose"><h2>답변하기</h2><form id="qna-answer-form" class="form"><label>답변 내용<textarea name="body" maxlength="4000" rows="6" required></textarea></label><p class="muted">작성 즉시 공개됩니다. 최대 4000자 · 24시간에 30건까지 · 게시 후 수정할 수 없습니다.</p><button class="primary">답변 게시</button></form></section>':'<p class="notice">답변을 작성하려면 <a href="#login">로그인</a>해 주세요.</p>'):'<p class="notice">공개된 질문에만 답변할 수 있습니다.</p>'}`;
    bindReviews();
    $('#qna-prev')?.addEventListener('click',()=>go(qnaUrl(name,{id:row.id,p:page-1})));
    $('#qna-next')?.addEventListener('click',()=>go(qnaUrl(name,{id:row.id,p:page+1})));
    $('#qna-answer-form')?.addEventListener('submit',event=>{
      event.preventDefault();const form=event.currentTarget;
      action(async()=>{
        must(await client.rpc('submit_wiki_answer',{p_question_id:row.id,p_body:new FormData(form).get('body')}));
        go(qnaUrl('qna-question',{id:row.id}));
      },form);
    });return;
  }
  const mine=name==='qna-mine',review=name==='qna-review';
  const kind=(mine||review)&&params.get('kind')==='answer'?'answer':'question';
  const answerManage=review&&kind==='answer';
  const status=review&&['pending','approved','rejected'].includes(params.get('status'))?params.get('status'):'pending';
  const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
  const query=(params.get('q')||'').trim().slice(0,120);
  const values={kind,q:query,...(review?{status}:{})};
  let request=client.from(kind==='question'?'wiki_questions':'wiki_answers').select('*',{count:'exact'}).order('created_at',{ascending:review}).order('id');
  if(mine)request=request.eq('author_id',session.user.id);
  else if(!answerManage)request=request.eq('status',review?status:'approved');
  if(query)request=request.ilike(kind==='question'?'title':'body',`%${query.replace(/[\\%_]/g,c=>`\\${c}`)}%`);
  const result=await request.range(page*SIZE,page*SIZE+SIZE-1),rows=must(result),count=result.count||0;
  if(!isCurrent())return;
  if(page>0&&page*SIZE>=count){go(qnaUrl(name,{...values,p:Math.max(0,Math.ceil(count/SIZE)-1)}));return;}
  content.innerHTML=head+`<section><h2>${mine?'내 질문·답변':review?(answerManage?'Q&A 답변 관리':'Q&A 질문 승인'):'공개 질문'}</h2>${mine||review?`<nav class="actions"><a class="button ${kind==='question'?'primary':''}" href="${qnaUrl(name,{kind:'question',status})}">질문</a>${mine||admin?`<a class="button ${kind==='answer'?'primary':''}" href="${qnaUrl(name,{kind:'answer',status})}">${review?'답변 관리':'답변'}</a>`:''}</nav>`:''}<form id="qna-search" class="search qna-search"><input name="q" aria-label="${kind==='question'?'질문 제목':'답변 내용'} 검색" placeholder="${kind==='question'?'질문 제목':'답변 내용'} 검색" maxlength="120" value="${e(query)}"><button class="primary">검색</button>${query?'<button type="button" id="qna-clear">초기화</button>':''}</form>${review&&!answerManage?`<label>심사 상태<select id="qna-status"><option value="pending" ${status==='pending'?'selected':''}>승인 대기</option><option value="approved" ${status==='approved'?'selected':''}>공개 중</option><option value="rejected" ${status==='rejected'?'selected':''}>반려·공개 중단</option></select></label>`:''}<p class="muted">${count}건${answerManage?' · 관리자만 답변을 삭제할 수 있습니다.':mine?' · 대기·반려된 질문은 본인과 편집자·관리자만 볼 수 있습니다.':''}</p>${rows.map(row=>card(row,kind,kind==='question'&&review&&moderator&&(row.status==='pending'||(admin&&row.status==='approved')),admin)).join('')||'<div class="empty">조건에 맞는 게시물이 없습니다.</div>'}${pager(page,count)}</section>`;
  bindReviews();
  $('#qna-search').addEventListener('submit',event=>{event.preventDefault();go(qnaUrl(name,{...values,q:String(new FormData(event.currentTarget).get('q')||'').trim()}));});
  $('#qna-clear')?.addEventListener('click',()=>go(qnaUrl(name,{...values,q:''})));
  $('#qna-status')?.addEventListener('change',event=>go(qnaUrl(name,{...values,status:event.currentTarget.value})));
  $('#qna-prev')?.addEventListener('click',()=>go(qnaUrl(name,{...values,p:page-1})));
  $('#qna-next')?.addEventListener('click',()=>go(qnaUrl(name,{...values,p:page+1})));
}
