---
name: hydration-research-brief
description: Act as head of research for syp hydration — scan for new academic research and industry/competitor news across hydration science and adjacent markets, then write one synthesized, source-cited article a founder could read over coffee. Use this whenever the user asks for a research brief, research digest, "what's new in hydration research," a scan of the hydration/wellness landscape, or wants their daily/morning research update for syp. Also use it when asked to research a specific angle (heat stress, electrolytes, GLP-1 and hydration, elderly hydration, athletic performance, longevity, wearables) for syp.
---

# syp Hydration Research Brief

Produces one well-written, synthesized research article per run — not a list
of links. The reader is Mathis (co-founder of syp hydration, a hardware
startup), and the article should read like a smart research analyst's morning
memo: here's what's new, here's why it matters to us, here's the source.

## syp context (for judging relevance)

syp is a retrofit sensor sleeve that clips onto any water bottle — not a new
bottle to buy — and tracks real-time fluid intake via a load-cell
mass-change mechanism, synced to an app. Its differentiation from wearables
(WHOOP, Oura, etc.) is that it *measures* intake directly rather than
*inferring* hydration status from proxies like heart rate variability or
skin conductance. Keep this in mind when writing the "why this matters"
section — the sharpest brief connects outside research to something specific
about syp's product, roadmap, market positioning, or fundraising narrative,
not a generic "hydration is important" statement.

## Step 1: Pick today's angle

The brief should NOT cover the same ground every run. Rotate across these
angles:

1. **Core hydration science** — fluid intake tracking, dehydration
   physiology, hydration biomarkers
2. **Heat illness / heat stress** — exertional heat illness, climate-driven
   heat exposure research, occupational heat safety
3. **Electrolytes & sports nutrition** — sodium/electrolyte research, sports
   drink science
4. **Elderly care** — dehydration risk in aging populations, hospital
   readmission links, eldercare tech
5. **GLP-1 drugs & hydration** — dehydration/electrolyte side effects of
   GLP-1 agonists (Ozempic, Wegovy, etc.), a fast-moving adjacent market
6. **Athletic performance & sports science** — hydration's role in
   performance/recovery, pro sports / college athletics adoption
7. **Longevity & healthspan** — hydration's role in aging research,
   biomarker/longevity-clinic angles
8. **Consumer wellness & wearables** — competitor product launches, funding
   news, wearable/hydration-adjacent market moves

Before researching, check the last 5 files in `10 Claude Code/Research
Briefs/` (read their frontmatter `angle:` field). Pick an angle that isn't
among the last 2-3 used, so the archive reads as a varied beat rather than
a rerun. If the user explicitly asks for a specific angle, use that instead
and skip the rotation check.

## Step 2: Research

Use WebSearch and WebFetch (load them via ToolSearch first if deferred).
Aim for a mix of:

- **Academic/clinical sources** — search PubMed
  (`site:pubmed.ncbi.nlm.nih.gov`), and generally look for peer-reviewed
  studies, meta-analyses, or clinical trial results. Prefer things published
  or newly covered in the last ~60 days, but a landmark older study is fair
  game if it's freshly relevant (e.g. just cited in new coverage).
- **Industry/competitor news** — funding rounds, product launches, or
  research partnerships from adjacent players (e.g. HidrateSpark, LARQ,
  Nix Biosensors, Epicore Biosystems, Gatorade Sports Science Institute,
  WHOOP, Oura, Levels, and any GLP-1/eldercare/longevity-tech news relevant
  to the chosen angle).

Do 3-5 searches minimum. **Prefer fetching full text with WebFetch** over
working off search snippets alone — snippets aren't enough to synthesize
accurately or cite specifics, and full text lets you verify a claim before
citing it. Try WebFetch on the 3-5 most promising results.

Some cloud-scheduled environments block WebFetch entirely (every domain
returns `EGRESS_BLOCKED`) while WebSearch keeps working — this is an
environment network policy, not something retrying fixes. If you hit that,
don't burn turns retrying the same domains: fall back to synthesizing from
WebSearch result snippets, but raise the bar to compensate —
cross-reference each claim across 2+ independent search results before
treating it as solid, prefer specific numbers/quotes that show up
consistently across sources over single-source claims, and be conservative
about anything you can't corroborate. Note in your final summary (not the
article itself) whether this run had full WebFetch access or was
snippet-only, so degraded runs are visible to whoever reviews the archive.

