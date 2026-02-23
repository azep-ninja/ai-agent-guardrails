# Threat Model for AI Agents Handling Funds

## Attack Categories

### 1. Prompt Injection
Attacker embeds malicious instructions in user input, token names, social posts, or image text.

**Mitigations:** Prompt hardening (L1), operation whitelist validation (L2), recipient verification (L2), identity verification (L2), rate limiting (L2)

### 2. Identity Confusion
Agent processes a message from User A but executes on User B's wallet.

**Mitigations:** Authenticated user ID from platform auth not LLM (L2), user_id check before execution (L2)

### 3. Hallucination Exploitation
LLM hallucinates an operation type or parameter the user never requested.

**Mitigations:** Valid operation type whitelist (L2), required field validation (L2), business rule checks (L2)

### 4. Replay / Duplication Attacks
Same request sent multiple times to execute duplicate transactions.

**Mitigations:** Pending operation deduplication (L3), rate limiting (L2)

### 5. Social Engineering
Attacker builds conversational trust then slips in malicious request.

**Mitigations:** Every operation goes through same validation regardless of conversation history (L2), anti-manipulation rules (L1)

### 6. Platform-Specific Attacks
Exploiting platform features (threads, quotes, group chats) to confuse the agent.

**Mitigations:** Platform-specific restrictions (L3), group chat financial op blocking (L3), tagging rules (L1)

### 7. Gradual Escalation
Start with small legitimate operations, escalate to large malicious ones.

**Mitigations:** Value-based rate limits (L2), daily volume caps (L2), unusual pattern detection (L2)

### 8. Token Name Injection
Creating tokens with names designed to inject instructions into the LLM context.

**Mitigations:** Token data should be sanitized before inclusion in prompts (L1), operation validation ignores token metadata (L2)

### 9. Cross-Chain Confusion
Exploiting chain-specific differences to cause operations on wrong networks.

**Mitigations:** Chain normalization in code (L2), chain validation per operation (L2), never assume default chain (L2)

### 10. Continuation Hijacking
Sending partial data hoping agent continues a different user's pending operation.

**Mitigations:** Continuation only possible when pending ops exist for authenticated user (L2), identity check on pending ops (L2)

## Layer Reference

- **L0**: Pre-LLM code checks (impersonation detection, basic sanitization)
- **L1**: LLM prompt layer (hardening, anti-manipulation, safe defaults)
- **L2**: Deterministic validation layer (completeness, identity, rate limits, business rules)
- **L3**: Execution safety layer (deduplication, platform restrictions, simulation)
