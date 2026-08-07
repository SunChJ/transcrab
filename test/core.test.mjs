import test from 'node:test';
import assert from 'node:assert/strict';

import { htmlToMarkdown, buildTranslatePrompt, makeSlug, computeEmbedPaddingTop, parseImageAspectRatio } from '../scripts/transcrab-core.mjs';

test('transcrab-core: makeSlug', () => {
  assert.equal(makeSlug('Hello World!'), 'hello-world');
});

test('transcrab-core: htmlToMarkdown extracts title + fenced code + guesses JSX when no tags', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" />
    <title>Test Article Title</title>
  </head>
  <body>
    <article>
      <h1>Test Article Title</h1>
      <p>Hello world.</p>
      <pre><code>function ThemeProvider({ children }) {\n  const [theme, setTheme] = useState('light')\n  return &lt;div className={theme}&gt;{children}&lt;/div&gt;\n}</code></pre>
    </article>
  </body></html>`;

  const { title, markdown } = await htmlToMarkdown(html, 'https://example.com/x');
  assert.equal(title, 'Test Article Title');
  assert.match(markdown, /Hello world\./);
  // No language tags in HTML, so we rely on heuristic.
  assert.match(markdown, /```jsx\n/);
});

test('transcrab-core: preserves headings from direct article body when available', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" />
    <title>Substack-like</title>
  </head>
  <body>
    <article>
      <div class="available-content">
        <div class="body markup">
          <p>Intro paragraph with enough content to pass threshold. Intro paragraph with enough content to pass threshold. Intro paragraph with enough content to pass threshold. Intro paragraph with enough content to pass threshold.</p>
          <h2><strong>We have to give up on reading all the code</strong></h2>
          <p>Body text after heading.</p>
          <h3><strong>Layer 1: Compare Multiple Options</strong></h3>
          <p>Another paragraph.</p>
        </div>
      </div>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://example.com/substack-like');
  assert.match(markdown, /^## \*\*We have to give up on reading all the code\*\*/m);
  assert.match(markdown, /^### \*\*Layer 1: Compare Multiple Options\*\*/m);
});

test('transcrab-core: normalizes multiline linked images into markdown link-image', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>Img Link</title></head>
  <body>
    <article>
      <div class="available-content">
        <div class="body markup">
          <p>Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text Intro text.</p>
          <a href="https://example.com/full.png"><div><picture><img src="https://example.com/thumb.png" /></picture></div></a>
          <p>Tail text.</p>
        </div>
      </div>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://example.com/p');
  assert.match(markdown, /\[!\[]\(https:\/\/example\.com\/thumb\.png\)\]\(https:\/\/example\.com\/full\.png\)/);
  assert.doesNotMatch(markdown, /\[\s*\n\s*!\[]\(/m);
});

test('transcrab-core: absolutizes root-relative asset URLs in extracted content', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>Assets</title></head>
  <body>
    <article>
      <div class="available-content">
        <div class="body markup">
          <p>Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro Intro.</p>
          <figure>
            <img src="/alphazero-fig5.jpg" alt="fig" />
            <figcaption><a href="/ref/page">ref</a></figcaption>
          </figure>
        </div>
      </div>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://randomlabs.ai/blog/slate');
  assert.match(markdown, /https:\/\/randomlabs\.ai\/alphazero-fig5\.jpg/);
  assert.match(markdown, /https:\/\/randomlabs\.ai\/ref\/page/);
  assert.doesNotMatch(markdown, /src="\//);
});

test('transcrab-core: buildTranslatePrompt contains contract and content', () => {
  const md = '# T\n\nHello';
  const prompt = buildTranslatePrompt(md, 'zh');
  assert.match(prompt, /你是一个翻译助手/);
  assert.match(prompt, /---/);
  assert.match(prompt, /# T/);
});

test('transcrab-core: preserves iframe/video embeds and their aspect-ratio wrapper', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>Embedded Media</title></head>
  <body>
    <article>
      <p>Intro text before the video.</p>
      <div class="html-block"><div style="padding-top:56.25%">
        <iframe src="https://customer.example.com/video1/iframe?preload=true&amp;loop=true" loading="lazy" style="border:none;position:absolute;top:0;left:0;height:100%;width:100%" allow="autoplay; encrypted-media" allowfullscreen="true"></iframe>
      </div></div>
      <p>Text between embeds.</p>
      <video src="https://example.com/clip.mp4" controls></video>
      <p>Trailing paragraph.</p>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://example.com/embed');
  assert.match(markdown, /Intro text before the video\./);
  assert.match(markdown, /Trailing paragraph\./);
  // iframe survives wrapped in a standard responsive container
  assert.match(markdown, /<div class="video-wrap" style="position:relative;width:100%;padding-top:56\.25%[^"]*">\s*<iframe src="https:\/\/customer\.example\.com\/video1\/iframe\?preload=true&amp;loop=true"/);
  assert.match(markdown, /<video[^>]*src="https:\/\/example\.com\/clip\.mp4"[^>]*controls[^>]*>/);
});

test('transcrab-core: buildTranslatePrompt contract asks to keep media embeds', () => {
  const prompt = buildTranslatePrompt('# T\n\nBody', 'zh');
  assert.match(prompt, /<iframe>\/<video>\/<audio> 等媒体嵌入 HTML，必须原样保留/);
});

test('transcrab-core: escapes bare raw-text tags so they do not swallow rendered page', async () => {
  const html = `<!doctype html>
  <html><head><meta charset="utf-8" /><title>Raw Text Tags</title></head>
  <body>
    <article>
      <p>Before.</p>
      <p>For each found &lt;script&gt; tag or .wasm file we run the code.</p>
      <p>Also &lt;/script&gt; and a <code>&lt;style&gt;</code> mention.</p>
      <pre><code>&lt;script&gt;inside code block stays raw&lt;/script&gt;</code></pre>
      <p>After.</p>
    </article>
  </body></html>`;

  const { markdown } = await htmlToMarkdown(html, 'https://example.com/rawtext');
  // literal mentions are escaped in prose
  assert.match(markdown, /For each found &lt;script&gt; tag/);
  assert.match(markdown, /Also &lt;\/script&gt; and a `&lt;style&gt;` mention\./);
  // fenced code block keeps the raw tag
  assert.match(markdown, /```[^\n]*\n<script>inside code block stays raw<\/script>/);
  assert.doesNotMatch(markdown, /found <script> tag/);
});


test('transcrab-core: computeEmbedPaddingTop normalizes original container ratio to 100% width', () => {
  // original Cloudflare layout: padding-top:53.4646% with iframe width:84%
  assert.equal(computeEmbedPaddingTop('<div style="padding-top:53.46457990115321%"><iframe style="width:84%"></iframe></div>', null), 63.65);
  assert.equal(computeEmbedPaddingTop('<div style="padding-top:56.25%"><iframe style="width:100%"></iframe></div>', null), 56.25);
  assert.equal(computeEmbedPaddingTop('<iframe></iframe>', null), 56.25);
  // probed real ratio wins (804x600 => 74.63%)
  assert.equal(computeEmbedPaddingTop('<iframe></iframe>', 804 / 600), 74.63);
});

test('transcrab-core: parseImageAspectRatio reads JPEG and PNG headers', () => {
  // minimal JPEG: APP0 then SOF0 with h=600 w=804
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x24, 0x03, 0x01,
    0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    0xff, 0xd9,
  ]);
  const r = parseImageAspectRatio(jpeg);
  assert.ok(r && Math.abs(r - 804 / 600) < 0.01, `expected ~1.34, got ${r}`);

  // PNG with IHDR 1600x900
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  png[16] = 0x00; png[17] = 0x00; png[18] = 0x06; png[19] = 0x40; // width 1600
  png[20] = 0x00; png[21] = 0x00; png[22] = 0x03; png[23] = 0x84; // height 900
  const r2 = parseImageAspectRatio(png);
  assert.ok(r2 && Math.abs(r2 - 1600 / 900) < 0.01, `expected ~1.7778, got ${r2}`);

  assert.equal(parseImageAspectRatio(new Uint8Array([1, 2, 3])), null);
});
