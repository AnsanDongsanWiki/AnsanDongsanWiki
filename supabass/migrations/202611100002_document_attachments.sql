-- 사진·첨부 파일 기능. 기존 삭제·수정 승인 기능 설치 후 실행합니다.
begin;
do $$ begin
 if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='pages' and column_name='deleted_at') then
  raise exception '삭제·수정 승인 기능을 먼저 설치해 주세요.';
 end if;
end $$;
alter table public.pages add column if not exists attachment_ids uuid[] not null default '{}';
alter table public.revisions add column if not exists attachment_ids uuid[] not null default '{}';
alter table public.document_submissions add column if not exists attachment_ids uuid[] not null default '{}';
create table if not exists public.wiki_attachments (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 object_path text not null unique,
 file_name text not null check (char_length(file_name) between 1 and 180),
 mime_type text not null,
 size_bytes bigint not null check (size_bytes between 1 and 10485760),
 created_at timestamptz not null default now()
);
create index if not exists wiki_attachments_owner_idx on public.wiki_attachments(owner_id,created_at desc);
create index if not exists pages_attachment_ids_idx on public.pages using gin(attachment_ids);
create index if not exists revisions_attachment_ids_idx on public.revisions using gin(attachment_ids);
create index if not exists submissions_attachment_ids_idx on public.document_submissions using gin(attachment_ids);
alter table public.wiki_attachments enable row level security;
revoke all on public.wiki_attachments from public,anon,authenticated;
grant select on public.wiki_attachments to anon,authenticated;

create or replace function public.wiki_attachment_readable(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.wiki_attachments a where a.id=p_id and (
   a.owner_id=auth.uid() or (select public.current_wiki_role())='admin'
   or exists (select 1 from public.pages p where p.deleted_at is null and a.id=any(p.attachment_ids))
   or exists (select 1 from public.revisions r join public.pages p on p.id=r.page_id
              where p.deleted_at is null and a.id=any(r.attachment_ids))
   or exists (select 1 from public.document_submissions s where s.author_id=auth.uid() and a.id=any(s.attachment_ids))
  )
 );
$$;
revoke all on function public.wiki_attachment_readable(uuid) from public;
grant execute on function public.wiki_attachment_readable(uuid) to anon,authenticated;
drop policy if exists read_wiki_attachments on public.wiki_attachments;
create policy read_wiki_attachments on public.wiki_attachments for select to anon,authenticated
 using (public.wiki_attachment_readable(id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dongsan-wiki-files','dongsan-wiki-files',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- Restrictive guards also protect this private bucket from broader existing policies.
drop policy if exists wiki_files_read on storage.objects;
create policy wiki_files_read on storage.objects for select to anon,authenticated
 using (bucket_id='dongsan-wiki-files' and exists (select 1 from public.wiki_attachments a where a.object_path=name and public.wiki_attachment_readable(a.id)));
drop policy if exists wiki_files_read_guard on storage.objects;
create policy wiki_files_read_guard on storage.objects as restrictive for select to anon,authenticated
 using (bucket_id<>'dongsan-wiki-files' or exists (select 1 from public.wiki_attachments a where a.object_path=name and public.wiki_attachment_readable(a.id)));
drop policy if exists wiki_files_insert on storage.objects;
create policy wiki_files_insert on storage.objects for insert to authenticated
 with check (bucket_id='dongsan-wiki-files' and exists (select 1 from public.wiki_attachments a where a.object_path=name and a.owner_id=auth.uid() and a.created_at>now()-interval '1 day'));
drop policy if exists wiki_files_insert_guard on storage.objects;
create policy wiki_files_insert_guard on storage.objects as restrictive for insert to anon,authenticated
 with check (bucket_id<>'dongsan-wiki-files' or exists (select 1 from public.wiki_attachments a where a.object_path=name and a.owner_id=auth.uid() and a.created_at>now()-interval '1 day'));
drop policy if exists wiki_files_no_update on storage.objects;
create policy wiki_files_no_update on storage.objects as restrictive for update to anon,authenticated
 using (bucket_id<>'dongsan-wiki-files') with check (bucket_id<>'dongsan-wiki-files');
drop policy if exists wiki_files_no_delete on storage.objects;
create policy wiki_files_no_delete on storage.objects as restrictive for delete to anon,authenticated
 using (bucket_id<>'dongsan-wiki-files');

create or replace function public.reserve_wiki_attachment(p_name text,p_size bigint)
returns public.wiki_attachments language plpgsql security definer set search_path='' as $$
declare result public.wiki_attachments%rowtype; ext text; mime text; new_id uuid:=gen_random_uuid();
begin
 if auth.uid() is null or public.current_wiki_role() is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 180 or p_name ~ '[[:cntrl:]/\\]' then raise exception '파일 이름을 확인해 주세요. (180자 이내)'; end if;
 if p_size is null or p_size not between 1 and 10485760 then raise exception '파일당 10MB 이하의 비어 있지 않은 파일만 첨부할 수 있습니다.'; end if;
 ext:=lower(substring(trim(p_name) from '\.([^.]+)$'));
 mime:=case ext when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' when 'gif' then 'image/gif' when 'pdf' then 'application/pdf' when 'txt' then 'text/plain' when 'csv' then 'text/csv' when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' when 'pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation' when 'zip' then 'application/zip' else null end;
 if mime is null then raise exception '지원하지 않는 파일 형식입니다. 사진·PDF·TXT·CSV·DOCX·XLSX·PPTX·ZIP을 선택해 주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if (select count(*) from public.wiki_attachments where owner_id=auth.uid() and created_at>now()-interval '1 day')>=50 then raise exception '하루에 파일 50개까지 업로드할 수 있습니다.'; end if;
 insert into public.wiki_attachments(id,owner_id,object_path,file_name,mime_type,size_bytes)
 values(new_id,auth.uid(),auth.uid()::text||'/'||new_id::text||'.'||ext,trim(p_name),mime,p_size) returning * into result;
 return result;
end;
$$;

create or replace function public.validate_wiki_attachments(p_ids uuid[],p_allowed uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare a public.wiki_attachments%rowtype; file_id uuid;
begin
 if p_ids is null or cardinality(p_ids)>8 then raise exception '첨부 파일은 문서당 최대 8개입니다.'; end if;
 if cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids) x) then raise exception '중복되거나 잘못된 첨부 파일입니다.'; end if;
 foreach file_id in array p_ids loop
  select * into a from public.wiki_attachments where id=file_id;
  if not found or not (a.owner_id=auth.uid() or coalesce(public.current_wiki_role(),'')='admin' or file_id=any(coalesce(p_allowed,'{}'::uuid[]))) then
   raise exception '사용할 수 없는 첨부 파일입니다.' using errcode='42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id='dongsan-wiki-files' and o.name=a.object_path
   and (o.metadata->>'size')::bigint=a.size_bytes and o.metadata->>'mimetype'=a.mime_type) then
   raise exception '파일 업로드가 완료되지 않았습니다. 다시 선택해 주세요.';
  end if;
 end loop;
