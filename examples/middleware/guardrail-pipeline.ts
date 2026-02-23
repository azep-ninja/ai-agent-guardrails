/**
 * AI Agent Guardrails — Full Pipeline Example
 *
 * Shows all guardrail layers working together:
 *   Message → Detection → Validation → Rate Limiting → Execution
 *
 * REFERENCE IMPLEMENTATION. Adapt to your framework.
 *
 * THE FLOW:
 * 1. Pre-LLM safety (impersonation detection, platform checks)
 * 2. LLM Call 1: Intent detection
 * 3. Code: Validate Call 1 output, assemble context
 * 4. LLM Call 2: Operation extraction
 * 5. Code: Hallucination check
 * 6. Code: Operation completeness validation
 * 7. Code: Business rule validation
 * 8. Code: Identity verification
 * 9. Code: Rate limiting
 * 10. Code: Deduplication
 * 11. Code: Platform restrictions
 * 12. Execution (only if ALL checks pass)
 */

import { VALID_OPERATION_TYPES, VALID_OPERATION_SET } from '../../src/core/types';

// ============================================================
// Type Definitions
// ============================================================

interface PipelineResult {
  type: 'execute' | 'conversational' | 'reject' | 'incomplete';
  operations?: any[];
  message?: string;
  missingFields?: string[];
}

interface PipelineDeps {
  callLLM: (prompt: string) => Promise<string>;
  getPendingOps: (userId: string) => Promise<string | null>;
  getRecentMessages: (userId: string) => Promise<string | null>;
  getPortfolio: (userId: string) => Promise<string | null>;
  executeOperation: (userId: string, op: any) => Promise<any>;
}

// ============================================================
// The Pipeline
// ============================================================

export async function processMessage(
  message: string,
  auth: { userId: string; platform: string; senderId: string },
  deps: PipelineDeps,
): Promise<PipelineResult> {

  // ── STEP 0: Pre-LLM Safety (Code Only) ──────────────────

  // Impersonation detection
  if (detectImpersonation(message)) {
    return { type: 'reject', message: 'Suspicious request pattern detected.' };
  }

  // ── STEP 1: LLM Call 1 — Intent Detection ───────────────

  const pendingOps = await deps.getPendingOps(auth.userId);
  const recentMessages = await deps.getRecentMessages(auth.userId);

  // Build prompt with context (see intent-detection.ts for template)
  const call1Prompt = buildCall1Prompt(message, auth, pendingOps, recentMessages);
  const call1Result = await deps.callLLM(call1Prompt);
  const intent = parseAndValidateCall1(call1Result, !!pendingOps);

  // Non-operational → no further pipeline needed
  if (intent.messageType !== 'operational' || intent.operationTypes.length === 0) {
    return { type: 'conversational' };
  }

  // ── STEP 2: Context Assembly (Code Only) ─────────────────

  // Only fetch what Call 1 said was needed — efficient and secure
  const portfolio = intent.needsPortfolio ? await deps.getPortfolio(auth.userId) : null;

  // ── STEP 3: LLM Call 2 — Operation Extraction ───────────

  const call2Prompt = buildCall2Prompt(message, intent, portfolio);
  const call2Result = await deps.callLLM(call2Prompt);
  const extracted = parseAndValidateCall2(call2Result);

  if (extracted.error) {
    return { type: 'conversational', message: 'Could you rephrase that?' };
  }

  // ── STEP 4: Hallucination Check (Code Only) ─────────────

  const validOps = extracted.operations.filter(
    (op: any) => VALID_OPERATION_SET.has(op.operation_type)
  );

  if (validOps.length === 0) {
    return { type: 'conversational' };
  }

  // ── STEP 5: Operation Completeness (Code Only) ──────────

  for (const op of validOps) {
    const missing = getMissingFields(op);
    if (missing.length > 0) {
      return {
        type: 'incomplete',
        message: `I need a few more details: ${missing.join(', ')}`,
        missingFields: missing,
      };
    }
  }

  // ── STEP 6: Business Rule Validation (Code Only) ────────

  for (const op of validOps) {
    const errors = validateBusinessRules(op);
    if (errors.length > 0) {
      return { type: 'reject', message: errors.join('. ') };
    }
  }

  // ── STEP 7: Identity Verification (Code Only) ───────────

  for (const op of validOps) {
    if (op.user_id && op.user_id !== auth.userId) {
      console.warn('Identity mismatch — potential attack', { op, auth });
      return { type: 'reject', message: 'Operation identity mismatch.' };
    }
  }

  // ── STEP 8: Rate Limiting (Code Only) ───────────────────

  for (const op of validOps) {
    const rateCheck = checkRateLimit(auth.userId, op.operation_type);
    if (!rateCheck.allowed) {
      return { type: 'reject', message: rateCheck.reason };
    }
  }

  // ── STEP 9: Deduplication (Code Only) ───────────────────

  for (const op of validOps) {
    const dupCheck = checkDuplicate(auth.userId, op);
    if (!dupCheck.allowed) {
      return { type: 'reject', message: dupCheck.reason };
    }
  }

  // ── STEP 10: Platform Restrictions (Code Only) ──────────

  for (const op of validOps) {
    const platformCheck = checkPlatformRestrictions(auth.platform, op.operation_type);
    if (!platformCheck.allowed) {
      return { type: 'reject', message: platformCheck.reason };
    }
  }

  // ── STEP 11: ALL CHECKS PASSED → Execute ────────────────

  const results = [];
  for (const op of validOps) {
    // Track as pending (deduplication)
    trackPending(auth.userId, op);

    try {
      const result = await deps.executeOperation(auth.userId, op);
      results.push(result);

      // Record for rate limiting
      recordOperation(auth.userId, op.operation_type);
    } finally {
      // Remove from pending
      removePending(auth.userId, op);
    }
  }

  return { type: 'execute', operations: results };
}

