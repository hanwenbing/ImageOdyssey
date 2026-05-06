create table if not exists public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  workflow text not null,
  stage text not null,
  status text not null,
  message text null,
  request_payload jsonb null,
  response_payload jsonb null,
  error_payload jsonb null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  constraint workflow_events_workflow_check check (btrim(workflow) <> ''),
  constraint workflow_events_stage_check check (btrim(stage) <> ''),
  constraint workflow_events_status_check check (status in ('started','succeeded','failed','blocked'))
);

create index if not exists workflow_events_created_at_idx on public.workflow_events(created_at desc);
create index if not exists workflow_events_request_id_idx on public.workflow_events(request_id);
create index if not exists workflow_events_workflow_created_at_idx on public.workflow_events(workflow, created_at desc);
create index if not exists workflow_events_status_created_at_idx on public.workflow_events(status, created_at desc);

alter table public.workflow_events enable row level security;
revoke all on table public.workflow_events from anon;
revoke all on table public.workflow_events from authenticated;
