CREATE TABLE IF NOT EXISTS request_metrics (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  route_group TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL CHECK (duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS request_metrics_recorded_at_idx ON request_metrics(recorded_at);
CREATE INDEX IF NOT EXISTS request_metrics_route_group_recorded_at_idx ON request_metrics(route_group, recorded_at);

CREATE TABLE IF NOT EXISTS user_activity_daily (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  activity_kind TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 1 CHECK (event_count > 0),
  PRIMARY KEY (user_id, activity_date, activity_kind)
);

CREATE INDEX IF NOT EXISTS user_activity_daily_date_idx ON user_activity_daily(activity_date);

CREATE TABLE IF NOT EXISTS operational_events (
  id BIGSERIAL PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS operational_events_type_recorded_at_idx ON operational_events(event_type, recorded_at);

COMMENT ON TABLE request_metrics IS
  'Privacy-preserving route-group timings. No URLs, query values, user IDs or request bodies. Retained for 90 days.';
COMMENT ON TABLE user_activity_daily IS
  'Daily authenticated activity used only for aggregate active-user counts. Retained for 90 days.';
COMMENT ON TABLE operational_events IS
  'Aggregate operational outcomes such as authentication, admin access and upstream availability. Retained for 90 days.';
