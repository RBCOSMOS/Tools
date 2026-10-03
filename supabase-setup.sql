-- Run once in the Supabase SQL Editor. Uses only a browser-safe publishable key.
-- Dedicated tables/functions for Pocket Workspace; does not modify other app tables.
begin;
create table if not exists public.pocket_html (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description)<=500),
  author text not null check (char_length(author) between 1 and 60),
  filename text not null check (char_length(filename) between 1 and 160),
  html text not null check (octet_length(html)<=2097152),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pocket_html_updated_idx on public.pocket_html(updated_at desc,id);
create index if not exists pocket_html_owner_idx on public.pocket_html(owner_id);
alter table public.pocket_html enable row level security;
revoke all on public.pocket_html from anon, authenticated;
grant select on public.pocket_html to anon, authenticated;
grant delete on public.pocket_html to authenticated;
drop policy if exists "pocket_public_read" on public.pocket_html;
create policy "pocket_public_read" on public.pocket_html for select to anon,authenticated using (true);
drop policy if exists "pocket_owner_delete" on public.pocket_html;
create policy "pocket_owner_delete" on public.pocket_html for delete to authenticated using ((select auth.uid())=owner_id);
-- All writes pass through this function. No direct INSERT/UPDATE privilege is granted.
create or replace function public.pocket_publish(
  p_title text, p_description text, p_author text, p_filename text, p_html text,
  p_id uuid default null, p_expected_revision integer default null
) returns public.pocket_html
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  existing public.pocket_html;
  saved public.pocket_html;
begin
  if caller is null then raise exception 'Sign in to publish.' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=caller and email_confirmed_at is not null and coalesce(is_anonymous,false)=false) then
    raise exception 'Confirm your email before publishing.' using errcode='42501';
  end if;
  -- Serializes concurrent publishes by the same owner so count/rate checks cannot race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,0));
  if p_title is null or char_length(trim(p_title)) not between 1 and 100 or p_author is null or char_length(trim(p_author)) not between 1 and 60 or p_filename is null or char_length(p_filename) not between 1 and 160 or p_description is null or char_length(p_description)>500 or p_html is null or octet_length(p_html)>2097152 then
    raise exception 'Invalid fields. HTML must be at most 2 MB.';
  end if;
  if exists(select 1 from public.pocket_html where owner_id=caller and updated_at>now()-interval '10 seconds') then
    raise exception 'Wait 10 seconds between publishes.';
  end if;
  if p_id is null then
    if (select count(*) from public.pocket_html where owner_id=caller)>=20 then
      raise exception 'Your account has reached 20 public HTMLs. Delete an old upload first.';
    end if;
    insert into public.pocket_html(owner_id,title,description,author,filename,html)
      values(caller,trim(p_title),p_description,trim(p_author),p_filename,p_html) returning * into saved;
  else
    select * into existing from public.pocket_html where id=p_id for update;
    if not found or existing.owner_id<>caller then raise exception 'Only the uploader can update this HTML.' using errcode='42501'; end if;
    if p_expected_revision is null or existing.revision<>p_expected_revision then
      raise exception 'A newer version was published. Reopen it from the gallery before updating.';
    end if;
    update public.pocket_html set title=trim(p_title),description=p_description,author=trim(p_author),filename=p_filename,html=p_html,revision=revision+1,updated_at=now() where id=p_id returning * into saved;
  end if;
  return saved;
end $$;
revoke all on function public.pocket_publish(text,text,text,text,text,uuid,integer) from public,anon;
grant execute on function public.pocket_publish(text,text,text,text,text,uuid,integer) to authenticated;
commit;
