-- =============================================================================
-- Private storage for resumes and generated documents.
-- Object paths are "<user_id>/<file>", so the first folder must match the user.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resumes', 'resumes', false, 5242880, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('documents', 'documents', false, 5242880, null)
on conflict (id) do nothing;

create policy "own resume files: read" on storage.objects for select to authenticated
  using (bucket_id in ('resumes', 'documents') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own resume files: upload" on storage.objects for insert to authenticated
  with check (bucket_id in ('resumes', 'documents') and (storage.foldername(name))[1] = auth.uid()::text);

create policy "own resume files: delete" on storage.objects for delete to authenticated
  using (bucket_id in ('resumes', 'documents') and (storage.foldername(name))[1] = auth.uid()::text);
