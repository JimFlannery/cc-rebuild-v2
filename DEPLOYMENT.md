# ConditionCover — Deployment & Repository Reference

## Repository Structure

**One monorepo** — `cc-rebuild-v2` contains all three components.

The components are tightly coupled (oracle references the smart contract program ID; oracle writes to MySQL; website reads from MySQL), so they move together. A monorepo means one PR, one place to see cross-component changes, no version coordination overhead.

```
cc-rebuild-v2/
├── CLAUDE.md               ← project overview and tech stack
├── DEPLOYMENT.md           ← this file
├── .gitignore              ← root-level (oracle, keypairs, logs)
├── mysql_schema.docx       ← MySQL schema reference
├── oracle/                 ← off-chain TypeScript polling service
├── smartcontracts/         ← Anchor/Rust Solana program
└── website/                ← Next.js 16 frontend
```

---

## GitHub Actions — CI/CD

Two automated deploy workflows. Smart contract deploys are **always manual** (they require the program keypair and are irreversible on-chain).

| Workflow | File | Triggers on |
|---|---|---|
| Deploy Website | `.github/workflows/deploy-website.yml` | Push to `main` with changes in `website/**` |
| Deploy Oracle | `.github/workflows/deploy-oracle.yml` | Push to `main` with changes in `oracle/**` |
| Smart contracts | *(none)* | Manual: `anchor deploy` from WSL2 |

The path filter means a push touching only `oracle/` will not trigger a website rebuild, and vice versa.

### GitHub Secrets Required

Add these in: GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

| Secret | Description | Example |
|---|---|---|
| `EC2_HOST` | EC2 public IP address or hostname | `54.123.45.67` |
| `EC2_USER` | SSH username for the EC2 instance | `ubuntu` |
| `EC2_SSH_KEY` | Full contents of the EC2 `.pem` private key | *(paste the key)* |
| `DEPLOY_PATH` | Absolute path on EC2 where the repo is cloned | `/home/ubuntu/cc-rebuild-v2` |

### Deploy Flow (per workflow)

```
Push to main
    │
    ▼
GitHub Actions runner (ubuntu-latest)
    │
    │  SSH via appleboy/ssh-action
    ▼
EC2 instance
    ├── git pull origin main
    ├── npm ci
    ├── npm run build
    └── pm2 restart <service>  (or pm2 start if first run)
```

---

## AWS Architecture

### Development: Single EC2 Instance

For a small dev site with low traffic, all web-facing components run on **one EC2 instance**. Split into multiple instances when load requires it.

**Recommended instance type:** `t3.small` or `t3.medium`

```
┌─────────────────────────────────────────────────┐
│  EC2 Instance (Ubuntu)                          │
│                                                 │
│  ┌─────────┐   ┌──────────┐   ┌─────────────┐   │
│  │  nginx  │   │ Next.js  │   │   Oracle    │   │ 
│  │ (proxy) │──>│  :3000   │   │ Node.js svc │   │
│  └─────────┘   └─────┬────┘   └──────┬──────┘   │
│       ^              │               │          │
│  port 80/443         └───────────────┘          │
│                              │                  │
│                   ┌──────────▼──────────┐       │
│                   │   MySQL  :3306      │       │
│                   └─────────────────────┘       │
└─────────────────────────────────────────────────┘
                         │ outbound
               ┌─────────▼──────────┐
               │   Solana devnet    │
               │ (smart contracts   │
               │  live here, not    │
               │  on EC2)           │
               └────────────────────┘
```

**Key decisions:**

| Component | Decision | Reason |
|---|---|---|
| Website (Next.js) | EC2, port 3000, behind nginx | Standard Node.js hosting |
| Oracle (Node.js) | Same EC2, managed by PM2 | Low traffic; no inbound port needed |
| MySQL | Same EC2 (not RDS) | Saves cost; sufficient for dev |
| Smart contracts | Solana devnet | On-chain; not an AWS concern |
| Reverse proxy | nginx | Handles HTTPS termination, port 80/443 → 3000 |
| Process manager | PM2 | Keeps both Next.js and oracle alive; survives reboots |

---

## EC2 One-Time Setup

Run these once on the EC2 instance before the first GitHub Actions deploy.

```bash
# 1. Install Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc
nvm install 20

# 2. Install PM2
npm install -g pm2

# 3. Install MySQL
sudo apt update && sudo apt install -y mysql-server
sudo mysql_secure_installation

# 4. Install nginx
sudo apt install -y nginx

# 5. Clone the repo
git clone https://github.com/<your-org>/cc-rebuild-v2.git
cd cc-rebuild-v2

# 6. Set up environment files (fill in values — never commit these)
cp oracle/.env.example oracle/.env
cp website/.env.example website/.env.local   # if applicable

# 7. Register PM2 to start on reboot (follow the printed command)
pm2 startup
```

### nginx Config (reverse proxy for Next.js)

`/etc/nginx/sites-available/conditioncover`:
```nginx
server {
    listen 80;
    server_name <your-domain-or-ip>;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/conditioncover /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### PM2 Process Names

The GitHub Actions workflows use these exact PM2 names:

| Service | PM2 name | Start command |
|---|---|---|
| Website | `website` | `pm2 start npm --name "website" -- start` |
| Oracle | `oracle` | `pm2 start dist/index.js --name "oracle"` |

Save the PM2 process list after first start so it survives reboots:
```bash
pm2 save
```

---

## Smart Contract Deployment

Smart contracts deploy to **Solana** (devnet for testing, mainnet-beta for production). This is always done manually from WSL2 — never via GitHub Actions.

```bash
# WSL2 only — not on EC2
cd /mnt/c/Users/jim-f/source/repos/cc-rebuild-v2/smartcontracts
anchor build
anchor deploy
```

**Program ID:** `5PkPCbdZNFGYVJNjifxgZDGyeaMKmTeWPj4fxhYeeB9K`

Verify on [Solscan Devnet](https://solscan.io/?cluster=devnet) after each deploy.

**Oracle wallet (devnet):**
- Pubkey: `Dtp4xjj7S56J7FFLPm5TFqA8kd3FDfNdkgAabB4cuckx`
- Keypair: `~/.config/solana/oracle-keypair.json` (WSL2) — **never commit**
- Funded: 2 SOL on devnet (2026-03-20)
- Hardcoded as `ORACLE_AUTHORITY` in `smartcontracts/programs/condition_cover/src/constants.rs`

---

## Environment Variables

Each component has its own `.env` file on the EC2 instance. These are **not in the repo** — only `.env.example` is committed.

| File | Location on EC2 | Managed by |
|---|---|---|
| `oracle/.env` | `/home/ubuntu/cc-rebuild-v2/oracle/.env` | Manual; see `oracle/.env.example` |
| `website/.env.local` | `/home/ubuntu/cc-rebuild-v2/website/.env.local` | Manual |

---

## Scaling Path (future)

When the dev site outgrows a single instance:

1. **Split MySQL to RDS** — first thing to extract; enables independent scaling and automated backups
2. **Move oracle to a separate EC2** — when settlement load increases or uptime SLA tightens
3. **Move website to Elastic Beanstalk or ECS** — when horizontal scaling is needed
4. **Add a load balancer (ALB)** — when running multiple website instances
