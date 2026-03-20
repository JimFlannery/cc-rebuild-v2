USE condition_cover;

INSERT INTO Todo (content, done, priority, owner, createdAt, updatedAt) VALUES
  ('Solana Configuration and Local Testnet', 1, 'high', 'jim-f', NOW(), NOW()),
  ('Database Connectivity',                  1, 'high', 'jim-f', NOW(), NOW()),
  ('Chainlink Oracle',                       0, 'high', 'jim-f', NOW(), NOW()),
  ('Smart Contracts',                        0, 'high', 'jim-f', NOW(), NOW()),
  ('Wallet Integration (Phantom, Solflare, MetaMask)', 0, 'high', 'jim-f', NOW(), NOW()),
  ('Authentication',                         0, 'high', 'jim-f', NOW(), NOW()),
  ('Website Homepage',                       0, 'high', 'jim-f', NOW(), NOW()),
  ('E2E Tests',                              0, 'high', 'jim-f', NOW(), NOW());
