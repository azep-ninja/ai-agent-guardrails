/**
 * AI Agent Guardrails — Platform-Specific Safety Restrictions
 *
 * Different platforms have different attack surfaces.
 * Public tweets vs DMs vs API calls need different safety levels.
 *
 * ADAPT: Define restrictions for YOUR platforms and operation types.
 */

import { type OperationType } from '../../src/core/types';

// ============================================================
// Platform Rules Definition
// ============================================================

export interface PlatformRules {
  /** Operations completely blocked on this platform */
  blockedOperations: OperationType[];
  /** Operations requiring explicit user confirmation */
  requireConfirmation: OperationType[];
  /** Maximum response length (e.g., Twitter's 280 chars) */
  maxResponseLength?: number;
  /** Whether financial ops are blocked in group contexts */
  blockFinancialOpsInGroups: boolean;
  /** Per-platform rate limit overrides */
  rateLimitOverrides?: {
    maxOperationsPerMinute?: number;
    maxSingleTransactionUsd?: number;
  };
}

const PLATFORM_RULES: Record<string, PlatformRules> = {
  twitter: {
    // Public platform — restrict high-risk operations
    blockedOperations: ['perp_long', 'perp_short', 'perp_deposit'],
    requireConfirmation: ['send', 'bridge'],
    maxResponseLength: 280,
    blockFinancialOpsInGroups: false, // Twitter doesn't have groups
    rateLimitOverrides: {
      maxOperationsPerMinute: 5,
    },
  },

  telegram: {
    blockedOperations: [],
    requireConfirmation: ['send'],
    blockFinancialOpsInGroups: true, // Block financial ops in group chats
    rateLimitOverrides: {
      maxOperationsPerMinute: 8,
    },
  },

  discord: {
    blockedOperations: [],
    requireConfirmation: ['send', 'bridge'],
    blockFinancialOpsInGroups: true,
  },

  farcaster: {
    blockedOperations: ['perp_long', 'perp_short'],
    requireConfirmation: ['send'],
    maxResponseLength: 1024,
    blockFinancialOpsInGroups: false,
  },

  web: {
    // Web/app UI — fewest restrictions (authenticated session)
    blockedOperations: [],
    requireConfirmation: [],
    blockFinancialOpsInGroups: false,
  },

  api: {
    // Direct API — authenticated, fewest restrictions
    blockedOperations: [],
    requireConfirmation: [],
    blockFinancialOpsInGroups: false,
    rateLimitOverrides: {
      maxOperationsPerMinute: 30,
    },
  },
};

// ============================================================
// Financial Operation Detection
// ============================================================

const FINANCIAL_OPERATIONS: Set<string> = new Set([
  'buy', 'sell', 'swap', 'bridge', 'send', 'burn',
  'limit_buy', 'limit_sell',
  'perp_long', 'perp_short', 'perp_deposit', 'perp_withdraw',
  'prediction_market_buy', 'prediction_market_sell',
  'yield_deposit', 'yield_withdraw',
  'dca_buy', 'dca_sell',
  'token_launch',
  'portfolio_stable', 'portfolio_sell',
]);

// ============================================================
// Platform Check Functions
// ============================================================

export interface PlatformCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

/**
 * Check if an operation is allowed on the current platform.
 */
export function checkPlatformRestrictions(
  platform: string,
  operationType: OperationType,
  isGroupContext: boolean = false,
): PlatformCheckResult {
  const rules = PLATFORM_RULES[platform];

  if (!rules) {
    // Unknown platform — apply conservative defaults
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationMessage: `Unknown platform "${platform}" — please confirm this operation`,
    };
  }

  // Check 1: Is this operation blocked on this platform?
  if (rules.blockedOperations.includes(operationType)) {
    return {
      allowed: false,
      reason: `${operationType} operations are not available on ${platform}`,
      requiresConfirmation: false,
    };
  }

  // Check 2: Is this a financial op in a group context?
  if (isGroupContext && rules.blockFinancialOpsInGroups && FINANCIAL_OPERATIONS.has(operationType)) {
    return {
      allowed: false,
      reason: `Financial operations are not available in group chats on ${platform}. Please use a direct message.`,
      requiresConfirmation: false,
    };
  }

  // Check 3: Does this operation require confirmation?
  if (rules.requireConfirmation.includes(operationType)) {
    return {
      allowed: true,
      requiresConfirmation: true,
      confirmationMessage: `Please confirm you want to execute this ${operationType} operation`,
    };
  }

  return { allowed: true, requiresConfirmation: false };
}

/**
 * Get platform-specific rate limit overrides.
 */
export function getPlatformRateLimits(platform: string): PlatformRules['rateLimitOverrides'] {
  return PLATFORM_RULES[platform]?.rateLimitOverrides;
}
