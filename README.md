# bsv-capacity-attest

A **BSV rail adapter** and **fixtures** for the post-call attestation layer
discussed in [modelcontextprotocol/registry#1300](https://github.com/modelcontextprotocol/registry/discussions/1300)
("Optional fiscal-safety metadata for paid MCP servers"), and demonstrated for
the Base/USDC rail by [capacity-attest](https://github.com/holistis/tokenizen)
(holistis) in [YE-YI7/asm-spec#18](https://github.com/YE-YI7/asm-spec).

This repo does for a **BSV-settled** paid call exactly what #18 does for a
Base/USDC one: after a call settles, the paying agent signs a small
content-addressed claim about what it received, and anyone can verify, offline
for the claim, and against the chain for the settlement, without trusting the
author.

## The boundary (the whole point)

The **content-addressing is shared and rail-neutral**: `claimId = 0x` + `sha256`
of the canonical JSON of the claim's content fields, where canonical =
recursive key-sort + `JSON.stringify`. This is byte-for-byte the route
capacity-attest freezes, and it does not fork.

Only two things are **BSV-specific**, and they live behind the adapter:

- **Address encoding.** `buyerAddress` / `sellerAddress` are base58 P2PKH
  addresses (case-sensitive, so not lower-cased the way `0x` hex is).
- **Signature envelope.** The buyer signs the `claimId` with a **Bitcoin Signed
  Message (BSM / BRC-77)**, a recoverable ECDSA signature over a prefixed
  message, the same secp256k1 primitive as EIP-191, a different envelope. The
  claim carries the payer's compressed pubkey (a BSV P2PKH spend reveals it
  on-chain anyway); verification checks the signature under that pubkey and that
  the pubkey hashes to `buyerAddress`.

capacity-attest's own `verifyClaim` cannot be called directly here: its frozen
schema hard-codes `0x`/EIP-191, so a base58 address is rejected before hashing.
The shared piece is the hash route, not the schema.

## The three checks

For a claim (see `claim_inference.json`, `claim_paywall.json`):

1. **Content address**, `computeClaimId(claim)` equals `claim.claimId`
   (`bsv-claim.mjs`).
2. **Payer signature**, the BSM signature verifies under `buyerPubKey`, and
   `P2PKH(buyerPubKey) === buyerAddress` (`bsv-claim.mjs` `verifyClaim`).
3. **Settlement linkage**, the on-chain tx `settlementRef` has an output paying
   `sellerAddress` and an input spent by `buyerAddress`
   (`verify-settlement.mjs`, a live WhatsOnChain read; the BSV analog of reading
   a USDC `Transfer` log).

## What these fixtures do NOT prove (explicit non-claims)

Mirroring #18: the fixtures prove **payment and claim authorship only**.
`delivered`, the `evidenceHash` preimage, and task correctness are the buyer's
attestation, **not** independently proven here, and `historical_asm_use` is
pinned **false** (these demonstrate the downstream linkage shape, not that ASM
was used for the original call). `fixture.test.mjs` asserts these boundaries.

## The pinned settlements

Both fixtures reference **real BSV mainnet** x402 settlements, paid by the same
buyer key:

| Fixture | settlementRef (txid) | seller (payTo) | paid |
|---|---|---|---|
| `claim_inference.json` | `77030c6192c6e86b808f1d7afa210b874bad86ed6a6b4ef69a8ccebc51ec83c6` | `1LdqUbdZ6GY71KxThU6aKfuKXxgmTn82cv` | 5,942 sats |
| `claim_paywall.json` | `07d0114a4d142942bc2f7ac85d35ae95e2dd71f130c71b5b2f89a2d508942938` | `19Kjq5uDoNGzKo84Ui6R4qtH2WVJeu7Dyi` | 592 sats |

Buyer / payer: `1ErDfgzGWe6kDSHWWZPUSpVRRvfQo7rDdZ` (a throwaway key, used only
for these fixtures). The inference settlement is a pay-per-call to
[inference.bsvkey.com](https://inference.bsvkey.com); the paywall one is a call
through [paywall.bsvkey.com](https://paywall.bsvkey.com).

## Run it

```bash
npm install
npm test              # adapter unit tests (ephemeral key) + both fixtures
FIXTURE_OFFLINE=1 npm test   # skip only the WhatsOnChain settlement read
```

## Files

- `bsv-claim.mjs`, the rail adapter (`canonicalize`, `computeClaimId`, `signClaim`, `verifyClaim`).
- `verify-settlement.mjs`, on-chain settlement linkage (WhatsOnChain).
- `sign-fixture.mjs`, produce a signed claim (key read at runtime from `WALLET_MNEMONIC` / `WALLET_WIF` / `--wallet-file`; never committed).
- `test.mjs`, adapter proof with an ephemeral keypair.
- `fixture.test.mjs`, the fixtures in #18's shape, with explicit non-claims.
- `claim_*.json` / `content_*.json`, the fixtures.

Built by Embry Space Inc. (DBA BSVKey). Verifies against, and links to,
[capacity-attest](https://github.com/holistis/tokenizen).
