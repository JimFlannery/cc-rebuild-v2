-- Migration 002: Add LoopSets table and loop columns to Orders
-- Feature: One-Click Delta Neutral Looping

-- New columns on Orders to link auto-generated loop orders back to their set
ALTER TABLE Orders
  ADD COLUMN IsLoopOrder    TINYINT(1)    NULL DEFAULT 0            AFTER owner,
  ADD COLUMN LoopSetID      VARCHAR(36)   NULL                      AFTER IsLoopOrder,
  ADD COLUMN LoopNumber     TINYINT       NULL                      AFTER LoopSetID,
  ADD COLUMN LoopNumLoops   TINYINT       NULL                      AFTER LoopNumber,
  ADD COLUMN LoopLoanAmount DECIMAL(18,8) NULL                      AFTER LoopNumLoops;

-- LoopSets: one record per matched whale pair, tracking all loop metadata
CREATE TABLE IF NOT EXISTS LoopSets (
  id                   VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  User1ID              VARCHAR(255)   NULL     COMMENT 'Cover party on initial contracts',
  User2ID              VARCHAR(255)   NULL     COMMENT 'Hedge party on initial contracts (Cover on offsetting)',
  Status               ENUM('Pending','Active','Settled','Cancelled') NULL DEFAULT 'Pending',
  InitialCover         DECIMAL(18,8)  NULL     COMMENT 'Cover amount provided by each user (SSTM)',
  NumLoops             TINYINT        NULL,
  TotalCoverDeployed   DECIMAL(18,8)  NULL     COMMENT 'InitialCover x leverage factor across all loops',
  TotalLoansIssued     DECIMAL(18,8)  NULL     COMMENT 'Sum of all SSTM loans from treasury',
  TotalInterestOwed    DECIMAL(18,8)  NULL     COMMENT 'Total interest owed at maturity (from rewards pool)',
  TotalFeesCollected   DECIMAL(18,8)  NULL     COMMENT 'Total USDC fees collected upfront',
  RewardAPY            DECIMAL(10,6)  NULL     COMMENT 'Snapshotted from VariableSettings.LoopRewardAPY',
  HedgePremiumPct      DECIMAL(10,6)  NULL     COMMENT 'Snapshotted from VariableSettings.LoopHedgePremiumPct',
  FeePct               DECIMAL(10,6)  NULL     COMMENT 'Snapshotted from VariableSettings.LoopFeePct',
  LoanAPR              DECIMAL(10,6)  NULL     COMMENT 'Snapshotted from VariableSettings.LoopLoanAPR',
  LTV                  DECIMAL(10,6)  NULL     COMMENT 'Snapshotted from VariableSettings.LoopLTV',
  SettledAt            DATETIME       NULL,
  owner                VARCHAR(255)   NULL,
  createdAt            DATETIME       NOT NULL,
  updatedAt            DATETIME       NOT NULL,
  PRIMARY KEY (id)
);
