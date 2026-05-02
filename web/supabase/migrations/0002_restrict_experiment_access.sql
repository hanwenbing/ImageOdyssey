drop policy if exists "local read experiments" on public.experiments;
drop policy if exists "local insert experiments" on public.experiments;
drop policy if exists "local read experiment images" on storage.objects;
drop policy if exists "local upload experiment images" on storage.objects;

update storage.buckets
set public = false
where id = 'experiment-images';
