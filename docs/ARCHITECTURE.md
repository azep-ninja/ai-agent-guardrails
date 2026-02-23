# Architecture Deep Dive

## The Three-Layer Model

### Why Three Layers?

A single layer of defense is never enough when money is involved. Each layer catches different failure modes:

**Layer 1 (LLM Intelligence)** catches: misunderstood intent, wrong operation type, missing context.
**Layer 2 (Deterministic Validation)** catches: hallucinated fields, incomplete operations, identity mismatches, rate limit violations.
**Layer 3 (Execution Safety)** catches: duplicate transactions, platform-inappropriate operations, failed simulations.

### The Two-Call LLM Pattern in Detail

Most AI agent frameworks use a single LLM call to go from natural language to structured operation. This is fragile because the model is doing two fundamentally different tasks simultaneously:

1. **Classification** — What kind of request is this?
2. **Extraction** — What are the specific parameters?

When combined, the model often hallucinating parameters while classifying, or misclassifying while extracting. Splitting into two calls dramatically improves accuracy.

**Call 1 (Detection)** is given:
- The user's message
- The list of valid operation types (constraint)
- Pending operations context (can this be a continuation?)
- Recent conversation (for reference resolution)

Call 1 returns classification only: operation types, message type, context flags.

**Between calls**, deterministic code:
- Validates Call 1 output against the valid operation type list
- Assembles ONLY the context that Call 1 flagged as needed
- Enforces continuation rules (can't continue what doesn't exist)

**Call 2 (Extraction)** is given:
- The user's message
- The validated operation types from Call 1
- The assembled context (portfolio, recent ops, etc.)
- Focused extraction instructions for the specific operation types

Call 2 returns structured parameters only: amounts, tokens, chains, recipients.

**After Call 2**, deterministic code:
- Checks for hallucinated operation types
- Validates all required fields are present
- Enforces business rules
- Verifies identity
- Checks rate limits
- Prevents duplicates

### Context Assembly: Why It Matters

A common mistake is sending ALL context to the LLM in every call. This is wasteful and dangerous:

- **Wasteful**: Larger context = slower inference, higher cost
- **Dangerous**: More context = more surface area for injection

Instead, Call 1 produces context flags that tell the code layer exactly what data to fetch. If the user's message doesn't reference their portfolio, don't include portfolio data. If there are no pending operations, don't include pending operation context.

This is a form of **least privilege** applied to LLM context.

## Failure Modes and Mitigations

| Failure Mode | Layer | Mitigation |
|---|---|---|
| LLM hallucinated operation type | 2 | Validate against allowed list |
| LLM extracted wrong amount | 2 | Completeness check, business rules |
| LLM set wrong recipient | 2 | Recipient must be in original message |
| User impersonation | 2 | Code-level identity verification |
| Rapid-fire attack | 2 | Rate limiting |
| Duplicate submission | 3 | Pending operation deduplication |
| Platform-inappropriate op | 3 | Platform restriction checks |
| Prompt injection | 1+2 | Prompt hardening + code validation |
| Social engineering | 1+2 | Anti-manipulation rules + identity checks |

## Scaling Considerations

**For high-throughput agents:**
- Rate limiting should use Redis or similar distributed store
- Pending operation tracking needs TTL-based cleanup
- Consider caching Call 1 results for identical messages

**For multi-platform agents:**
- Platform restrictions should be configurable per deployment
- Identity resolution needs platform-specific adapters
- Rate limits may differ per platform

**For multi-chain agents:**
- Chain normalization needs comprehensive alias mapping
- Cross-chain operations need dependency chain validation
- Native token handling varies per chain
