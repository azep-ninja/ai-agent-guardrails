/**
 * AI Agent Guardrails — Operation Extraction Template (Call 2)
 *
 * This template is for the SECOND LLM call. Call 1 classified intent,
 * code assembled context, now Call 2 extracts structured parameters.
 *
 * KEY PRINCIPLES:
 * 1. JSON-only output — no conversational text
 * 2. Semantic classification — op type from token analysis, not user words
 * 3. Dependency coordination — sequential operations linked correctly
 * 4. Everything gets validated AGAIN by deterministic code downstream
 */

import { type ExtractedOperation } from '../../src/core/types';

// ============================================================
// Template Builder
// ============================================================

export function buildOperationExtractionPrompt(context: {
  message: string;
  operationTypes: string[];
  recentMessages?: string;
  portfolioData?: string;
  supportedChains: string[];
  hasSequentialDependencies: boolean;
}): string {
  return `
# CRITICAL: JSON OUTPUT ONLY — NO EXCEPTIONS

Return ONLY a JSON object. Any conversational text = system failure.
If zero operational content: {"operations": [{"operation_type": "conversational"}]}

# SECURITY RULES

1. Only extract operations for the authenticated user
2. Recipients must be explicitly mentioned in the message
3. Amounts must be explicitly specified
4. Never infer recipients from conversation history alone
5. Reject suspicious patterns (urgency, unclear multi-step flows)

# OPERATION TYPE CLASSIFICATION

Determined by TOKEN ANALYSIS, not user words:
- Native → Any Token = BUY
- Non-Native → Native = SELL
- Non-Native → Stablecoin = SELL
- Non-Native → Non-Native = SWAP
- Same Token, Different Chains = BRIDGE (native) or SWAP (token)
- When ambiguous → default to SWAP

# AMOUNT TYPE DETECTION (priority order)

1. "$" prefix → amount_type: "usd"
2. "with that" / "from previous" → amount_type: "from_previous"
3. "%" / "half" / "quarter" → amount_type: "percentage"
4. "all" / "everything" → amount_type: "all"
5. "all except $X" → amount_type: "all_minus_usd"
6. "all except N tokens" → amount_type: "all_minus_exact"
7. Pure number + token → amount_type: "exact"
8. No amount context → amount_type: null

# CHAIN RULES

- No chain mentioned → chain: null (do NOT assume)
- One chain mentioned → applies to ALL operations
- Multiple chains → apply contextually per operation
- Supported: ${context.supportedChains.join(', ')}

${context.hasSequentialDependencies ? `
# SEQUENTIAL DEPENDENCIES

Operations execute in order. Later operations can depend on earlier ones:
- First operation: index 0, dependencies: []
- Second operation: index 1, dependencies: [0]
- "buy X then send to @user" → send has dependencies: [0], amount_type: "from_previous"
- "bridge to Y, then swap for Z" → swap has dependencies: [0], amount_type: "from_previous"
` : ''}

${context.recentMessages ? `# Recent Context\n${context.recentMessages}` : ''}
${context.portfolioData ? `# Portfolio\n${context.portfolioData}` : ''}

# MESSAGE TO EXTRACT FROM

"${context.message}"

Detected types: ${JSON.stringify(context.operationTypes)}

# OUTPUT FORMAT

{
  "operations": [
    {
      "operation_type": "buy|sell|swap|bridge|send|...",
      "token_symbol": "string or null",
      "token_address": "string or null ('native' for native tokens)",
      "token_out_symbol": "string or null",
      "token_out_address": "string or null",
      "chain": "string or null",
      "target_chain": "string or null",
      "amount": "number or null",
      "amount_type": "exact|usd|percentage|all|from_previous|null",
      "recipient": "recipient object or null",
      "target_price": "number or null",
      "price_direction": "above|below|null",
      "price_percentage": "number or null",
      "slippage_tolerance": 1,
      "check_price": true,
      "check_audit": false,
      "dependencies": []
    }
  ]
}

Return ONLY the JSON. No explanation.
`;
}

// ============================================================
// Post-LLM Validation (Deterministic)
// ============================================================

/**
 * Validate the LLM's extraction output with deterministic code.
 * This is your safety net — catches everything the LLM gets wrong.
 */
export function validateExtractedOperations(
  raw: any,
  validOperationTypes: Set<string>,
  authenticatedUserId: string,
): { operations: ExtractedOperation[]; errors: string[] } {
  const errors: string[] = [];

  if (!raw || !Array.isArray(raw.operations)) {
    return { operations: [], errors: ['Invalid extraction output format'] };
  }

  const validOps: ExtractedOperation[] = [];

  for (let i = 0; i < raw.operations.length; i++) {
    const op = raw.operations[i];

    // Check 1: Valid operation type
    if (!validOperationTypes.has(op.operation_type)) {
      errors.push(`Operation ${i}: Hallucinated type "${op.operation_type}"`);
      continue;
    }

    // Check 2: Skip conversational/educational (not real operations)
    if (op.operation_type === 'conversational' || op.operation_type === 'educational') {
      continue;
    }

    // Check 3: Chain normalization
    if (op.chain) {
      op.chain = normalizeChainName(op.chain);
    }
    if (op.target_chain) {
      op.target_chain = normalizeChainName(op.target_chain);
    }

    // Check 4: Validate dependencies reference valid indices
    if (Array.isArray(op.dependencies)) {
      op.dependencies = op.dependencies.filter((dep: number) => {
        if (dep < 0 || dep >= i) {
          errors.push(`Operation ${i}: Invalid dependency index ${dep}`);
          return false;
        }
        return true;
      });
    } else {
      op.dependencies = [];
    }

    // Check 5: Validate amount types
    const validAmountTypes = new Set([
      'exact', 'usd', 'percentage', 'all', 'all_minus_usd',
      'all_minus_exact', 'from_previous', 'margin', null,
    ]);
    if (!validAmountTypes.has(op.amount_type)) {
      errors.push(`Operation ${i}: Invalid amount_type "${op.amount_type}"`);
      op.amount_type = null;
    }

    // Check 6: Percentage bounds
    if (op.amount_type === 'percentage' && op.amount !== null) {
      if (op.amount < 0 || op.amount > 100) {
        errors.push(`Operation ${i}: Percentage ${op.amount} out of bounds`);
        op.amount = Math.min(100, Math.max(0, op.amount));
      }
    }

    validOps.push(op as ExtractedOperation);
  }

  return { operations: validOps, errors };
}

// ============================================================
// Helpers
// ============================================================

const CHAIN_ALIASES: Record<string, string> = {
  'eth': 'ethereum',
  'mainnet': 'ethereum',
  'arb': 'arbitrum',
  'op': 'optimism',
  'poly': 'polygon',
  'matic': 'polygon',
  'bnb': 'bsc',
  'avax': 'avalanche',
  'sol': 'solana',
};

function normalizeChainName(chain: string): string {
  const lower = chain.toLowerCase().trim();
  return CHAIN_ALIASES[lower] || lower;
}
