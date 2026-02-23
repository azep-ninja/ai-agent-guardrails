/**
 * AI Agent Guardrails — Core Type Definitions
 *
 * These types define the shared contracts between the LLM layer,
 * the validation layer, and the execution layer.
 *
 * Adapt these to your specific agent's operation types and fields.
 */

// ============================================================
// Operation Types
// ============================================================

/**
 * All valid operation types your agent supports.
 * This is the SINGLE SOURCE OF TRUTH — used by both
 * LLM templates (as a constraint) and validation code (as a check).
 *
 * If an operation type isn't in this list, it doesn't exist.
 */
export const VALID_OPERATION_TYPES = [
  // Trading
  'buy',
  'sell',
  'swap',
  'bridge',
  'wrap',
  'unwrap',
  'burn',

  // Limit Orders
  'limit_buy',
  'limit_sell',

  // Sends & Transfers
  'send',
  'nft_send',

  // DCA (Dollar Cost Averaging)
  'dca_buy',
  'dca_sell',
  'dca_status',

  // Perpetual Trading
  'perp_long',
  'perp_short',
  'perp_deposit',
  'perp_withdraw',
  'perp_status',

  // Prediction Markets
  'prediction_market_buy',
  'prediction_market_sell',
  'prediction_market_status',

  // Yield / Staking
  'yield_deposit',
  'yield_withdraw',
  'yield_claim',
  'yield_status',

  // Portfolio
  'portfolio_stable',
  'portfolio_sell',
  'portfolio_dust',

  // Utility
  'balance',
  'token_scan',
  'fund',
  'token_launch',

  // Status / Info
  'status',
  'limit_order_status',

  // Non-operational (LLM classification)
  'conversational',
  'educational',
] as const;

export type OperationType = (typeof VALID_OPERATION_TYPES)[number];

export const VALID_OPERATION_SET = new Set<string>(VALID_OPERATION_TYPES);

// ============================================================
// Amount Types
// ============================================================

/**
 * How the user specified the amount for an operation.
 * This determines how downstream processing handles the value.
 */
export type AmountType =
  | 'exact'          // "5 ETH" — exact token amount
  | 'usd'            // "$100" — dollar value to convert
  | 'percentage'     // "50%" — percentage of holdings
  | 'all'            // "all my ETH" — entire balance
  | 'all_minus_usd'  // "all except $5" — everything minus USD reserve
  | 'all_minus_exact' // "all except 0.01 ETH" — everything minus token reserve
  | 'from_previous'  // "use that to buy..." — output from previous operation
  | 'margin'         // "5x leverage" — perpetual margin amount
  | null;            // Not applicable (e.g., balance queries)

// ============================================================
// Message Classification
// ============================================================

/**
 * Call 1 output: How the user's message was classified.
 */
export type MessageType =
  | 'operational'    // User wants to execute something
  | 'educational'    // User is asking how something works
  | 'conversational' // General chat, greetings, etc.
  | 'reference'      // Referring to previous operations
  | 'continuation';  // Completing a multi-message operation

// ============================================================
// Extracted Operation
// ============================================================

/**
 * The structured output from Call 2 (operation extraction).
 * This is what gets validated by the deterministic layer.
 */
export interface ExtractedOperation {
  operation_type: OperationType;

  // Token information
  token_symbol: string | null;
  token_address: string | null;
  token_out_symbol: string | null;
  token_out_address: string | null;

  // Chain information
  chain: string | null;
  target_chain: string | null;

  // Amount information
  amount: number | null;
  amount_type: AmountType;

  // Recipient (for send operations)
  recipient: Recipient | Recipient[] | null;

  // Limit order fields
  target_price: number | null;
  price_direction: 'above' | 'below' | null;
  price_percentage: number | null;

  // Sequential dependency
  dependencies: number[];

  // Safety checks
  slippage_tolerance: number;
  check_price: boolean;
  check_audit: boolean;

  // Metadata
  url: string | null;
  time_condition: string | null;
}

// ============================================================
// Recipient Types
// ============================================================

/**
 * Recipient information for send operations.
 * Only ONE primary identifier should be populated per recipient.
 */
export interface Recipient {
  username?: string;      // Social platform username (no @ symbol)
  ensName?: string;       // ENS domain (e.g., "vitalik.eth")
  evmAddress?: string;    // 0x... address
  solanaAddress?: string; // Base58 Solana address
  platform?: 'twitter' | 'farcaster' | 'email' | 'telegram';
  amount?: number;        // Per-recipient amount (multi-send)
  percentage?: number;    // Per-recipient percentage (multi-send)
}

// ============================================================
// Call 1 Output (Intent Detection)
// ============================================================

/**
 * What Call 1 returns. This drives context assembly
 * and determines which template Call 2 uses.
 */
export interface IntentDetectionResult {
  operationTypes: OperationType[];
  messageType: MessageType;
  complexity: 'simple' | 'complex';

  // Continuation / state
  isContinuation: boolean;
  isIncomplete: boolean;
  isRetry: boolean;

  // Context flags — what data does Call 2 need?
  needsPortfolio: boolean;
  needsTrending: boolean;
  needsRecent: boolean;
  needsPending: boolean;
  needsCrossChain: boolean;
  needsNativeHandling: boolean;
  needsTokenPrice: boolean;
  needsTokenSafety: boolean;

  // Target info detected
  targetToken: string | null;
  targetTokenAddress: string | null;
  targetChain: string | null;

  // Complexity flags
  hasAmountAmbiguity: boolean;
  hasRecipientComplexity: boolean;
  hasSequentialDependencies: boolean;
}

// ============================================================
// Validation Results
// ============================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  operation_index?: number;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// ============================================================
// Rate Limiting
// ============================================================

export interface RateLimitConfig {
  maxOperationsPerMinute: number;
  maxOperationsPerHour: number;
  maxOperationsPerDay: number;
  operationLimits: Partial<Record<OperationType, {
    perMinute?: number;
    perHour?: number;
    perDay?: number;
  }>>;
  maxSingleTransactionUsd: number;
  maxDailyVolumeUsd: number;
}

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
  currentUsage?: {
    minute: number;
    hour: number;
    day: number;
    dailyVolumeUsd: number;
  };
}

// ============================================================
// Pipeline Types
// ============================================================

/**
 * The full pipeline result after all layers have processed.
 */
export interface PipelineResult {
  // What the user wanted
  intent: IntentDetectionResult;

  // What was extracted
  operations: ExtractedOperation[];

  // Validation results
  validation: ValidationResult;

  // Rate limit check
  rateLimit: RateLimitCheck;

  // Final decision
  approved: boolean;
  rejectionReason?: string;

  // What needs user confirmation
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
}
