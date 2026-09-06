// Self-contained proof of the BSV claim adapter. Uses an EPHEMERAL keypair
// generated here for the test, no real or sensitive key is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signClaim, verifyClaim, computeClaimId, canonicalize, PrivateKey } from './bsv-claim.mjs';

function sampleContent(over = {}) {
  return {
    network: 'bsv',
    sellerAddress: '19Kjq5uDoNGzKo84Ui6R4qtH2WVJeu7Dyi',
    assetType: 'api-credits',
    promisedSpec: { model: 'claude-haiku-4-5', tokens: 500 },
    delivered: 'yes',
    evidenceHash: 'a'.repeat(64),
    settlementRef: 'b'.repeat(64),
    timestamp: '2026-09-06T07:00:00.000Z',
    ...over,
  };
}

test('sign then verify round-trips (valid claim)', () => {
  const priv = PrivateKey.fromRandom();
  const buyerAddress = priv.toAddress();
  const content = sampleContent({ buyerAddress });
  const { claimId, signature, buyerPubKey } = signClaim(priv, content);
  const claim = { ...content, buyerPubKey, claimId, signature };
  assert.deepEqual(verifyClaim(claim), { ok: true });
});

test('canonicalize is key-order independent (stable content-addressing)', () => {
  const a = { z: 1, a: 2, m: { y: 1, x: 2 } };
  const b = { a: 2, m: { x: 2, y: 1 }, z: 1 };
  assert.equal(canonicalize(a), canonicalize(b));
  assert.equal(computeClaimId(a), computeClaimId(b));
});

test('tampering any content field breaks claimId (content-addressing holds)', () => {
  const priv = PrivateKey.fromRandom();
  const content = sampleContent({ buyerAddress: priv.toAddress() });
  const { claimId, signature, buyerPubKey } = signClaim(priv, content);
  const tampered = { ...content, buyerPubKey, claimId, signature, delivered: 'no' };
  assert.equal(verifyClaim(tampered).reason, 'claimId_mismatch');
});

test('a signature from a different key is rejected', () => {
  const buyer = PrivateKey.fromRandom();
  const attacker = PrivateKey.fromRandom();
  const content = sampleContent({ buyerAddress: buyer.toAddress() });
  // Attacker signs, but claims to be the buyer address + buyer pubkey.
  const signed = signClaim(attacker, content);
  const forged = { ...content, buyerPubKey: buyer.toPublicKey().toString(), claimId: signed.claimId, signature: signed.signature };
  const r = verifyClaim(forged);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'signature_does_not_match_buyer');
});

test('a pubkey that does not match buyerAddress is rejected', () => {
  const buyer = PrivateKey.fromRandom();
  const other = PrivateKey.fromRandom();
  const content = sampleContent({ buyerAddress: buyer.toAddress() });
  const signed = signClaim(buyer, content);
  const forged = { ...content, buyerPubKey: other.toPublicKey().toString(), claimId: signed.claimId, signature: signed.signature };
  assert.equal(verifyClaim(forged).reason, 'pubkey_does_not_match_buyerAddress');
});

test('a claim carrying an unsigned extra field is rejected (strict shape)', () => {
  const priv = PrivateKey.fromRandom();
  const content = sampleContent({ buyerAddress: priv.toAddress() });
  const { claimId, signature, buyerPubKey } = signClaim(priv, content);
  const good = { ...content, buyerPubKey, claimId, signature };
  assert.deepEqual(verifyClaim(good), { ok: true });
  // An unsigned field the signature does not cover must NOT slip through.
  const withExtra = { ...good, delivered_note: 'forged, not covered by the signature' };
  const r = verifyClaim(withExtra);
  assert.equal(r.ok, false);
  assert.match(r.reason, /^unknown_field:/);
});
