import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const admin='00000000-0000-4000-8000-000000000003';
const editor='00000000-0000-4000-8000-000000000004';
const migration=new URL('../supabass/migrations/202611100003_private_inquiries.sql',import.meta.url);
async function as(role,id,sql,args=[]) {
 await db.exec(`set role ${role}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 try{return await db.query(sql,args);}finally{await db.exec('reset role');}
}
const auth=(id,sql,args=[])=>as('authenticated',id,sql,args);
const send=async(title='도움 요청',body='문의 내용',who=owner)=>(await auth(who,'select public.create_wiki_inquiry($1,$2) as id',[title,body])).rows[0].id;
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;`);
 await db.exec(await readFile(new URL('../supabass/migrations/202611080001_wiki.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(migration,'utf8'));
 for(const id of [owner,other,admin,editor])await db.query('insert into auth.users(id) values($1)',[id]);
 await db.query("update public.profiles set role='admin' where id=$1",[admin]);
 await db.query("update public.profiles set role='editor' where id=$1",[editor]);
});
after(async()=>await db?.close());
test('로그인한 회원의 문의는 작성자와 관리자만 조회',async()=>{
 const id=await send();
 const row=(await auth(owner,'select * from public.wiki_inquiries where id=$1',[id])).rows[0];
 assert.equal(row.author_id,owner);assert.equal(row.status,'open');assert.equal(row.reply,'');
 assert.equal((await auth(admin,'select * from public.wiki_inquiries where id=$1',[id])).rows.length,1);
 for(const who of [other,editor])assert.equal((await auth(who,'select * from public.wiki_inquiries where id=$1',[id])).rows.length,0);
 await assert.rejects(as('anon',null,'select * from public.wiki_inquiries'),/permission denied/);
 await assert.rejects(as('anon',null,"select public.create_wiki_inquiry('익명','내용')"),/permission denied/);
});
test('직접 삽입·답변 조작·문의 수정·삭제 권한을 부여하지 않음',async()=>{
 const id=await send('조작 방지');
 for(const who of [owner,admin]) {
  await assert.rejects(auth(who,"update public.wiki_inquiries set reply='위조',status='answered' where id=$1",[id]),/permission denied/);
  await assert.rejects(auth(who,'delete from public.wiki_inquiries where id=$1',[id]),/permission denied/);
  await assert.rejects(auth(who,"insert into public.wiki_inquiries(author_id,author_name,title,body) values($1,'위조','제목','내용')",[other]),/permission denied/);
 }
});
test('관리자만 답변하고 답변도 다른 회원에게 비공개',async()=>{
 const id=await send('답변 시험');
 for(const who of [owner,other,editor])await assert.rejects(auth(who,"select public.reply_wiki_inquiry($1,'사칭 답변',1)",[id]),/관리자만/);
 await auth(admin,"select public.reply_wiki_inquiry($1,'안내 답변',1)",[id]);
 const row=(await auth(owner,'select * from public.wiki_inquiries where id=$1',[id])).rows[0];
 assert.equal(row.status,'answered');assert.equal(row.reply,'안내 답변');assert.equal(row.body,'문의 내용');
 assert.equal(row.replied_by,admin);assert.equal(row.version,2);
 for(const who of [other,editor])assert.equal((await auth(who,'select * from public.wiki_inquiries where id=$1',[id])).rows.length,0);
});
test('답변 수정 시 오래된 화면의 덮어쓰기를 차단',async()=>{
 const id=await send('동시 답변');
 await auth(admin,"select public.reply_wiki_inquiry($1,'첫 답변',1)",[id]);
 await assert.rejects(auth(admin,"select public.reply_wiki_inquiry($1,'오래된 답변',1)",[id]),/다른 관리자가/);
 await auth(admin,"select public.reply_wiki_inquiry($1,'보완된 답변',2)",[id]);
 assert.equal((await auth(owner,'select reply from public.wiki_inquiries where id=$1',[id])).rows[0].reply,'보완된 답변');
});
test('공백·길이 초과 입력은 데이터베이스에서도 차단',async()=>{
 await assert.rejects(send('   '),/제목은/);
 await assert.rejects(send('x'.repeat(121)),/제목은/);
 await assert.rejects(send('제목','   '),/문의 내용은/);
 await assert.rejects(send('제목','x'.repeat(4001)),/문의 내용은/);
 const id=await send('유효성 시험');
 await assert.rejects(auth(admin,"select public.reply_wiki_inquiry($1,'   ',1)",[id]),/답변은/);
 await assert.rejects(auth(admin,'select public.reply_wiki_inquiry($1,$2,1)',[id,'x'.repeat(4001)]),/답변은/);
 assert.equal((await auth(owner,'select version from public.wiki_inquiries where id=$1',[id])).rows[0].version,1);
});
test('관리자 상태별·제목 검색은 동작하고 일반 회원 검색은 다른 문의를 노출하지 않음',async()=>{
 const id=await send('검색용 고유 제목','비밀 내용',other);
 const adminRows=await auth(admin,"select * from public.wiki_inquiries where status='open' and title ilike '%고유%' order by created_at,id limit 24");
 assert.equal(adminRows.rows.length,1);assert.equal(adminRows.rows[0].id,id);
 assert.equal((await auth(owner,"select * from public.wiki_inquiries where title ilike '%고유%'")).rows.length,0);
 await auth(admin,"select public.reply_wiki_inquiry($1,'확인했습니다.',1)",[id]);
 assert.equal((await auth(admin,"select * from public.wiki_inquiries where status='answered' and title ilike '%고유%'")).rows.length,1);
});
test('설치 SQL 재실행은 기존 문의와 답변을 유지',async()=>{
 const before=(await db.query('select count(*)::int as n from public.wiki_inquiries')).rows[0].n;
 await db.exec(await readFile(migration,'utf8'));
 assert.equal((await db.query('select count(*)::int as n from public.wiki_inquiries')).rows[0].n,before);
 assert.equal((await auth(owner,"select * from public.wiki_inquiries where reply='보완된 답변'")).rows.length,1);
});
test('24시간 동안 문의 10건을 넘겨 접수할 수 없음',async()=>{
 const n=(await auth(owner,'select count(*)::int as n from public.wiki_inquiries')).rows[0].n;
 for(let i=n;i<10;i++)await send('문의 '+i);
 await assert.rejects(send('초과 문의'),/10건까지/);
});
