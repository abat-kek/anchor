create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Alle 15 Minuten Auto-Lock-Function anstoßen.
select cron.schedule(
  'anchor-auto-lock',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.functions_url') || '/auto-lock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  );
  $$
);
