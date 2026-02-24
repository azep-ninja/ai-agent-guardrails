---
name: ai-agent-guardrails
description: Safety patterns and guardrails for AI agents that handle financial transactions. Covers prompt injection prevention, operation validation, identity verification, rate limiting, hallucination prevention, and platform-specific safety.
version: 1.0.0
metadata:
  openclaw:
    homepage: https://github.com/azep-ninja/ai-agent-guardrails
---

# AI Agent Guardrails

Safety patterns for AI agents that handle financial transactions. Framework-agnostic TypeScript examples from production systems across 24+ chains.

## Core Principle

LLMs understand language. Code enforces rules. Never confuse the two. LLMs detect intent. Deterministic code validates, authorizes, and executes.

## Three-Layer Architecture

* **Layer 1 — LLM Intelligence**: Intent detection, classification, context resolution, conversational interaction
* **Layer 2 — Deterministic Validation**: Operation completeness, identity verification, rate limiting, business rules. No LLM. Can't be prompt-injected.
* **Layer 3 — Execution Safety**: Deduplication, platform restrictions, transaction simulation. No LLM.

## Two-Call LLM Pattern

* **Call 1 (Detection)**: Classify intent → operational / educational / conversational. Detect operation types. Flag context needs.
* **Code (between calls)**: Validate Call 1 output against operation whitelist. Assemble only needed context.
* **Call 2 (Extraction)**: Extract structured parameters (amounts, tokens, chains, recipients) from focused prompt.
* **Code (after Call 2)**: Validate completeness, identity, rate limits, business rules. Execute only if ALL pass.

## Key Files

| File | Purpose |
|------|---------|
| `README.md` | Complete guide with all 8 architecture patterns |
| `llms.txt` | LLM-optimized summary of framework |
| `src/core/types.ts` | Shared type definitions — start here |
| `examples/templates/intent-detection.ts` | Call 1 template + post-LLM validation |
| `examples/templates/operation-extraction.ts` | Call 2 template + extraction validation |
| `examples/validation/operation-completeness.ts` | Required field validation per operation type |
| `examples/validation/hallucination-prevention.ts` | Detecting hallucinated LLM output |
| `examples/rate-limiting/operation-rate-limiter.ts` | Tiered rate limiting (global, per-type, value-based) |
| `examples/security/identity-verification.ts` | User identity checks + impersonation detection |
| `examples/security/pending-operations.ts` | Duplicate operation prevention |
| `examples/security/prompt-hardening.ts` | LLM prompt security + anti-manipulation |
| `examples/security/platform-restrictions.ts` | Platform-specific operation restrictions |
| `examples/middleware/guardrail-pipeline.ts` | Full pipeline — all layers working together |
| `docs/ARCHITECTURE.md` | Deep dive on three-layer architecture |
| `docs/THREAT-MODEL.md` | 10 attack categories with mitigations |
| `docs/LLM-PERSPECTIVE.md` | Insights from the LLM side — failure modes and why |

## Implementation Order

1. Define operation types and required fields → `examples/validation/operation-completeness.ts`
2. Add identity verification → `examples/security/identity-verification.ts`
3. Implement rate limiting → `examples/rate-limiting/operation-rate-limiter.ts`
4. Add security guardrails to LLM prompts → `examples/security/prompt-hardening.ts`
5. Implement two-call detection/extraction → `examples/templates/`
6. Add hallucination prevention → `examples/validation/hallucination-prevention.ts`
7. Add deduplication + platform restrictions → `examples/security/`
8. Wire together → `examples/middleware/guardrail-pipeline.ts`

## Adapting to Your Agent

* **Operation types**: Replace `VALID_OPERATION_TYPES` in `src/core/types.ts` with your operations
* **Chains**: Replace chain mappings and native token definitions with your supported networks
* **ElizaOS**: Map two-call pattern to action handlers. Validation in `validate()` method.
* **LangChain**: Custom chain with validation nodes between LLM calls
* **Python**: Same patterns, use Pydantic for types
* **Any framework**: Patterns are architecture, not library code. Adapt the structure.

## Quick Reference

| Situation | Pattern |
|-----------|---------|
| LLM hallucinating operation types | Whitelist valid types in code, validate after every call |
| Prompt injection via token names/posts | Prompt hardening + code validation (never trust LLM alone) |
| User impersonation on social platforms | Identity check in code: `operation.user_id === authenticatedUserId` |
| Duplicate/rapid-fire transactions | Pending operation deduplication + rate limiting |
| Missing fields (buy without amount) | Required field validation per operation type |
| Wrong operation type ("buy" is actually swap) | Semantic classification by token analysis, not user words |
| Agent on public platform (Twitter) | Platform-specific operation blocking and confirmation rules |
| Sequential operations (buy then send) | Dependency chain validation with `from_previous` amount types |

## Notes

* All validation must be deterministic code — never LLM-driven
* Safe defaults: when uncertain, return LESS not MORE, classify as conversational
* Treat LLM output as untrusted input — validate everything in code
* Temperature 0 for financial operations — deterministic output, not creative
* Start with conservative rate limits, loosen based on data