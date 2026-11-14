import {escapeHtml as e} from './core.js';
const BUCKET='dongsan-member-verifications';
const LIMIT=10485760;
const MIME=['image/jpeg','image/png','image/webp'];
const labels={uploading:'업로드 미완료',pending:'관리자 확인 중',approved:'가입 승인',rejected:'다시 제출해 주세요'};
const urls=new Set();
const must=result=>{if(result.error)throw result.error;return result.data;};
const $=selector=>document.querySelector(selector);
const date=value=>new Date(value).toLocaleString('ko-KR');
const isAdmin=profile=>profile?.role==='admin'&&profile?.membership_status==='approved';
export const needsVerification=profile=>!!profile&&profile.membership_status!=='approved';
export function releaseVerificationUrls(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
function imageUrl(blob){const url=URL.createObjectURL(blob);urls.add(url);return url;}
export function validateVerificationFile(file){
 if(!file||!MIME.includes(file.type)||file.size<1||file.size>LIMIT)throw new Error('JPG·PNG·WEBP 이미지 한 장을 10MB 이하로 올려 주세요.');
 return file;
}
export async function submitVerification(client,file){
 validateVerificationFile(file);
 const reservation=must(await client.rpc('reserve_wiki_verification',{p_mime:file.type,p_size:file.size}));
 const row=Array.isArray(reservation)?reservation[0]:reservation;
 if(!row?.id||!row.object_path)throw new Error('업로드 준비에 실패했습니다. 다시 시도해 주세요.');
 const bucket=client.storage.from(BUCKET);
 try{
  must(await bucket.upload(row.object_path,file,{contentType:file.type,upsert:false,cacheControl:'0'}));
  must(await client.rpc('submit_wiki_verification',{p_id:row.id}));
  return row.id;
 }catch(error){
  // Only an unsubmitted upload can be removed by its owner.
  try{await bucket.remove([row.object_path]);}catch{}
  throw error;
 }
}
export async function reviewVerification(client,row,approve,note){
 const trimmed=String(note||'').trim();
 if(!approve&&!trimmed)throw new Error('다시 제출할 수 있도록 반려 이유를 적어 주세요.');
 must(await client.rpc('review_wiki_verification',{p_id:row.id,p_approve:approve,p_note:trimmed,p_version:row.version}));
 // Use the Storage API to remove bytes as well as metadata after review.
 try{
  const result=await client.storage.from(BUCKET).remove([row.object_path]);
  return {cleanupFailed:!!result.error};
 }catch{return {cleanupFailed:true};}
}
const heading=`<div class="verification-heading"><span class="eyebrow">DONGSAN WIKI MEMBERSHIP</span><h1>본인인증</h1><p class="muted">리로스쿨 마이페이지 자료를 확인한 뒤 관리자가 회원가입을 승인합니다.</p></div>`;
export async function verificationView({name,params,content,client,session,profile,isCurrent,go,action,notify,refreshProfile,logout}){
 content.className='wrap verification-content';
 if(!client){content.innerHTML=heading+'<p class="notice">실제 서비스에서 이메일 인증 후 자료를 제출할 수 있습니다.</p>';return;}
 if(!session){content.innerHTML=heading+'<p class="notice">이메일 인증을 완료한 계정으로 로그인해 주세요.</p><a class="button primary" href="#login">로그인</a>';return;}
 if(name==='verification-review'){
  if(!isAdmin(profile)){content.innerHTML='<p class="notice">관리자만 회원가입 승인 화면에 접근할 수 있습니다.</p>';return;}
  await adminView();return;
 }
 if(profile?.membership_status==='approved'){
  content.innerHTML=heading+'<section class="verification-card"><span class="tag">승인 완료</span><h2>동산위키에 오신 것을 환영해요.</h2><p>회원가입 승인이 완료되었습니다.</p><a class="button primary" href="#profile">프로필로 이동</a></section>';return;
 }
 const latest=must(await client.from('wiki_member_verifications').select('*').eq('author_id',session.user.id).neq('status','uploading').order('created_at',{ascending:false}).limit(1).maybeSingle());
 if(!isCurrent())return;
 const pending=latest?.status==='pending';
 content.innerHTML=heading+`<ol class="verification-steps"><li>이메일 인증 완료</li><li class="${pending?'':'active'}">리로스쿨 자료 제출</li><li class="${pending?'active':''}">관리자 가입 승인</li></ol><section class="verification-card"><div class="verification-account"><strong>${e(profile?.nickname||'동산인')}</strong><span>${e(session.user.email||'')}</span></div>${latest?`<div class="notice"><strong>${labels[latest.status]}</strong>${latest.review_note?`<p>${e(latest.review_note)}</p>`:''}${pending?'<p>자료를 제출했어요. 관리자가 확인할 때까지 기다려 주세요.</p>':''}</div>`:''}${pending?'':`<h2>리로스쿨 마이페이지를 올려 주세요.</h2><p>마이페이지의 <strong>학교와 성명 확인에 필요한 부분</strong>을 캡처하거나 촬영해 주세요. 성적·연락처·생년월일 등 불필요한 정보는 가려 주세요.</p><p class="muted">자료는 본인과 관리자만 볼 수 있습니다. 관리자는 심사 후 인증 사진을 삭제합니다.</p><form id="verification-form" class="form"><div class="verification-upload-options"><label class="verification-file-label">캡처 파일 선택<input id="verification-file" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="verification-file-label">사진 촬영<input id="verification-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"></label></div><p id="verification-selection" class="muted">JPG·PNG·WEBP · 한 장 · 최대 10MB · 업로드 시도는 하루 3회</p><div id="verification-preview"></div><label><span><input name="consent" type="checkbox" required> 학교 구성원 확인을 위해 관리자에게 위 자료를 제출하며, 불필요한 개인정보를 가렸습니다.</span></label><button class="primary">인증 자료 제출</button></form>`}<div class="actions verification-bottom"><button id="verification-refresh">승인 상태 새로고침</button><a class="button" href="#home">공개 문서 보기</a><button id="verification-logout">로그아웃</button><a class="button" href="#profile-withdraw">회원탈퇴</a></div></section>`;
 $('#verification-refresh').addEventListener('click',()=>action(async()=>{await refreshProfile();go('#verify');}));
 $('#verification-logout').addEventListener('click',()=>action(logout));
 if(pending)return;
 let selected=null,preview=null;
 for(const selector of ['#verification-file','#verification-camera'])$(selector).addEventListener('change',event=>{
  selected=null;
  if(preview){URL.revokeObjectURL(preview);urls.delete(preview);preview=null;}
  $('#verification-preview').innerHTML='';
  try{
   selected=validateVerificationFile(event.currentTarget.files?.[0]);
   $('#verification-selection').textContent=`${selected.name} · ${(selected.size/1048576).toFixed(1)}MB`;
   preview=imageUrl(selected);$('#verification-preview').innerHTML=`<img class="verification-image" src="${preview}" alt="제출할 인증 사진 미리보기">`;
  }catch(error){$('#verification-selection').textContent=error.message;}
 });
 $('#verification-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;
  action(async()=>{
   if(!new FormData(form).get('consent'))throw new Error('인증 자료 제출 안내를 확인해 주세요.');
   await submitVerification(client,selected);await refreshProfile();go('#verify');
  },form);
 });
 async function adminView(){
  const status=['pending','approved','rejected','uploading'].includes(params.get('status'))?params.get('status'):'pending';
  const query=(params.get('q')||'').trim().slice(0,30);
  const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
  let request=client.from('wiki_member_verifications').select('*',{count:'exact'}).eq('status',status).order('submitted_at',{ascending:true}).order('id');
  if(status==='uploading')request=request.lt('created_at',new Date(Date.now()-86400000).toISOString());
  if(query)request=request.ilike('author_name',`%${query.replace(/[\\%_]/g,c=>`\\${c}`)}%`);
  const result=await request.range(page*20,page*20+19),rows=must(result),count=result.count||0;
  if(!isCurrent())return;
  const href=changes=>`#verification-review?${new URLSearchParams({status,q:query,p:String(page),...changes})}`;
  if(page>0&&page*20>=count){go(href({p:String(Math.max(0,Math.ceil(count/20)-1))}));return;}
  content.innerHTML=`<a class="back-link" href="#profile">← 프로필</a><div class="verification-heading"><span class="eyebrow">MEMBERSHIP REVIEW</span><h1>회원가입 승인</h1><p class="muted">리로스쿨 자료를 확인한 뒤 승인하거나 반려해 주세요. 심사 후 인증 사진은 삭제됩니다.</p></div><form id="verification-search" class="search"><input name="q" maxlength="30" placeholder="닉네임 검색" aria-label="인증 신청자 닉네임 검색" value="${e(query)}"><button class="primary">검색</button></form><label>처리 상태<select id="verification-status"><option value="pending" ${status==='pending'?'selected':''}>승인 대기</option><option value="approved" ${status==='approved'?'selected':''}>승인 완료</option><option value="rejected" ${status==='rejected'?'selected':''}>반려</option><option value="uploading" ${status==='uploading'?'selected':''}>만료된 미완료 업로드</option></select></label><p class="muted">${count}건</p>${rows.map(row=>`<article class="verification-card" data-id="${row.id}"><span class="tag">${labels[row.status]}</span><h2>${e(row.author_name)}</h2><p class="muted">제출: ${date(row.submitted_at||row.created_at)} · 계정 ${e(row.author_id.slice(0,8))}</p>${row.review_note?`<p class="notice">${e(row.review_note)}</p>`:''}<button class="verification-show" data-id="${row.id}">인증 사진 확인</button><div class="verification-proof"></div>${status==='pending'?`<form class="verification-review form" data-id="${row.id}"><label>심사 메모<textarea name="note" maxlength="1000" rows="3" placeholder="반려할 경우 다시 제출할 내용을 알려 주세요."></textarea></label><div class="actions"><button class="primary" value="approve">가입 승인</button><button value="reject">반려</button></div></form>`:`<button class="verification-cleanup" data-id="${row.id}">남아 있는 인증 사진 삭제</button>`}</article>`).join('')||'<div class="empty">해당하는 인증 요청이 없습니다.</div>'}${count>20?`<nav class="pagination"><button id="verification-prev" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${Math.ceil(count/20)}</span><button id="verification-next" ${(page+1)*20>=count?'disabled':''}>다음 →</button></nav>`:''}`;
  const byId=new Map(rows.map(row=>[row.id,row]));
  content.querySelectorAll('.verification-show').forEach(button=>button.addEventListener('click',()=>action(async()=>{
   const row=byId.get(button.dataset.id);
   const result=await client.storage.from(BUCKET).download(row.object_path);
   if(!isCurrent())return;
   if(result.error){button.closest('article').querySelector('.verification-proof').textContent='인증 사진이 없거나 심사 후 삭제된 자료입니다.';return;}
   const holder=button.closest('article').querySelector('.verification-proof');
   if(holder.dataset.previewUrl){URL.revokeObjectURL(holder.dataset.previewUrl);urls.delete(holder.dataset.previewUrl);}
   const url=imageUrl(result.data);holder.dataset.previewUrl=url;
   holder.innerHTML=`<img class="verification-image" src="${url}" alt="${e(row.author_name)}의 리로스쿨 인증 자료">`;
  },button.closest('article'))));
  content.querySelectorAll('.verification-review').forEach(form=>form.addEventListener('submit',event=>{
   event.preventDefault();action(async()=>{
    const result=await reviewVerification(client,byId.get(form.dataset.id),event.submitter?.value==='approve',new FormData(form).get('note'));
    if(result.cleanupFailed)window.alert('가입 심사는 완료됐지만 사진 삭제에 실패했습니다. 승인 완료·반려 목록의 자료 삭제 버튼으로 다시 삭제해 주세요.');
    go(location.hash);
   },form);
  }));
  content.querySelectorAll('.verification-cleanup').forEach(button=>button.addEventListener('click',()=>action(async()=>{
   must(await client.storage.from(BUCKET).remove([byId.get(button.dataset.id).object_path]));notify('인증 사진을 삭제했습니다.');
  },button.closest('article'))));
  $('#verification-search').addEventListener('submit',event=>{event.preventDefault();go(href({q:String(new FormData(event.currentTarget).get('q')||'').trim(),p:'0'}));});
  $('#verification-status').addEventListener('change',event=>go(href({status:event.currentTarget.value,p:'0'})));
  $('#verification-prev')?.addEventListener('click',()=>go(href({p:String(page-1)})));
  $('#verification-next')?.addEventListener('click',()=>go(href({p:String(page+1)})));
 }
}
