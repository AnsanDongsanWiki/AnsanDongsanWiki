-- 한 번만 실행: 일반 회원의 비공개 문서 제출 및 관리자 승인.
begin;
alter table public.pages drop constraint if exists pages_category_check;
alter table public.pages add constraint pages_category_check
 check (category in ('학교소개','학교생활','동아리','학생회','FAQ','급식','기타','교육과정','입결'));
create table public.document_submissions (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id),
 author_name text not null,
 title text not null check (char_length(trim(title)) between 1 and 120),
 category text not null check (category in ('학교소개','학교생활','동아리','학생회','FAQ','급식','기타','교육과정','입결')),
 content text not null check (char_length(trim(content)) between 1 and 50000),
 source text not null check (char_length(trim(source)) between 1 and 2000),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 review_note text not null default '' check (char_length(review_note)<=2000),
 reviewer_id uuid references public.profiles(id),
 published_page_id uuid references public.pages(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index document_submissions_author_idx on public.document_submissions(author_id,updated_at desc);
create index document_submissions_pending_idx on public.document_submissions(created_at) where status='pending';
alter table public.document_submissions enable row level security;
revoke all on public.document_submissions from public,anon,authenticated;
grant select on public.document_submissions to authenticated;
create policy author_or_admin_read_submissions on public.document_submissions
 for select to authenticated
 using (author_id=(select auth.uid()) or (select public.current_wiki_role())='admin');

create function public.submit_wiki_document(p_id uuid,p_title text,p_category text,p_content text,p_source text)
returns uuid language plpgsql security definer set search_path='' as $$
declare submission public.document_submissions%rowtype; saved_id uuid; author text;
begin
 if auth.uid() is null or public.current_wiki_role() is null then
  raise exception '로그인이 필요합니다.' using errcode='42501';
 end if;
 select nickname into author from public.profiles where id=auth.uid();
 if p_id is null then
  insert into public.document_submissions(author_id,author_name,title,category,content,source)
   values(auth.uid(),author,trim(p_title),p_category,trim(p_content),trim(p_source)) returning id into saved_id;
 else
  select * into submission from public.document_submissions where id=p_id for update;
  if not found or submission.author_id is distinct from auth.uid() then
   raise exception '본인이 제출한 문서만 수정할 수 있습니다.' using errcode='42501';
  end if;
  if submission.status='approved' then raise exception '이미 승인된 문서는 수정할 수 없습니다.'; end if;
  update public.document_submissions set title=trim(p_title),category=p_category,
   content=trim(p_content),source=trim(p_source),author_name=author,status='pending',
   review_note='',reviewer_id=null,reviewed_at=null,updated_at=now() where id=p_id;
  saved_id:=p_id;
 end if;
 return saved_id;
end;
$$;
create function public.review_wiki_document(p_id uuid,p_approve boolean,p_note text,p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare submission public.document_submissions%rowtype; page_id uuid;
begin
 if auth.uid() is null or coalesce(public.current_wiki_role(),'')<>'admin' then
  raise exception '관리자만 승인·반려할 수 있습니다.' using errcode='42501';
 end if;
 if p_approve is null then raise exception '심사 결과가 필요합니다.'; end if;
 if char_length(coalesce(p_note,''))>2000 then raise exception '심사 의견은 2000자 이내로 작성해 주세요.'; end if;
 select * into submission from public.document_submissions where id=p_id for update;
 if not found then raise exception '제출 문서를 찾을 수 없습니다.'; end if;
 if submission.updated_at is distinct from p_expected_updated_at then raise exception '제출 내용이 변경됐습니다. 새로고침 후 다시 검토해 주세요.'; end if;
 if submission.status<>'pending' then raise exception '이미 심사가 완료된 문서입니다.'; end if;
 if p_approve then
  page_id:=public.save_page(null,submission.title,submission.category,submission.content,submission.source,null);
 end if;
 update public.document_submissions set status=case when p_approve then 'approved' else 'rejected' end,
  review_note=coalesce(p_note,''),reviewer_id=auth.uid(),published_page_id=page_id,
  reviewed_at=now(),updated_at=now() where id=p_id;
 return page_id;
end;
$$;
revoke all on function public.submit_wiki_document(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.review_wiki_document(uuid,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.submit_wiki_document(uuid,text,text,text,text) to authenticated;
grant execute on function public.review_wiki_document(uuid,boolean,text,timestamptz) to authenticated;
commit;
