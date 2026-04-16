-- Migration 004: Add SSTMPriceAtCreation to Orders and community order fields
--
-- SSTMPriceAtCreation locks in the SSTM price at order placement time.
-- Tier calculations use this price, not the current market price, so that
-- tier thresholds are stable for the life of the order/contract.
--
-- Community order fields track pool-based Yield Boost orders that accept
-- contributions from multiple participants up to a coverage cap.

ALTER TABLE Orders
  ADD COLUMN SSTMPriceAtCreation  DECIMAL(18,8) NULL
    COMMENT 'SSTM price in USD at the time the order was created; used for tier calculations',
  ADD COLUMN IsCommunityOrder     TINYINT(1)    NULL DEFAULT 0
    COMMENT '1 = community pool Yield Boost order',
  ADD COLUMN CoverageSought       DECIMAL(18,8) NULL
    COMMENT 'Total coverage the community order is seeking (USD)',
  ADD COLUMN CoverageFilled       DECIMAL(18,8) NULL DEFAULT 0
    COMMENT 'Coverage filled so far by participants (USD)';
