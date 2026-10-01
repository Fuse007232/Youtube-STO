-- ─────────────────────────────────────────────────────────────
-- 0003: Zeitplaner (Phase 4)
-- Supabase ruft alle 15 Minuten den Schnappschuss-Endpunkt der App auf.
-- Das Geheimwort liegt NICHT hier, sondern im Supabase-Tresor (Vault)
-- unter dem Namen 'cron_secret' (vom Nutzer per Klick angelegt).
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Falls es den Job schon gibt (erneutes Ausführen), vorher entfernen
select cron.unschedule(jobid) from cron.job where jobname = 'dashboard-snapshot';

select cron.schedule(
  'dashboard-snapshot',
  '*/15 * * * *',
  $job$
  select net.http_get(
    url := 'https://youtube-sto.vercel.app/api/cron/snapshot',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'), ''),
      'x-snapshot-trigger', 'cron'
    ),
    timeout_milliseconds := 55000
  );
  $job$
);