end;
$$;
revoke all on function public.validate_wiki_attachments(uuid[],uuid[]) from public,anon,authenticated;

-- Legacy saves retain a snapshot of the current attachments too.
create or replace function public.snapshot_wiki_revision_attachments()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 select attachment_ids into new.attachment_ids from public.pages where id=new.page_id;
 return new;
end;
$$;
revoke all on function public.snapshot_wiki_revision_attachments() from public,anon,authenticated;
drop trigger if exists snapshot_wiki_revision_attachments on public.revisions;
create trigger snapshot_wiki_revision_attachments before insert on public.revisions
 for each row execute function public.snapshot_wiki_revision_attachments();

create or replace function public.save_page_with_attachments(
 p_id uuid,p_title text,p_category text,p_content text,p_source text,p_version integer,p_attachment_ids uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; allowed uuid[]:='{}';
begin
 if auth.uid() is null or coalesce(public.current_wiki_role(),'') not in ('editor','admin') then raise exception '편집 권한이 없습니다.' using errcode='42501'; end if;
 if p_id is not null then select attachment_ids into allowed from public.pages where id=p_id and deleted_at is null for update; if not found then raise exception '문서를 찾을 수 없습니다.'; end if; end if;
 perform public.validate_wiki_attachments(p_attachment_ids,allowed);
 saved:=public.save_page(p_id,p_title,p_category,p_content,p_source,p_version);
 update public.pages set attachment_ids=p_attachment_ids where id=saved;
 update public.revisions set attachment_ids=p_attachment_ids where page_id=saved and version=(select version from public.pages where id=saved);
 return saved;
end;
$$;

create or replace function public.submit_wiki_document_with_attachments(
 p_id uuid,p_title text,p_category text,p_content text,p_source text,
 p_target_page_id uuid,p_base_version integer,p_attachment_ids uuid[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; allowed uuid[]:='{}'; prior public.document_submissions%rowtype;
begin
 if auth.uid() is null or public.current_wiki_role() is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_id is not null then
  select * into prior from public.document_submissions where id=p_id and author_id=auth.uid() for update;
  if not found then raise exception '본인의 요청만 수정할 수 있습니다.' using errcode='42501'; end if;
  allowed:=prior.attachment_ids;
 end if;
 if p_target_page_id is not null then
  select coalesce(allowed,'{}')||attachment_ids into allowed from public.pages where id=p_target_page_id and deleted_at is null for share;
  if not found then raise exception '공개 문서를 찾을 수 없습니다.'; end if;
 end if;
 perform public.validate_wiki_attachments(p_attachment_ids,allowed);
 saved:=public.submit_wiki_document(p_id,p_title,p_category,p_content,p_source,p_target_page_id,p_base_version);
 update public.document_submissions set attachment_ids=p_attachment_ids where id=saved;
 return saved;
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
  page_id:=public.save_page_with_attachments(submission.target_page_id,submission.title,submission.category,
   submission.content,submission.source,submission.base_version,submission.attachment_ids);
 end if;
 update public.document_submissions set status=case when p_approve then 'approved' else 'rejected' end,
  review_note=coalesce(p_note,''),reviewer_id=auth.uid(),published_page_id=page_id,
  reviewed_at=now(),updated_at=now() where id=p_id;
 return page_id;
end;
$$;
revoke all on function public.reserve_wiki_attachment(text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_wiki_attachment(text,bigint) to authenticated;
revoke all on function public.save_page_with_attachments(uuid,text,text,text,text,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.save_page_with_attachments(uuid,text,text,text,text,integer,uuid[]) to authenticated;
revoke all on function public.submit_wiki_document_with_attachments(uuid,text,text,text,text,uuid,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.submit_wiki_document_with_attachments(uuid,text,text,text,text,uuid,integer,uuid[]) to authenticated;
commit;
