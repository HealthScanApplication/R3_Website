-- The Higgsfield and Guardian-images Edge Functions run as service_role, but this project does not grant service_role
-- on new public tables by default (the public default privileges only cover `admin`), so every read and write they made
-- on their own tables failed. Symptoms: "Higgsfield login didn't finish" (the OAuth client was re-registered on every
-- call because it could not be read back, so the callback exchanged the code with a different client than the login
-- used), connections that would not save, image jobs that were never logged.
-- Grant exactly the tables these two functions use.
grant select, insert, update, delete on public.higgsfield_oauth_clients to service_role;
grant select, insert, update, delete on public.guardian_higgsfield_connections to service_role;
grant select, insert, update, delete on public.guardian_video_jobs to service_role;
grant select, insert, update, delete on public.guardian_openai_connections to service_role;
grant select, insert, update, delete on public.guardian_image_jobs to service_role;
