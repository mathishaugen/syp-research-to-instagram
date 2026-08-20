#!/usr/bin/env node
// Renders a syp research-carousel slide deck (from template-spec.json + a deck
// JSON describing each slide's copy) as standalone SVG files — one per slide,
// no browser/canvas needed. Google Drive previews .svg files natively as
// images, so this is what actually shows up as "the slide itself" in Drive.
//
// IMPORTANT: raw SVG files can't load Google Fonts (no network access in the
// preview sandbox), so `font-family` always falls back to a system font
// (Segoe UI / Arial). Text width is therefore estimated conservatively and
// every line is auto-shrunk to fit — never assume Poppins metrics.
//
// Usage: node render-svg.js <template-spec.json> <deck.json> <out-dir>
//
// Two slide "families" (draw from one per run, per SKILL.md, for variance
// day to day — not mixed within a single carousel):
//
//  Family A — Quote & Cascade (from the cream reference template, syp colors):
//   - "text": lines of segments, mixed boxed/plain, each line independently
//     aligned left/center/right. Covers cover hooks, quote-style cascades,
//     and equation lines ("Less input = More clarity").
//   - "cards": 1-2 callout cards (bold label + sub line).
//   - "list2col": two-column plain list.
//   - "statrows": label/value data rows with an optional divider.
//
//  Family B — Bold Impact (scale borrowed from the Borcelle reference):
//   - "stackwords": each word on its own line, auto-sized to fill the full
//     content width edge-to-edge.
//   - "bigstat": eyebrow + a huge value + supporting lines.
//   - "text" is also usable here for short (2-4 word) punch statements —
//     just keep sizes big (90+) so it doesn't read as an afterthought next
//     to the stackwords slides. Do NOT use "cards" or "list2col" in this
//     family — no filled boxes, it's a pure-typography look.
//
//  Both families end on "cta" (closing illustration, no page number).
//
// Any slide may carry a "citation" string — rendered small, dim, above the
// page number. Use it to name the actual source (study authors/journal or
// the article title) — required at least once per deck.
//
// Deck JSON shape: { "slides": [ {...}, ... ] }. Line shape inside "text":
//   "plain string line"
//   { "segments": [ "plain", {"text":"boxed phrase","boxed":true} ], "align":"center" }
//   { "text": "shorthand single-segment line", "boxed": true, "align": "right" }

const fs = require('fs');
const path = require('path');

