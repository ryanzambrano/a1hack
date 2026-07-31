-- Workspace-level Pixero OAuth connection (single row, id = 'default').
-- Stores the tokens obtained via "Connect Pixero" so every SweetLeads user
-- gets Pixero access natively; the server refreshes them automatically.
create table if not exists public.pixero_connections (
  id text primary key,
  access_token text not null,
  refresh_token text,
  token_type text not null default 'Bearer',
  scope text,
  expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pixero_connections enable row level security;
-- No policies: only the service-role key (server) may touch tokens.
