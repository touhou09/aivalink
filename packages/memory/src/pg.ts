/**
 * PostgreSQL Database Manager
 * Replaces SQLite DatabaseManager for AivaLink cloud deployment
 */

import { Pool, type PoolConfig } from "pg";

export class PostgresManager {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  static fromUrl(connectionString: string): PostgresManager {
    return new PostgresManager({ connectionString });
  }

  get instance(): Pool {
    return this.pool;
  }

  async query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T | undefined> {
    const rows = await this.query<T>(text, params);
    return rows[0];
  }

  async execute(text: string, params?: unknown[]): Promise<number> {
    const result = await this.pool.query(text, params);
    return result.rowCount ?? 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
