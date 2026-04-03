-- Migration 001: Add looping yield amplification variables to VariableSettings
-- Feature: One-Click Delta Neutral Looping
-- These values drive smart contract generation for the looping feature and can
-- be adjusted without redeploying contracts.

ALTER TABLE VariableSettings
  ADD COLUMN LoopRewardAPY       DECIMAL(10,6) NULL DEFAULT 0.170000 COMMENT 'Cover party reward APY for loop contracts',
  ADD COLUMN LoopHedgePremiumPct DECIMAL(10,6) NULL DEFAULT 0.010000 COMMENT 'Hedge premium percent; cancels out between delta-neutral users',
  ADD COLUMN LoopFeePct          DECIMAL(10,6) NULL DEFAULT 0.010000 COMMENT 'Platform fee percent; paid upfront in USDC',
  ADD COLUMN LoopLoanAPR         DECIMAL(10,6) NULL DEFAULT 0.075000 COMMENT 'Annual interest rate on SSTM treasury loans',
  ADD COLUMN LoopLTV             DECIMAL(10,6) NULL DEFAULT 0.670000 COMMENT 'Loan-to-value ratio for each loop',
  ADD COLUMN LoopMaxLoops        TINYINT       NULL DEFAULT 10       COMMENT 'Maximum number of loan loops allowed',
  ADD COLUMN LoopDefaultLoops    TINYINT       NULL DEFAULT 2        COMMENT 'Default number of loops shown to user in UI';
