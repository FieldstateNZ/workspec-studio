# Site cutover runbook: studio.workspec.io

One-time cutover for slice S1 (route restructure of `apps/site` into the WorkSpec Studio
site). This repo's side (`pages.yml`, `apps/site/public/CNAME`) is ready to go on merge; the
steps below are **Brett-gated** — they touch DNS and the old repo, which this session cannot
reach. Execute in order.

## 0. What's moving where

| Old                                                | New                                                |
| -------------------------------------------------- | -------------------------------------------------- |
| `https://decision-studio.workspec.io/` (marketing) | `https://studio.workspec.io/decisions`             |
| `https://decision-studio.workspec.io/demo`         | `https://studio.workspec.io/decisions/demo`        |
| — (didn't exist)                                   | `https://studio.workspec.io/` (Studio landing)     |
| — (didn't exist)                                   | `https://studio.workspec.io/c4` (coming-soon stub) |

The old repo is `FieldstateNZ/workspec-decision-studio`; the new one is this repo,
`FieldstateNZ/workspec-studio`.

## 1. DNS — add the new record

In the DNS provider for `workspec.io`, add:

```
studio.workspec.io    CNAME    fieldstatenz.github.io    (grey-cloud / DNS-only, not proxied)
```

Grey-cloud (DNS-only) matters if the zone is on Cloudflare — GitHub Pages issues its own
certificate for the custom domain and needs to see the real GitHub Pages IPs/host during
verification; an orange-clouded (proxied) record breaks Pages' domain verification and
certificate issuance.

This is the only DNS change this cutover requires on the new-domain side. No DNS change is
needed for `decision-studio.workspec.io` yet — see §5 for its eventual retirement.

## 2. Land the site and let it deploy

Merge the branch containing this slice to `main`. `.github/workflows/pages.yml` triggers on
`apps/site/**` and deploys automatically:

- `apps/site/public/CNAME` (`studio.workspec.io`) is copied to `dist/CNAME` by Vite.
- The build step's own check (`test -f dist/CNAME`, `test -f dist/404.html`, and a `diff`
  between `dist/index.html` and `dist/404.html`) fails the workflow if either is missing or the
  SPA fallback copy didn't happen — so a green run is proof the artifact is correct before it
  ever reaches Pages.

No manual dispatch needed unless you want to redeploy without a code change
(`workflow_dispatch` is wired for that).

## 3. Claim the custom domain + certificate

GitHub Pages usually picks up the custom domain from the `CNAME` file inside the deployed
artifact automatically. If the repo's **Settings → Pages** page doesn't show
`studio.workspec.io` as the custom domain after the first deploy in §2, set it explicitly:

```bash
gh api -X PUT repos/FieldstateNZ/workspec-studio/pages -f cname=studio.workspec.io
```

Then, once GitHub finishes provisioning (a few minutes, occasionally up to ~24h for the
certificate to mint), enable **Enforce HTTPS** on the same Settings → Pages page (or
`gh api -X PUT repos/FieldstateNZ/workspec-studio/pages -F https_enforced=true` once the
certificate shows as issued — it 422s if you try before the cert is ready. Note the capital
`-F`: the API field is a boolean, and `-f` would send the string `"true"`).

## 4. Verify the new site

```bash
curl -I https://studio.workspec.io/                    # expect 200
curl -sI https://studio.workspec.io/decisions           # expect HTTP 404 — see note below
curl -sI https://studio.workspec.io/decisions/demo      # expect HTTP 404 — see note below
curl -sI https://studio.workspec.io/c4                   # expect HTTP 404 — see note below
```

**Note on the 404s:** GitHub Pages has no server-side router, so the SPA-fallback trick (serving
`404.html` — a byte-identical copy of `index.html` — for any unrecognised path) means deep links
correctly load the app shell, but the _HTTP status code_ GitHub reports for them is still `404`.
That's expected, not a regression — confirm the deep links work by loading them in a real browser
(client-side JS takes over immediately and renders the right route) or by checking the response
_body_ contains the app shell (`curl -s ... | grep 'id="root"'`) rather than the status code.

## 5. Retire the old site — paste this into `workspec-decision-studio`

The old repo isn't writable from this session, so this is a paste-ready file, not a change this
slice makes directly.

Replace `apps/site/index.html` in `FieldstateNZ/workspec-decision-studio` with the file below.
The file deliberately contains no `<script type="module" src="/src/main.tsx">` tag, so the old
React app no longer builds into or mounts over this page — Vite passes scriptless HTML straight
through to `dist/index.html`, and no other change to that repo's build or workflow is needed.

Because that repo's build already copies `index.html` → `404.html` for its own SPA fallback,
shipping this as the new `index.html` and redeploying makes **both** the root path and any old
deep link (e.g. the former `/demo`) serve this redirect — one file covers every old URL.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=https://studio.workspec.io/decisions" />
    <link rel="canonical" href="https://studio.workspec.io/decisions" />
    <meta name="robots" content="noindex" />
    <title>Moved — WorkSpec Decision Studio is now part of WorkSpec Studio</title>
  </head>
  <body>
    <p>
      WorkSpec Decision Studio has moved to
      <a href="https://studio.workspec.io/decisions">studio.workspec.io/decisions</a>.
    </p>
    <script>
      location.replace('https://studio.workspec.io/decisions');
    </script>
  </body>
</html>
```

Three redundant redirect mechanisms, in order of when a client honours them: the JS
`location.replace` fires first for any browser with scripting enabled (and doesn't leave the old
URL in history); the `<meta http-equiv="refresh">` covers script-disabled browsers; the
`rel="canonical"` link tells search engines/crawlers the real URL even though no crawler executes
JS or honours meta-refresh, so it protects the SEO transfer independently of the other two.

**Verify by loading the URL in a real browser**, not `curl -I` — this is a client-side redirect
(meta-refresh + JS), not a server-side HTTP 3xx, because GitHub Pages custom domains have no
redirect rules to configure. `curl` will only ever show `200` with this page's markup as the
body; that's correct, not a failure.

## 6. DNS retirement — 2027-01

Keep `decision-studio.workspec.io` resolving (DNS record untouched, old repo's Pages still
serving the redirect from §5) for a migration grace window so bookmarks, backlinks, and search
index entries have time to update via the redirect.

**Target date: 2027-01** (~6 months after this cutover). At that point:

1. Remove the `decision-studio` CNAME DNS record for `workspec.io`.
2. In `FieldstateNZ/workspec-decision-studio` → Settings → Pages, remove the custom domain (or
   disable Pages entirely / archive the repo, per whatever this repo's fate is by then).
3. No further action needed on the `workspec-studio` side — `studio.workspec.io` is unaffected by
   the old domain's retirement.
