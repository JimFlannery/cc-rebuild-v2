"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useSession } from "@/lib/auth-client";

export default function ProfilePage() {
  const { data: session } = useSession();
  const { connected, publicKey } = useWallet();
  const user = session?.user;

  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-semibold mb-2">Profile</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Your account information and wallet connection.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account */}
        <section className="rounded-lg border border-border">
          <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
            Account
          </h2>
          <div className="px-4 py-4 space-y-3 text-sm">
            <Row label="Name" value={user?.name ?? "—"} />
            <Row label="Email" value={user?.email ?? "—"} />
            <Row
              label="KYC Status"
              value={user?.kycVerified ? "Verified" : "Pending"}
              valueClass={user?.kycVerified ? "text-green-600 dark:text-green-400" : "text-yellow-500"}
            />
            <Row label="Member Since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"} />
          </div>
        </section>

        {/* Wallet */}
        <section className="rounded-lg border border-border">
          <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
            Wallet
          </h2>
          <div className="px-4 py-4 space-y-3 text-sm">
            <Row
              label="Status"
              value={connected ? "Connected" : "Not connected"}
              valueClass={connected ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}
            />
            <Row label="Network" value="Solana Devnet" />
            {connected && publicKey && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Address</p>
                <p className="font-mono text-xs break-all">{publicKey.toBase58()}</p>
              </div>
            )}
          </div>
        </section>

        {/* Platform */}
        <section className="rounded-lg border border-border">
          <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
            Platform
          </h2>
          <div className="px-4 py-4 space-y-3 text-sm">
            <Row label="Program ID" value="5PkPCb...eeB9K" mono />
            <Row label="SSTM Mint" value="GzHNyb...Y41S" mono />
            <Row label="Oracle" value="Dtp4xj...uckx" mono />
          </div>
        </section>

        {/* Identity Verification */}
        <section className="rounded-lg border border-border">
          <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
            Identity Verification
          </h2>
          <div className="px-4 py-4 text-sm text-muted-foreground space-y-2">
            <p>
              ConditionCover requires identity verification (KYC/AML) before you can connect a wallet
              and place orders. This is a regulatory requirement tied to your account, not your wallet.
            </p>
            <p>
              Verification is handled by a third-party provider and typically completes within minutes.
              Your personal information is never stored on-chain.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  valueClass,
  mono,
}: {
  label: string;
  value: string;
  valueClass?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="text-muted-foreground text-xs shrink-0">{label}</span>
      <span className={`font-medium text-right ${mono ? "font-mono text-xs" : ""} ${valueClass ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
