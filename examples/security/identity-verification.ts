/**
 * AI Agent Guardrails — User Identity Verification
 * THE MOST CRITICAL GUARDRAIL. Must be code, never LLM-driven.
 */

export interface AuthenticatedContext {
  userId: string;
  platform: string;
  platformSenderId: string;
  isVerified: boolean;
}

export interface IdentityCheckResult {
  authorized: boolean;
  reason?: string;
  isSuspicious: boolean;
}

/**
 * Verify operation belongs to authenticated user.
 * Runs AFTER LLM extraction, BEFORE execution. No prompt can bypass this.
 */
export function verifyOperationIdentity(
  operation: { user_id?: string; recipient?: any },
  auth: AuthenticatedContext,
): IdentityCheckResult {
  if (operation.user_id && operation.user_id !== auth.userId) {
    return {
      authorized: false,
      reason: 'Operation user_id does not match authenticated user',
      isSuspicious: true,
    };
  }
  return { authorized: true, isSuspicious: false };
}

/**
 * Resolve authenticated user from platform context.
 * Uses YOUR auth system, never LLM parsing.
 */
export async function resolveAuthenticatedUser(
  platformContext: { platform: string; senderId: string },
  lookupUser: (platform: string, platformId: string) => Promise<string | null>,
): Promise<AuthenticatedContext | null> {
  const userId = await lookupUser(platformContext.platform, platformContext.senderId);
  if (!userId) return null;
  return {
    userId,
    platform: platformContext.platform,
    platformSenderId: platformContext.senderId,
    isVerified: true,
  };
}

/**
 * Detect impersonation attempts in user messages.
 * Defense in depth — LLM template also has anti-impersonation rules,
 * but this code layer catches what the LLM might miss.
 */
export function detectImpersonation(message: string): { isAttempt: boolean; pattern?: string } {
  const patterns: Array<{ regex: RegExp; description: string }> = [
    { regex: /i(?:'m| am) (?:actually |really )?(?:user|account|admin)/i, description: 'Identity claim' },
    { regex: /(?:acting|operating) (?:on behalf|as representative) of/i, description: 'Proxy claim' },
    { regex: /(?:execute|run|do) (?:this|it) (?:for|as) @?\w+/i, description: 'Delegated execution' },
    { regex: /(?:emergency|urgent).{0,30}(?:send|transfer|move)/i, description: 'Urgency pressure' },
    { regex: /ignore (?:previous|prior|above) (?:instructions|rules)/i, description: 'Instruction override' },
    { regex: /(?:you are|act as|pretend|roleplay|behave like)/i, description: 'Role override' },
  ];

  for (const { regex, description } of patterns) {
    if (regex.test(message)) return { isAttempt: true, pattern: description };
  }
  return { isAttempt: false };
}
