import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {validateAttachmentFile,MAX_FILE_BYTES} from '../src/attachments.js';
let db;
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const admin='00000000-0000-4000-8000-000000000003';
const editor='00000000-0000-4000-8000-000000000004';
async function as(role,id,sql,args=[]) {
 await db.exec(`set role ${role}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 try{return await db.query(sql,args);}finally{await db.exec('reset role');}
}
const auth=(id,sql,args=[])=>as('authenticated',id,sql,args);
const anon=(sql,args=[])=>as('anon',null,sql,args);
async function reserve(name='photo.png',who=owner,size=100) {
 return (await auth(who,'select * from public.reserve_wiki_attachment($1,$2)',[name,size])).rows[0];
}
async function upload(a,who=owner,size=a.size_bytes,mime=a.mime_type) {
 return auth(who,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)', ['dongsan-wiki-files',a.object_path,{size:Number(size),mimetype:mime}]);
}
async function asset(name='photo.png',who=owner) { const a=await reserve(name,who);await upload(a,who);return a; }
async function save(title,ids=[],id=null,version=null,who=admin) {
 return (await auth(who,"select public.save_page_with_attachments($1,$2,'학교생활','문서 내용','출처',$3,$4) as id",[id,title,version,ids])).rows[0].id;
}
async function submit(title,ids=[],target=null,version=null,id=null,who=owner) {
 return (await auth(who,"select public.submit_wiki_document_with_attachments($1,$2,'기타','제안 내용','출처',$3,$4,$5) as id",[id,title,target,version,ids])).rows[0].id;
}
async function review(id,approve=true,who=admin) {
 const row=(await auth(admin,'select * from public.document_submissions where id=$1',[id])).rows[0];
 return auth(who,'select public.review_wiki_document($1,$2,$3,$4) as id',[id,approve,'',row.updated_at]);
}
const readable=async(a,who)=>(await (who?auth(who,'select * from public.wiki_attachments where id=$1',[a.id]):anon('select * from public.wiki_attachments where id=$1',[a.id]))).rows.length;
const bytesReadable=async(a,who)=>(await (who?auth(who,'select * from storage.objects where name=$1',[a.object_path]):anon('select * from storage.objects where name=$1',[a.object_path]))).rows.length;
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant usage on schema storage to anon,authenticated;
 grant select,insert,update,delete on storage.objects to anon,authenticated;
 create policy legacy_broad_storage_policy on storage.objects for all to anon,authenticated using(true) with check(true);`);
 for(const file of ['202611080001_wiki.sql','202611090003_member_submissions.sql','202611100001_review_edits_trash.sql','202611100002_document_attachments.sql'])await db.exec(await readFile(new URL('../supabass/migrations/'+file,import.meta.url),'utf8'));
 // Reapplying the attachment installation preserves rows and permissions.
 await db.exec(await readFile(new URL('../supabass/migrations/202611100002_document_attachments.sql',import.meta.url),'utf8'));
 for(const id of [owner,other,admin,editor])await db.query('insert into auth.users(id) values($1)',[id]);
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("update public.profiles set role='editor' where id=$1",[editor]);
});
after(async()=>await db?.close());
test('버킷은 비공개이며 크기·형식 제한을 설정',async()=>{
 const bucket=(await db.query("select * from storage.buckets where id='dongsan-wiki-files'")).rows[0];
 assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),MAX_FILE_BYTES);
 assert(!bucket.allowed_mime_types.includes('image/svg+xml'));
});
test('미공개 파일은 소유자·관리자만 metadata와 bytes를 조회',async()=>{
 const a=await asset();
 for(const who of [null,other,editor]){assert.equal(await readable(a,who),0);assert.equal(await bytesReadable(a,who),0);}
 for(const who of [owner,admin]){assert.equal(await readable(a,who),1);assert.equal(await bytesReadable(a,who),1);}
 await assert.rejects(anon("select public.reserve_wiki_attachment('x.png',10)"),/permission denied/);
 await assert.rejects(auth(owner,'update public.wiki_attachments set owner_id=$1 where id=$2',[other,a.id]),/permission denied/);
});
test('광범위한 기존 storage 정책이 있어도 파일 위조 업로드·수정·삭제 불가',async()=>{
 const a=await asset();
 await assert.rejects(auth(other,'insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['dongsan-wiki-files',a.object_path+'x',{}]),/row-level security/);
 const updates=await auth(owner,"update storage.objects set metadata='{}' where name=$1 returning id",[a.object_path]);
 assert.equal(updates.rows.length,0);
 assert.equal((await auth(owner,'delete from storage.objects where name=$1 returning id',[a.object_path])).rows.length,0);
 assert.equal((await auth(admin,'delete from storage.objects where name=$1 returning id',[a.object_path])).rows.length,0);
 const b=await reserve('another.png');await assert.rejects(upload(b,other),/row-level security/);
});
test('다른 사람 비공개 첨부를 ID로 가져와 제출할 수 없음',async()=>{
 const a=await asset();
 await assert.rejects(submit('훔친 첨부',[a.id],null,null,null,other),/사용할 수 없는/);
 await assert.rejects(auth(owner,"select public.validate_wiki_attachments('{}','{}')"),/permission denied/);
});
test('실제 업로드 완료·크기·MIME을 검증하고 빈 파일·SVG 등을 차단',async()=>{
 const a=await reserve();await assert.rejects(submit('미완료',[a.id]),/완료되지/);
 const b=await reserve('size.png');await upload(b,owner,99);await assert.rejects(submit('크기 위조',[b.id]),/완료되지/);
 const c=await reserve('mime.png');await upload(c,owner,c.size_bytes,'text/html');await assert.rejects(submit('형식 위조',[c.id]),/완료되지/);
 for(const name of ['x.svg','x.html','x.exe','../x.png','a\\b.png'])await assert.rejects(reserve(name));
 await assert.rejects(reserve('big.png',owner,MAX_FILE_BYTES+1));await assert.rejects(reserve('empty.png',owner,0));
});
test('승인 전 공개 조회를 차단하고 승인 시 첨부·이력을 원자적으로 공개',async()=>{
 const a=await asset('pending.pdf');const id=await submit('첨부 승인',[a.id]);
 assert.equal(await readable(a,null),0);assert.equal(await bytesReadable(a,other),0);
 await assert.rejects(review(id,true,editor),/관리자만/);
 const page=(await review(id)).rows[0].id;
 assert.equal(await readable(a,null),1);assert.equal(await bytesReadable(a,null),1);
 assert.deepEqual((await anon('select attachment_ids from public.pages where id=$1',[page])).rows[0].attachment_ids,[a.id]);
 assert.deepEqual((await anon('select attachment_ids from public.revisions where page_id=$1',[page])).rows[0].attachment_ids,[a.id]);
});
test('일반 회원이 다른 작성자의 공개 첨부를 유지하며 수정·추가 가능',async()=>{
 const a=await asset('old.png',admin);const page=await save('첨부 수정',[a.id]);
 const b=await asset('private.png');const id=await submit('첨부 수정',[a.id,b.id],page,1);
 assert.equal(await readable(b,null),0);assert.equal(await bytesReadable(b,null),0);
 assert.deepEqual((await anon('select attachment_ids from public.pages where id=$1',[page])).rows[0].attachment_ids,[a.id]);
 await review(id);
 assert.equal(await bytesReadable(b,null),1);
 const rev=(await anon('select attachment_ids from public.revisions where page_id=$1 order by version',[page])).rows;
 assert.deepEqual(rev.map(r=>r.attachment_ids),[[a.id],[a.id,b.id]]);
});
test('반려·재제출에서도 첨부는 비공개, 오래된 수정안은 파일을 공개하지 않음',async()=>{
 const a=await asset('rejected.png');const id=await submit('반려 파일',[a.id]);await review(id,false);
 assert.equal(await bytesReadable(a,null),0);await submit('반려 파일',[a.id],null,null,id);await review(id);
 assert.equal(await bytesReadable(a,null),1);
 const page=await save('충돌 파일');const b=await asset('conflict.png');const pending=await submit('충돌 파일',[b.id],page,1);
 await save('충돌 파일',[],page,1);await assert.rejects(review(pending),/다른 운영진/);
 assert.equal(await bytesReadable(b,null),0);
});
test('첨부 제거 후 이전 이력은 유지되며 문서 삭제 시 공개 bytes도 숨김·복구',async()=>{
 const a=await asset('history.png',admin);const page=await save('첨부 이력',[a.id]);
 await save('첨부 이력',[],page,1);assert.equal(await bytesReadable(a,null),1);
 await auth(admin,'select public.set_wiki_page_deleted($1,2,true)',[page]);
 for(const who of [null,owner,other,editor]){assert.equal(await readable(a,who),0);assert.equal(await bytesReadable(a,who),0);}
 assert.equal(await bytesReadable(a,admin),1);
 await auth(admin,'select public.set_wiki_page_deleted($1,3,false)',[page]);assert.equal(await bytesReadable(a,null),1);
});
test('기존 저장 RPC는 첨부를 보존하고, 새 RPC는 일반 회원 직접 게시를 차단',async()=>{
 const a=await asset('legacy.png',admin);const page=await save('이전 호출',[a.id]);
 await auth(editor,"select public.save_page($1,'이전 호출','기타','수정','출처',1)",[page]);
 assert.deepEqual((await anon('select attachment_ids from public.revisions where page_id=$1 and version=2',[page])).rows[0].attachment_ids,[a.id]);
 await assert.rejects(save('권한 우회',[a.id],null,null,owner),/편집 권한/);
 await assert.rejects(save('중복 첨부',[a.id,a.id]),/중복/);
 await assert.rejects(save('과다 첨부',Array(9).fill(a.id)),/최대 8개/);
});
test('클라이언트는 이미지 서명·확장자·파일 크기를 확인',async()=>{
 assert.equal(await validateAttachmentFile(new File([new Uint8Array([137,80,78,71,13,10,26,10])],'a.png')),'image/png');
 await assert.rejects(validateAttachmentFile(new File(['<script>bad</script>'],'a.png')),/확장자가/);
 await assert.rejects(validateAttachmentFile(new File(['svg'],'a.svg')),/지원하지/);
 await assert.rejects(validateAttachmentFile(new File([],'a.txt')),/비어 있지/);
 await assert.rejects(validateAttachmentFile(new File([new Uint8Array(MAX_FILE_BYTES+1)],'large.txt')),/10MB/);
});
