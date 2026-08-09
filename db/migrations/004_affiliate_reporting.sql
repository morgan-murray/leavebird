CREATE TABLE IF NOT EXISTS affiliate_events (
  event_key UUID PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click')),
  placement TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  merchant TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS affiliate_events_recorded_at_idx
  ON affiliate_events(recorded_at);
CREATE INDEX IF NOT EXISTS affiliate_events_placement_recorded_at_idx
  ON affiliate_events(placement, recorded_at);
CREATE INDEX IF NOT EXISTS affiliate_events_merchant_recorded_at_idx
  ON affiliate_events(merchant, recorded_at);

CREATE TABLE IF NOT EXISTS affiliate_conversions (
  conversion_key_hash TEXT PRIMARY KEY,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ NOT NULL,
  click_event_key UUID REFERENCES affiliate_events(event_key) ON DELETE SET NULL,
  placement TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  commission_minor INTEGER NOT NULL CHECK (commission_minor >= 0),
  currency CHAR(3) NOT NULL CHECK (currency = UPPER(currency))
);

CREATE INDEX IF NOT EXISTS affiliate_conversions_occurred_at_idx
  ON affiliate_conversions(occurred_at);
CREATE INDEX IF NOT EXISTS affiliate_conversions_placement_occurred_at_idx
  ON affiliate_conversions(placement, occurred_at);
CREATE INDEX IF NOT EXISTS affiliate_conversions_merchant_occurred_at_idx
  ON affiliate_conversions(merchant, occurred_at);

COMMENT ON TABLE affiliate_events IS
  'Anonymous recommendation impressions and outbound clicks. No user IDs, IP addresses, URLs or browser identifiers. Retained for 395 days.';
COMMENT ON COLUMN affiliate_events.event_key IS
  'Random event identifier used only to deduplicate retries; it is not tied to an account or device.';
COMMENT ON TABLE affiliate_conversions IS
  'Affiliate-network conversion outcomes and commission only. External booking references are one-way hashed; no customer, payment or booking details are stored. Retained for 395 days.';
