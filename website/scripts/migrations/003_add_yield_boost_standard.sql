-- Migration 003: Add standard Yield Boost settings to VariableSettings
-- Standard Yield Boost: individual cover parties on normal hedge orders.
-- Treasury acts as the hedge party to create the matched contract pair.
-- Max 2 loops. Eligible orders must be SSTM denomination and >= YieldBoostMinCoverage.

ALTER TABLE VariableSettings
  ADD COLUMN YieldBoostMinCoverage      DECIMAL(18,8) NULL DEFAULT 2000.00000000
    COMMENT 'Min SSTM coverage (USD) to qualify for standard Yield Boost',
  ADD COLUMN YieldBoostMaxUncoveredRisk DECIMAL(18,8) NULL DEFAULT 1000000.00000000
    COMMENT 'When treasury uncovered risk reaches this amount a $1M hedge order is created',
  ADD COLUMN YieldBoostMaxLoops         TINYINT       NULL DEFAULT 2
    COMMENT 'Max loops for standard Yield Boost (individual cover parties)';

-- TODO: When treasury uncovered risk reaches YieldBoostMaxUncoveredRisk ($1M in SSTM),
-- the platform should automatically create a hedge order for $1M in coverage to offset
-- the accumulated risk. This requires:
--   1. An oracle/cron job that monitors SUM of treasury cover positions
--   2. A trigger or scheduled task to call createOrder({ type: Hedge, coverage: $1M })
--      on-chain using the treasury admin keypair
--   3. Matching that hedge order against marketplace cover parties
