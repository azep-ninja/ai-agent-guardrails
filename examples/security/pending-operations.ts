/**
 * AI Agent Guardrails — Pending Operation Deduplication
 * Prevents duplicate transactions from rapid requests or replay attacks.
 */

const OPERATION_TTL_MS = 120_000; // 2 minutes

interface PendingOp {
  key: string;
  userId: string;
  operationType: string;
  timestamp: number;
  params: Record<string, any>;
}

export class PendingOperationManager {
  private pending: Map<string, PendingOp> = new Map();

  /**
   * Check if an operation can execute (not a duplicate).
   */
  canExecute(userId: string, operation: {
    operation_type: string;
    token_symbol?: string | null;
    chain?: string | null;
    amount?: number | null;
    recipient?: any;
  }): { allowed: boolean; reason?: string } {
    this.cleanExpired();

    const key = this.buildKey(userId, operation);
    const existing = this.pending.get(key);

    if (existing) {
      const ageMs = Date.now() - existing.timestamp;
      return {
        allowed: false,
        reason: `Duplicate operation detected (submitted ${Math.round(ageMs / 1000)}s ago). Wait or modify your request.`,
      };
    }

    return { allowed: true };
  }

  /** Track a new pending operation. */
  track(userId: string, operation: Record<string, any>): void {
    this.cleanExpired();
    const key = this.buildKey(userId, operation);
    this.pending.set(key, {
      key,
      userId,
      operationType: operation.operation_type,
      timestamp: Date.now(),
      params: operation,
    });
  }

  /** Remove a pending operation (after completion or cancellation). */
  remove(userId: string, operation: Record<string, any>): void {
    const key = this.buildKey(userId, operation);
    this.pending.delete(key);
  }

  /** Get all pending operations for a user. */
  getPending(userId: string): PendingOp[] {
    this.cleanExpired();
    return Array.from(this.pending.values()).filter(p => p.userId === userId);
  }

  private buildKey(userId: string, op: Record<string, any>): string {
    // Key combines user + operation type + key parameters
    // Two "buy $50 of ETH on base" requests = same key = duplicate
    const parts = [
      userId,
      op.operation_type,
      op.token_symbol || '',
      op.chain || '',
      op.amount?.toString() || '',
      JSON.stringify(op.recipient || ''),
    ];
    return parts.join(':').toLowerCase();
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, op] of this.pending) {
      if (now - op.timestamp > OPERATION_TTL_MS) {
        this.pending.delete(key);
      }
    }
  }
}

/*
Usage:
const pendingMgr = new PendingOperationManager();

// Before executing:
const check = pendingMgr.canExecute(userId, operation);
if (!check.allowed) return rejectOperation(check.reason);

// Track it:
pendingMgr.track(userId, operation);

// After completion:
pendingMgr.remove(userId, operation);
*/
