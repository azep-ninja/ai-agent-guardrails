/**
 * AI Agent Guardrails — Operation Rate Limiter
 *
 * Pure code. No LLM. Mathematical enforcement.
 *
 * Prevents rapid-fire exploitation, drain attacks, and abuse.
 * Implements tiered limits: global, per-operation-type, and value-based.
 *
 * ADAPT: Change the limits, add tiers (free vs premium), add
 * value-based limits in your currency, add cooldown periods.
 */

import { type OperationType, type RateLimitConfig, type RateLimitCheck } from '../../src/core/types';

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: RateLimitConfig = {
  // Global limits
  maxOperationsPerMinute: 10,
  maxOperationsPerHour: 50,
  maxOperationsPerDay: 200,

  // Per-operation-type limits (override global)
  operationLimits: {
    send: { perMinute: 3, perHour: 20, perDay: 50 },
    token_launch: { perDay: 5 },
    bridge: { perMinute: 2, perHour: 15 },
    perp_long: { perMinute: 3, perHour: 20 },
    perp_short: { perMinute: 3, perHour: 20 },
  },

  // Value-based limits (in USD)
  maxSingleTransactionUsd: 10_000,
  maxDailyVolumeUsd: 50_000,
};

// ============================================================
// Rate Limiter Implementation
// ============================================================

interface OperationRecord {
  type: OperationType;
  timestamp: number;
  estimatedValueUsd: number;
  userId: string;
}

export class OperationRateLimiter {
  private config: RateLimitConfig;
  private records: Map<string, OperationRecord[]> = new Map();

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if an operation is allowed under current rate limits.
   * Call this BEFORE execution, AFTER validation.
   */
  checkLimit(
    userId: string,
    operationType: OperationType,
    estimatedValueUsd: number = 0,
  ): RateLimitCheck {
    const now = Date.now();
    const userRecords = this.getUserRecords(userId);

    // Clean old records
    this.cleanExpiredRecords(userId, now);

    // Check 1: Global rate limits
    const globalCheck = this.checkGlobalLimits(userRecords, now);
    if (!globalCheck.allowed) return globalCheck;

    // Check 2: Per-operation-type limits
    const typeCheck = this.checkTypeLimits(userRecords, operationType, now);
    if (!typeCheck.allowed) return typeCheck;

    // Check 3: Value-based limits
    const valueCheck = this.checkValueLimits(userRecords, estimatedValueUsd, now);
    if (!valueCheck.allowed) return valueCheck;

    return {
      allowed: true,
      currentUsage: this.getUsageSummary(userRecords, now),
    };
  }

  /**
   * Record an operation after successful execution.
   */
  recordOperation(
    userId: string,
    operationType: OperationType,
    estimatedValueUsd: number = 0,
  ): void {
    const records = this.getUserRecords(userId);
    records.push({
      type: operationType,
      timestamp: Date.now(),
      estimatedValueUsd,
      userId,
    });
  }

  // ============================================================
  // Internal Checks
  // ============================================================

