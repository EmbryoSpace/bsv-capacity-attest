# base-usdc (USDC-on-Base rail)

The **USDC-on-Base rail** for BSVKey's verifiable, non-custodial, pay-per-call
settlement, the Base/EVM sibling of the BSV rail in this repo: the same
rail-neutral, content-addressed attestation core, with only the address
encoding (EVM `0x` hex) and signature envelope (EIP-191) swapped for Base.

Settlement runs over **x402** at
[inference.bsvkey.com/usdc](https://inference.bsvkey.com/usdc) (USDC on Base via
Coinbase's facilitator, self-custody embedded wallet).

## The three checks

1. **Content address**, `claimId = 0x + sha256(canonicalJSON(content))`,
   byte-identical to the BSV rail.
2. **Payer signature**, the buyer signs `claimId` with an EIP-191 message
   signature; `recover(sig) === buyerAddress` (the frozen capacity-attest Base
   path, [#18](https://github.com/YE-YI7/asm-spec)).
3. **Settlement linkage**, the settlement tx moves at least the declared USDC
   from `buyerAddress` to `sellerAddress` (`base-verify-settlement.mjs`, a
   keyless Blockscout read on Base mainnet, the Base analog of a BSV P2PKH
   output).

## What is proven now vs. pending

- **Proven now (check 3, real money).** `base-verify-settlement.mjs` confirms a
  live USDC-on-Base settlement on-chain. Verified against a real transfer:

  ```
  node base-verify-settlement.mjs \
    0x2b3abd35647a733d177e8bf1a7829b06dfec551ce682aa00224d430b6cce62ac \
    0x386886726557626785D8A699547B01B77D45333d \
    0xd403f725eeB79b7358C741327a2a815B185F6f69
  # => { ok: true, amountUsdc: 0.01, ... }
  ```

  This proves the USDC payment path is live and independently checkable.

- **Pending (checks 1 and 2), the pinned fixture.** A complete fixture, the USDC
  twin of the BSV `claim_inference.json`, needs the *buyer* to sign the claim.
  The settlement above was paid by the hosted CDP wallet, whose key is not
  handled here. To finish the fixture, make **one ~$0.01 x402 call from a
  throwaway Base key** so `buyerAddress` equals the settlement payer, then sign
  the claim with that throwaway key. Fill the two `TODO` fields in
  `content_inference_usdc.json` (`buyerAddress`, `settlementRef`) with that call.

## Non-claims (mirrors the BSV/#18 boundary)

The fixture proves **payment and claim authorship only**. `delivered`, the
`evidenceHash` preimage, and task correctness are the buyer's attestation, not
independently proven here; `historical_asm_use` is pinned `false`.

A product of Embryo Space Inc. (DBA BSVKey).
