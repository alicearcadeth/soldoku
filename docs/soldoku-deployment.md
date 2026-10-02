# Soldoku deployment

## Keep releases aligned

Commit and push completed source changes to `alicearcadeth/soldoku` on `main` before creating a production build. Run `npm run build`, then deploy only with `npx wrangler deploy --config wrangler.soldoku.jsonc`. After deployment, run `npm run verify:release` and repeat with `QA_ORIGIN=https://www.soldoku.com/`. The verifier requires a clean checkout, matching local/GitHub commit, matching Worker release manifest, and identical SHA-256 hashes for every shipped file. It fails for old builds or uncommitted changes. The build generates `dist/release.json`; never edit it manually.

The Worker reports its bound manifest at `/api/release` with `Cache-Control: no-store`. The HTML entry point and service worker revalidate rather than retaining an unchecked cached entry point. The existing service worker continues to fetch from the network first and preserves offline fallback.

Browser verification scripts are `scripts/refinement-check.mjs`, `scripts/competition-check.mjs`, and `scripts/laptop-check.mjs`; set `QA_ORIGIN` to the production origin or the local preview. Their signed synthetic wallets exercise free leaderboard entry and never fund a room.

## Live deployment — 2026-10-02

Published at https://soldoku.com/ and https://www.soldoku.com/ with HTTPS. Worker `soldoku` uses D1 `soldoku-matches` (`ce2b7609-384c-404f-8524-b96f59508b54`). Version `682f2689-d18e-4db8-84bd-23b0b633cbba` serves both hostnames through Worker routes. Namecheap delegates to `itzel.ns.cloudflare.com` and `kai.ns.cloudflare.com`; Cloudflare reports the zone active. Existing mail MX and SPF records were preserved. All 11 live competition checks and eight live refinement checks pass.

For future login, use `wrangler login --device` if the localhost OAuth listener expires before approval. This flow polls Cloudflare and avoids localhost redirects.

Final public-origin verification: all 23 browser checks pass, including classic completion, private Practice, Quick Match, leaderboard competition, and token search.

The full app is configured in `wrangler.soldoku.jsonc`. It uses the competition Worker, static assets, and a separate `soldoku-matches` D1 database. Do not use `wrangler.production.jsonc`: that configuration serves the older mainnet shell.

## Current verification

- Production assets build successfully.
- Cloudflare deployment bundle passes `wrangler deploy --dry-run`.
- Competition browser checks pass against the local Cloudflare Worker and D1 runtime.
- All 23 browser checks pass, including classic play, private Practice, Quick Match, and token selection. The local-file URL initialization that broke Practice in Workers is fixed.
- Unit tests: 215 passed, four optional integration tests skipped.
- Token search remains broad and Solana-only; Star Atlas ATLAS and POLIS are pinned to issuer mints.
- Public deployment completed after signing in using device authorization.

## Publish the Worker

From the project directory, sign into the Cloudflare account that will own Soldoku:

```powershell
npx.cmd wrangler login
npx.cmd wrangler d1 create soldoku-matches
```

Add the real `database_id` returned by D1 creation to the DB binding in `wrangler.soldoku.jsonc`. If that database already exists in the intended account, inspect it and reuse its actual ID instead of creating a duplicate.

```powershell
npx.cmd wrangler d1 execute soldoku-matches --remote --config wrangler.soldoku.jsonc --file schema.sql
npm.cmd run build
npx.cmd wrangler deploy --config wrangler.soldoku.jsonc
```

Verify the actual workers.dev URL reported by deployment before connecting the domain. Check token search, signed room creation, a second participant joining, leaderboard persistence, and classic/practice play. The leaderboard is free-entry in this release; its paid-entry escrow has not been implemented. Connecting a wallet authenticates identity and does not fund a room.

## Connect the Namecheap domain

1. Add `soldoku.com` to the same Cloudflare account. Review imported DNS records, preserving any existing mail MX, SPF, DKIM, and other service records.
2. In Namecheap's domain management, select Custom DNS and enter the two nameservers actually assigned by Cloudflare. Do not guess the nameservers. Save and wait until Cloudflare reports the zone active.
3. Add Worker Custom Domains for `soldoku.com` and `www.soldoku.com` to the `soldoku` Worker. Cloudflare manages the DNS records and TLS certificates for these Custom Domains.
4. Record these bindings in `wrangler.soldoku.jsonc` under `routes` with `custom_domain: true` once the zone is available, so subsequent deployments retain them.
5. Verify HTTPS on both domains and repeat the room-create/join and token-search checks on the public origin.

Reference: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

Namecheap nameserver instructions: https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/