If the last few briefs already covered a specific study or news item in
depth, don't re-cover the same one — find something new, even within the
same angle.

## Step 3: Write the article

Save as a new file: `10 Claude Code/Research Briefs/YYYY-MM-DD-<slug>.md`
(today's date, slug = a few words from the angle/headline, e.g.
`2026-08-19-heat-stress-occupational-safety.md`).

Use this structure:

```markdown
---
date: YYYY-MM-DD
angle: <one of the 8 angles above, or the custom angle requested>
---

# <Article title — specific, not generic. E.g. "Heat Illness Is Becoming an
Occupational Safety Liability, Not Just an Athlete Problem">

**TL;DR**
- 3-5 bullets, the "if you only read this" takeaways

## The Research
(400-700 words. Synthesize 2-4 sources into one narrative — don't just
summarize each source in its own paragraph. Explain what's actually new or
notable, not just "a study found X." Write like an analyst who read the
primary sources, not like a press release rewrite.)

## Why This Matters for syp
(2-4 sentences. Be specific: does this validate a message pillar, suggest a
new market/customer segment, inform the fundraising narrative, flag a
competitive move, or suggest a product/content angle? Skip this section's
content entirely rather than writing a generic "hydration matters" filler
sentence if there's no real connection this time.)

## Sources
1. [Title](url) — Publication/Journal, Month Year
2. ...
```

Tone: confident, specific, a little opinionated where the evidence supports
it — not hedging every sentence. Founders skim; make the TL;DR good enough
to stand alone, and make the body worth reading anyway.

## Step 4: Publish to Notion

The daily downstream consumer for this brief is the `Science Articles`
Notion database (under Research & Science) — the `syp-carousel-pipeline`
skill turns whatever's newest there into an Instagram carousel, so this
step is required, not optional. Its schema is just four properties: `Name`
(title), `Date`, `Quick Summary` (text), `File` (attachment, leave empty —
this skill doesn't produce a separate file for it).

Load the Notion tools if deferred (ToolSearch
`select:mcp__fd5257b2-f8a1-4c9c-8f13-ee293212cdd3__notion-create-pages,mcp__fd5257b2-f8a1-4c9c-8f13-ee293212cdd3__notion-query-data-sources`).

Before creating, check for a duplicate so reruns/manual runs never produce
two rows for the same article:

```sql
SELECT url FROM "collection://3c11a731-5797-804a-a3a7-000baad3e727"
WHERE "Name" = ?
```

(bind today's article title). If a match exists, skip creating another row
and note that in your final summary — don't silently double-post either.

Otherwise create one page via `notion-create-pages` with parent
`{"type": "data_source_id", "data_source_id": "3c11a731-5797-804a-a3a7-000baad3e727"}`
and:
- `Name` — the article's full title
- `date:Date:start` — today's date, `YYYY-MM-DD`
- `Quick Summary` — 1-2 sentences distilled from the TL;DR. This is what
  shows in the database table view, so it needs to stand alone without the
  rest of the page.
- page content — the full article body (TL;DR, The Research, Why This
  Matters for syp, Sources) in Notion-flavored Markdown. Skip the raw YAML
  frontmatter block, and don't repeat the title as an H1 — the `Name`
  property already is the title.

## Step 5: Tell the user

Report the angle chosen, the Notion page, the file path, and a one-sentence
summary of the headline finding. Ask if they want it read aloud/summarized
in chat or if the saved article is enough — don't dump the full article
text into chat by default once it exists, to keep the conversation
readable.

## What this skill does not do

- Does not schedule itself — a recurring daily run is set up separately via
  the `schedule` skill once the user is happy with sample output quality.
- Does not publish anywhere else external (no email, no Slack, no
  Instagram/artifact) beyond the `Science Articles` Notion database — the
  saved markdown file in `10 Claude Code/Research Briefs/` is the archival
  copy; Notion is the record other automation (the carousel pipeline)
  actually reads from.
- Does not fabricate studies or statistics. If research on the chosen angle
  is thin this run, say so and either narrow the claim or pick a different
  angle rather than padding with unverifiable claims.
