// Proves the contractRef extension: a receipt can bind the authoritative
// contract, so acceptance is provably against THAT contract, not an abridged
// brief. Uses an ephemeral key (no real or sensitive material).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeClaimId as shippedComputeClaimId } from '../bsv-claim.mjs';
import { signClaim, verifyClaim, verifyContract, contractRefOf, computeClaimId, PrivateKey } from './spec-ref.mjs';

const contractBytes = await readFile(new URL('./contract.example.json', import.meta.url));

function baseContent(over = {}) {
  return {
    network: 'bsv',
    sellerAddress: '19Kjq5uDoNGzKo84Ui6R4qtH2WVJeu7Dyi',
    assetType: 'api-credits',
    promisedSpec: { service: 'weather forecast API' },
    delivered: 'yes',
    evidenceHash: 'a'.repeat(64),
    settlementRef: 'b'.repeat(64),
    timestamp: '2026-09-06T07:00:00.000Z',
    ...over,
  };
}

test('a claim binds the authoritative contract, and the bound contract verifies', () => {
  const priv = PrivateKey.fromRandom();
  const content = baseContent({ buyerAddress: priv.toAddress(), contractRef: contractRefOf(contractBytes) });
  const { claimId, signature, buyerPubKey } = signClaim(priv, content);
  const claim = { ...content, buyerPubKey, claimId, signature };

  assert.deepEqual(verifyClaim(claim), { ok: true });
  // The receipt proves acceptance was against THIS contract.
  assert.deepEqual(verifyContract(claim, contractBytes), { ok: true });
});

test('a different contract (an abridged brief) is caught', () => {
  const priv = PrivateKey.fromRandom();
  const content = baseContent({ buyerAddress: priv.toAddress(), contractRef: contractRefOf(contractBytes) });
  const signed = signClaim(priv, content);
  const claim = { ...content, buyerPubKey: signed.buyerPubKey, claimId: signed.claimId, signature: signed.signature };

  // Drop condition 2 (the "match the source record" term) to simulate a scoped brief.
  const abridged = JSON.parse(contractBytes.toString('utf8'));
  abridged.binding_conditions = abridged.binding_conditions.filter((c) => !c.startsWith('2.'));
  const r = verifyContract(claim, Buffer.from(JSON.stringify(abridged, null, 2) + '\n', 'utf8'));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'contract_hash_mismatch');
});

test('contractRef is inside the signed claimId (it is bound, not decorative)', () => {
  const priv = PrivateKey.fromRandom();
  const c1 = baseContent({ buyerAddress: priv.toAddress() });
  const c2 = { ...c1, contractRef: contractRefOf(contractBytes) };
  assert.notEqual(computeClaimId(c1), computeClaimId(c2), 'adding contractRef must change the claimId');
});

test('backward compatible: a claim with no contractRef hashes identically to the shipped adapter', () => {
  const content = baseContent({ buyerAddress: '1ErDfgzGWe6kDSHWWZPUSpVRRvfQo7rDdZ' });
  assert.equal(computeClaimId(content), shippedComputeClaimId(content), 'no-contractRef claims must not change claimId');
});