  private checkGlobalLimits(records: OperationRecord[], now: number): RateLimitCheck {
    const oneMinAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;
    const oneDayAgo = now - 86_400_000;

    const lastMinute = records.filter(r => r.timestamp > oneMinAgo).length;
    const lastHour = records.filter(r => r.timestamp > oneHourAgo).length;
    const lastDay = records.filter(r => r.timestamp > oneDayAgo).length;

    if (lastMinute >= this.config.maxOperationsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit: ${lastMinute}/${this.config.maxOperationsPerMinute} operations per minute`,
        retryAfterMs: 60_000,
      };
    }

    if (lastHour >= this.config.maxOperationsPerHour) {
      return {
        allowed: false,
        reason: `Rate limit: ${lastHour}/${this.config.maxOperationsPerHour} operations per hour`,
        retryAfterMs: 3_600_000,
      };
    }

    if (lastDay >= this.config.maxOperationsPerDay) {
      return {
        allowed: false,
        reason: `Daily limit reached: ${lastDay}/${this.config.maxOperationsPerDay} operations`,
        retryAfterMs: 86_400_000,
      };
    }

    return { allowed: true };
  }

  private checkTypeLimits(
    records: OperationRecord[],
    type: OperationType,
    now: number,
  ): RateLimitCheck {
    const limits = this.config.operationLimits[type];
    if (!limits) return { allowed: true };

    const typeRecords = records.filter(r => r.type === type);

    if (limits.perMinute) {
      const count = typeRecords.filter(r => r.timestamp > now - 60_000).length;
      if (count >= limits.perMinute) {
        return {
          allowed: false,
          reason: `${type} limit: ${count}/${limits.perMinute} per minute`,
          retryAfterMs: 60_000,
        };
      }
    }

    if (limits.perHour) {
      const count = typeRecords.filter(r => r.timestamp > now - 3_600_000).length;
      if (count >= limits.perHour) {
        return {
          allowed: false,
          reason: `${type} limit: ${count}/${limits.perHour} per hour`,
          retryAfterMs: 3_600_000,
        };
      }
    }

    if (limits.perDay) {
      const count = typeRecords.filter(r => r.timestamp > now - 86_400_000).length;
      if (count >= limits.perDay) {
        return {
          allowed: false,
          reason: `${type} daily limit: ${count}/${limits.perDay} per day`,
          retryAfterMs: 86_400_000,
        };
      }
    }

    return { allowed: true };
  }

  private checkValueLimits(
    records: OperationRecord[],
    estimatedValueUsd: number,
    now: number,
  ): RateLimitCheck {
    // Single transaction limit
    if (estimatedValueUsd > this.config.maxSingleTransactionUsd) {
      return {
        allowed: false,
        reason: `Single transaction limit: $${estimatedValueUsd} exceeds $${this.config.maxSingleTransactionUsd} max`,
      };
    }

    // Daily volume limit
    const dailyVolume = records
      .filter(r => r.timestamp > now - 86_400_000)
      .reduce((sum, r) => sum + r.estimatedValueUsd, 0);

    if (dailyVolume + estimatedValueUsd > this.config.maxDailyVolumeUsd) {
      return {
        allowed: false,
        reason: `Daily volume limit: $${dailyVolume + estimatedValueUsd} would exceed $${this.config.maxDailyVolumeUsd} max`,
      };
    }

    return { allowed: true };
  }

  // ============================================================
  // Helpers
  // ============================================================

  private getUserRecords(userId: string): OperationRecord[] {
    if (!this.records.has(userId)) {
      this.records.set(userId, []);
    }
    return this.records.get(userId)!;
  }

  private cleanExpiredRecords(userId: string, now: number): void {
    const records = this.getUserRecords(userId);
    const cutoff = now - 86_400_000; // Keep 24 hours
    const cleaned = records.filter(r => r.timestamp > cutoff);
    this.records.set(userId, cleaned);
  }

  private getUsageSummary(records: OperationRecord[], now: number) {
    return {
      minute: records.filter(r => r.timestamp > now - 60_000).length,
      hour: records.filter(r => r.timestamp > now - 3_600_000).length,
      day: records.filter(r => r.timestamp > now - 86_400_000).length,
      dailyVolumeUsd: records
        .filter(r => r.timestamp > now - 86_400_000)
        .reduce((sum, r) => sum + r.estimatedValueUsd, 0),
    };
  }
}

// ============================================================
// Usage Example
// ============================================================

/*
const limiter = new OperationRateLimiter({
  // Custom limits for your agent
  maxOperationsPerMinute: 5,
  operationLimits: {
    send: { perMinute: 2, perHour: 10 },
    token_launch: { perDay: 3 },
  },
  maxSingleTransactionUsd: 5000,
  maxDailyVolumeUsd: 25000,
});

// Before executing any operation:
const check = limiter.checkLimit(userId, 'send', 500);
if (!check.allowed) {
  return rejectOperation(check.reason);
}

// After successful execution:
limiter.recordOperation(userId, 'send', 500);
*/
