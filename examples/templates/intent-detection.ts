/**
 * AI Agent Guardrails — Intent Detection Template (Call 1)
 *
 * This template is for the FIRST LLM call in the two-call architecture.
 * Its job is ONLY to classify the user's intent — NOT to extract operation parameters.
 *
 * KEY PRINCIPLES:
 * 1. When in doubt, return LESS not MORE
 * 2. Unknown operation → operationTypes: []
 * 3. Ambiguous intent → messageType: "conversational"
 * 4. Partial data without action words → isIncomplete: true
 * 5. Action words are your friend — no action words = probably not operational
 *
 * ADAPT THIS TO YOUR AGENT:
 * - Replace the operation types with YOUR valid operations
 * - Replace the action words with YOUR domain's action vocabulary
 * - Replace the context flags with what YOUR Call 2 needs
 * - Keep the structural patterns (safe defaults, hallucination checks, etc.)
 */

import { VALID_OPERATION_TYPES, type IntentDetectionResult } from '../../src/core/types';

// ============================================================
// The Template
// ============================================================

/**
 * Build the intent detection prompt for Call 1.
 *
 * This is a TEMPLATE BUILDER, not the raw prompt string.
 * Using a builder lets you inject dynamic context (pending operations,
 * recent messages, etc.) while keeping the core instructions stable.
 */
