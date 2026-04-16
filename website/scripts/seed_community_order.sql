-- Seed the first Community Yield Boost order.
-- Run after migration 004.
--
-- Coverage sought: $2,000,000 in SSTM
-- Order duration: 30 days
-- Contract duration: 180 days
-- Closes when CoverageFilled >= CoverageSought OR Expiration passes.

INSERT INTO Orders (
  OrderType, Status, StatusDate,
  OrderTiming, OrderDuration, Expiration,
  Denomination, Duration, OracleChecks,
  IndexName, IndexLevel, IndexUnit, PayoutProbability,
  Coverage, CoverageSought, CoverageFilled,
  SSTMPriceAtCreation,
  IsLoopOrder, IsCommunityOrder,
  LoopNumLoops,
  MOS, MOStype,
  createdAt, updatedAt
) VALUES (
  'Cover', 'Open', NOW(),
  'Committed', 720, DATE_ADD(NOW(), INTERVAL 30 DAY),
  'SSTM', 180, 1,
  'Disturbance Storm Time', -850, 'nT', 0.012000,
  0, 2000000.00000000, 0,
  9.02400000,
  1, 1,
  2,
  0, NULL,
  NOW(), NOW()
);
