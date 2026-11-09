import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { escapeHtml, canEdit, safeUrl, validatePassword } from '../src/core.js';
let db;
const reader = '00000000-0000-4000-8000-000000000001';
const editor = '00000000-0000-4000-8000-000000000002';
const admin = '00000000-0000-4000-8000-000000000003';
async function asUser(role, id, sql, args = []) {
  await db.exec(`set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
  try { return await db.query(sql, args); }
  finally { await db.exec('reset role'); }
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth,public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabass/migrations/202611080001_wiki.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2),($3,$4),($5,$6)', [reader, {nickname:'일반회원',role:'admin'}, editor, {nickname:'편집자'}, admin, {nickname:'관리자'}]);
  await db.query("update public.profiles set role='editor' where id=$1", [editor]);
  await db.query("update public.profiles set role='admin' where id=$1", [admin]);
});
after(async () => { await db?.close(); });

test('닉네임과 본문은 HTML로 실행되지 않음', () => {
  assert.equal(escapeHtml('<img onerror="alert(1)">'), '&lt;img onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://example.com/form'), 'https://example.com/form');
  assert.equal(canEdit({role:'reader'}), false);
  assert.throws(() => validatePassword('short'));
});
test('회원가입 metadata의 관리자 요청은 무시', async () => {
  const result = await db.query('select role from public.profiles where id=$1',[reader]);
  assert.equal(result.rows[0].role, 'reader');
});
test('일반 회원은 자기 프로필만 조회하고 자기 역할을 올릴 수 없음', async () => {
  const profiles = await asUser('authenticated',reader,'select * from public.profiles');
  assert.equal(profiles.rows.length,1);
  const changed = await asUser('authenticated',reader,"update public.profiles set role='admin' where id=$1 returning id",[reader]);
  assert.equal(changed.rows.length,0);
  await assert.rejects(asUser('authenticated',reader,"update public.profiles set nickname='변경' where id=$1",[reader]),/permission denied/);
});
test('일반 회원은 RPC나 직접 API로 문서 저장 불가', async () => {
  await assert.rejects(asUser('authenticated',reader,"select public.save_page(null,'거부','FAQ','내용','출처',null)"),/편집 권한/);
  await assert.rejects(asUser('authenticated',reader,"insert into public.pages(title,category,content) values('거부','FAQ','내용')"),/permission denied/);
});
test('관리자만 일반 회원과 편집자 역할 변경 가능, 웹 관리자 생성 불가', async () => {
  await assert.rejects(asUser('authenticated',admin,"update public.profiles set role='admin' where id=$1",[reader]),/row-level security/);
  const changed = await asUser('authenticated',admin,"update public.profiles set role='editor' where id=$1 returning role",[reader]);
  assert.equal(changed.rows[0].role,'editor');
  await asUser('authenticated',admin,"update public.profiles set role='reader' where id=$1",[reader]);
  const own = await asUser('authenticated',admin,"update public.profiles set role='reader' where id=$1 returning id",[admin]);
  assert.equal(own.rows.length,0);
  const denied = await asUser('authenticated',editor,"update public.profiles set role='editor' where id=$1 returning id",[reader]);
  assert.equal(denied.rows.length,0);
});
test('편집자 저장은 이력을 남기고, 충돌·잘못된 내용은 전체 롤백', async () => {
  const created = await asUser('authenticated',editor,"select public.save_page(null,'학교생활 안내','학교생활','첫 내용','안내문',null) as id");
  const id = created.rows[0].id;
  await asUser('authenticated',editor,"select public.save_page($1,'학교생활 안내','학교생활','수정 내용','안내문',1)",[id]);
  await assert.rejects(asUser('authenticated',editor,"select public.save_page($1,'학교생활 안내','학교생활','오래된 내용','안내문',1)",[id]),/다른 운영진/);
  await assert.rejects(asUser('authenticated',editor,"select public.save_page($1,'학교생활 안내','학교생활','   ','안내문',2)",[id]),/check constraint/);
  const revisions = await asUser('anon',null,'select * from public.revisions where page_id=$1 order by version',[id]);
  assert.equal(revisions.rows.length,2);
  assert.equal(revisions.rows[1].editor_name,'편집자');
  const page = await asUser('anon',null,'select * from public.pages where id=$1',[id]);
  assert.equal(page.rows[0].content,'수정 내용'); assert.equal(page.rows[0].version,2);
  await assert.rejects(asUser('authenticated',editor,"update public.revisions set content='위조'"),/permission denied/);
  await assert.rejects(asUser('anon',null,'select * from public.profiles'),/permission denied/);
});
