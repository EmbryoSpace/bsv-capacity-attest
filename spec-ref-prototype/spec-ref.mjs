// PROTOTYPE: contractRef, binding the authoritative contract into the claim.
//
// Craig Wright's "Competent Verifier Problem" argues the assurance failure in
// multi-agent systems is reference divergence: the verifier accepts against an
// abridged brief, not the principal's frozen contract, and the certificate is
// meaningless. His remedy is to keep the authoritative reference immutable and
// to record which representation of the requirements a decision was made against.
//
// This prototype extends the BSV attestation claim with ONE optional field,
// contractRef: a content-addressed hash of the authoritative contract. When
// present it is folded into the signed claimId, so the receipt proves the work
// was accepted against THAT exact contract, not a scoped-down brief. Absent, the
// claim hashes exactly as before (the capacity-attest `measured` extension
// pattern: presence is the version marker, absence changes nothing).
//
// This is a standalone prototype for review. It does not modify the shipped
// bsv-claim.mjs; it reuses only its frozen canonicalize().

import { createHash } from 'node:crypto';
import { canonicalize } from '../bsv-claim.mjs';
import { PublicKey, BSM, Utils, Signature, PrivateKey } from '@bsv/sdk';

// Same content fields as the shipped adapter, plus the optional contractRef.
const CONTENT_FIELDS = [
  'network', 'sellerAddress', 'buyerAddress', 'assetType', 'promisedSpec',
  'delivered', 'evidenceHash', 'settlementRef', 'timestamp', 'contractRef',
];
const ALLOWED_KEYS = new Set([...CONTENT_FIELDS, 'claimId', 'signature', 'buyerPubKey']);

function pickContent(claim) {
  const c = {};
  for (const k of CONTENT_FIELDS) if (claim[k] !== undefined) c[k] = claim[k];
  return c;
}

export function computeClaimId(content) {
  return '0x' + createHash('sha256').update(canonicalize(pickContent(content)), 'utf8').digest('hex');
}

// The content-addressed reference to the authoritative contract. `contractBytes`
// is the exact bytes of the frozen contract (canonical JSON, a signed doc, etc.).
export function contractRefOf(contractBytes) {
  return 'sha256:' + createHash('sha256').update(contractBytes).digest('hex');
}

export function signClaim(priv, content) {
  const claimId = computeClaimId(content);
  const sig = BSM.sign(Utils.toArray(claimId, 'utf8'), priv, 'raw');
  return { claimId, signature: Utils.toHex(sig.toDER()), buyerPubKey: priv.toPublicKey().toString() };
}

// claim-internal consistency: strict shape, claimId recompute, BSM signature.
export function verifyClaim(claim) {
  if (claim === null || typeof claim !== 'object') return { ok: false, reason: 'not_an_object' };
  for (const k of Object.keys(claim)) if (!ALLOWED_KEYS.has(k)) return { ok: false, reason: `unknown_field:${k}` };
  if (computeClaimId(claim).toLowerCase() !== String(claim.claimId).toLowerCase()) return { ok: false, reason: 'claimId_mismatch' };
  let pub;
  try { pub = PublicKey.fromString(claim.buyerPubKey); } catch (e) { return { ok: false, reason: `bad_buyerPubKey: ${e.message}` }; }
  if (pub.toAddress() !== claim.buyerAddress) return { ok: false, reason: 'pubkey_does_not_match_buyerAddress' };
  let sig;
  try { sig = Signature.fromDER(Utils.toArray(claim.signature, 'hex')); } catch (e) { return { ok: false, reason: `bad_signature_encoding: ${e.message}` }; }
  if (!BSM.verify(Utils.toArray(claim.claimId, 'utf8'), sig, pub)) return { ok: false, reason: 'signature_does_not_match_buyer' };
  return { ok: true };
}

// The new check: does the claim bind the authoritative contract you hold? This
// is what defeats reference divergence, it proves acceptance was against THIS
// contract, not an abridged brief. Give it the exact contract bytes.
export function verifyContract(claim, contractBytes) {
  if (!claim.contractRef) return { ok: false, reason: 'no_contractRef' };
  const actual = contractRefOf(contractBytes);
  return actual === claim.contractRef ? { ok: true } : { ok: false, reason: 'contract_hash_mismatch', expected: claim.contractRef, actual };
}

export { PrivateKey };
