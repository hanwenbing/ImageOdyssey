create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null,
  source_gallery_file text not null
);

create table if not exists public.prompt_cases (
  id uuid primary key default gen_random_uuid(),
  case_number integer not null unique,
  title text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  prompt_text text not null,
  image_storage_path text not null,
  image_public_url text not null,
  summary text not null default '',
  tags text[] not null default '{}',
  source_gallery_file text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  source_image_storage_path text not null,
  result_image_storage_path text not null,
  prompt_case_id uuid not null references public.prompt_cases(id) on delete restrict,
  original_prompt_text text not null,
  rewritten_prompt_text text not null,
  recommendation_query text,
  created_at timestamptz not null default now()
);

create index if not exists prompt_cases_category_id_idx on public.prompt_cases(category_id);
create index if not exists prompt_cases_case_number_idx on public.prompt_cases(case_number);
create index if not exists experiments_prompt_case_id_idx on public.experiments(prompt_case_id);

insert into storage.buckets (id, name, public)
values
  ('gallery-images', 'gallery-images', true),
  ('experiment-images', 'experiment-images', true)
on conflict (id) do update set public = excluded.public;

alter table public.categories enable row level security;
alter table public.prompt_cases enable row level security;
alter table public.experiments enable row level security;

drop policy if exists "local read categories" on public.categories;
create policy "local read categories"
on public.categories
for select
to anon, authenticated
using (true);

drop policy if exists "local read prompt cases" on public.prompt_cases;
create policy "local read prompt cases"
on public.prompt_cases
for select
to anon, authenticated
using (true);

drop policy if exists "local read experiments" on public.experiments;
create policy "local read experiments"
on public.experiments
for select
to anon, authenticated
using (true);

drop policy if exists "local insert experiments" on public.experiments;
create policy "local insert experiments"
on public.experiments
for insert
to anon, authenticated
with check (true);

drop policy if exists "local read gallery images" on storage.objects;
create policy "local read gallery images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'gallery-images');

drop policy if exists "local read experiment images" on storage.objects;
create policy "local read experiment images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'experiment-images');

drop policy if exists "local upload experiment images" on storage.objects;
create policy "local upload experiment images"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'experiment-images');