export function buildIntentDetectionPrompt(context: {
  message: string;
  userId: string;
  platform: string;
  validOperationTypes: string[];
  pendingOperations?: string | null;
  recentMessages?: string | null;
  hasRecentOperations?: boolean;
}): string {
  const {
    message,
    userId,
    platform,
    validOperationTypes,
    pendingOperations,
    recentMessages,
    hasRecentOperations,
  } = context;

  return `
# ROLE: Intent Detection System

You are an intent detection system for a financial AI agent.
Your ONLY job is to classify what the user wants. Do NOT extract parameters — that happens later.

# HALLUCINATION PREVENTION

These are the ONLY valid operation types:
${validOperationTypes.join(', ')}

CRITICAL RULES:
1. If an operation type is NOT in the list above → It's a hallucination, remove it
2. Educational phrases are NOT operations: "tell how to", "explain", "show me how"
3. Operations MUST match user's action verbs from their message
4. When in doubt, return LESS not MORE

# SAFE DEFAULTS

- Unknown operation type → operationTypes: []
- Ambiguous intent → messageType: "conversational"
- Partial data without action words → isIncomplete: true
- Let the next processing step handle clarification with user

# INPUT

Message: "${message}"
Platform: ${platform}
User ID: ${userId}

${recentMessages ? `# Recent Conversation Context\n${recentMessages}\n` : ''}

${pendingOperations
  ? `# Pending Operations (continuation IS possible)\n${pendingOperations}\n`
  : `# NO Pending Operations (continuation is NOT possible)\nisContinuation MUST be false\n`
}

# STEP 1: SCAN FOR ACTION WORDS

Scan the ENTIRE message for operational intent:

Action words (ANY ONE = operational intent detected):
- Trading: buy, sell, send, swap, bridge, transfer
- Management: check, claim, close, cancel, stop
- Financial: bet, wager, stake, lend, deposit, withdraw
- Creation: launch, deploy, create, mint

Financial patterns:
- Amount + "on" + target: "$2 on ohio state"
- Amount + token + recipient: "100 USDC to @friend"

Store result: OPERATIONAL_INTENT = true/false

# STEP 2: CLASSIFY MESSAGE TYPE

If OPERATIONAL_INTENT = true → messageType: "operational" (NO EXCEPTIONS)
  - Educational language in same message does NOT change this
  - "buy ETH and explain what DCA is" → OPERATIONAL (buy is the action)

If OPERATIONAL_INTENT = false → Check for educational patterns:
  - "How does X work?" → "educational"
  - "Can you help me trade?" → "educational"
  - "What is DCA?" → "educational"

If neither → "conversational"

# STEP 3: DETECT OPERATION TYPES

Only if messageType is "operational":
- Map action words to valid operation types
- "buy $50 of ETH" → ["buy"]
- "send 100 USDC to @friend" → ["send"]
- "buy ETH then send to @friend" → ["buy", "send"]

# STEP 4: CONTINUATION CHECK

${pendingOperations
  ? `Pending operations exist. Check if message provides missing info.
     If message ONLY provides completion data → isContinuation: true`
  : `NO pending operations exist.
     isContinuation MUST be false.
     Partial data = isIncomplete: true (new incomplete operation)`
}

# STEP 5: CONTEXT FLAGS

Determine what data Call 2 will need:
- needsPortfolio: true if "all my tokens", "everything", "portfolio"
- needsRecent: true if "it", "that", "those" (reference to past ops)
- needsCrossChain: true if multiple chains mentioned
- needsTokenPrice: true if price query detected
- needsTokenSafety: true if "is this safe", "scan", "audit"
${pendingOperations ? '- needsPending: true if continuing pending ops' : '- needsPending: false (no pending ops)'}

# FINAL HALLUCINATION CHECK

For EACH operation in your output:
1. Is it in the valid list? NO → Remove it
2. Does it contain: explain, inform, tell, show, help? YES → Remove it (not an operation)

# OUTPUT FORMAT

Return ONLY valid JSON:

{
  "operationTypes": [],
  "messageType": "operational" | "educational" | "conversational" | "reference" | "continuation",
  "complexity": "simple" | "complex",
  "isContinuation": boolean,
  "isIncomplete": boolean,
  "isRetry": boolean,
  "needsPortfolio": boolean,
  "needsTrending": boolean,
  "needsRecent": boolean,
  "needsPending": boolean,
  "needsCrossChain": boolean,
  "needsNativeHandling": boolean,
  "needsTokenPrice": boolean,
  "needsTokenSafety": boolean,
  "targetToken": string | null,
  "targetTokenAddress": string | null,
  "targetChain": string | null,
  "hasAmountAmbiguity": boolean,
  "hasRecipientComplexity": boolean,
  "hasSequentialDependencies": boolean
}

Return ONLY the JSON. No explanation. No markdown.
`;
}

// ============================================================
// Post-LLM Validation (Deterministic)
// ============================================================

/**
 * After the LLM returns its classification, validate it
 * with deterministic code. This catches hallucinations
 * and enforces rules the LLM might have missed.
 *
 * THIS IS THE KEY PATTERN: LLM classifies, CODE validates.
 */
export function validateIntentDetection(
  raw: any,
  hasPendingOperations: boolean,
): IntentDetectionResult {
  // Default safe result
  const safe: IntentDetectionResult = {
    operationTypes: [],
    messageType: 'conversational',
    complexity: 'simple',
    isContinuation: false,
    isIncomplete: false,
    isRetry: false,
    needsPortfolio: false,
    needsTrending: false,
    needsRecent: false,
    needsPending: false,
    needsCrossChain: false,
    needsNativeHandling: false,
    needsTokenPrice: false,
    needsTokenSafety: false,
    targetToken: null,
    targetTokenAddress: null,
    targetChain: null,
    hasAmountAmbiguity: false,
    hasRecipientComplexity: false,
    hasSequentialDependencies: false,
  };

  if (!raw || typeof raw !== 'object') {
    console.warn('Intent detection returned invalid output, using safe defaults');
    return safe;
  }

  // 1. Filter out hallucinated operation types
  const validOps = new Set(VALID_OPERATION_TYPES as readonly string[]);
  const filteredOps = (raw.operationTypes || []).filter(
    (op: string) => validOps.has(op)
  );

  // 2. Enforce continuation rules
  let isContinuation = raw.isContinuation === true;
  if (!hasPendingOperations && isContinuation) {
    // Can't continue what doesn't exist
    isContinuation = false;
    console.warn('LLM said isContinuation=true but no pending operations exist. Overriding to false.');
  }

  // 3. Enforce message type consistency
  let messageType = raw.messageType || 'conversational';
  if (filteredOps.length > 0 && messageType === 'educational') {
    // If we have valid operations, it's operational
    messageType = 'operational';
  }
  if (filteredOps.length === 0 && messageType === 'operational' && !raw.isIncomplete) {
    // No operations detected but classified as operational — downgrade
    messageType = 'conversational';
  }

  return {
    ...safe,
    operationTypes: filteredOps,
    messageType,
    complexity: raw.complexity === 'complex' ? 'complex' : 'simple',
    isContinuation,
    isIncomplete: raw.isIncomplete === true,
    isRetry: raw.isRetry === true,
    needsPortfolio: raw.needsPortfolio === true,
    needsTrending: raw.needsTrending === true,
    needsRecent: raw.needsRecent === true,
    needsPending: isContinuation || raw.needsPending === true,
    needsCrossChain: raw.needsCrossChain === true,
    needsNativeHandling: raw.needsNativeHandling === true,
    needsTokenPrice: raw.needsTokenPrice === true,
    needsTokenSafety: raw.needsTokenSafety === true,
    targetToken: raw.targetToken || null,
    targetTokenAddress: raw.targetTokenAddress || null,
    targetChain: raw.targetChain || null,
    hasAmountAmbiguity: raw.hasAmountAmbiguity === true,
    hasRecipientComplexity: raw.hasRecipientComplexity === true,
    hasSequentialDependencies: raw.hasSequentialDependencies === true,
  };
}

// ============================================================
// Usage Example
// ============================================================

/*
async function processUserMessage(message: string, userId: string) {
  // Step 1: Build the prompt with current context
  const prompt = buildIntentDetectionPrompt({
    message,
    userId,
    platform: 'telegram',
    validOperationTypes: [...VALID_OPERATION_TYPES],
    pendingOperations: await getPendingOps(userId),
    recentMessages: await getRecentMessages(userId),
  });

  // Step 2: Call your LLM (any provider works)
  const llmResponse = await callLLM(prompt);
  const parsed = JSON.parse(llmResponse);

  // Step 3: VALIDATE with deterministic code
  const hasPending = await hasPendingOperations(userId);
  const validated = validateIntentDetection(parsed, hasPending);

  // Step 4: Use the validated result to assemble context for Call 2
  const contextForCall2 = await assembleContext(validated);

  // Step 5: Call 2 — operation extraction with assembled context
  // ... (see operation-extraction.ts)
}
*/
