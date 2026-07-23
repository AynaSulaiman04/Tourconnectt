alter table if exists admin_workspace_settings
  add column if not exists landing_slideshow_images jsonb not null default '[]'::jsonb;

update admin_workspace_settings
set landing_slideshow_images = coalesce(landing_slideshow_images, '[]'::jsonb)
where landing_slideshow_images is null;
