-- Up Migration
-- Phase 3 design correction from the review doc's original framing: a single OAuth token
-- grants access to exactly one Swiggy account. There is no tool that reads a DIFFERENT
-- person's order history, so "watches their ordering activity going quiet" as originally
-- imagined isn't buildable against this API. "Quiet" here means OUR OWN last-contact
-- record instead -- updated by an explicit check-in (a call, a message, an order placed
-- for them), not observed Swiggy data. See DECISIONS.md for the full reasoning.
CREATE TABLE watched_people (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address_id TEXT NOT NULL,           -- Food-domain address id to deliver to
  quiet_threshold_hours NUMERIC NOT NULL DEFAULT 48,
  last_contact_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE watched_people;