const [, , specPath, deckPath, outDir] = process.argv;
if (!specPath || !deckPath || !outDir) {
  console.error('Usage: node render-svg.js <spec.json> <deck.json> <out-dir>');
  process.exit(1);
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const deck = JSON.parse(fs.readFileSync(deckPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const assetDir = path.dirname(specPath);
// True vector paths (potrace-traced from the original brand PNGs), not
// embedded raster <image data:...> — Google Drive's own SVG preview strips
// embedded raster images (a sanitizer security behavior), which is why the
// logo used to go missing in Drive's thumbnail even though the file was
// correct. Pure vector paths render everywhere reliably and need no browser
// to rasterize, which is also what makes this pipeline cloud-portable.
const logoPathD = fs.readFileSync(path.join(assetDir, spec.logo.pathAsset), 'utf8').trim();
const illoPathD = fs.readFileSync(path.join(assetDir, spec.illustration.pathAsset), 'utf8').trim();

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Conservative average glyph-width factor for the *fallback system font*
// (Segoe UI / Arial — Poppins never actually loads in a raw SVG). Deliberately
// generous so estimates over- rather than under-shoot; combined with the
// auto-shrink in fitLine(), a line can never render wider than the canvas.
const textWidth = (str, size, bold) => str.length * size * (bold ? 0.66 : 0.6);
const maxContentW = () => spec.canvas.w - spec.margin.x * 2;

// Vertically centers a content block of the given height within the canvas
// (clear of the logo above, the footer below) — used whenever a slide
// doesn't pin an explicit `top`, so short slides don't strand their content
// near the top with a dead zone below it.
function autoTop(blockHeight) {
  const minTop = 300;
  const maxBottom = spec.footer.y - 50;
  let top = (spec.canvas.h - blockHeight) / 2;
  return Math.max(minTop, Math.min(top, maxBottom - blockHeight));
}

function logoSvg() {
  const h = spec.logo.height;
  const w = h * spec.logo.aspect;
  const x = spec.canvas.w - spec.logo.right - w;
  const y = spec.logo.top;
  const scale = h / spec.logo.nativeHeight;
  return `<g transform="translate(${x},${y}) scale(${scale})"><path d="${logoPathD}" fill="${spec.colors.white}" fill-rule="evenodd"/></g>`;
}

function pageNumberSvg(slide) {
  if (slide.type === 'cta' || slide.index === 1 || slide.noFooter) return '';
  const c = spec.colors;
  return `<text x="${spec.canvas.w - spec.margin.x}" y="${spec.footer.y}" text-anchor="end" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${spec.footer.size}" fill="${c.white}">${esc(slide.index)}</text>`;
}

function citationSvg(slide) {
  if (!slide.citation) return '';
  const c = spec.colors, m = spec.margin;
  const cs = 22;
  const y = spec.footer.y - (slide.type === 'cta' ? 0 : 6);
  return `<text x="${m.x}" y="${y}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${cs}" fill="${c.whiteDim}">${esc(slide.citation)}</text>`;
}

// Shrinks lineSize proportionally so the estimated total width of `segs`
// (each {text, bold}) never exceeds `maxW`. Returns { size, segs, totalW }.
function fitLine(segs, size, maxW, boxCount) {
  const padX = spec.highlightPad.x;
  let s = size;
  for (let i = 0; i < 6; i++) {
    const totalW = segs.reduce((sum, seg) => sum + textWidth(seg.text, s, seg.bold) + (seg.boxed ? padX * 2 : 0), 0);
    if (totalW <= maxW) return { size: s, totalW };
    s *= maxW / totalW;
  }
  const totalW = segs.reduce((sum, seg) => sum + textWidth(seg.text, s, seg.bold) + (seg.boxed ? padX * 2 : 0), 0);
  return { size: s, totalW };
}

// --- "text" family: segment-based lines with per-line alignment ---
function normLine(raw) {
  if (typeof raw === 'string') return { segments: [{ text: raw, boxed: false }], align: 'left' };
  if (raw.segments) return { align: 'left', ...raw };
  const { text, boxed, size, weight, color, align } = raw;
  return { align: align || 'left', size, segments: [{ text, boxed, weight, color }] };
}

function renderText(slide) {
  const c = spec.colors, m = spec.margin;
  const defaultSize = slide.size || spec.sizes.statementLarge;
  const lh = spec.lineHeight;
  const maxW = maxContentW();

  let estH = 0;
  if (slide.eyebrow) estH += spec.sizes.eyebrow * lh * 1.9;
  for (const raw of slide.lines) {
    const line = normLine(raw);
    estH += (line.size || defaultSize) * lh;
  }
  let y = slide.top !== undefined ? slide.top : autoTop(estH);
  let body = '';

  if (slide.eyebrow) {
    const eAlign = slide.eyebrowAlign || 'left';
    const anchor = eAlign === 'center' ? 'middle' : eAlign === 'right' ? 'end' : 'start';
    const tx = anchor === 'middle' ? spec.canvas.w / 2 : anchor === 'end' ? spec.canvas.w - m.x : m.x;
    const es = spec.sizes.eyebrow;
    body += `<text x="${tx}" y="${y}" text-anchor="${anchor}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${es}" fill="${c.blueText}">${esc(slide.eyebrow)}</text>`;
    y += es * lh * 1.9;
  }

  for (const raw of slide.lines) {
    const line = normLine(raw);
    const rawSegs = line.segments.map((s2) => {
      const seg = typeof s2 === 'string' ? { text: s2 } : s2;
      return { text: seg.text, boxed: !!seg.boxed, bold: seg.weight ? seg.weight !== 'regular' : true, color: seg.color };
    });
    const { size: lineSize, totalW } = fitLine(rawSegs, line.size || defaultSize, maxW);
    const baseline = y + lineSize * 0.78;
    const padX = spec.highlightPad.x, padY = spec.highlightPad.y;

    let x = line.align === 'center' ? spec.canvas.w / 2 - totalW / 2
      : line.align === 'right' ? spec.canvas.w - m.x - totalW
      : m.x;

    // Boxed-segment rects (estimated position — text itself uses native tspan
    // flow below so it's never mis-measured even if this estimate drifts).
    let cursor = x;
    for (const seg of rawSegs) {
      const w = textWidth(seg.text, lineSize, seg.bold);
      if (seg.boxed) {
        body += `<rect x="${cursor}" y="${y - padY}" width="${w + padX * 2}" height="${lineSize * 1.02 + padY * 2}" fill="${c.blue}"/>`;
        cursor += w + padX * 2;
      } else {
        cursor += w;
      }
    }

    const tspans = rawSegs.map((seg) => {
      const weight = seg.bold ? spec.font.boldWeight : spec.font.regularWeight;
      const fill = seg.boxed ? c.white : seg.color === 'blue' ? c.blueText : c.white;
      const pad = seg.boxed ? ` ${esc(seg.text)} ` : esc(seg.text);
      return `<tspan font-weight="${weight}" fill="${fill}">${pad}</tspan>`;
    }).join('');
    // Center/right alignment anchors against the true canvas coordinate
    // (real glyph widths), not the estimated `x` used for rects above — that
    // estimate is deliberately conservative and would otherwise visibly
    // off-center the line. (Boxed segments only ever appear on left-aligned
    // lines in this deck vocabulary, so this never has to reconcile a boxed
    // rect's estimated position against a centered/right-anchored run.)
    const anchor = line.align === 'center' ? 'middle' : line.align === 'right' ? 'end' : 'start';
    const tx = anchor === 'middle' ? spec.canvas.w / 2 : anchor === 'end' ? spec.canvas.w - m.x : x;
    body += `<text x="${tx}" y="${baseline}" text-anchor="${anchor}" font-family="${spec.font.family}" font-size="${lineSize}">${tspans}</text>`;
    y += lineSize * lh;
  }
  return body;
}

// --- "stackwords": each word auto-sized to fill the content width ---
function renderStackwords(slide) {
  const c = spec.colors, m = spec.margin;
  const contentW = maxContentW();
  const minSize = slide.minSize || 90, maxSize = slide.maxSize || 220;
  const lh = slide.leading || 0.98;

  const sizeFor = (wordRaw) => {
    const word = typeof wordRaw === 'string' ? { text: wordRaw } : wordRaw;
    return Math.max(minSize, Math.min(maxSize, contentW / textWidth(word.text, 1, true)));
  };
  const estH = slide.words.reduce((sum, w) => sum + sizeFor(w) * lh, 0);
  let y = slide.top !== undefined ? slide.top : autoTop(estH);
  let body = '';

  slide.words.forEach((wordRaw) => {
    const word = typeof wordRaw === 'string' ? { text: wordRaw } : wordRaw;
    const bold = true;
    let size = contentW / textWidth(word.text, 1, bold);
    size = Math.max(minSize, Math.min(maxSize, size));
    const baseline = y + size * 0.8;
    const fill = word.color === 'blue' ? c.blueText : c.white;
    if (word.boxed) {
      const padX = spec.highlightPad.x, padY = spec.highlightPad.y;
      const w = textWidth(word.text, size, true);
      body += `<rect x="${m.x}" y="${y - padY}" width="${w + padX * 2}" height="${size * 1.02 + padY * 2}" fill="${c.blue}"/>`;
      body += `<text x="${m.x + padX}" y="${baseline}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${size}" fill="${c.white}">${esc(word.text)}</text>`;
    } else {
      body += `<text x="${m.x}" y="${baseline}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${size}" fill="${fill}">${esc(word.text)}</text>`;
    }
    y += size * lh;
  });
  return body;
}

// --- "bigstat": eyebrow + huge value + supporting lines ---
function renderBigstat(slide) {
  const c = spec.colors, m = spec.margin;
  const maxW = maxContentW();
  const valSizeNom = slide.valueSize || spec.sizes.bigStatValue;
  let estH = (slide.eyebrow ? spec.sizes.eyebrow * 2.6 : 0) + valSizeNom * 1.15
    + (slide.lines || []).length * spec.sizes.body * spec.lineHeight;
  let y = slide.top !== undefined ? slide.top : autoTop(estH);
  let body = '';
  if (slide.eyebrow) {
    const es = spec.sizes.eyebrow;
    body += `<text x="${m.x}" y="${y + es * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${es}" fill="${c.blueText}">${esc(slide.eyebrow)}</text>`;
    y += es * 2.6;
  }
  const { size: valSize } = fitLine([{ text: slide.value, bold: true }], slide.valueSize || spec.sizes.bigStatValue, maxW);
  body += `<text x="${m.x}" y="${y + valSize * 0.8}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${valSize}" fill="${c.white}">${esc(slide.value)}</text>`;
  y += valSize * 1.15;
  const subSize = spec.sizes.body;
  for (const line of slide.lines || []) {
    body += `<text x="${m.x}" y="${y + subSize * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${subSize}" fill="${c.white}">${esc(line)}</text>`;
    y += subSize * spec.lineHeight;
  }
  return body;
}

// --- "cards": heading + a short divided list (bold label + dim sub line) ---
// No filled/stroked boxes — a thin rule divides each item, matching the
// same hairline-divider language as "statrows".
function renderCards(slide) {
  const c = spec.colors, m = spec.margin;
  const hs = spec.sizes.statementSmall;
  const titleSize = spec.sizes.statementMedium * 0.92;
  const subSize = spec.sizes.body * 0.95;
  const rowH = titleSize + subSize * 1.7 + 56;

  const headingLines = slide.heading ? slide.heading.split('\n') : [];
  const estH = (headingLines.length ? headingLines.length * hs * spec.lineHeight + hs * 0.9 : 0)
    + slide.items.length * rowH;
  let y = slide.top !== undefined ? slide.top : autoTop(estH);
  let body = '';

  for (const hl of headingLines) {
    body += `<text x="${m.x}" y="${y + hs * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${hs}" fill="${c.white}">${esc(hl)}</text>`;
    y += hs * spec.lineHeight;
  }
  if (headingLines.length) y += hs * 0.9;

  slide.items.forEach((item, i) => {
    if (i > 0) {
      body += `<line x1="${m.x}" y1="${y}" x2="${spec.canvas.w - m.x}" y2="${y}" stroke="${c.white}" stroke-opacity="0.25" stroke-width="2"/>`;
      y += 44;
    }
    body += `<text x="${m.x}" y="${y + titleSize * 0.8}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${titleSize}" fill="${c.white}">${esc(item.title)}</text>`;
    y += titleSize * 1.25;
    if (item.sub) {
      body += `<text x="${m.x}" y="${y + subSize * 0.8}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${subSize}" fill="${c.whiteDim}">${esc(item.sub)}</text>`;
      y += subSize * 1.5;
    }
  });
  return body;
}

function renderList2col(slide) {
  const c = spec.colors, m = spec.margin;
  const headingSize = spec.sizes.statementSmall;
  const itemSize = spec.sizes.listItem;
  const rowH = itemSize * 2.1;
  const rowCount = Math.max(slide.items.length, (slide.items2 || []).length);
  const estH = (slide.heading ? headingSize * 2.4 : 0) + rowCount * rowH;
  let body = '';
  let y = slide.top !== undefined ? slide.top : autoTop(estH);

  if (slide.heading) {
    body += `<text x="${m.x}" y="${y + headingSize * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${headingSize}" fill="${c.white}">${esc(slide.heading)}</text>`;
    y += headingSize * 2.4;
  }

  const col2x = spec.canvas.w / 2 + 30;
  const rows = rowCount;
  for (let i = 0; i < rows; i++) {
    const ry = y + i * rowH + itemSize * 0.78;
    if (slide.items[i]) {
      body += `<text x="${m.x}" y="${ry}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${itemSize}" fill="${c.white}">${esc(slide.items[i])}</text>`;
    }
    if (slide.items2 && slide.items2[i]) {
      body += `<text x="${col2x}" y="${ry}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${itemSize}" fill="${c.white}">${esc(slide.items2[i])}</text>`;
    }
  }
  return body;
}

function renderStatrows(slide) {
  const c = spec.colors, m = spec.margin;
  const rowH0 = spec.sizes.statValue * 1.55;
  let estH = (slide.heading ? spec.sizes.statementSmall * 3.4 : 0)
    + (slide.eyebrow ? spec.sizes.eyebrow * 3 : 0)
    + (slide.note ? spec.sizes.body * 3.2 : 0)
    + slide.rows.length * rowH0 + (slide.dividerBeforeLast ? rowH0 * 0.7 : 0);
  let body = '';
  let y = slide.top !== undefined ? slide.top : autoTop(estH);

  if (slide.heading) {
    const hs = spec.sizes.statementSmall;
    body += `<text x="${m.x}" y="${y + hs * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${hs}" fill="${c.white}">${esc(slide.heading)}</text>`;
    y += hs * 1.5;
    body += `<line x1="${m.x}" y1="${y}" x2="${m.x + 70}" y2="${y}" stroke="${c.blue}" stroke-width="4"/>`;
    y += hs * 1.9;
  }
  if (slide.eyebrow) {
    const es = spec.sizes.eyebrow;
    body += `<text x="${m.x}" y="${y + es * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${es}" fill="${c.blueText}">${esc(slide.eyebrow)}</text>`;
    y += es * 3;
  }
  if (slide.note) {
    const ns = spec.sizes.body;
    body += `<text x="${m.x}" y="${y + ns * 0.78}" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${ns}" fill="${c.white}">${esc(slide.note)}</text>`;
    y += ns * 3.2;
  }

  const rows = slide.rows;
  const rowH = spec.sizes.statValue * 1.55;
  const labelSize = spec.sizes.statLabel;
  const valueSize = spec.sizes.statValue;
  rows.forEach((row, i) => {
    if (slide.dividerBeforeLast && i === rows.length - 1) {
      y += rowH * 0.25;
      body += `<line x1="${m.x}" y1="${y}" x2="${spec.canvas.w - m.x}" y2="${y}" stroke="${c.white}" stroke-width="2" stroke-opacity="0.6"/>`;
      y += rowH * 0.45;
    }
    const baseline = y + valueSize * 0.78;
    body += `<text x="${m.x}" y="${baseline}" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${labelSize}" fill="${c.white}">${esc(row.label)}</text>`;
    body += `<text x="${spec.canvas.w - m.x}" y="${baseline}" text-anchor="end" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${valueSize}" fill="${c.white}">${esc(row.value)}</text>`;
    y += rowH;
  });
  return body;
}

// --- "cta": closing illustration + save-for-later + domain, no footer ---
function renderCta(slide) {
  const c = spec.colors;
  const maxW = maxContentW();
  const illoW = spec.illustration.width;
  const illoH = illoW * spec.illustration.aspect;
  const illoX = spec.canvas.w / 2 - illoW / 2;
  const illoY = slide.illoTop || 420;
  const illoScale = illoW / spec.illustration.nativeWidth;
  let body = `<g transform="translate(${illoX},${illoY}) scale(${illoScale})"><path d="${illoPathD}" fill="${c.white}" fill-rule="evenodd"/></g>`;

  // Centered lines use text-anchor="middle" with x fixed at the true canvas
  // center, so the *real* rendered glyph widths center themselves — never an
  // estimated width (which is deliberately conservative for the shrink-to-fit
  // check below, and therefore wrong to center against).
  const cx = spec.canvas.w / 2;
  let y = illoY + illoH + 90;
  const segs = slide.headingSegments.map((s) => ({ text: s.text, bold: true, color: s.color }));
  const { size: hs } = fitLine(segs, spec.sizes.ctaHeading, maxW);
  const headingTspans = segs.map((seg) => {
    const fill = seg.color === 'blue' ? c.blueText : c.white;
    return `<tspan fill="${fill}">${esc(seg.text)}</tspan>`;
  }).join('');
  body += `<text x="${cx}" y="${y + hs * 0.8}" text-anchor="middle" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${hs}">${headingTspans}</text>`;
  y += hs * 1.5;

  const ss = spec.sizes.ctaSub;
  for (const line of (slide.sub || '').split('\n')) {
    const { size } = fitLine([{ text: line, bold: false }], ss, maxW);
    body += `<text x="${cx}" y="${y + size * 0.78}" text-anchor="middle" font-family="${spec.font.family}" font-weight="${spec.font.regularWeight}" font-size="${size}" fill="${c.white}">${esc(line)}</text>`;
    y += size * spec.lineHeight;
  }

  if (slide.domain) {
    const ds = spec.sizes.eyebrow;
    body += `<text x="${cx}" y="${spec.footer.y}" text-anchor="middle" font-family="${spec.font.family}" font-weight="${spec.font.boldWeight}" font-size="${ds}" fill="${c.whiteDim}">${esc(slide.domain)}</text>`;
  }
  return body;
}

function renderSlide(slide) {
  let body;
  switch (slide.type) {
    case 'stackwords': body = renderStackwords(slide); break;
    case 'bigstat': body = renderBigstat(slide); break;
    case 'cards': body = renderCards(slide); break;
    case 'list2col': body = renderList2col(slide); break;
    case 'statrows': body = renderStatrows(slide); break;
    case 'cta': body = renderCta(slide); break;
    case 'text':
    default: body = renderText(slide); break;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${spec.canvas.w}" height="${spec.canvas.h}" viewBox="0 0 ${spec.canvas.w} ${spec.canvas.h}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${spec.canvas.w}" height="${spec.canvas.h}" fill="${spec.bg}"/>
  ${logoSvg()}
  ${body}
  ${citationSvg(slide)}
  ${pageNumberSvg(slide)}
</svg>
`;
}

const total = deck.slides.length;
deck.slides.forEach((slide, i) => {
  slide.index = i + 1;
  slide.total = total;
  const svg = renderSlide(slide);
  const outPath = path.join(outDir, `${String(i + 1).padStart(2, '0')}.svg`);
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`Wrote ${outPath}`);
});
