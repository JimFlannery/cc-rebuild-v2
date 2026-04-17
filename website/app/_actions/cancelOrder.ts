'use server';

import pool from '@/lib/db';

export interface CancelOrderResult {
  ok: boolean;
  error?: string;
}

// TODO: add on-chain cancel_order + escrow refund via the condition_cover
// Anchor program once the instruction exists. For now this is a DB-only
// status flip — escrowed funds are not returned until on-chain support lands.
export async function cancelOrder(
  id: string,
  walletAddress: string
): Promise<CancelOrderResult> {
  const [result]: any = await pool.execute(
    `UPDATE Orders
        SET Status = 'Cancelled',
            StatusDate = ?,
            updatedAt = ?
      WHERE id = ?
        AND WalletAddress = ?
        AND Status = 'Open'
        AND COALESCE(CoverageFilled, 0) = 0
        AND COALESCE(OrderTaken, 0) = 0`,
    [new Date(), new Date(), id, walletAddress]
  );

  if (result.affectedRows === 0) {
    return { ok: false, error: "Order cannot be cancelled (already filled, matched, or not owned by this wallet)." };
  }

  return { ok: true };
}
