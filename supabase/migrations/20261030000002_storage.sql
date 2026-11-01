-- Private bucket for rendered presentation videos.
-- Objects are stored as <user_id>/<export_id>.mp4 and are only readable by their owner
-- (the app hands out short-lived signed URLs). The render worker uploads with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 524288000, array['video/mp4'])
on conflict (id) do nothing;

drop policy if exists "exports_objects_select_own" on storage.objects;
create policy "exports_objects_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "exports_objects_delete_own" on storage.objects;
create policy "exports_objects_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = (select auth.uid())::text);
