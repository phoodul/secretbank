# site/ — landing page

Static landing page for `api-vault.app`. Single self-contained
`index.html` with inline CSS — no build step, no runtime JS.

## Deploy

### Cloudflare Pages

```sh
# from repo root, point at this directory
wrangler pages deploy site --project-name api-vault-landing
```

Or attach the GitHub repo at <https://dash.cloudflare.com/?to=/:account/pages>
and set:

- Production branch: `main`
- Build command: (none)
- Build output directory: `site`

### Vercel

```sh
vercel deploy site --prod
```

Or import the repo and set the project root to `site/`.

### GitHub Pages

```sh
# branch: gh-pages, source: site/
git subtree push --prefix site origin gh-pages
```

## Domain

Buy `api-vault.app` (or alternative TLD), point CNAME at the deployment
target. Set up:

- A/AAAA or CNAME → Cloudflare Pages / Vercel.
- DNSSEC enabled.
- HSTS via Cloudflare or `pages.dev` rules.
- TLS auto via Cloudflare or Vercel.

## Future

- v2: marketing copy + animated graph hero.
- v3: docs site (Astro / Vocs) replacing this raw HTML.
