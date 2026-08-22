---
name: syp-carousel-pipeline
description: Turn today's article in the "Science Articles" Notion database (under Research & Science) into a 9-slide syp-branded Instagram carousel, publish a review gallery via the Artifact tool, and drop the flattened slide images into a dated Google Drive subfolder for the marketing team. Use when the user asks to run the carousel pipeline, generate today's research carousel, turn the daily article into an Instagram post, or on a scheduled morning run.
---

# syp Carousel Pipeline

Turns the article that lands each morning in the **Science Articles** Notion
database into a 9-slide black/blue syp-branded Instagram carousel: reads the
article, writes the slide copy, renders it against the locked visual
template, publishes a review gallery, and drops ready-to-post images into
Drive. Mathis (or marketing) reviews and posts — this does not publish to
Instagram itself.

## What's locked vs. what varies

- **`assets/template-spec.json`** and **`assets/render-svg.js`** are the
  approved visual system: black canvas, white text (fallback system font —
  see the comment at the top of render-svg.js for why Poppins is declared but
  never actually renders), the signature blue highlight, the syp squiggle
  logo top-right, plain page numbers bottom-right (never on the cover or the
  closing slide). Mathis approved this after several rounds against his own
  reference carousel and its source Canva template. **Do not change these
  files** unless the user explicitly asks to revise the template itself —
  treat "make today's carousel" as a request for new *copy*, not a new visual
  system.
- **`assets/logo-path.txt`** and **`assets/illustration-path.txt`** are the
  locked brand assets — true SVG vector paths (potrace-traced from the
  original brand PNGs, 2026-08-20), not embedded raster images. This is
  deliberate: Google Drive's own SVG preview strips embedded
  `<image href="data:...">` raster elements (a sanitizer security behavior),
  which is what caused the logo to go missing in Drive's thumbnail earlier
  even though the file itself was correct. Pure vector paths render
  everywhere reliably and need no browser to rasterize, which is also what
  makes this pipeline cloud-portable — no Playwright/Chromium dependency for
  the actual deliverable anymore. The old raster PNGs
  (`logo-mark.png`, `closing-illustration.png`) are kept only as source
  material for re-tracing if the paths ever need regenerating — **not**
  read by `render-svg.js` anymore.
  - If re-tracing is ever needed: potrace's polarity is inverted from the
    intuitive reading — trace on `alpha <= threshold` (transparent pixels),
    not `alpha > threshold`, or you'll get a spurious full-frame bounding
    path with the real artwork cut out of it as a hole. Tight-crop to
    `im.getbbox()` first.
- **Copy** — the 9-slide narrative script — is what varies each run, along
  with which slide **family** to draw from (see below).

## The two slide families

Pick **one family per run** and stay inside its vocabulary for all 9 slides
— they are not meant to be mixed within a single carousel. Rotate which
family you use across days for variety (check `assets/last-family.txt` for
which one ran last time, alternate).

- **Family A — "Quote & Cascade"**: slide `type: "text"` (mixed boxed/plain
  segments, independently left/center/right-aligned lines — this alone
  covers cover hooks, quote cascades, and equation-style lines like
  `"Less input = More clarity"`), `"cards"` (a short divided list, bold
  title + dim sub, no filled boxes), `"list2col"`, `"statrows"` (label/value
  data rows with a divider before the last row).
- **Family B — "Bold Impact"**: `"stackwords"` (each word own line,
  auto-sized to fill the width edge-to-edge — the standout move), `"bigstat"`
  (eyebrow + a huge value + supporting lines), and `"text"` for short 2-4
  word punch statements **at large explicit sizes (90+)** so they don't read
  as an afterthought next to the stackwords slides. Do **not** use `"cards"`
  or `"list2col"` in this family — it's pure typography, no filled boxes.

