// Produce a signed BSV delivery-claim fixture. YOU run this on YOUR machine with
// the buyer key that paid the referenced settlement, the key is read at runtime
// from WALLET_WIF (or --wallet-file) and never leaves your machine.
//
//   WALLET_WIF=<buyer-wif> node sign-fixture.mjs --content content.json > claim.json
//
// content.json holds the claim's content fields (see fields below). buyerAddress
// must be the address that key controls AND the payer in settlementRef; the
// script fills buyerAddress from the key if you omit it, and refuses if you set
// one that does not match the key.

import { readFile } from 'node:fs/promises';
import { Mnemonic, HD } from '@bsv/sdk';
import { signClaim, computeClaimId, PrivateKey } from './bsv-claim.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : null;
}

// BSVKey/inference wallet derivation path (BIP44 coin type 236 = BSV).
const BSV_PATH = "m/44'/236'/0'/0/0";

async function loadPriv() {
  // A BIP39 mnemonic (inference.bsvkey.com wallet export) takes precedence.
  const mnemonic = process.env.WALLET_MNEMONIC || (arg('--mnemonic') || null);
  if (mnemonic) {
    const seed = Mnemonic.fromString(mnemonic.trim()).toSeed();
    return HD.fromSeed(seed).derive(BSV_PATH).privKey;
  }
  let wif = process.env.WALLET_WIF;
  const wf = arg('--wallet-file');
  if (!wif && wf) {
    const raw = JSON.parse(await readFile(wf, 'utf8'));
    wif = raw.wif || raw.WIF || raw.privateKey || raw.priv || raw.key;
    if (!wif && raw.mnemonic) {
      const seed = Mnemonic.fromString(String(raw.mnemonic).trim()).toSeed();
      return HD.fromSeed(seed).derive(BSV_PATH).privKey;
    }
  }
  if (!wif) throw new Error('provide the buyer key via WALLET_MNEMONIC=..., WALLET_WIF=..., or --wallet-file <json>');
  return PrivateKey.fromWif(wif.trim());
}

const priv = await loadPriv();
const addr = priv.toAddress();

const contentPath = arg('--content');
if (!contentPath) throw new Error('pass --content <file.json> with the claim content fields');
const content = JSON.parse(await readFile(contentPath, 'utf8'));

if (content.buyerAddress && content.buyerAddress !== addr) {
  throw new Error(`content.buyerAddress (${content.buyerAddress}) does not match the signing key's address (${addr})`);
}
content.buyerAddress = addr;
content.network = content.network || 'bsv';

const { claimId, signature, buyerPubKey } = signClaim(priv, content);
const claim = { ...content, buyerPubKey, claimId, signature };

// Sanity: recompute here so what we print is self-consistent before you publish.
if (computeClaimId(claim) !== claimId) throw new Error('internal: claimId recompute mismatch');

process.stdout.write(JSON.stringify(claim, null, 2) + '\n');
