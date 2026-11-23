# SEO and Google Search Console runbook

Applies to the marketing surface (`/`, `/lead-follow-up-software`, `/robots.txt`,
`/sitemap.xml`) served by `server.js` from `public/`.

## 1. Where the `<head>` lives

`public/index.html` and `public/lead-follow-up-software.html` are ordinary HTML files with a
hand-written `<head>`. Nothing regenerates them at build time. Placeholders replaced per
request:

| Placeholder | Replaced with |
| --- | --- |
| `{{APP_URL}}` | `APP_URL` environment variable (canonical/OG absolute URLs) |
| `{{GOOGLE_VERIFICATION_META}}` | `<meta name="google-site-verification" …>` when `GOOGLE_SITE_VERIFICATION` is set, otherwise an HTML comment |
| `{{ANALYTICS}}` | GA4 snippet when `GOOGLE_ANALYTICS_ID` is set |
| `{{NOINDEX}}` | empty on public pages; `noindex` only on app pages |

Only the placeholders are substituted. Any tag you add by hand — including an existing
`google-site-verification` meta tag — is preserved verbatim.

## 2. Add your verification token (two supported ways)

**A. Edit the HTML (static, survives all rebuilds)**

Open `public/index.html`, find the line

```html
{{GOOGLE_VERIFICATION_META}}
```

and add your tag above or below it:

```html
<meta name="google-site-verification" content="YOUR_TOKEN_HERE" />
```

Do the same in `public/lead-follow-up-software.html` and `public/404.html` if you want the tag
everywhere. Never delete an existing verification tag: Google keeps working while old tokens
are present, and removing one breaks verification.

**B. Environment variable (no code change)**

```bash
GOOGLE_SITE_VERIFICATION=YOUR_TOKEN_HERE
```

The server injects the tag into every public page's `<head>` at request time. If both A and B
are present, both tags are served — that is valid.

## 3. HTML file verification

Google offers a file such as `google1a2b3c4d5e6f7g8h.html` containing
`google-site-verification: google1a2b3c4d5e6f7g8h.html`.

- **Dynamic support (no upload):** any request matching `/google<token>.html` returns exactly
  `google-site-verification: google<token>.html` with `200` and `text/html`.
- **Static support:** drop the real file into `public/`; it is served at its exact URL first,
  before the dynamic fallback.

Test it:

```bash
curl -s https://your-domain/google1a2b3c4d5e6f7g8h.html
# google-site-verification: google1a2b3c4d5e6f7g8h.html
```

## 4. Crawlability

- `robots.txt` allows everything, disallows `/app`, `/api/`, `/invite/`, and prints the sitemap
  URL. No `Googlebot` block, no wildcard disallow of public pages.
- `sitemap.xml` lists `/`, `/lead-follow-up-software`, `/login`, `/signup` with lastmod,
  changefreq and priority. Add pages to `SITEMAP_PAGES` in `server.js` when you create them.
- Application pages carry `<meta name="robots" content="noindex, nofollow">`; the 404 page is
  `noindex, follow` and returns HTTP 404 (not a soft 404 with 200).
- Public pages include canonical URLs, viewport, Open Graph + Twitter card metadata, JSON-LD,
  semantic landmarks (`header`, `nav`, `main`, `section`, `footer`), one `<h1>` each, and
  descriptive image alt text.
- Internal links: header, hero CTAs, footer, breadcrumb and FAQ anchors all resolve to real
  routes. `/sitemap.xml`, `/robots.txt` and `/login` are linked from the footer.

## 5. Production verification checklist (do not skip)

```bash
# 1. the deployed HTML must contain the tag
curl -s https://your-domain/ | grep -o '<meta name="google-site-verification"[^>]*>'

# 2. verification file must be public
curl -sI https://your-domain/google<token>.html | head -1     # expect 200
curl -s  https://your-domain/google<token>.html                # expect the google-site-verification line

# 3. no accidental noindex on public pages
curl -s https://your-domain/ | grep -i 'noindex' || echo "clean"

# 4. robots + sitemap
curl -s https://your-domain/robots.txt
curl -s https://your-domain/sitemap.xml | head -20

# 5. canonical host matches the property in Search Console
```

In Search Console: add the property (URL-prefix or Domain), complete verification, submit
`sitemap.xml`, then use **URL Inspection → Test live URL** on `/` and
`/lead-follow-up-software` to confirm rendering and indexing eligibility.

## 6. Preserving this during future changes

- Keep the `<head>` block intact when editing marketing pages; the verification placeholders
  must remain.
- If you add a page, add its route, its canonical, its sitemap entry, and a footer link.
- Do not add `noindex` to `/`, `/lead-follow-up-software`, `/login` or `/signup`.
- Re-run the checklist in section 5 after every deployment.
