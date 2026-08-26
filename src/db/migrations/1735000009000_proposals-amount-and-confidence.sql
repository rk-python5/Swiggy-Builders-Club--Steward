-- Up Migration
-- Phase 2: the action gate needs to enforce the sandbox's real ₹1000 cap itself (per
-- PLAN.md's exit criterion -- not left to each daemon to self-police), and Kitchen
-- Entropy's proposals carry a confidence score worth logging from day one per
-- DECISIONS.md's "instrument now, train later" ML stance.
ALTER TABLE proposals ADD COLUMN amount_paise INTEGER;
ALTER TABLE proposals ADD COLUMN confidence REAL;

-- Down Migration
ALTER TABLE proposals DROP COLUMN amount_paise;
ALTER TABLE proposals DROP COLUMN confidence;
