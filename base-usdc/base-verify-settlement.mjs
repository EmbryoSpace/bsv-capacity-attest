// USDC-on-Base settlement-linkage check, the third of the three attestation
// checks (recover-to-buyer, recompute-claimId, confirm-on-chain-transfer). This
// is the Base/EVM analog of the BSV P2PKH-output read and the XRPL Payment read:
// fetch the settlement tx and confirm a USDC ERC-20 Transfer moved at least the
// declared amount from payer to payee. Read-only; needs no key. Network: keyless
// Blockscout (Base mainnet), the same source the payout monitor uses.

const BLOCKSCOUT = process.env.BASE_BLOCKSCOUT || 'https://base.blockscout.com';
// Circle USDC on Base mainnet, 6 decimals.
const USDC = (process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913').toLowerCase();

async function bs(path, { tries = 4 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${BLOCKSCOUT}${path}`);
    if (r.ok) return r.json();
    last = r;
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 1200 * (i + 1))); continue; }
    throw new Error(`Blockscout ${r.status} for ${path}`);
  }
  throw new Error(`Blockscout ${last?.status ?? 'error'} for ${path} after ${tries} tries`);
}

// Verify a single USDC Transfer inside a confirmed Base tx: token is USDC, the
// transfer runs payer -> payee, and the amount is at least minUsdc. Addresses
// are compared lower-cased (EVM hex is case-insensitive, unlike base58).
export async function verifySettlement({ txHash, payer, payee, minUsdc = 0.01 }) {
  const info = await bs(`/api/v2/transactions/${txHash}`);
  const confirmed = info.status === 'ok' && (Number(info.confirmations) || 0) > 0;

  const { items = [] } = await bs(`/api/v2/transactions/${txHash}/token-transfers`);
  const p = payer.toLowerCase();
  const q = payee.toLowerCase();

  let match = null;
  for (const t of items) {
    const tok = (t.token?.address_hash || t.token?.address || '').toLowerCase();
    if (tok !== USDC) continue;
    const from = (t.from?.hash || '').toLowerCase();
    const to = (t.to?.hash || '').toLowerCase();
    const raw = t.total?.value, dec = Number(t.total?.decimals);
    if (raw == null || !Number.isFinite(dec)) continue;
    const amt = Number(raw) / 10 ** dec;
    if (from === p && to === q && amt >= minUsdc) { match = { from, to, amt }; break; }
  }

  return {
    ok: confirmed && !!match,
    txHash,
    confirmed,
    token: 'USDC',
    payer: match?.from ?? null,
    payee: match?.to ?? null,
    amountUsdc: match?.amt ?? null,
  };
}

// Allow a direct run:  node base-verify-settlement.mjs <tx> <payer> <payee> [minUsdc]
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('base-verify-settlement.mjs')) {
  const [, , txHash, payer, payee, min] = process.argv;
  if (!txHash || !payer || !payee) {
    console.error('usage: node base-verify-settlement.mjs <tx> <payer> <payee> [minUsdc]');
    process.exit(2);
  }
  verifySettlement({ txHash, payer, payee, minUsdc: min ? Number(min) : 0.01 })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.error(e.message); process.exit(2); });
}
