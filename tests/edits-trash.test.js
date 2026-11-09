import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const reader='00000000-0000-4000-8000-000000000001';
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
const create=async title=>(await auth(admin,"select public.save_page(null,$1,'학교생활','기존 내용','기존 출처',null) as id",[title])).rows[0].id;
const propose=async(page,title,version=1,owner=reader)=>(await auth(owner,"select public.submit_wiki_document(null,$1,'교육과정','수정 제안','새 출처',$2,$3) as id",[title,page,version])).rows[0].id;
const review=async(id,approve=true)=>{
 const row=(await auth(admin,'select * from public.document_submissions where id=$1',[id])).rows[0];
 return auth(admin,'select public.review_wiki_document($1,$2,$3,$4) as id',[id,approve,'검토 완료',row.updated_at]);
};
const archive=(page,version,deleted=true,who=admin)=>auth(who,'select public.set_wiki_page_deleted($1,$2,$3)',[page,version,deleted]);
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`);
 for(const file of ['202611080001_wiki.sql','202611090003_member_submissions.sql','202611100001_review_edits_trash.sql'])
  await db.exec(await readFile(new URL('../supabass/migrations/'+file,import.meta.url),'utf8'));
 for(const id of [reader,other,admin,editor])await db.query('insert into auth.users(id) values($1)',[id]);
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("update public.profiles set role='editor' where id=$1",[editor]);
});
after(async()=>await db?.close());
test('일반 회원 수정안은 승인 전 기존 본문·공개 이력을 바꾸지 않음',async()=>{
 const page=await create('수정 승인');const id=await propose(page,'수정 승인');
 assert.equal((await anon('select content,version from public.pages where id=$1',[page])).rows[0].content,'기존 내용');
 assert.equal((await anon('select * from public.revisions where page_id=$1',[page])).rows.length,1);
 assert.equal((await auth(other,'select * from public.document_submissions where id=$1',[id])).rows.length,0);
 await assert.rejects(auth(reader,"select public.save_page($1,'직접 수정','학교생활','우회','출처',1)",[page]),/편집 권한/);
 assert.equal((await review(id)).rows[0].id,page);
 const published=(await anon('select * from public.pages where id=$1',[page])).rows[0];
 assert.equal(published.content,'수정 제안');assert.equal(published.version,2);assert.equal(published.category,'교육과정');
 const history=(await anon('select content from public.revisions where page_id=$1 order by version',[page])).rows;
 assert.deepEqual(history.map(r=>r.content),['기존 내용','수정 제안']);
 await assert.rejects(review(id),/이미 심사/);
});
test('반려된 수정안은 기존 문서를 유지하고 작성자가 다시 제출 가능',async()=>{
 const page=await create('반려 시험');const id=await propose(page,'반려 시험');
 await review(id,false);
 assert.equal((await anon('select content from public.pages where id=$1',[page])).rows[0].content,'기존 내용');
 await auth(reader,"select public.submit_wiki_document($1,'반려 시험','학교생활','보완한 내용','보완 출처',$2,1)",[id,page]);
 await review(id);
 assert.equal((await anon('select content from public.pages where id=$1',[page])).rows[0].content,'보완한 내용');
});
test('수정안의 대상과 기준 버전 조작 및 다른 사람 요청 수정을 차단',async()=>{
 const a=await create('대상 A');const b=await create('대상 B');const id=await propose(a,'대상 A');
 await assert.rejects(auth(reader,"select public.submit_wiki_document($1,'탈취','기타','내용','출처',$2,1)",[id,b]),/대상과 기준 버전/);
 await assert.rejects(auth(other,"select public.submit_wiki_document($1,'탈취','기타','내용','출처',$2,1)",[id,a]),/본인이/);
 await assert.rejects(propose(a,'거짓 버전',99),/문서가 변경/);
});
test('먼저 반영된 다른 수정안을 오래된 요청이 덮어쓸 수 없음',async()=>{
 const page=await create('충돌 시험');const a=await propose(page,'충돌 시험');const b=await propose(page,'충돌 시험',1,other);
 await review(a);await assert.rejects(review(b),/다른 운영진/);
 assert.equal((await auth(other,'select status from public.document_submissions where id=$1',[b])).rows[0].status,'pending');
 assert.equal((await anon('select version from public.pages where id=$1',[page])).rows[0].version,2);
 await review(b,false);
});
test('관리자만 삭제하며 삭제된 본문·이력을 다른 회원과 익명에게 숨김',async()=>{
 const page=await create('휴지통 시험');
 for(const who of [reader,editor])await assert.rejects(archive(page,1,true,who),/관리자만/);
 await assert.rejects(anon('select public.set_wiki_page_deleted($1,1,true)',[page]),/permission denied/);
 await assert.rejects(auth(admin,'delete from public.pages where id=$1',[page]),/permission denied/);
 await archive(page,1);
 for(const who of [reader,other,editor]) {
  assert.equal((await auth(who,'select * from public.pages where id=$1',[page])).rows.length,0);
  assert.equal((await auth(who,'select * from public.revisions where page_id=$1',[page])).rows.length,0);
 }
 assert.equal((await anon('select * from public.pages where id=$1',[page])).rows.length,0);
 assert.equal((await anon('select * from public.revisions where page_id=$1',[page])).rows.length,0);
 assert.equal((await auth(admin,'select * from public.pages where id=$1',[page])).rows.length,1);
 assert.equal((await auth(admin,'select * from public.revisions where page_id=$1',[page])).rows.length,2);
 await assert.rejects(auth(editor,"select public.save_page($1,'우회','학교생활','내용','출처',2)",[page]),/문서를 찾을/);
 await assert.rejects(propose(page,'휴지통 시험',2),/공개 문서를 찾을/);
 await assert.rejects(archive(page,1,false),/문서가 변경/);
 await archive(page,2,false);
 assert.equal((await anon('select content,version from public.pages where id=$1',[page])).rows[0].content,'기존 내용');
 assert.equal((await anon('select * from public.revisions where page_id=$1',[page])).rows.length,3);
});
test('삭제·복구를 거친 문서에 과거 수정안을 적용하지 않음',async()=>{
 const page=await create('삭제 후 승인');const id=await propose(page,'삭제 후 승인');
 await archive(page,1);await assert.rejects(review(id),/문서를 찾을/);
 await archive(page,2,false);await assert.rejects(review(id),/다른 운영진/);
 assert.equal((await anon('select content from public.pages where id=$1',[page])).rows[0].content,'기존 내용');
});
test('이전 새 문서 제출 방식과 편집자 직접 수정도 계속 동작',async()=>{
 const id=(await auth(reader,"select public.submit_wiki_document(null,'호환 시험','기타','새 내용','출처') as id")).rows[0].id;
 const page=(await review(id)).rows[0].id;
 await auth(editor,"select public.save_page($1,'호환 시험','기타','편집자 수정','출처',1)",[page]);
 assert.equal((await anon('select content from public.pages where id=$1',[page])).rows[0].content,'편집자 수정');
});
