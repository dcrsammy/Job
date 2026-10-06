-- Initial job sources. Employer boards (Greenhouse, Lever, Ashby) are the
-- employers' own public job-board APIs, so listings link to the official
-- application page. Aggregators are credited and linked back per their terms.
-- Admins can add/disable sources from /admin.

insert into public.job_sources (kind, name, slug, config, is_official, attribution, terms_url, min_interval_minutes, enabled) values
  ('greenhouse', 'GitLab', 'gh-gitlab', '{"board":"gitlab"}', true, null, null, 360, true),
  ('greenhouse', 'Stripe', 'gh-stripe', '{"board":"stripe"}', true, null, null, 360, true),
  ('greenhouse', 'Figma', 'gh-figma', '{"board":"figma"}', true, null, null, 360, true),
  ('greenhouse', 'Discord', 'gh-discord', '{"board":"discord"}', true, null, null, 360, true),
  ('greenhouse', 'Cloudflare', 'gh-cloudflare', '{"board":"cloudflare"}', true, null, null, 360, true),
  ('greenhouse', 'Vercel', 'gh-vercel', '{"board":"vercel"}', true, null, null, 360, true),
  ('greenhouse', 'Airbnb', 'gh-airbnb', '{"board":"airbnb"}', true, null, null, 360, true),
  ('greenhouse', 'Databricks', 'gh-databricks', '{"board":"databricks"}', true, null, null, 360, true),
  ('greenhouse', 'Datadog', 'gh-datadog', '{"board":"datadog"}', true, null, null, 360, true),
  ('greenhouse', 'Coinbase', 'gh-coinbase', '{"board":"coinbase"}', true, null, null, 360, true),
  ('greenhouse', 'Anthropic', 'gh-anthropic', '{"board":"anthropic"}', true, null, null, 360, true),
  ('greenhouse', 'Twilio', 'gh-twilio', '{"board":"twilio"}', true, null, null, 360, true),
  ('greenhouse', 'Elastic', 'gh-elastic', '{"board":"elastic"}', true, null, null, 360, true),
  ('greenhouse', 'MongoDB', 'gh-mongodb', '{"board":"mongodb"}', true, null, null, 360, true),
  ('greenhouse', 'Grafana Labs', 'gh-grafanalabs', '{"board":"grafanalabs"}', true, null, null, 360, true),
  ('greenhouse', 'Automattic', 'gh-automattic', '{"board":"automatticcareers"}', true, null, null, 360, true),
  ('greenhouse', 'Canonical', 'gh-canonical', '{"board":"canonical"}', true, null, null, 360, true),
  ('greenhouse', 'Duolingo', 'gh-duolingo', '{"board":"duolingo"}', true, null, null, 360, true),
  ('greenhouse', 'Webflow', 'gh-webflow', '{"board":"webflow"}', true, null, null, 360, true),
  ('lever', 'Palantir', 'lv-palantir', '{"company":"palantir"}', true, null, null, 360, true),
  ('lever', 'Spotify', 'lv-spotify', '{"company":"spotify"}', true, null, null, 360, true),
  ('lever', 'Binance', 'lv-binance', '{"company":"binance"}', true, null, null, 360, true),
  ('lever', 'Outreach', 'lv-outreach', '{"company":"outreach"}', true, null, null, 360, true),
  ('ashby', 'Linear', 'ab-linear', '{"board":"linear"}', true, null, null, 360, true),
  ('ashby', 'Notion', 'ab-notion', '{"board":"notion"}', true, null, null, 360, true),
  ('ashby', 'Ramp', 'ab-ramp', '{"board":"ramp"}', true, null, null, 360, true),
  ('ashby', 'PostHog', 'ab-posthog', '{"board":"posthog"}', true, null, null, 360, true),
  ('ashby', 'Supabase', 'ab-supabase', '{"board":"supabase"}', true, null, null, 360, true),
  ('ashby', 'OpenAI', 'ab-openai', '{"board":"openai"}', true, null, null, 360, true),
  ('ashby', 'Cursor', 'ab-cursor', '{"board":"cursor"}', true, null, null, 360, true),
  ('ashby', 'Zapier', 'ab-zapier', '{"board":"zapier"}', true, null, null, 360, true),
  ('remoteok', 'Remote OK', 'agg-remoteok', '{}', false,
    'Listing from Remote OK', 'https://remoteok.com/api', 720, true),
  ('arbeitnow', 'Arbeitnow', 'agg-arbeitnow', '{"maxPages":3}', false,
    'Listing from Arbeitnow', 'https://www.arbeitnow.com/api/job-board-api', 720, true),
  -- Remotive's terms forbid showing their jobs behind a sign-up wall. Keep
  -- disabled unless you have a commercial agreement with Remotive.
  ('remotive', 'Remotive', 'agg-remotive', '{}', false,
    'Listing from Remotive', 'https://remotive.com/api-documentation', 720, false)
on conflict (slug) do nothing;
