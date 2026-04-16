'use server';

import pool from '@/lib/db';

/**
 * Increments CoverageFilled on a hedge order by the amount of cover provided.
 * If CoverageFilled >= Coverage after the update, marks the order as fully matched.
 */
export async function updateCoverageFilled(
  orderId: string,
  amountFilled: number
): Promise<{ closed: boolean }> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Atomically increment and check if fully filled
  await pool.execute(
    `UPDATE Orders
     SET CoverageFilled = COALESCE(CoverageFilled, 0) + ?,
         updatedAt = ?
     WHERE id = ?`,
    [amountFilled, now, orderId]
  );

  // Check if fully filled
  const [rows] = await pool.query(
    `SELECT Coverage, CoverageFilled FROM Orders WHERE id = ?`,
    [orderId]
  ) as [any[], unknown];

  const r = (rows as any[])[0];
  if (!r) return { closed: false };

  const coverage = Number(r.Coverage);
  const filled = Number(r.CoverageFilled);

  if (filled >= coverage) {
    await pool.execute(
      `UPDATE Orders
       SET OrderTaken = 1, Status = 'Matched', StatusDate = ?, updatedAt = ?
       WHERE id = ?`,
      [now, now, orderId]
    );
    return { closed: true };
  }

  return { closed: false };
}
