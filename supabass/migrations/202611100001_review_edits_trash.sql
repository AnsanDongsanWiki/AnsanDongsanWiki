-- 이전 회원 제출 기능 설치 후 한 번 실행합니다. 기존 문서·제출 내역을 유지합니다.
begin;
alter table public.pages add column deleted_at timestamptz;
alter table public.document_submissions
 add column target_page_id uuid references public.pages(id),
 add column base_version integer,
 add constraint submission_target_version_check check (
  (target_page_id is null and base_version is null)
  or (target_page_id is not null and base_version is not null and base_version>0)
 );

drop policy public_read_pages on public.pages;
create policy public_read_pages on public.pages for select to anon,authenticated
 using (deleted_at is null);
create policy admin_read_trashed_pages on public.pages for select to authenticated
 using ((select public.current_wiki_role())='admin');
drop policy public_read_revisions on public.revisions;
create policy public_read_revisions on public.revisions for select to anon,authenticated
 using (exists (select 1 from public.pages where pages.id=revisions.page_id));
create or replace function public.save_page(
 p_id uuid,p_title text,p_category text,p_content text,p_source text,p_version integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; old_version integer; next_version integer; author_name text;
begin
 if auth.uid() is null or coalesce(public.current_wiki_role(),'') not in ('editor','admin') then
  raise exception '편집 권한이 없습니다.' using errcode='42501';
 end if;
 if p_id is null then
  insert into public.pages(title,category,content,source)
   values(trim(p_title),p_category,trim(p_content),coalesce(p_source,'')) returning id into saved_id;
  next_version:=1;
 else
  select version into old_version from public.pages where id=p_id and deleted_at is null for update;
  if not found then raise exception '문서를 찾을 수 없습니다.'; end if;
  if p_version is distinct from old_version then
   raise exception '다른 운영진이 수정했습니다. 내용을 복사한 뒤 문서를 다시 열어 주세요.' using errcode='40001';
  end if;
  saved_id:=p_id; next_version:=old_version+1;
  update public.pages set title=trim(p_title),category=p_category,content=trim(p_content),
   source=coalesce(p_source,''),version=next_version,updated_at=now() where id=p_id;
 end if;
 select nickname into author_name from public.profiles where id=auth.uid();
 insert into public.revisions(page_id,title,category,content,source,version,editor_id,editor_name)
 select id,title,category,content,source,version,auth.uid(),author_name from public.pages where id=saved_id;
 return saved_id;
end;
$$;
-- Default arguments keep old five-field new-document requests working.
drop function public.submit_wiki_document(uuid,text,text,text,text);
create function public.submit_wiki_document(
 p_id uuid,p_title text,p_category text,p_content text,p_source text,
 p_target_page_id uuid default null,p_base_version integer default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare submission public.document_submissions%rowtype; saved_id uuid; author text; current_version integer;
begin
 if auth.uid() is null or public.current_wiki_role() is null then
  raise exception '로그인이 필요합니다.' using errcode='42501';
 end if;
 select nickname into author from public.profiles where id=auth.uid();
 if p_id is not null then
  select * into submission from public.document_submissions where id=p_id for update;
  if not found or submission.author_id is distinct from auth.uid() then
   raise exception '본인이 제출한 문서만 수정할 수 있습니다.' using errcode='42501';
  end if;
  if submission.status='approved' then raise exception '이미 승인된 문서는 수정할 수 없습니다.'; end if;
  if submission.target_page_id is distinct from p_target_page_id
   or submission.base_version is distinct from p_base_version then
   raise exception '수정 대상과 기준 버전은 변경할 수 없습니다. 현재 공개 문서에서 새 수정안을 작성해 주세요.';
  end if;
 end if;
 if p_target_page_id is not null then
  select version into current_version from public.pages
   where id=p_target_page_id and deleted_at is null for share;
  if not found then raise exception '공개 문서를 찾을 수 없습니다. 삭제되었을 수 있습니다.'; end if;
  if p_base_version is distinct from current_version then
   raise exception '공개 문서가 변경됐습니다. 현재 문서를 확인하고 새 수정안을 작성해 주세요.' using errcode='40001';
  end if;
 elsif p_base_version is not null then
  raise exception '새 문서에는 기준 버전을 지정할 수 없습니다.';
 end if;
 if p_id is null then
  insert into public.document_submissions(author_id,author_name,title,category,content,source,target_page_id,base_version)
   values(auth.uid(),author,trim(p_title),p_category,trim(p_content),trim(p_source),p_target_page_id,p_base_version)
   returning id into saved_id;
 else
  update public.document_submissions set title=trim(p_title),category=p_category,
   content=trim(p_content),source=trim(p_source),author_name=author,status='pending',
   review_note='',reviewer_id=null,reviewed_at=null,updated_at=now() where id=p_id;
  saved_id:=p_id;
 end if;
 return saved_id;
end;
$$;
create or replace function public.review_wiki_document(
 p_id uuid,p_approve boolean,p_note text,p_expected_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare submission public.document_submissions%rowtype; page_id uuid;
begin
 if auth.uid() is null or coalesce(public.current_wiki_role(),'')<>'admin' then
  raise exception '관리자만 승인·반려할 수 있습니다.' using errcode='42501';
 end if;
 if p_approve is null then raise exception '심사 결과가 필요합니다.'; end if;
 if char_length(coalesce(p_note,''))>2000 then raise exception '심사 의견은 2000자 이내로 작성해 주세요.'; end if;
 select * into submission from public.document_submissions where id=p_id for update;
 if not found then raise exception '제출 문서를 찾을 수 없습니다.'; end if;
 if submission.updated_at is distinct from p_expected_updated_at then
  raise exception '제출 내용이 변경됐습니다. 새로고침 후 다시 검토해 주세요.';
 end if;
 if submission.status<>'pending' then raise exception '이미 심사가 완료된 문서입니다.'; end if;
 if p_approve then
  page_id:=public.save_page(submission.target_page_id,submission.title,submission.category,
   submission.content,submission.source,submission.base_version);
 end if;
 update public.document_submissions set status=case when p_approve then 'approved' else 'rejected' end,
  review_note=coalesce(p_note,''),reviewer_id=auth.uid(),published_page_id=page_id,
  reviewed_at=now(),updated_at=now() where id=p_id;
 return page_id;
end;
$$;
create function public.set_wiki_page_deleted(p_id uuid,p_version integer,p_deleted boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare page public.pages%rowtype; author text;
begin
 if auth.uid() is null or coalesce(public.current_wiki_role(),'')<>'admin' then
  raise exception '관리자만 문서를 삭제·복구할 수 있습니다.' using errcode='42501';
 end if;
 if p_deleted is null then raise exception '삭제 또는 복구를 선택해 주세요.'; end if;
 select * into page from public.pages where id=p_id for update;
 if not found then raise exception '문서를 찾을 수 없습니다.'; end if;
 if page.version is distinct from p_version then
  raise exception '문서가 변경됐습니다. 새로고침 후 다시 시도해 주세요.' using errcode='40001';
 end if;
 if (page.deleted_at is not null)=p_deleted then raise exception '이미 처리된 문서입니다.'; end if;
 select nickname into author from public.profiles where id=auth.uid();
 update public.pages set deleted_at=case when p_deleted then now() else null end,
  updated_at=now(),version=version+1 where id=p_id;
 insert into public.revisions(page_id,title,category,content,source,version,editor_id,editor_name)
  select id,title,category,content,source,version,auth.uid(),author from public.pages where id=p_id;
 return p_id;
end;
$$;
revoke all on function public.submit_wiki_document(uuid,text,text,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.submit_wiki_document(uuid,text,text,text,text,uuid,integer) to authenticated;
revoke all on function public.set_wiki_page_deleted(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.set_wiki_page_deleted(uuid,integer,boolean) to authenticated;
commit;
