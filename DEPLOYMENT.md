# Deployment notes

## Hosting

Production: **Cloudflare Pages** (project connected to the GitHub repo, build = static publish of repo root).

Confirmed by live response headers:
- `server: cloudflare`
- `cf-cache-status: HIT/MISS`
- `_headers` file is honored (custom Referrer-Policy / Permissions-Policy come through)
- `netlify.toml` is **ignored** — confirmed when its `[[redirects]]` block had no effect in production after deploy

## Redirects

Cloudflare Pages reads `_redirects` at the repo root. The file in this repo is the source of truth for HTTP redirects. Syntax reference: https://developers.cloudflare.com/pages/configuration/redirects/

Notes:
- The trailing `!` on each line ("force") is required to override Cloudflare Pages' built-in 307 redirect from `/foo.html` → `/foo`.
- Source paths are path-only. There is no host matching in `_redirects`, so a **www → apex redirect cannot be done from this file** if both www and apex are attached to the same Pages project (the rule would loop or no-op).

## Manual Cloudflare configuration required: www → apex

Both `www.axialrealty.com` and `axialrealty.com` currently return `200 OK` for the same content. To redirect www to apex with a 301, do **one** of the following in the Cloudflare dashboard (zone: axialrealty.com):

### Option A — Bulk Redirects (recommended)

Dashboard → **Bulk Redirects** → create a new list and add a rule:

| Source URL | Target URL | Status | Parameters |
|---|---|---|---|
| `https://www.axialrealty.com/` | `https://axialrealty.com/` | 301 | `preserve_query_string`, `subpath_matching`, `preserve_path_suffix` |

Then attach the list to a Bulk Redirect rule on the zone.

### Option B — Single Redirect rule

Dashboard → **Rules → Redirect Rules** → create rule:

- **When incoming requests match**:
  - Field: `Hostname`
  - Operator: `equals`
  - Value: `www.axialrealty.com`
- **Then**:
  - Type: `Dynamic`
  - Expression: `concat("https://axialrealty.com", http.request.uri.path)`
  - Status: `301`
  - Preserve query string: ✓

### Option C — Detach www from Pages project

If the apex (`axialrealty.com`) is the only domain the Pages project needs, **remove `www.axialrealty.com` from the Pages project's Custom Domains list**, then in the DNS / zone settings add a redirect (Page Rule or Bulk Redirect as above) sending `www.*` to `axialrealty.com/*` 301.

This is the cleanest end state but requires the project owner to verify nothing else relies on the www hostname.

## Verification after any change

```bash
# Should be 301 (currently 307 before the _redirects fix lands):
curl -sI https://axialrealty.com/neighborhood-frisco.html | head -3

# Should be 301 to apex (currently 200):
curl -sI https://www.axialrealty.com/ | head -3
```
