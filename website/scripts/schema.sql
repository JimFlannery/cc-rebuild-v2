-- ConditionCover MySQL Schema
-- Converted from AWS Amplify / DynamoDB definitions
-- Generated: 2026-03-17
--
-- Notes:
--   - All PKs are VARCHAR(36) UUID with DEFAULT (UUID())
--   - Address columns (WalletAddress, OrderAddress, etc.) use VARCHAR(44)
--     for Solana base58 public keys (schema doc listed these as INT in error)
--   - Financial amounts: DECIMAL(18,8)
--   - Rates / percentages: DECIMAL(10,6)
--   - Booleans: TINYINT(1)  (0 = false, 1 = true)

USE condition_cover;

-- ---------------------------------------------------------------------------
-- 1. Todo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Todo (
  id          VARCHAR(36)                          NOT NULL DEFAULT (UUID()),
  content     TEXT                                 NULL,
  done        TINYINT(1)                           NULL     DEFAULT 0,
  priority    ENUM('low', 'medium', 'high')        NULL,
  owner       VARCHAR(255)                         NULL,
  createdAt   DATETIME                             NOT NULL,
  updatedAt   DATETIME                             NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 2. Orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Orders (
  id                       VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  OrderType                VARCHAR(50)    NULL,
  Status                   VARCHAR(50)    NULL,
  StatusDate               VARCHAR(50)    NULL,
  OrderTaken               TINYINT(1)     NULL,
  OrderCancelled           TINYINT(1)     NULL,
  ContractExpiration       VARCHAR(50)    NULL,
  ContractOutcome          TINYINT(1)     NULL,
  ContractValue            DECIMAL(18,8)  NULL,
  MatchingOrderID          VARCHAR(36)    NULL,
  OffsettingID             VARCHAR(36)    NULL,
  OffsettingTaken          TINYINT(1)     NULL,
  MOStotalTaken            DECIMAL(18,8)  NULL,
  MOSenrollmentExpires     VARCHAR(50)    NULL,
  MOS                      TINYINT(1)     NULL,
  MOStype                  VARCHAR(50)    NULL,
  MicroMOSperiod           INT            NULL,
  OrderTiming              VARCHAR(20)    NULL,
  OrderDuration            INT            NULL,
  Expiration               VARCHAR(50)    NULL,
  FormattedExpiration      VARCHAR(100)   NULL,
  Denomination             VARCHAR(10)    NULL,
  Duration                 INT            NULL,
  OracleChecks             INT            NULL,
  IndexName                VARCHAR(100)   NULL,
  IndexLevel               DECIMAL(18,8)  NULL,
  IndexUnit                VARCHAR(50)    NULL,
  PayoutProbability        DECIMAL(10,6)  NULL,
  Coverage                 DECIMAL(18,8)  NULL,
  HedgePremium             DECIMAL(18,8)  NULL,
  HedgePremiumAdjustment   DECIMAL(18,8)  NULL,
  AdjustedHedgePremium     DECIMAL(18,8)  NULL,
  CoverRewardAPY           DECIMAL(10,6)  NULL,
  TokenReward              DECIMAL(18,8)  NULL,
  PointsReward             DECIMAL(18,8)  NULL,
  CoverPartyIncome         DECIMAL(18,8)  NULL,
  HedgePointsReward        DECIMAL(18,8)  NULL,
  ServiceFee               DECIMAL(18,8)  NULL,
  ServiceFeeAddress        VARCHAR(44)    NULL,
  TotalServiceFees         DECIMAL(18,8)  NULL,
  GasFeeLayer1             DECIMAL(18,8)  NULL,
  Layer1Address            VARCHAR(44)    NULL,
  GasFeeOracle             DECIMAL(18,8)  NULL,
  OracleAddress            VARCHAR(44)    NULL,
  DenominationAddress      VARCHAR(44)    NULL,
  WalletAddress            VARCHAR(44)    NULL,
  OrderAddress             VARCHAR(44)    NULL,
  IsLoopOrder              TINYINT(1)     NULL     DEFAULT 0,
  LoopSetID                VARCHAR(36)    NULL,
  LoopNumber               TINYINT        NULL     COMMENT '0=initial offsetting pair, 1=loop 1, 2=loop 2, etc.',
  LoopNumLoops             TINYINT        NULL     COMMENT 'Requested number of loops (set on the seed order)',
  LoopLoanAmount           DECIMAL(18,8)  NULL     COMMENT 'SSTM loaned from treasury to fund this loop',
  owner                    VARCHAR(255)   NULL,
  createdAt                DATETIME       NOT NULL,
  updatedAt                DATETIME       NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 3. Contracts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Contracts (
  id               VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  HedgeUserID      VARCHAR(255)  NULL,
  HedgeOrderID     VARCHAR(36)   NULL,
  HedgeAddress     VARCHAR(44)   NULL,
  CoverUserID      VARCHAR(255)  NULL,
  CoverOrderID     VARCHAR(36)   NULL,
  CoverAddress     VARCHAR(44)   NULL,
  Created          DATETIME      NULL,
  Expiration       DATETIME      NULL,
  ContractAddress  VARCHAR(44)   NULL,
  owner            VARCHAR(255)  NULL,
  createdAt        DATETIME      NOT NULL,
  updatedAt        DATETIME      NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 4. LoopSets
-- ---------------------------------------------------------------------------
-- One record per matched loop pair. Created when two users match on the
-- Looping page. All auto-generated Orders reference this via LoopSetID.
-- Rates are snapshotted from VariableSettings at creation time so a later
-- admin change does not retroactively affect active loop sets.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS LoopSets (
  id                   VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  User1ID              VARCHAR(255)   NULL     COMMENT 'Cover party on initial contracts',
  User2ID              VARCHAR(255)   NULL     COMMENT 'Hedge party on initial contracts (Cover on offsetting)',
  Status               ENUM('Pending','Active','Settled','Cancelled') NULL DEFAULT 'Pending',
  InitialCover         DECIMAL(18,8)  NULL     COMMENT 'Cover amount provided by each user (SSTM)',
  NumLoops             TINYINT        NULL,
  TotalCoverDeployed   DECIMAL(18,8)  NULL     COMMENT 'InitialCover × leverage factor across all loops',
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

-- ---------------------------------------------------------------------------
-- 5. IndexProbabilities
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS IndexProbabilities (
  id                  VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  Category            VARCHAR(100)   NULL,
  IndexName           VARCHAR(100)   NULL,
  IndexShortName      VARCHAR(20)    NULL,
  IndexUnit           VARCHAR(20)    NULL,
  IndexLevelDisplay   VARCHAR(50)    NULL,
  FrequencyCycle      VARCHAR(50)    NULL,
  IndexLevel          DECIMAL(18,8)  NULL,
  OddsYear            DECIMAL(10,6)  NULL,
  createdAt           DATETIME       NOT NULL,
  updatedAt           DATETIME       NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 5. Tiers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Tiers (
  id               VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  Tier             INT            UNIQUE   NULL,
  Name             VARCHAR(100)   NULL,
  TotalStart       INT            NULL,
  TotalLessThan    INT            NULL,
  APY              DECIMAL(10,6)  NULL,
  USDCserviceFee   DECIMAL(10,6)  NULL,
  SSTMserviceFee   DECIMAL(10,6)  NULL,
  createdAt        DATETIME       NOT NULL,
  updatedAt        DATETIME       NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 6. VariableSettings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS VariableSettings (
  id                VARCHAR(36)    NOT NULL DEFAULT (UUID()),
  PointsToUSD       DECIMAL(18,8)  NULL,
  GameSpeed         DECIMAL(10,4)  NULL,
  GameOn            TINYINT(1)     NULL     DEFAULT 0,
  SSTMpriceIncrease DECIMAL(10,6)  NULL,
  MOSfee            DECIMAL(10,6)  NULL,
  GEMpadding        DECIMAL(18,8)  NULL,
  MinimumMOScover   DECIMAL(18,8)  NULL,
  -- Yield Boost (standard contracts — treasury acts as hedge party)
  YieldBoostMinCoverage      DECIMAL(18,8)  NULL     DEFAULT 2000.00000000 COMMENT 'Min SSTM coverage (USD) to qualify for standard Yield Boost',
  YieldBoostMaxUncoveredRisk DECIMAL(18,8)  NULL     DEFAULT 1000000.00000000 COMMENT 'When treasury uncovered risk reaches this amount a $1M hedge order is created',
  YieldBoostMaxLoops         TINYINT        NULL     DEFAULT 2 COMMENT 'Max loops for standard Yield Boost (individual cover parties)',
  -- Yield Boost (looping — whale pairs)
  LoopRewardAPY     DECIMAL(10,6)  NULL     DEFAULT 0.170000,
  LoopHedgePremiumPct DECIMAL(10,6) NULL    DEFAULT 0.010000,
  LoopFeePct        DECIMAL(10,6)  NULL     DEFAULT 0.010000,
  LoopLoanAPR       DECIMAL(10,6)  NULL     DEFAULT 0.075000,
  LoopLTV           DECIMAL(10,6)  NULL     DEFAULT 0.670000,
  LoopMaxLoops      TINYINT        NULL     DEFAULT 10,
  LoopDefaultLoops  TINYINT        NULL     DEFAULT 2,
  createdAt         DATETIME       NOT NULL,
  updatedAt         DATETIME       NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 7. LogFile
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS LogFile (
  id             VARCHAR(36)     NOT NULL DEFAULT (UUID()),
  Page           VARCHAR(255)    NULL,
  Action         VARCHAR(255)    NULL,
  Detail         TEXT            NULL,
  VideoTimeStamp DECIMAL(10,3)   NULL,
  owner          VARCHAR(255)    NULL,
  createdAt      DATETIME        NOT NULL,
  updatedAt      DATETIME        NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 8. Survey
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Survey (
  id                     VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  SecureCoverage         TINYINT(1)    NULL,
  SecureCoverageAmount   INT           NULL,
  SupplyCoverage         TINYINT(1)    NULL,
  SupplyCoverageAmount   INT           NULL,
  FirstMarket            VARCHAR(255)  NULL,
  SecondMarket           VARCHAR(255)  NULL,
  ThirdMarket            VARCHAR(255)  NULL,
  TokenEvents            TINYINT(1)    NULL,
  Industry               VARCHAR(255)  NULL,
  owner                  VARCHAR(255)  NULL,
  createdAt              DATETIME      NOT NULL,
  updatedAt              DATETIME      NOT NULL,
  PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- 9. Feedback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS Feedback (
  id         VARCHAR(36)   NOT NULL DEFAULT (UUID()),
  Category   VARCHAR(100)  NULL,
  Feedback   TEXT          NULL,
  UX         INT           NULL,
  Features   INT           NULL,
  Videos     INT           NULL,
  iBubbles   INT           NULL,
  owner      VARCHAR(255)  NULL,
  createdAt  DATETIME      NOT NULL,
  updatedAt  DATETIME      NOT NULL,
  PRIMARY KEY (id)
);
