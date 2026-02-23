/**
 * AI Agent Guardrails — Operation Completeness Validation
 *
 * Pure deterministic code. No LLM. Can't be prompt-injected.
 *
 * Every operation extracted by the LLM must pass this validation
 * before reaching execution. Catches missing fields, invalid combos,
 * and special case violations.
 *
 * ADAPT: Add/remove operation types. Change required fields. Add your
 * own business rules. The pattern is what matters, not the specifics.
 */

import { type ExtractedOperation, type AmountType } from '../../src/core/types';

// ============================================================
// Required Fields Definition — SINGLE SOURCE OF TRUTH
// ============================================================

/**
 * Define what fields each operation type requires.
 *
 * These are checked AFTER the LLM extracts operations.
 * The LLM template can mention these requirements (defense in depth),
 * but THIS code is what actually enforces them.
 *
 * 'amount_or_type' means either amount must be set OR amount_type
 * must be one of: 'all', 'from_previous', 'percentage'
 */
interface FieldRequirement {
  field: string;
  // Some fields have complex requirements
  validator?: (op: ExtractedOperation) => boolean;
  // Human-readable description of what's needed
  description: string;
}

const REQUIRED_FIELDS: Record<string, FieldRequirement[]> = {
  buy: [
    {
      field: 'amount',
      description: 'How much to spend',
      validator: (op) => hasAmountOrType(op),
    },
    {
      field: 'token_out',
      description: 'Which token to buy',
      validator: (op) => !!(op.token_out_symbol || op.token_out_address),
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  sell: [
    {
      field: 'amount',
      description: 'How much to sell',
      validator: (op) => hasAmountOrType(op),
    },
    {
      field: 'token',
      description: 'Which token to sell',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  swap: [
    {
      field: 'token',
      description: 'Which token to swap from',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'token_out',
      description: 'Which token to swap to',
      validator: (op) => !!(op.token_out_symbol || op.token_out_address),
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  send: [
    {
      field: 'amount',
      description: 'How much to send',
      validator: (op) => hasAmountOrType(op) || hasRecipientAmounts(op),
    },
    {
      field: 'token',
      description: 'Which token to send',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'recipient',
      description: 'Who to send to',
      validator: (op) => !!op.recipient,
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  bridge: [
    {
      field: 'amount',
      description: 'How much to bridge',
      validator: (op) => hasAmountOrType(op),
    },
    {
      field: 'token',
      description: 'Which token to bridge',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'chain',
      description: 'Source blockchain',
      validator: (op) => !!op.chain,
    },
    {
      field: 'target_chain',
      description: 'Destination blockchain',
      validator: (op) => !!op.target_chain,
    },
  ],

  burn: [
    {
      field: 'amount',
      description: 'How much to burn',
      validator: (op) => hasAmountOrType(op),
    },
    {
      field: 'token',
      description: 'Which token to burn',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  limit_buy: [
    {
      field: 'token_out',
      description: 'Which token to buy',
      validator: (op) => !!(op.token_out_symbol || op.token_out_address),
    },
    {
      field: 'target_price',
      description: 'At what price to buy',
      validator: (op) => op.target_price !== null || op.price_percentage !== null,
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  limit_sell: [
    {
      field: 'token',
      description: 'Which token to sell',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'target_price',
      description: 'At what price to sell',
      validator: (op) => op.target_price !== null || op.price_percentage !== null,
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  token_scan: [
    {
      field: 'token',
      description: 'Which token to scan',
      validator: (op) => !!(op.token_symbol || op.token_address),
    },
    {
      field: 'chain',
      description: 'Which blockchain',
      validator: (op) => !!op.chain,
    },
  ],

  // Add more operation types as needed...
};

// ============================================================
// Core Validation Functions
// ============================================================

/**
 * Get list of missing fields for an operation.
 * Returns human-readable descriptions for user-facing prompts.
 */
export function getMissingFields(operation: ExtractedOperation): string[] {
  const requirements = REQUIRED_FIELDS[operation.operation_type];

  if (!requirements) {
    // Unknown operation type — shouldn't happen if hallucination
    // prevention is working, but safety first
    return [`Unknown operation type: ${operation.operation_type}`];
  }

  const missing: string[] = [];

  for (const req of requirements) {
    if (req.validator && !req.validator(operation)) {
      missing.push(req.description);
    }
  }

  return missing;
}

/**
 * Check if an operation has all required fields.
 */
export function isOperationComplete(operation: ExtractedOperation): boolean {
  return getMissingFields(operation).length === 0;
}

/**
 * Validate a batch of operations. Returns per-operation results.
 */
export function validateOperationBatch(
  operations: ExtractedOperation[]
): {
  allComplete: boolean;
  results: Array<{
    index: number;
    complete: boolean;
    missingFields: string[];
  }>;
} {
  const results = operations.map((op, index) => {
    const missing = getMissingFields(op);
    return {
      index,
      complete: missing.length === 0,
      missingFields: missing,
    };
  });

  return {
    allComplete: results.every(r => r.complete),
    results,
  };
}

// ============================================================
// Special Validation Rules
// ============================================================

/**
 * Business-rule validations that go beyond field presence.
 * These catch logically invalid operations.
 */
export function validateBusinessRules(
  operation: ExtractedOperation
): string[] {
  const errors: string[] = [];

  // Rule: Bridge source and target must be different chains
  if (operation.operation_type === 'bridge') {
    if (operation.chain && operation.target_chain && operation.chain === operation.target_chain) {
      errors.push('Bridge source and target chain cannot be the same');
    }
  }

  // Rule: Burn operations cannot target native assets
  if (operation.operation_type === 'burn') {
    if (operation.token_address === 'native') {
      errors.push('Cannot burn native assets (ETH, SOL, etc.)');
    }
  }

  // Rule: Percentage must be 0-100
  if (operation.amount_type === 'percentage' && operation.amount !== null) {
    if (operation.amount <= 0 || operation.amount > 100) {
      errors.push(`Invalid percentage: ${operation.amount}%. Must be between 0 and 100.`);
    }
  }

  // Rule: from_previous requires dependencies
  if (operation.amount_type === 'from_previous' && operation.dependencies.length === 0) {
    errors.push('Operation uses "from_previous" but has no dependencies');
  }

  // Rule: Dependencies must reference earlier operations
  for (const dep of operation.dependencies) {
    if (dep < 0) {
      errors.push(`Invalid dependency index: ${dep}`);
    }
  }

  // Rule: Send operations must have valid recipient format
  if (operation.operation_type === 'send' && operation.recipient) {
    const recipientErrors = validateRecipient(operation.recipient);
    errors.push(...recipientErrors);
  }

  // Add your own business rules here:
  // - Minimum transaction amounts
  // - Maximum slippage thresholds
  // - Chain-specific restrictions
  // - Time-of-day restrictions
  // - etc.

  return errors;
}

// ============================================================
// Helper Functions
// ============================================================

function hasAmountOrType(op: ExtractedOperation): boolean {
  // Operation has explicit amount
  if (op.amount !== null && op.amount !== undefined) return true;

  // Operation has a type that implies amount (all, from_previous, etc.)
  const impliedTypes: AmountType[] = ['all', 'from_previous'];
  if (op.amount_type && impliedTypes.includes(op.amount_type)) return true;

  // Percentage with amount set
  if (op.amount_type === 'percentage' && op.amount !== null) return true;

  return false;
}

function hasRecipientAmounts(op: ExtractedOperation): boolean {
  if (!op.recipient) return false;
  const recipients = Array.isArray(op.recipient) ? op.recipient : [op.recipient];
  return recipients.every(r => r.amount !== undefined || r.percentage !== undefined);
}

function validateRecipient(recipient: any): string[] {
  const errors: string[] = [];
  const recipients = Array.isArray(recipient) ? recipient : [recipient];

  for (const r of recipients) {
    const identifiers = [r.username, r.ensName, r.evmAddress, r.solanaAddress].filter(Boolean);
    if (identifiers.length === 0) {
      errors.push('Recipient has no identifier (username, ENS, or address)');
    }

    // Validate EVM address format
    if (r.evmAddress && !/^0x[a-fA-F0-9]{40}$/.test(r.evmAddress)) {
      errors.push(`Invalid EVM address format: ${r.evmAddress}`);
    }

    // Validate username doesn't contain @
    if (r.username && r.username.startsWith('@')) {
      errors.push(`Username should not start with @: ${r.username}`);
    }

    // Validate ENS format
    if (r.ensName && !r.ensName.includes('.')) {
      errors.push(`Invalid ENS name format: ${r.ensName}`);
    }
  }

  return errors;
}

// ============================================================
// Usage Example
// ============================================================

/*
// After Call 2 extraction and initial validation:
const extractedOps = validateExtractedOperations(llmOutput, validTypes, userId);

for (const op of extractedOps.operations) {
  // Check completeness
  if (!isOperationComplete(op)) {
    const missing = getMissingFields(op);
    // Ask user for missing info instead of executing
    return promptUser(`I need a few more details: ${missing.join(', ')}`);
  }

  // Check business rules
  const ruleErrors = validateBusinessRules(op);
  if (ruleErrors.length > 0) {
    return rejectOperation(`Invalid operation: ${ruleErrors.join('. ')}`);
  }

  // Operation is complete and valid — proceed to rate limiting, then execution
}
*/