// ============================================================
// Placeholder implementations — replace with your actual code
// (See individual example files for full implementations)
// ============================================================

function detectImpersonation(message: string): boolean {
  const patterns = [
    /ignore (?:previous|prior) (?:instructions|rules)/i,
    /(?:you are|act as|pretend to be)/i,
    /(?:emergency|urgent).{0,30}(?:send|transfer)/i,
  ];
  return patterns.some(p => p.test(message));
}

function buildCall1Prompt(message: string, auth: any, pending: any, recent: any): string {
  // See examples/templates/intent-detection.ts
  return `[Call 1 prompt for: "${message}"]`;
}

function parseAndValidateCall1(raw: string, hasPending: boolean): any {
  // See examples/templates/intent-detection.ts — validateIntentDetection()
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    // Filter hallucinated operation types
    parsed.operationTypes = (parsed.operationTypes || []).filter(
      (t: string) => VALID_OPERATION_SET.has(t)
    );
    // Enforce continuation rules
    if (!hasPending) parsed.isContinuation = false;
    return parsed;
  } catch {
    return { messageType: 'conversational', operationTypes: [] };
  }
}

function buildCall2Prompt(message: string, intent: any, portfolio: any): string {
  // See examples/templates/operation-extraction.ts
  return `[Call 2 prompt for: "${message}"]`;
}

function parseAndValidateCall2(raw: string): any {
  // See examples/validation/hallucination-prevention.ts
  try {
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return { operations: parsed.operations || [], error: null };
  } catch {
    return { operations: [], error: 'Parse failed' };
  }
}

function getMissingFields(op: any): string[] {
  // See examples/validation/operation-completeness.ts
  const required: Record<string, string[]> = {
    buy: ['amount', 'token_out', 'chain'],
    sell: ['amount', 'token', 'chain'],
    send: ['amount', 'token', 'recipient', 'chain'],
    bridge: ['amount', 'token', 'chain', 'target_chain'],
    swap: ['token', 'token_out', 'chain'],
  };
  const fields = required[op.operation_type] || [];
  return fields.filter(f => !op[f] && !op[`${f}_symbol`] && !op[`${f}_address`]);
}

function validateBusinessRules(op: any): string[] {
  // See examples/validation/operation-completeness.ts
  const errors: string[] = [];
  if (op.operation_type === 'bridge' && op.chain === op.target_chain) {
    errors.push('Bridge source and target cannot be the same');
  }
  if (op.operation_type === 'burn' && op.token_address === 'native') {
    errors.push('Cannot burn native assets');
  }
  return errors;
}

function checkRateLimit(userId: string, opType: string): { allowed: boolean; reason?: string } {
  // See examples/rate-limiting/operation-rate-limiter.ts
  return { allowed: true };
}

function checkDuplicate(userId: string, op: any): { allowed: boolean; reason?: string } {
  // See examples/security/pending-operations.ts
  return { allowed: true };
}

function checkPlatformRestrictions(platform: string, opType: string): { allowed: boolean; reason?: string } {
  // See examples/security/platform-restrictions.ts
  return { allowed: true };
}

function trackPending(userId: string, op: any): void { /* See pending-operations.ts */ }
function removePending(userId: string, op: any): void { /* See pending-operations.ts */ }
function recordOperation(userId: string, opType: string): void { /* See rate-limiter.ts */ }