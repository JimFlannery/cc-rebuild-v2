'use server';

import pool from '@/lib/db';

export async function testDbConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const [rows] = await pool.query('SHOW TABLES') as [Array<Record<string, string>>, unknown];
    const tables = rows.map(r => Object.values(r)[0]);
    return { ok: true, message: `Connected. Tables: ${tables.join(', ')}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}
