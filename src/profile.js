import {escapeHtml as e,canEdit,validatePassword} from './core.js';
import {icon} from './design.js';
const must=result=>{if(result.error)throw result.error;return result.data;};
const $=selector=>document.querySelector(selector);
const roles={reader:'일반 회원',editor:'편집자',admin:'관리자'};
const person='<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="17" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M11 39v-3a13 13 0 0 1 26 0v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
export function profileMenu(profile) {
 const item=(href,title,description,symbol)=>`<a class="profile-menu-item" href="${href}"><span class="profile-item-icon">${icon(symbol,21)}</span><span><strong>${title}</strong><small>${description}</small></span><span class="profile-chevron" aria-hidden="true">↗</span></a>`;
 const group=(title,items)=>`<section class="profile-group"><h2>${title}</h2><div class="profile-menu">${items}</div></section>`;
 return group('계정',item('#profile-settings','계정 설정','로그인 계정 확인과 닉네임 변경','club')+item('#profile-password','비밀번호 변경','현재 비밀번호를 확인하고 변경','lock'))
 +group('일반',item('#profile-created','작성한 문서(게시)','내가 처음 게시한 공개 문서','book')+item('#profile-edited','참여한 문서(수정)','내가 수정에 참여한 공개 문서','pen')+item('#submissions','내 제출 문서','승인 대기·반려된 문서 확인','clock'))
 +(canEdit(profile)?group('편집자',item('#review','문서 승인','새 문서와 수정안 심사','curriculum')+item('#qna-review','Q&A 질문 승인','질문 승인과 반려','faq')):'')
 +(profile?.role==='admin'?group('관리자',item('#qna-review?kind=answer','Q&A 답변 관리','답변 확인과 삭제','faq')+item('#inquiries','문의 승인','접수된 문의 확인과 답변','faq')+item('#trash','휴지통','삭제된 문서 확인과 복구','other')+item('#admin','권한 관리','회원 역할 확인과 변경','council')):'');
}
export async function changeProfilePassword(client,currentPassword,password,confirm) {
 validatePassword(password);
 if(password!==confirm)throw new Error('비밀번호 확인이 일치하지 않습니다.');
 if(!currentPassword)throw new Error('현재 비밀번호를 입력해 주세요.');
 const user=must(await client.auth.getUser()).user;
 if(!user?.email)throw new Error('로그인 계정을 확인할 수 없습니다. 다시 로그인해 주세요.');
 const signed=await client.auth.signInWithPassword({email:user.email,password:currentPassword});
 if(signed.error)throw new Error('현재 비밀번호를 확인해 주세요.');
 if(signed.data.user?.id!==user.id)throw new Error('로그인 계정이 변경됐습니다. 새로고침해 주세요.');
 must(await client.auth.updateUser({password}));
}
export async function profileView({name,params,content,client,session,profile,isCurrent,go,action,notify,refreshProfile,logout}) {
 content.className='wrap profile-content';
 if(!client||!session){
  content.innerHTML='<section class="profile-guest"><span class="eyebrow">YOUR OWN CHAPTER</span><h1>나의 동산위키</h1><p>로그인하면 계정 설정과 참여한 문서를 확인할 수 있어요.</p><a class="button primary" href="#login">로그인하기</a></section>';return;
 }
 const identity=`<div class="profile-identity"><div class="profile-avatar">${person}</div><h1>${e(profile?.nickname||'동산인')}</h1><span class="tag">${roles[profile?.role]||'일반 회원'}</span></div>`;
 const heading=(title,description)=>`<a class="back-link" href="#profile">← 프로필</a><div class="profile-page-heading"><span class="eyebrow">MY DONGSAN WIKI</span><h1>${title}</h1><p class="muted">${description}</p></div>`;
 if(name==='profile'){
  content.innerHTML=`<div class="profile-intro"><span class="eyebrow">YOUR OWN CHAPTER</span>${identity}</div><div class="profile-groups">${profileMenu(profile)}</div><div class="profile-signout"><button id="profile-logout">로그아웃</button></div>`;
  $('#profile-logout').addEventListener('click',()=>action(logout));return;
 }
 if(name==='profile-settings'){
  const user=must(await client.auth.getUser()).user;
  if(!isCurrent())return;
  content.innerHTML=heading('계정 설정','지금 로그인한 계정과 위키에서 사용할 이름을 확인하세요.')+`<div class="profile-settings-card"><dl class="profile-account"><div><dt>로그인 이메일</dt><dd>${e(user?.email||'확인할 수 없음')}</dd></div><div><dt>현재 권한</dt><dd>${roles[profile?.role]||'일반 회원'}</dd></div></dl><form id="nickname-form" class="form"><label>닉네임<input name="nickname" value="${e(profile?.nickname||'')}" minlength="2" maxlength="30" autocomplete="nickname" required></label><p class="muted">2~30자 · 앞으로 작성하는 문서와 답변에 사용할 이름입니다. 기존 기록에 남은 이름은 유지됩니다.</p><button class="primary">닉네임 저장</button></form></div>`;
  $('#nickname-form').addEventListener('submit',event=>{
   event.preventDefault();const form=event.currentTarget;
   action(async()=>{
    const nickname=String(new FormData(form).get('nickname')||'').trim();
    if([...nickname].length<2||[...nickname].length>30)throw new Error('닉네임은 2~30자로 입력해 주세요.');
    must(await client.rpc('set_wiki_nickname',{p_nickname:nickname}));
    await refreshProfile();go('#profile');notify('닉네임을 변경했습니다.');
   },form);
  });return;
 }
 if(name==='profile-password'){
  content.innerHTML=heading('비밀번호 변경','현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.')+`<form id="profile-password-form" class="form profile-settings-card"><label>현재 비밀번호<input name="current" type="password" autocomplete="current-password" maxlength="128" required></label><label>새 비밀번호<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><label>새 비밀번호 확인<input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="muted">12~128자로 입력해 주세요. 비밀번호는 계정 설정 화면에 표시되지 않습니다.</p><button class="primary">비밀번호 변경</button><a href="#forgot">현재 비밀번호를 잊으셨나요?</a></form>`;
  $('#profile-password-form').addEventListener('submit',event=>{
   event.preventDefault();const form=event.currentTarget,fields=new FormData(form);
   action(async()=>{
    await changeProfilePassword(client,String(fields.get('current')||''),String(fields.get('password')||''),String(fields.get('confirm')||''));
    form.reset();notify('비밀번호를 변경했습니다.');
   },form);
  });return;
 }
 const kind=name==='profile-created'?'created':'edited';
 const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
 const rows=must(await client.rpc('my_wiki_documents',{p_kind:kind,p_page:page}))||[];
 if(!isCurrent())return;
 const count=Number(rows[0]?.total_count||0);
 if(page>0&&!rows.length){go(`#${name}`);return;}
 const title=kind==='created'?'작성한 문서(게시)':'참여한 문서(수정)';
 const description=kind==='created'?'내가 처음 게시했거나, 내가 제출한 새 문서가 승인되어 공개된 문서입니다.':'내 수정 내용이 공개 문서에 반영된 기록입니다. 승인만 처리한 문서는 포함되지 않습니다.';
 content.innerHTML=heading(title,description)+`<p class="profile-list-summary">공개 문서 <strong>${count}</strong>개</p><div class="profile-documents">${rows.map(row=>`<a class="profile-document" href="#page?id=${encodeURIComponent(row.id)}"><span class="tag">${e(row.category)}</span><h2>${e(row.title)}</h2><p class="muted">나의 ${kind==='created'?'게시':'수정'} · ${e(new Date(row.activity_at).toLocaleString('ko-KR'))}</p><span aria-hidden="true">↗</span></a>`).join('')||'<div class="empty">아직 해당하는 공개 문서가 없습니다.<br>승인 대기·반려 문서는 ‘내 제출 문서’에서 확인할 수 있습니다.</div>'}</div>${count>20?`<div class="pagination"><button id="profile-prev" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${Math.ceil(count/20)}</span><button id="profile-next" ${(page+1)*20>=count?'disabled':''}>다음 →</button></div>`:''}`;
 $('#profile-prev')?.addEventListener('click',()=>go(`#${name}?p=${page-1}`));
 $('#profile-next')?.addEventListener('click',()=>go(`#${name}?p=${page+1}`));
}
