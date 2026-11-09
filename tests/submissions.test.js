import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
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
const submit=(id=null,title='제출 문서',category='교육과정')=>as('authenticated',owner,'select public.submit_wiki_document($1,$2,$3,$4,$5) as id',[id,title,category,'검토할 내용','확인된 출처']);
async function review(id,approve,note='',actor=admin,version) {
 const row=(await as('authenticated',admin,'select * from public.document_submissions where id=$1',[id])).rows[0];
 return as('authenticated',actor,'select public.review_wiki_document($1,$2,$3,$4) as id',[id,approve,note,version??row.updated_at]);
}
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`);
 await db.exec(await readFile(new URL('../supabass/migrations/202611080001_wiki.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabass/migrations/202611090003_member_submissions.sql',import.meta.url),'utf8'));
 for(const id of [owner,other,admin,editor])await db.query('insert into auth.users(id) values($1)',[id]);
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("update public.profiles set role='editor' where id=$1",[editor]);
});
after(async()=>await db?.close());
test('제출 문서는 작성자와 관리자만 읽고 공개 목록·이력에는 나타나지 않음',async()=>{
 const id=(await submit()).rows[0].id;
 assert.equal((await as('authenticated',owner,'select * from public.document_submissions where id=$1',[id])).rows.length,1);
 assert.equal((await as('authenticated',other,'select * from public.document_submissions where id=$1',[id])).rows.length,0);
 assert.equal((await as('authenticated',editor,'select * from public.document_submissions where id=$1',[id])).rows.length,0);
 assert.equal((await as('authenticated',admin,'select * from public.document_submissions where id=$1',[id])).rows.length,1);
 await assert.rejects(as('anon',null,'select * from public.document_submissions'),/permission denied/);
 assert.equal((await as('anon',null,'select * from public.pages')).rows.length,0);
 assert.equal((await as('anon',null,'select * from public.revisions')).rows.length,0);
});
test('일반 회원의 직접 게시·상태 조작·다른 사람 문서 수정·승인을 차단',async()=>{
 const id=(await submit(null,'권한 시험')).rows[0].id;
 await assert.rejects(as('authenticated',owner,"select public.save_page(null,'우회','학교생활','내용','출처',null)"),/편집 권한/);
 await assert.rejects(as('authenticated',owner,"update public.document_submissions set status='approved' where id=$1",[id]),/permission denied/);
 await assert.rejects(as('authenticated',other,"select public.submit_wiki_document($1,'탈취','기타','내용','출처')",[id]),/본인이/);
 for(const actor of [owner,editor])await assert.rejects(review(id,true,'',actor),/관리자만/);
 await assert.rejects(as('anon',null,"select public.submit_wiki_document(null,'익명','기타','내용','출처')"),/permission denied/);
});
test('반려 후 재제출하고 승인하면 정확히 한 번 공개·이력을 생성',async()=>{
 const id=(await submit(null,'승인 시험','입결')).rows[0].id;
 await review(id,false,'출처 보완');
 let row=(await as('authenticated',owner,'select * from public.document_submissions where id=$1',[id])).rows[0];
 assert.equal(row.status,'rejected');assert.equal(row.review_note,'출처 보완');assert.equal(row.published_page_id,null);
 await submit(id,'승인 시험','입결');
 row=(await as('authenticated',owner,'select * from public.document_submissions where id=$1',[id])).rows[0];
 assert.equal(row.status,'pending');assert.equal(row.review_note,'');
 const pageId=(await review(id,true)).rows[0].id;
 assert.equal((await as('anon',null,'select * from public.pages where id=$1',[pageId])).rows.length,1);
 assert.equal((await as('anon',null,'select * from public.revisions where page_id=$1',[pageId])).rows.length,1);
 await assert.rejects(review(id,true),/이미 심사/);
 await assert.rejects(submit(id),/이미 승인/);
});
test('같은 제목 승인 실패는 기존 문서를 보존하며 대기 상태도 유지',async()=>{
 const id=(await submit(null,'승인 시험')).rows[0].id;
 await assert.rejects(review(id,true),/unique|duplicate/);
 const row=(await as('authenticated',owner,'select * from public.document_submissions where id=$1',[id])).rows[0];
 assert.equal(row.status,'pending');assert.equal(row.published_page_id,null);
});
test('검토 도중 제출 내용이 바뀌면 이전 화면으로 승인할 수 없음',async()=>{
 const id=(await submit(null,'변경 전')).rows[0].id;
 const old=(await as('authenticated',admin,'select * from public.document_submissions where id=$1',[id])).rows[0];
 await submit(id,'변경 후');
 await assert.rejects(review(id,true,'',admin,old.updated_at),/내용이 변경/);
 await review(id,true);
});
