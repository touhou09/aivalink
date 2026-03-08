/**
 * User Repository
 * Upsert and query user profiles in the PostgreSQL users table.
 */

import type { Pool } from "pg";
import { nanoid } from "nanoid";

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string;
  authProvider: string;
  avatarUrl: string | null;
}

export type UserTier = "free" | "basic" | "plus" | "pro" | "enterprise";

export interface EnergyState {
  userId: string;
  tier: UserTier;
  current: number;
  max: number;
  lastResetAt: string | null;
}

export interface ConsumeEnergyResult extends EnergyState {
  consumed: number;
  allowed: boolean;
}

const TIER_DAILY_ENERGY: Record<UserTier, number> = {
  free: 50,
  basic: 200,
  plus: 200,
  pro: 500,
  enterprise: Number.MAX_SAFE_INTEGER,
};

export class UserRepository {
  constructor(private db: Pool) {}

  async create(profile: UserProfile): Promise<void> {
    await this.upsert(profile);
  }

  async upsert(profile: UserProfile): Promise<void> {
    await this.db.query(
      `INSERT INTO users (id, email, display_name, auth_provider, avatar_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         auth_provider = EXCLUDED.auth_provider,
         avatar_url = EXCLUDED.avatar_url,
         updated_at = NOW()`,
      [profile.id, profile.email, profile.displayName, profile.authProvider, profile.avatarUrl],
    );
  }

  async update(id: string, patch: Partial<Omit<UserProfile, "id">>): Promise<UserProfile | undefined> {
    const current = await this.findById(id);
    if (!current) return undefined;

    await this.upsert({
      ...current,
      ...patch,
      id,
    });

    return this.findById(id);
  }

  async findById(id: string): Promise<UserProfile | undefined> {
    const result = await this.db.query<{
      id: string;
      email: string | null;
      display_name: string;
      auth_provider: string;
      avatar_url: string | null;
    }>(
      "SELECT id, email, display_name, auth_provider, avatar_url FROM users WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      authProvider: row.auth_provider,
      avatarUrl: row.avatar_url,
    };
  }

  async getEnergyState(userId: string): Promise<EnergyState | undefined> {
    await this.ensureDailyReset(userId);

    const result = await this.db.query<{
      id: string;
      tier: UserTier;
      energy_balance: number;
      energy_max: number;
      last_energy_reset_at: string | null;
    }>(
      "SELECT id, tier, energy_balance, energy_max, last_energy_reset_at FROM users WHERE id = $1",
      [userId],
    );
    const row = result.rows[0];
    if (!row) return undefined;

    return {
      userId: row.id,
      tier: row.tier,
      current: row.energy_balance,
      max: row.energy_max,
      lastResetAt: row.last_energy_reset_at,
    };
  }

  async consumeEnergy(userId: string, amount: number, reason = "chat", referenceId?: string): Promise<ConsumeEnergyResult | undefined> {
    await this.ensureDailyReset(userId);

    const current = await this.getEnergyState(userId);
    if (!current) return undefined;

    if (current.tier === "enterprise") {
      await this.insertEnergyTransaction(userId, 0, current.current, reason, referenceId);
      return { ...current, consumed: 0, allowed: true };
    }

    const cost = Math.max(0, Math.floor(amount));
    if (current.current < cost) {
      return { ...current, consumed: 0, allowed: false };
    }

    const next = current.current - cost;
    await this.db.query(
      "UPDATE users SET energy_balance = $1, updated_at = NOW() WHERE id = $2",
      [next, userId],
    );

    await this.insertEnergyTransaction(userId, -cost, next, reason, referenceId);

    return {
      ...current,
      current: next,
      consumed: cost,
      allowed: true,
    };
  }

  async chargeEnergy(userId: string, amount: number, reason = "manual_charge", referenceId?: string): Promise<EnergyState | undefined> {
    const current = await this.getEnergyState(userId);
    if (!current) return undefined;

    const charge = Math.max(0, Math.floor(amount));
    const next = Math.min(current.max, current.current + charge);

    await this.db.query(
      "UPDATE users SET energy_balance = $1, updated_at = NOW() WHERE id = $2",
      [next, userId],
    );

    await this.insertEnergyTransaction(userId, next - current.current, next, reason, referenceId);

    return {
      ...current,
      current: next,
    };
  }

  async ensureDailyReset(userId: string): Promise<void> {
    const result = await this.db.query<{
      tier: UserTier;
      last_energy_reset_at: string | null;
    }>(
      "SELECT tier, last_energy_reset_at FROM users WHERE id = $1",
      [userId],
    );
    const row = result.rows[0];
    if (!row) return;

    const todayResult = await this.db.query<{ d: string }>(
      "SELECT CURRENT_DATE::text AS d",
    );
    const today = todayResult.rows[0]?.d ?? null;

    let last: string | null = null;
    if (row.last_energy_reset_at) {
      const lastResult = await this.db.query<{ d: string }>(
        "SELECT ($1::timestamptz AT TIME ZONE 'localtime')::date::text AS d",
        [row.last_energy_reset_at],
      );
      last = lastResult.rows[0]?.d ?? null;
    }

    if (last === today) return;

    const resetTo = TIER_DAILY_ENERGY[row.tier] ?? TIER_DAILY_ENERGY.free;

    await this.db.query(
      `UPDATE users
         SET energy_balance = $1,
             energy_max = $2,
             last_energy_reset_at = NOW(),
             updated_at = NOW()
       WHERE id = $3`,
      [resetTo, resetTo, userId],
    );

    await this.insertEnergyTransaction(userId, resetTo, resetTo, "daily_reset");
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query(
      "DELETE FROM users WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async insertEnergyTransaction(
    userId: string,
    amount: number,
    balanceAfter: number,
    reason: string,
    referenceId?: string,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO energy_transactions
        (id, user_id, amount, balance_after, reason, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nanoid(), userId, amount, balanceAfter, reason, referenceId ?? null],
    );
  }
}
