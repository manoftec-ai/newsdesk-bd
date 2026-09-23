# Session — Custom domain launch jachaidesk.com (2026-09-23)

## What happened
User bought `jachaidesk.com` at Spaceship for the newsdesk-bd project and set Spaceship
nameservers. Asked: "did my domain setup complete? check whats happening?"

## Checks performed
1. DNS (dns.google / 1.1.1.1 DoH, RDAP): domain registered 2026-09-23 13:04Z, NS = launch1/launch2.spaceship.net (propagated globally). RDAP showed DNSSEC DS. Zone had NO records initially → http/https 000.
2. Registrar RDAP (Verisign .COM): registrar Spaceship, status clientTransferProhibited, expiry 2027-09-23.
3. Vercel API: domain already added to team man-of-technology, attached to `newsdesk-bd` project (prj_FX5YmvjrSM5JnbCm1PNbQuJU6xJO), `verified:true`, `zone:true`, but configVerifiedAt/txtVerifiedAt/nsVerifiedAt all null. int UtendedNameservers ns1/ns2.vercel-dns.com (NOT used — user kept Spaceship DNS).
4. User added records manually (asked TTL → advised 3600).

## Verification results (after user added records)
- A @ → 76.76.21.21 ✓ (both 8.8.8.8 and 1.1.1.1 DoH)
- CNAME www → cname.vercel-dns.com ✓
- Neutral proxy (WebFetch) → full homepage served on https://jachaidesk.com (title নিউজডেস্ক বিডি) ✓
- --resolve apex https → 200, http → 308 redirect to https ✓; www http → 308 ✓
- Deployments READY ✓

## Gotcha found
Termux device's local DNS: `curl https://jachaidesk.com` → "Could not resolve host".
Basically the phone/ISP DNS is failing for the apex → matches user's "in live i dont see my site".
Fix steps given to user: restart phone/toggle Wi-Fi, use https://www.jachaidesk.com,
switch to mobile data once, or enable Chrome secure DNS.
Vercel dashboard `configVerifiedAt: null` = cosmetic, flips when Vercel's background check re-runs.

## Status
Domain fully live and correct. User-side DNS cache is the only blocker.

## Lessons
- When "site doesn't load", always verify DNS from ≥2 global resolvers + fetch via a neutral
  proxy before assuming a misconfiguration.
- Vercel apex recommendation = A 76.76.21.21 (not 76.76.21.123); www = cname.vercel-dns.com.
```
>> 2026-09-23 after-action: user confirmed the site loads on jachaidesk.com from his browser ("yes its working fine now"). Domain launch fully closed. Next queued: switch siteUrl/canonical/og + telegram/facebook script URLs to jachaidesk.com, then GSC/Bing add custom domain.