Both families end on `"cta"` — the closing illustration + "Save This for
**Later**" + subtext + `syphydration.com`. Keep this CTA slide's copy
consistent across runs (it's evergreen), don't rewrite it per article.

Full deck JSON schema, line/segment shape, and per-type fields are documented
in the header comment of `assets/render-svg.js` — read it before writing a
deck.

## Steps

1. **Fetch today's article.** Query the "Science Articles" data source
   (`collection://3c11a731-5797-804a-a3a7-000baad3e727`, under Research &
   Science) for the row matching today's date:
   ```
   SELECT url, Name, "Quick Summary", "date:Date:start", File, createdTime
   FROM "collection://3c11a731-5797-804a-a3a7-000baad3e727"
   ORDER BY createdTime DESC LIMIT 5
   ```
   Take the entry whose date matches today (or the most recent if none
   matches exactly — note this to the user).
2. **Read the source, not just the summary.** If the row has a `File`
   attachment, fetch/download it and read the actual article — this is what
   lets you write specific, accurate slide copy *and* pull a real citation
   (authors, journal, year — the kind of line the reference carousel shows:
   "Maughan et al., American Journal of Clinical Nutrition, 2016"). If there's
   no file, work from the `Name` + `Quick Summary` fields and cite honestly
   as sourced from the syp Science Articles brief — never fabricate a journal
   citation you don't actually have.
3. **Pick a family** (A or B) — check `assets/last-family.txt`, use the
   other one, then update that file to the family you used.
4. **Write the 9-slide script** in that family's vocabulary:
   - Slide 1: cover hook, no page number (index 1 never gets one).
   - Slides 2-8: build a problem → mechanism → evidence → stakes narrative
     arc grounded in the actual article. Put a `citation` field (small, dim,
     rendered above the page number) on at least one slide — required every
     run.
   - Slide 9: the evergreen `"cta"` slide.
   - Ground every claim in what the article actually says — this is a
     health/science claim on a commercial account; do not embellish beyond
     the source.
   - Don't set explicit `"top"` on slides unless you have a specific reason
     to override the default vertical centering.
5. **Render.** Write the deck JSON to a scratch file, then:
   `node assets/render-svg.js assets/template-spec.json <deck.json> <out-dir>`
   — produces `01.svg`...`09.svg`. Then rasterize to PNG with
   `NODE_PATH="$(npm root -g)" node assets/svg-to-png.js <svg-dir> <png-out-dir>`
   (headless Chromium via the globally-installed `playwright` package —
   correct fonts/logo, full quality, no color quantization needed).
6. **Publish the review gallery.** Build an HTML page embedding the 9
   rendered SVGs (base64 data URIs, no external requests) in a horizontal
   filmstrip, with the article title/summary/date as a header. Publish via
   the Artifact tool using the URL in `assets/last-artifact-url.txt` so it
   updates the same link each run rather than creating a new artifact. Update
   that file if the returned URL ever differs.
7. **Upload the PNGs to Drive for the team — the images themselves, not a
   link.** Use the OAuth uploader at
   `C:\Users\Mathis Haugen\.syp-carousel-pipeline\drive_upload.py` (see the
   dedicated section below for why — do **not** use the Drive connector's
   `create_file` for this, it's unreliable for binary files):
   1. `python drive_upload.py create-folder <parent_id> <YYYY-MM-DD>` where
      `parent_id` is the ID in `assets/drive-folder-id.txt` — note the
      returned folder `id`.
   2. For each PNG: `python drive_upload.py upload <folder_id> <path> "<title>"`,
      named `01 - <short slide gist>.png` through `09 - ...png`. Check the
      printed `size` against the local file's byte size after each — it
      should match exactly.
   3. **Also write the Instagram caption into the same dated folder**, as a
      plain `.txt` file named `caption.txt` — the full caption text (hook +
      body + hashtags), nothing else. Write it to a local scratch file first,
      then `python drive_upload.py upload <folder_id> <caption_path> "caption.txt"`.
      Marketing needs the caption sitting right next to that day's images,
      not just visible in the review gallery — every run drops one, no
      exceptions.
      - In the cloud routine (no local Python/OAuth script available), use
        the Drive connector's `create_file` with `textContent` for this one
        file instead — plain text through that path is reliable (only
        binary/base64 was ever the problem, see the section below).
   4. **Also write a standalone X (Twitter) post into the same dated folder**,
      as `x-post.txt` — one self-contained short-form version of the same
      story, NOT just a trimmed copy of the Instagram caption. Rewrite it in
      X's native register: single punchy hook, 1-2 supporting facts, a plain
      one-line takeaway, no more than 1-2 hashtags (X readers don't scan
      hashtag-heavy copy the way IG readers do). Hard cap at 280 characters
      total including any link/hashtags — check the character count before
      writing the file, don't just aim for "short." End with
      `syphydration.com` if it fits. Upload the same way as `caption.txt`
      (`drive_upload.py` locally, `create_file`/`textContent` in the cloud).
      There is no image requirement for this one — it's text-only, to be
      pasted directly into a new X post; the carousel images are for
      Instagram, not X.
8. **Tell the user**: the gallery link, the Drive subfolder link, a
   one-sentence summary of the article and the angle the carousel takes, and
   which family was used (so they can tell at a glance the last run used the
   other one).

## Uploading to Drive: use the OAuth script, not the Drive MCP connector

The Drive connector's `create_file` tool (`base64Content`/`textContent`)
routes binary content through a chat tool call — for files bigger than a
couple KB this is **not reliable**: content can arrive silently
corrupted/truncated (only a mismatched `fileSize` reveals it; there's no
error). Confirmed 2026-08-19 across repeated attempts at PNG upload.

**The fix already set up**: a standalone OAuth-authenticated script outside
this repo (so the credential never lives in a Drive-synced folder) that
calls the real Drive REST API with a proper HTTP multipart upload — this is
what a normal Drive client does, and it doesn't go through any of Claude's
own text-generation, so there's no transcription risk at all.

- **Location**: `C:\Users\Mathis Haugen\.syp-carousel-pipeline\` (deliberately
  outside any Drive-synced folder — never move this into the project dir).
  - `credentials/client_secret.json` — Desktop-app OAuth client (Cloud
    project `syp-research`). The org has `iam.disableServiceAccountKeyCreation`
    enforced, so a service account key was not an option — OAuth + a stored
    refresh token was the workaround.
  - `credentials/token.json` — refresh token from the one-time consent flow
    already completed. Silently re-authenticates on every run; no browser
    needed unless this file is deleted or the grant is revoked.
  - `oauth_setup.py` — one-time consent flow (only re-run if `token.json` is
    lost or the user revokes access).
  - `drive_upload.py` — the actual uploader. Usage:
    ```
    python drive_upload.py create-folder <parent_id> <name>
    python drive_upload.py upload <parent_id> <local_file_path> [<title>]
    ```
    Always check the printed `size` field against the local file's byte size
    as a sanity check before moving on — it should match exactly (unlike the
    old connector path, mismatches here would indicate a real bug, not
    routine transcription drift).
  - Shell quoting note: `python.exe` and this script's path both contain
    spaces — when looping over multiple files, keep `PY=".../python.exe"`
    and `SCRIPT=".../drive_upload.py"` as separate variables and call
    `"$PY" "$SCRIPT" upload ...`, never interpolate them pre-joined into one
    quoted string (that broke silently on the first automated run here).

**Every run**: render PNGs locally (headless Chromium via the globally
installed `playwright` package — see `svg-to-png.js` pattern used
2026-08-19 if not already saved into `assets/`), then upload each with
`drive_upload.py upload`. SVGs can still go up via the Drive connector's
`textContent` path (reliable for text) if a vector copy is wanted
alongside, but PNG is what the user actually asked for and what marketing
should receive — treat PNG-via-`drive_upload.py` as the primary path now,
not a fallback.

Also note: Google Drive's own SVG preview thumbnail appears to strip
embedded `<image href="data:...">` raster elements (a sanitizer security
behavior) — this is why the syp logo went missing in Drive's SVG preview
even though the SVG file itself was correct. Not relevant once PNG is the
primary format, but worth remembering if SVG delivery ever comes back.

## The cloud routine only uploads SVG — a local step converts it to PNG

The **"Research to Instagram"** cloud routine (`trig_01PSBRVgCz99Yo2uE8bcBcfs`)
has no Chromium and no access to `drive_upload.py`'s OAuth credentials, so its
stored prompt has it upload the 9 rendered SVGs straight into the dated Drive
subfolder via the Drive connector's `create_file` (`textContent`, reliable for
text). That is deliberate and correct for the cloud leg — **but it means the
Drive folder is SVG-only right after the cloud run**, not the PNG/JPG
marketing actually needs.

**The fix**: `C:\Users\Mathis Haugen\.syp-carousel-pipeline\finish-carousel-drive.py`,
run locally by Windows Task Scheduler task `syp-carousel-drive-finish` daily at
7:20am Mountain (9:20am ET — ~16 min after the cloud routine's 9:04am ET fire,
which has taken 10-13 min end to end both times it's run). It:
1. Finds today's dated subfolder under `drive-folder-id.txt`'s parent.
2. Downloads each SVG via the real Drive API (bytes only ever move through
   code — never retyped by a model, so no corruption risk).
3. Rasterizes with the same `svg-to-png.js` + Playwright used everywhere else.
4. Uploads each PNG via `drive_upload.py`, verifying byte-exact size.
5. Trashes the original SVGs, leaving the folder PNG-only.

If this task is ever disabled or the machine is off at run time, the Drive
folder will silently stay SVG-only for that day — check
`Get-ScheduledTask -TaskName syp-carousel-drive-finish` if PNGs go missing
again, and re-run manually with
`python finish-carousel-drive.py YYYY-MM-DD` for any date it missed.

## What this skill does not do

- Does not post to Instagram or any social platform — marketing takes it
  from the Drive folder.
- Does not change the visual template. If the user wants to iterate on the
  design again, that's a template revision, not a normal run — treat it the
  same way `syp-ad-pipeline` treats its locked `template-spec.json`.
- Does not invent citations. If the underlying article isn't available in
  full, cite the syp brief honestly rather than fabricating a journal
  reference.
