-- 새 Supabase 프로젝트에서 한 번 실행합니다. 기존 프로젝트는 먼저 백업하세요.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check (char_length(nickname) between 2 and 30),
 role text not null default 'reader' check (role in ('reader','editor','admin')),
 created_at timestamptz not null default now()
);
create table public.pages (
 id uuid primary key default gen_random_uuid(),
 title text not null unique check (char_length(title) between 1 and 120),
 category text not null check (category in ('학교소개','학교생활','동아리','학생회','FAQ')),
 content text not null check (char_length(content) between 1 and 50000),
 source text not null check (char_length(trim(source)) between 1 and 2000),
 version integer not null default 1 check (version>0),
 updated_at timestamptz not null default now()
);
create table public.revisions (
 id bigint generated always as identity primary key,
 page_id uuid not null references public.pages(id) on delete cascade,
 title text not null, category text not null, content text not null, source text not null,
 version integer not null,
 editor_id uuid references auth.users(id) on delete set null,
 editor_name text not null,
 created_at timestamptz not null default now(),
 unique(page_id,version)
);
create index revisions_page_idx on public.revisions(page_id,version desc);
create function public.current_wiki_role() returns text
language sql stable security definer set search_path = '' as $$
 select role from public.profiles where id=(select auth.uid());
$$;
create function public.create_wiki_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,nickname) values (
  new.id, case when char_length(trim(coalesce(new.raw_user_meta_data->>'nickname',''))) between 2 and 30
    then trim(new.raw_user_meta_data->>'nickname') else '동산인' end
 );
 return new;
end;
$$;
create trigger on_wiki_user_created after insert on auth.users
 for each row execute function public.create_wiki_profile();
-- 기존 Auth 회원도 읽기 계정으로만 초기화합니다. metadata의 role은 신뢰하지 않습니다.
insert into public.profiles(id,nickname) select id,'동산인' from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.pages enable row level security;
alter table public.revisions enable row level security;
revoke all on public.profiles,public.pages,public.revisions from anon,authenticated;
grant select on public.pages,public.revisions to anon,authenticated;
grant select on public.profiles to authenticated;
grant update(role) on public.profiles to authenticated;
create policy own_or_admin_profile on public.profiles for select to authenticated
 using (id=(select auth.uid()) or (select public.current_wiki_role())='admin');
-- 관리자 계정 생성/해제는 SQL Editor에서만 합니다. 웹에서는 일반 회원/편집자만 변경.
create policy admin_assign_editor on public.profiles for update to authenticated
 using ((select public.current_wiki_role())='admin' and role<>'admin' and id<>(select auth.uid()))
 with check (role in ('reader','editor') and id<>(select auth.uid()));
create policy public_read_pages on public.pages for select to anon,authenticated using (true);
create policy public_read_revisions on public.revisions for select to anon,authenticated using (true);

-- 문서와 이력은 하나의 트랜잭션으로 저장. 직접 INSERT/UPDATE 권한은 주지 않습니다.
create function public.save_page(
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
  select version into old_version from public.pages where id=p_id for update;
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
revoke all on function public.current_wiki_role() from public;
grant execute on function public.current_wiki_role() to authenticated;
revoke all on function public.create_wiki_profile() from public;
revoke all on function public.save_page(uuid,text,text,text,text,integer) from public;
grant execute on function public.save_page(uuid,text,text,text,text,integer) to authenticated;
commit;
