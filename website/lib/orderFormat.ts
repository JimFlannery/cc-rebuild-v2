export function shortIndex(name: string | null | undefined): string {
  if (!name) return "—";
  if (name.includes("Disturbance")) return "Dst";
  if (name.includes("Planetary")) return "Kp";
  if (name.includes("X-Ray")) return "X-Ray";
  if (name.includes("Proton")) return "Proton";
  if (name.includes("Radio")) return "Radio";
  return name;
}

export function longIndex(name: string | null | undefined): string {
  if (!name) return "—";
  if (name.includes("Disturbance")) return "Dst";
  if (name.includes("Planetary")) return "Kp";
  if (name.includes("X-Ray")) return "Solar X-Ray Flux";
  if (name.includes("Proton")) return "Solar Proton Flux";
  if (name.includes("Radio")) return "Solar Radio Flux";
  return name;
}

export function formatCondition(indexName: string, indexLevel: number, indexUnit: string): string {
  const idx = shortIndex(indexName);
  const level = indexLevel < 0 ? `< ${indexLevel}` : `≥ ${indexLevel / 100}`;
  return `${idx} ${level} ${indexUnit}`;
}

export function formatCoverage(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function shortWallet(address: string | null | undefined): string {
  if (!address) return "—";
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function formatCreated(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

export function timeRemaining(expiration: string | Date | null | undefined): string {
  if (!expiration) return "—";
  const diff = new Date(expiration).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diff / 3_600_000);
  return `${hours}h`;
}

export function explorerTxUrl(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

export function explorerAccountUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}
