#!/usr/bin/env node

// Verify that embedded media (iframe/video) survives HTML→Markdown extraction,
// that video embeds get a responsive container sized to the real aspect ratio,
// and that bare raw-text tags (e.g. literal <script> in prose) are escaped so
// they cannot swallow the rest of the rendered page.
//
// Usage:
//   node scripts/verify-embed-extraction.mjs <url|path/to/file.html>
//   node scripts/verify-embed-extraction.mjs <url> --expect-iframes 2
//
// Exits 1 when an expectation is not met; prints a JSON report otherwise.

import { htmlToMarkdown } from './transcrab-core.mjs';
import { readFileSync } from 'node:fs';

const arg = process.argv[2];
if (!arg || arg === '-h' || arg === '--help') {
  console.log('Usage: node scripts/verify-embed-extraction.mjs <url|path> [--expect-iframes N]');
  process.exit(2);
}

const expectIframesIdx = process.argv.indexOf('--expect-iframes');
const expectIframes = expectIframesIdx >= 0 ? Number(process.argv[expectIframesIdx + 1]) : null;

const isUrl = /^https?:\/\//i.test(arg);
const html = isUrl ? await (await fetch(arg)).text() : readFileSync(arg, 'utf8');

const { title, markdown } = await htmlToMarkdown(html, isUrl ? arg : 'https://example.local/');

const iframes = markdown.match(/<iframe\b/g) || [];
const videoWraps = markdown.match(/class="video-wrap"[^>]*>/g) || [];
const figures = markdown.match(/^<figure /gm) || [];
const escapedRawText = markdown.match(/&lt;(?:script|style|textarea|title)\b/g) || [];
const bareScript = markdown.match(/(?<!&lt;)<script\b/) || null;

const report = {
  title,
  iframes: iframes.length,
  videoWraps: videoWraps.map((w) => {
    const m = w.match(/padding-top:([\d.]+)%/);
    return m ? `${m[1]}%` : '?';
  }),
  figures: figures.length,
  escapedRawTextTags: escapedRawText.length,
  hasBareScriptOutsideFences: Boolean(bareScript),
};

console.log(JSON.stringify(report, null, 2));

let failed = false;
if (expectIframes !== null && iframes.length !== expectIframes) {
  console.error(`FAIL: expected ${expectIframes} iframe(s), got ${iframes.length}`);
  failed = true;
}
if (videoWraps.length > 0 && videoWraps.some((w) => !/padding-top:[\d.]+%/.test(w))) {
  console.error('FAIL: a video-wrap is missing a computed padding-top ratio');
  failed = true;
}
if (report.hasBareScriptOutsideFences) {
  console.error('FAIL: bare <script> found in prose (would swallow the rendered page)');
  failed = true;
}

process.exit(failed ? 1 : 0);
