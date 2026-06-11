-- Optional: RLS für Geräte/Dokumente vereinfachen (Team-MVP)
-- Nur ausführen wenn Löschen/Update clientseitig blockiert wird.

drop policy if exists "devices_all_authenticated" on devices;
create policy "devices_all_authenticated"
on devices for all to authenticated
using (true)
with check (true);

drop policy if exists "docs_all_authenticated" on docs;
create policy "docs_all_authenticated"
on docs for all to authenticated
using (true)
with check (true);
