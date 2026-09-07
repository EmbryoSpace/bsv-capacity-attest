// Fixture test in the same shape as asm-spec #18 (the Base/USDC fixture):
// follow the link, recompute the claimId, recover the signature, and check the
// on-chain settlement, and encode, as explicit assertions, exactly what the
// fixture does NOT prove. It demonstrates the downstream linkage shape for a
// BSV-settled claim; it is not evidence that ASM was used for the original call.
//
// Verifier profile: bsv-claim adapter (this repo), canonicalize+sha256 content
// address (rail-neutral, identical to capacity-attest) + compact Bitcoin Signed
// Message (BSM) recovery to a base58 P2PKH address (BSM is deprecated in favor of
// BRC-77 and the two are not equivalent; a BRC-77 migration is out of scope).
// capacity-attest itself (holistis/tokenizen) verifies the Base/USDC sibling; see #18.
//
// The settlement check is a live WhatsOnChain read, matching #18's live
// on-chain verification. Set FIXTURE_OFFLINE=1 to skip only that network step.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyClaim, computeClaimId } from './bsv-claim.mjs';
import { verifySettlement } from './verify-settlement.mjs';

// What each fixture pins, and, explicitly, what it does not claim.
const FIXTURES = [
  {
    name: 'inference-mcp (x402 pay-per-call LLM inference)',
    file: 'claim_inference.json',
    // ASM would retain only these stable references; the raw claim stays here.
    verifierProfile: 'bsv-claim@0.0.0 / BSM-recovery',
    historical_asm_use: false, // demonstrates linkage shape, NOT that ASM was used
  },
  {
    name: 'paywall (non-custodial x402 API gateway)',
    file: 'claim_paywall.json',
    verifierProfile: 'bsv-claim@0.0.0 / BSM-recovery',
    historical_asm_use: false,
  },
];

for (const fx of FIXTURES) {
  test(`BSV fixture: ${fx.name}`, async (t) => {
    const claim = JSON.parse(await readFile(new URL(fx.file, import.meta.url), 'utf8'));

    await t.test('content addressing: claimId is the sha256 of the canonical content', () => {
      assert.equal(computeClaimId(claim), claim.claimId);
    });

    await t.test('payer signature: the compact BSM signature recovers the signer, and P2PKH(recovered) equals buyerAddress', () => {
      assert.deepEqual(verifyClaim(claim), { ok: true });
    });

    await t.test('settlement linkage: buyer paid seller on-chain (P2PKH output to seller, an input spends a buyer-locked prevout)', async (st) => {
      if (process.env.FIXTURE_OFFLINE) return st.skip('FIXTURE_OFFLINE set, skipping the WhatsOnChain read');
      const s = await verifySettlement({
        settlementRef: claim.settlementRef,
        buyerAddress: claim.buyerAddress,
        sellerAddress: claim.sellerAddress,
      });
      assert.equal(s.ok, true, `settlement ${claim.settlementRef} must pay ${claim.sellerAddress} and spend a prevout locked to ${claim.buyerAddress}`);
      assert.ok(s.sellerPaidSats > 0);
      assert.equal(s.buyerIsPayer, true);
      assert.ok(s.buyerInputCount > 0);
    });

    // ---- EXPLICIT NON-CLAIMS (mirrors #18) ------------------------------------
    // These are asserted, not merely commented, so the fixture cannot silently
    // drift into implying more than it proves.
    await t.test('explicit non-claims: the fixture proves payment + authorship ONLY', () => {
      // historical ASM use is pinned false: this is downstream-linkage shape.
      assert.equal(fx.historical_asm_use, false);
      // delivered is the buyer's attestation, NOT independently proven here.
      assert.ok(['yes', 'no', 'partial'].includes(claim.delivered));
      // the evidenceHash PREIMAGE is not revealed or verified, only the digest
      // is content-addressed into the claim.
      assert.match(claim.evidenceHash, /^[0-9a-f]{64}$/);
      // and this test deliberately makes NO assertion about task correctness or
      // that `delivered === 'yes'` is true. That boundary is the whole point.
    });
  });
}
