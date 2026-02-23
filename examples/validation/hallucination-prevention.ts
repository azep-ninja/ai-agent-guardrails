/**
 * AI Agent Guardrails — Hallucination Prevention
 *
 * LLMs hallucinate. Especially small models used for speed.
 * This module catches hallucinated operation types, invalid field values,
 * and structurally impossible outputs before they reach execution.
 *
 * DEFENSE IN DEPTH:
 * 1. Prompt-level: Tell the LLM the valid types, ask it to self-check
 * 2. Code-level: THIS FILE validates LLM output against truth
 * 3. Execution-level: Final checks before funds move
 *
 * The prompt helps. The code enforces.
 */

import { VALID_OPERATION_SET } from '../../src/core/types';

// ============================================================
// LLM Output Validation
// ============================================================

export interface HallucinationCheckResult {
  valid: boolean;
  cleaned: any;
  hallucinations: string[];
  warnings: string[];
}

/**
 * Validate raw LLM output for hallucinated content.
 * Run this BEFORE any other validation.
 */
export function checkForHallucinations(
  rawOutput: any,
  validOperationTypes: Set<string> = VALID_OPERATION_SET,
): HallucinationCheckResult {
  const hallucinations: string[] = [];
  const warnings: string[] = [];

  // Check 1: Is it even valid JSON structure?
  if (!rawOutput || typeof rawOutput !== 'object') {
    return {
      valid: false,
      cleaned: { operations: [] },
      hallucinations: ['LLM output is not a valid JSON object'],
      warnings: [],
    };
  }

  // Check 2: Does it have an operations array?
  if (!Array.isArray(rawOutput.operations)) {
    return {
      valid: false,
      cleaned: { operations: [] },
      hallucinations: ['LLM output missing "operations" array'],
      warnings: [],
    };
  }

  // Check 3: Validate each operation
  const cleanedOps = [];

  for (let i = 0; i < rawOutput.operations.length; i++) {
    const op = rawOutput.operations[i];

    // 3a: Check operation_type exists and is valid
    if (!op.operation_type) {
      hallucinations.push(`Operation ${i}: Missing operation_type`);
      continue;
    }

    if (!validOperationTypes.has(op.operation_type)) {
      hallucinations.push(
        `Operation ${i}: Hallucinated type "${op.operation_type}" — not in valid list`
      );
      continue;
    }

    // 3b: Check for educational/informational words in operation type
    // Common hallucination: LLM creates types like "wallet_access_explanation"
    const educationalWords = [
      'explain', 'inform', 'tell', 'show', 'help',
      'access', 'tutorial', 'guide', 'learn', 'teach',
      'description', 'overview', 'summary',
    ];
    const opTypeLower = op.operation_type.toLowerCase();
    for (const word of educationalWords) {
      if (opTypeLower.includes(word)) {
        hallucinations.push(
          `Operation ${i}: Type "${op.operation_type}" contains educational word "${word}"`
        );
        continue;
      }
    }

    // 3c: Check for impossible field combinations
    const fieldIssues = checkFieldConsistency(op, i);
    hallucinations.push(...fieldIssues.hallucinations);
    warnings.push(...fieldIssues.warnings);

    if (fieldIssues.hallucinations.length === 0) {
      cleanedOps.push(op);
    }
  }

  return {
    valid: hallucinations.length === 0,
    cleaned: { ...rawOutput, operations: cleanedOps },
    hallucinations,
    warnings,
  };
}

// ============================================================
// Field Consistency Checks
// ============================================================

function checkFieldConsistency(
  op: any,
  index: number,
): { hallucinations: string[]; warnings: string[] } {
  const hallucinations: string[] = [];
  const warnings: string[] = [];

  // Check: from_previous without dependencies
  if (op.amount_type === 'from_previous') {
    if (!Array.isArray(op.dependencies) || op.dependencies.length === 0) {
      warnings.push(
        `Operation ${index}: amount_type is "from_previous" but no dependencies set`
      );
    }
  }

  // Check: Bridge needs different chains
  if (op.operation_type === 'bridge') {
    if (op.chain && op.target_chain && op.chain === op.target_chain) {
      hallucinations.push(
        `Operation ${index}: Bridge with same source and target chain "${op.chain}"`
      );
    }
  }

  // Check: Dependencies reference future operations (impossible)
  if (Array.isArray(op.dependencies)) {
    for (const dep of op.dependencies) {
      if (typeof dep !== 'number' || dep < 0 || dep >= index) {
        hallucinations.push(
          `Operation ${index}: Dependency ${dep} references invalid/future operation`
        );
      }
    }
  }

  // Check: Amount is a valid number when present
  if (op.amount !== null && op.amount !== undefined) {
    if (typeof op.amount !== 'number' || isNaN(op.amount)) {
      hallucinations.push(
        `Operation ${index}: Amount "${op.amount}" is not a valid number`
      );
    }
    if (op.amount < 0) {
      hallucinations.push(
        `Operation ${index}: Negative amount ${op.amount}`
      );
    }
  }

  // Check: Percentage is within bounds
  if (op.amount_type === 'percentage' && typeof op.amount === 'number') {
    if (op.amount < 0 || op.amount > 100) {
      warnings.push(
        `Operation ${index}: Percentage ${op.amount}% outside 0-100 range`
      );
    }
  }

  // Check: Slippage is reasonable
  if (typeof op.slippage_tolerance === 'number') {
    if (op.slippage_tolerance < 0 || op.slippage_tolerance > 50) {
      warnings.push(
        `Operation ${index}: Unusual slippage tolerance ${op.slippage_tolerance}%`
      );
    }
  }

  return { hallucinations, warnings };
}

// ============================================================
// JSON Parsing with Hallucination Recovery
// ============================================================

/**
 * Parse LLM output, handling common formatting issues.
 * LLMs sometimes wrap JSON in markdown code blocks,
 * add explanatory text before/after, or produce invalid JSON.
 */
export function safeParseLLMOutput(rawText: string): {
  parsed: any | null;
  error: string | null;
} {
  // Strip markdown code blocks
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');

  // Try to find JSON object in the text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { parsed: null, error: 'No JSON object found in LLM output' };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return { parsed, error: null };
  } catch (e) {
    return {
      parsed: null,
      error: `JSON parse error: ${e instanceof Error ? e.message : 'Unknown error'}`,
    };
  }
}

// ============================================================
// Usage Example
// ============================================================

/*
async function processLLMOutput(rawResponse: string) {
  // Step 1: Parse the raw text
  const { parsed, error } = safeParseLLMOutput(rawResponse);
  if (error) {
    console.error('Failed to parse LLM output:', error);
    return fallbackToConversational();
  }

  // Step 2: Check for hallucinations
  const check = checkForHallucinations(parsed);
  if (check.hallucinations.length > 0) {
    console.warn('Hallucinations detected:', check.hallucinations);
    // Use cleaned output (hallucinated ops removed)
  }
  if (check.warnings.length > 0) {
    console.info('Warnings:', check.warnings);
  }

  // Step 3: Continue with cleaned output
  return processValidatedOperations(check.cleaned);
}
*/