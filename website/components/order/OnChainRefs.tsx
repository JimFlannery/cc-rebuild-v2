import { explorerAccountUrl } from "@/lib/orderFormat";

interface Props {
  walletAddress: string | null;
  orderAddress?: string | null;
  denominationAddress?: string | null;
  contractAddress?: string | null;
  label?: string;
}

export function OnChainRefs({
  walletAddress, orderAddress, denominationAddress, contractAddress,
  label = "On-chain",
}: Props) {
  const rows: Array<[string, string | null | undefined]> = [
    ["Wallet", walletAddress],
    ["Order Address", orderAddress],
    ["Denomination Mint", denominationAddress],
    ["Contract Address", contractAddress],
  ].filter(([, v]) => !!v) as Array<[string, string]>;

  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border border-border">
      <h2 className="bg-gray-200 dark:bg-gray-800 px-4 py-2 text-sm font-medium rounded-t-lg">
        {label}
      </h2>
      <div className="px-4 py-3 text-xs space-y-2">
        {rows.map(([lbl, addr]) => (
          <div key={lbl} className="flex flex-col sm:flex-row sm:justify-between gap-1">
            <span className="text-muted-foreground shrink-0">{lbl}</span>
            <a
              href={explorerAccountUrl(addr!)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-muted-foreground hover:text-foreground break-all underline-offset-2 hover:underline"
            >
              {addr}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
