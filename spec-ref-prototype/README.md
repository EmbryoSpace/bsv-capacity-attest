# contractRef: binding the authoritative contract into a receipt (prototype)

A prototype extension to the BSV attestation claim, in response to Craig Wright's
"The Competent Verifier Problem" (Sep 2026). That essay argues the assurance
failure in multi-agent systems is *reference divergence*: a verifier accepts work
against an abridged brief rather than the principal's frozen contract, so the
certificate is real but meaningless. His remedy is to keep the authoritative
reference immutable and to record which representation of the requirements a
decision was actually made against.

This adds one optional field, `contractRef`, a content-addressed hash
(`sha256:<hex>`) of the authoritative contract, folded into the signed claimId.
A receipt then proves not just that a payment happened, but that the work was
accepted against **that exact contract**, not a scoped-down brief. Content
addressing plus on-chain settlement gives the immutable, pull-only authoritative
reference the essay calls for.

## Properties (see `spec-ref.test.mjs`, 4/4)

- **Bound, not decorative:** `contractRef` is inside the signed claimId, so it
  cannot be swapped after signing.
- **Catches an abridged brief:** `verifyContract(claim, contractBytes)` fails
  with `contract_hash_mismatch` if the contract you hold is not the one the
  receipt was made against (e.g. a condition was dropped).
- **Backward compatible:** a claim with no `contractRef` hashes identically to
  the shipped adapter (`../bsv-claim.mjs`), the same optional-field pattern
  capacity-attest uses for `measured`. Presence is the version marker; absence
  changes nothing.

## Status

Prototype for discussion, not part of the merged fixture. If it is useful to the
ASM / capacity-attest effort it can become a follow-up spec fixture. Run:

```bash
node --test
```

Reuses the frozen `canonicalize()` from the shipped adapter; only `@bsv/sdk` is
required at runtime.
