'use server';

export interface TokenPrices {
  SSTM: number;
  SOL: number;
  USDC: number;
  LINK: number;
}

// Hardcoded fallback prices from prototype currency.ts
const FALLBACK: TokenPrices = {
  SSTM: 9.024301397,
  SOL: 126.961894378,
  USDC: 0.999999,
  LINK: 14.01404657,
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const LINK_MINT = "2wpTofQ8SkACrkZWrZDjXgrMCjD3GsBMB9Cq1vbkHkde"; // Chainlink LINK on Solana

let cached: { prices: TokenPrices; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getTokenPrices(): Promise<TokenPrices> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.prices;
  }

  try {
    const ids = [SOL_MINT, USDC_MINT, LINK_MINT].join(",");
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${ids}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) throw new Error(`Jupiter API ${res.status}`);

    const json = await res.json() as {
      data: Record<string, { price: string }>;
    };

    const prices: TokenPrices = {
      SSTM: FALLBACK.SSTM, // hardcoded until SSTM is listed on a DEX
      SOL: parseFloat(json.data[SOL_MINT]?.price ?? "0") || FALLBACK.SOL,
      USDC: parseFloat(json.data[USDC_MINT]?.price ?? "0") || FALLBACK.USDC,
      LINK: parseFloat(json.data[LINK_MINT]?.price ?? "0") || FALLBACK.LINK,
    };

    cached = { prices, fetchedAt: Date.now() };
    return prices;
  } catch {
    // Fall back to hardcoded constants if Jupiter is unreachable
    cached = { prices: FALLBACK, fetchedAt: Date.now() };
    return FALLBACK;
  }
}
