-- Per-minute scheduler tick that works on any Vercel plan (Hobby cannot run per-minute Vercel Cron).
-- Run once in the Supabase SQL editor. Replace the two placeholders first.
-- If you move to Vercel Pro you can instead add "crons": [{"path": "/api/cron/process", "schedule": "* * * * *"}]
-- to vercel.json and drop this job: select cron.unschedule('raksha-tick');
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('raksha-tick', '* * * * *', $$
  select net.http_get(
    url := 'https://YOUR-DOMAIN/api/cron/process',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 20000
  )
$$);
