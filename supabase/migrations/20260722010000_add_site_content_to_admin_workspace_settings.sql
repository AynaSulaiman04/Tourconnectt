alter table if exists public.admin_workspace_settings
  add column if not exists site_content jsonb not null default '{}'::jsonb;

update public.admin_workspace_settings
set site_content = coalesce(site_content, '{}'::jsonb)
where site_content is null;
