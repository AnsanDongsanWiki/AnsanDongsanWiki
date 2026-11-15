import {escapeHtml as e,safeUrl} from './core.js';
import {validateAttachmentFile,ATTACHMENT_BUCKET} from './attachments.js';
import {koreaToday} from './calendar.js';
const must=result=>{if(result.error)throw result.error;return result.data;};
const urls=new Set();
const PAGE_SIZE=12;
const columns='id,title,issue_label,published_on,pdf_id,cover_id,published,version,created_at';
export function releaseNewspaperUrls(){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}
export async function validateNewspaperFile(file,kind){
 const mime=await validateAttachmentFile(file);
 if(kind==='pdf'&&mime!=='application/pdf')throw new Error('신문 원본은 PDF 파일을 선택해 주세요. (10MB 이하)');
 if(kind==='cover'&&(!['image/jpeg','image/png','image/webp'].includes(mime)||file.size>2*1024*1024))throw new Error('표지는 JPG·PNG·WEBP 이미지를 2MB 이하로 선택해 주세요.');
 if(!['pdf','cover'].includes(kind))throw new Error('파일 종류를 확인해 주세요.');
 return mime;
}
export async function uploadNewspaperFile(client,file,kind,cache){
 const mime=await validateNewspaperFile(file,kind);let record=cache.get(file);
 if(!record){
  const result=must(await client.rpc('reserve_wiki_attachment',{p_name:file.name,p_size:file.size}));
  const asset=Array.isArray(result)?result[0]:result;
  if(!asset?.id||!asset.object_path||asset.mime_type!==mime)throw new Error('파일 업로드를 준비하지 못했습니다.');
  record={...asset,uploaded:false};cache.set(file,record);
 }
 if(!record.uploaded){
  const result=await client.storage.from(ATTACHMENT_BUCKET).upload(record.object_path,file,{contentType:mime,upsert:false,cacheControl:'0'});
  if(result.error&&![409,'409'].includes(result.error.statusCode)&&!/already exists|duplicate/i.test(result.error.message||''))throw result.error;
  record.uploaded=true;
 }
 return record.id;
}
const date=value=>value.replaceAll('-','.');
const issueUrl=id=>`#newspaper?id=${encodeURIComponent(id)}`;
const manageUrl=id=>`#newspapers-manage${id?`?id=${encodeURIComponent(id)}`:''}`;
function rackCard(row){
 return `<article class="newspaper-slot"><a class="newspaper-cover" href="${issueUrl(row.id)}" data-paper="${row.id}" aria-label="${e(row.title)} ${e(row.issue_label)} PDF 읽기"><span class="newspaper-cover-art" data-cover="${row.id}"><span class="newspaper-masthead">DONGSAN PRESS</span><span class="newspaper-cover-title">${e(row.title)}</span><span class="newspaper-cover-rule"></span><span class="newspaper-cover-issue">${e(row.issue_label||'교내신문')}</span><span class="newspaper-cover-date">${date(row.published_on)}</span></span></a><span class="newspaper-pocket" aria-hidden="true"></span><p class="newspaper-caption">${e(row.issue_label||row.title)}<small>${date(row.published_on)}</small></p></article>`;
}
async function hydrateCovers(client,container,rows,isCurrent){
 const ids=[...new Set(rows.flatMap(row=>[row.pdf_id,row.cover_id]).filter(Boolean))];
 if(!ids.length)return;
 let assets;
 try{assets=must(await client.from('wiki_attachments').select('id,object_path,mime_type,file_name').in('id',ids));}catch{return;}
 const byId=new Map(assets.map(a=>[a.id,a]));
 await Promise.allSettled(rows.map(async row=>{
  const pdf=byId.get(row.pdf_id);const anchors=container.querySelectorAll(`[data-paper="${row.id}"]`);
  if(pdf&&anchors.length){
   try{
    const data=must(await client.storage.from(ATTACHMENT_BUCKET).createSignedUrl(pdf.object_path,3600));
    const href=safeUrl(data.signedUrl);
    if(href&&isCurrent())for(const anchor of anchors)if(anchor.isConnected){anchor.href=href;anchor.target='_blank';anchor.rel='noopener noreferrer';}
   }catch{/* The detail page remains available for retrying. */}
  }
  const cover=byId.get(row.cover_id),art=container.querySelector(`[data-cover="${row.id}"]`);
  if(cover&&art&&['image/jpeg','image/png','image/webp'].includes(cover.mime_type)){
   try{
    const blob=must(await client.storage.from(ATTACHMENT_BUCKET).download(cover.object_path));
    if(!isCurrent()||!art.isConnected)return;
    const url=URL.createObjectURL(new Blob([blob],{type:cover.mime_type}));urls.add(url);
    const image=document.createElement('img');image.src=url;image.alt=row.title;image.loading='lazy';art.replaceChildren(image);
   }catch{/* Keep the readable title cover if the image fails. */}
  }
 }));
}
export async function mountNewspaperRack({client,container,isCurrent=()=>true}){
 if(!container)return;
 container.innerHTML='<p class="muted newspaper-loading">신문을 꺼내오는 중…</p>';
 try{
  const rows=client?must(await client.from('wiki_newspapers').select(columns).eq('published',true).order('published_on',{ascending:false}).order('created_at',{ascending:false}).order('id').limit(4)):[];
  if(!isCurrent()||!container.isConnected)return;
  container.innerHTML=rows.length?`<div class="newspaper-shelf">${rows.map(rackCard).join('')}</div>`:'<div class="newspaper-empty-rack" aria-hidden="true"><span></span><span></span></div><p class="newspaper-empty">교내신문을 준비하고 있어요.</p>';
  if(rows.length)await hydrateCovers(client,container,rows,isCurrent);
 }catch{if(isCurrent()&&container.isConnected)container.innerHTML='<p class="newspaper-empty">신문을 불러오지 못했습니다.<br><a href="#newspapers">신문함 다시 보기 →</a></p>';}
}
export async function newspapersView({name,params,content,client,session,profile,isCurrent,action,notify,go}){
 const admin=profile?.role==='admin'&&(!profile.membership_status||profile.membership_status==='approved');
 const manage=name==='newspapers-manage',detail=name==='newspaper';
 content.className='wrap newspapers-content';
 if(manage&&(!session||!admin)){content.innerHTML='<h1>교내신문 관리</h1><p>관리자만 이용할 수 있습니다.</p><a class="button" href="#newspapers">신문함 보기</a>';return;}
 const head=`<a class="back-link" href="${manage?'#profile':'#home'}">← ${manage?'프로필':'홈'}</a><div class="profile-page-heading"><span class="eyebrow">DONGSAN PRESS</span><h1>${manage?'교내신문 관리':'교내신문'}</h1><p class="muted">한 장씩 쌓여가는, 우리 학교의 이야기.</p><nav class="actions"><a class="button" href="#newspapers">신문함 보기</a>${admin?`<a class="button" href="${manageUrl()}">신문 등록·관리</a>`:''}</nav></div>`;
 if(!client){content.innerHTML=head+'<p class="notice">아직 등록된 교내신문이 없습니다.</p>';return;}
 const selectedId=params.get('id');
 let selected=null;
 if(selectedId){selected=must(await client.from('wiki_newspapers').select(columns).eq('id',selectedId).maybeSingle());if(!isCurrent())return;}
 if(detail){
  if(!selected){content.innerHTML=head+'<p class="notice">신문을 찾을 수 없거나 비공개 상태입니다.</p>';return;}
  content.innerHTML=head+`<section class="newspaper-detail"><div class="newspaper-detail-cover">${rackCard(selected)}</div><div><h2>${e(selected.title)}</h2><p>${e(selected.issue_label)} · ${date(selected.published_on)}</p><p class="muted">표지를 누르면 PDF가 새 탭으로 열립니다.</p><a class="button primary" href="${issueUrl(selected.id)}" data-paper="${selected.id}">PDF 열기 ↗</a><p class="muted newspaper-link-note">열리지 않으면 이 화면을 새로고침해 주세요.</p></div></section>`;
  await hydrateCovers(client,content,[selected],isCurrent);return;
 }
 const page=Math.max(0,Math.min(10000,parseInt(params.get('p'),10)||0));
 let request=client.from('wiki_newspapers').select(columns,{count:'exact'}).order('published_on',{ascending:false}).order('created_at',{ascending:false}).order('id');
 if(!manage)request=request.eq('published',true);
 const result=await request.range(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE-1),rows=must(result),count=result.count||0;
 if(!isCurrent())return;
 if(page>0&&page*PAGE_SIZE>=count){go(manage?'#newspapers-manage':'#newspapers');return;}
 const pager=count>PAGE_SIZE?`<nav class="pagination" aria-label="신문함 페이지"><button data-paper-page="${page-1}" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${Math.ceil(count/PAGE_SIZE)}</span><button data-paper-page="${page+1}" ${(page+1)*PAGE_SIZE>=count?'disabled':''}>다음 →</button></nav>`:'';
 const form=manage?`<section class="newspaper-compose profile-settings-card"><h2>${selected?'신문 정보 수정':'새 신문 등록'}</h2><form id="newspaper-form" class="form"><fieldset><label>신문 제목<input name="title" maxlength="120" value="${e(selected?.title||'')}" required></label><div class="calendar-date-fields"><label>발행호 (선택)<input name="issue" maxlength="40" value="${e(selected?.issue_label||'')}" placeholder="예: 제1호 · 11월호"></label><label>발행일<input name="date" type="date" min="1900-01-01" max="2100-12-31" value="${selected?.published_on||koreaToday()}" required></label></div><label>${selected?'PDF 교체 (선택)':'신문 PDF'}<input name="pdf" type="file" accept=".pdf" ${selected?'':'required'}></label><small>PDF 10MB 이하${selected?' · 선택하지 않으면 기존 원본 유지':''}</small><label>표지 이미지 (선택)<input name="cover" type="file" accept=".jpg,.jpeg,.png,.webp"></label><small>JPG·PNG·WEBP 2MB 이하 · 없으면 제목형 표지 사용</small>${selected?.cover_id?'<label class="newspaper-remove-cover"><input name="remove_cover" type="checkbox"> 기존 표지 빼기</label>':''}<p class="muted">${selected?(selected.published?'공개 중인 신문입니다. 수정하면 바로 반영됩니다.':'비공개 신문입니다. 저장 후 아래 목록에서 다시 공개할 수 있습니다.'):'저장하면 신문함에 바로 공개됩니다.'}</p><div class="actions"><button class="primary">${selected?'변경 저장':'신문 게시'}</button>${selected?`<a class="button" href="${manageUrl()}">새 신문 등록</a>`:''}</div></fieldset></form></section>`:'';
 content.innerHTML=head+form+`<section><h2 class="newspaper-list-heading">${manage?'등록된 신문':'신문함'} <span class="muted">${count}호</span></h2>${rows.length?`<div class="newspaper-grid">${rows.map(row=>`<div>${rackCard(row)}${manage?`<div class="newspaper-manage-actions"><span class="tag">${row.published?'공개':'비공개'}</span><a class="button" href="${manageUrl(row.id)}">수정</a><button data-paper-toggle="${row.id}" data-version="${row.version}" data-published="${!row.published}">${row.published?'비공개로 전환':'다시 공개'}</button></div>`:''}</div>`).join('')}</div>`:'<p class="empty">아직 등록된 교내신문이 없습니다.</p>'}${pager}</section>`;
 const cache=new WeakMap(),editor=content.querySelector('#newspaper-form');
 editor?.addEventListener('submit',event=>{
  event.preventDefault();action(async()=>{
   const values=new FormData(editor),pdf=editor.elements.pdf.files[0],cover=editor.elements.cover.files[0];
   if(!pdf&&!selected?.pdf_id)throw new Error('신문 PDF를 선택해 주세요.');
   if(pdf)await validateNewspaperFile(pdf,'pdf');if(cover)await validateNewspaperFile(cover,'cover');
   const fieldset=editor.querySelector('fieldset');fieldset.disabled=true;
   try{
    const pdfId=pdf?await uploadNewspaperFile(client,pdf,'pdf',cache):selected.pdf_id;
    const coverId=cover?await uploadNewspaperFile(client,cover,'cover',cache):values.get('remove_cover')?null:selected?.cover_id||null;
    const id=must(await client.rpc('save_wiki_newspaper',{p_id:selected?.id||null,p_title:String(values.get('title')).trim(),p_issue:String(values.get('issue')||'').trim(),p_date:String(values.get('date')),p_pdf:pdfId,p_cover:coverId,p_version:selected?.version||null}));
    if(!isCurrent())return;notify('교내신문을 저장했습니다.');go(manageUrl(id));
   }finally{fieldset.disabled=false;}
  },editor);
 });
 content.querySelectorAll('[data-paper-toggle]').forEach(button=>button.addEventListener('click',()=>action(async()=>{
  must(await client.rpc('set_wiki_newspaper_published',{p_id:button.dataset.paperToggle,p_published:button.dataset.published==='true',p_version:Number(button.dataset.version)}));
  if(!isCurrent())return;notify('신문 공개 상태를 변경했습니다.');go(location.hash);
 },button.closest('.newspaper-manage-actions'))));
 content.querySelectorAll('[data-paper-page]').forEach(button=>button.addEventListener('click',()=>go(`#${manage?'newspapers-manage':'newspapers'}?p=${button.dataset.paperPage}`)));
 await hydrateCovers(client,content,rows,isCurrent);
}
