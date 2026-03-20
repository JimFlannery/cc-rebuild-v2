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
-- 4. IndexProbabilities
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
