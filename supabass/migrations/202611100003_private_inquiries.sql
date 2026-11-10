-- 관리자 문의 기능. 기존 문서와 회원 데이터는 유지합니다.
begin;
create table if not exists public.wiki_inquiries (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id),
 author_name text not null,
 title text not null check (char_length(trim(title)) between 1 and 120),
 body text not null check (char_length(trim(body)) between 1 and 4000),
 status text not null default 'open' check (status in ('open','answered')),
 reply text not null default '' check (char_length(reply)<=4000),
 replied_by uuid references public.profiles(id),
 replied_at timestamptz,
 version integer not null default 1 check (version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((status='open' and reply='' and replied_by is null and replied_at is null)
  or (status='answered' and char_length(trim(reply))>0 and replied_by is not null and replied_at is not null))
);
create index if not exists wiki_inquiries_author_idx on public.wiki_inquiries(author_id,created_at desc);
create index if not exists wiki_inquiries_status_idx on public.wiki_inquiries(status,created_at);
alter table public.wiki_inquiries enable row level security;
revoke all on public.wiki_inquiries from public,anon,authenticated;
grant select on public.wiki_inquiries to authenticated;
drop policy if exists private_wiki_inquiries on public.wiki_inquiries;
create policy private_wiki_inquiries on public.wiki_inquiries for select to authenticated
 using (author_id=(select auth.uid()) or (select public.current_wiki_role())='admin');

create or replace function public.create_wiki_inquiry(p_title text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved uuid; author text;
begin
 if auth.uid() is null or public.current_wiki_role() is null then raise exception '로그인 후 문의해 주세요.' using errcode='42501'; end if;
 if p_title is null or char_length(trim(p_title)) not between 1 and 120 then raise exception '제목은 1~120자로 입력해 주세요.'; end if;
 if p_body is null or char_length(trim(p_body)) not between 1 and 4000 then raise exception '문의 내용은 1~4000자로 입력해 주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('wiki-inquiry:'||auth.uid()::text,0));
 if (select count(*) from public.wiki_inquiries where author_id=auth.uid() and created_at>now()-interval '1 day')>=10 then raise exception '문의는 24시간에 10건까지 보낼 수 있습니다.'; end if;
 select nickname into author from public.profiles where id=auth.uid();
 insert into public.wiki_inquiries(author_id,author_name,title,body)
  values(auth.uid(),author,trim(p_title),trim(p_body)) returning id into saved;
 return saved;
end;
$$;
create or replace function public.reply_wiki_inquiry(p_id uuid,p_reply text,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare inquiry public.wiki_inquiries%rowtype;
begin
 if auth.uid() is null or coalesce(public.current_wiki_role(),'')<>'admin' then raise exception '관리자만 문의에 답변할 수 있습니다.' using errcode='42501'; end if;
 if p_reply is null or char_length(trim(p_reply)) not between 1 and 4000 then raise exception '답변은 1~4000자로 입력해 주세요.'; end if;
 select * into inquiry from public.wiki_inquiries where id=p_id for update;
 if not found then raise exception '문의를 찾을 수 없습니다.'; end if;
 if inquiry.version is distinct from p_version then raise exception '다른 관리자가 답변을 변경했습니다. 내용을 복사해 두고 새로고침해 주세요.' using errcode='40001'; end if;
 update public.wiki_inquiries set reply=trim(p_reply),status='answered',replied_by=auth.uid(),
  replied_at=now(),updated_at=now(),version=version+1 where id=p_id;
 return p_id;
end;
$$;
revoke all on function public.create_wiki_inquiry(text,text) from public,anon,authenticated;
revoke all on function public.reply_wiki_inquiry(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.create_wiki_inquiry(text,text) to authenticated;
grant execute on function public.reply_wiki_inquiry(uuid,text,integer) to authenticated;
commit;
