import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import slugify from 'slugify';
import { buildTranslatePrompt as buildProfiledTranslatePrompt } from './lib/translate-prompt.mjs';

export function makeSlug(text) {
  const s = String(text || '').trim();
  if (!s) return 'untitled';
  return slugify(s, { lower: true, strict: true }) || 'untitled';
}

export function buildTranslatePrompt(markdown, lang = 'zh', profile = {}) {
  return buildProfiledTranslatePrompt(markdown, lang, profile);
}

export async function htmlToMarkdown(html, baseUrl) {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(html, { url: baseUrl });

  const langHints = collectCodeLangHints(dom.window.document);

  const directContentHtml = pickDirectContentHtml(dom.window.document);
  // Readability strips <iframe> from its output. Swap embeds for placeholder
  // images before parsing and restore them afterwards so video demos and
  // interactive embeds survive extraction.
  protectEmbeddedIframes(dom.window.document);
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const title = article?.title || dom.window.document.title || '';
  const contentHtml =
    directContentHtml ||
    article?.content ||
    dom.window.document.body?.innerHTML ||
    '';

  const contentDom = new JSDOM(contentHtml, { url: baseUrl });
  await restoreEmbeddedIframes(contentDom.window.document);
  applyCodeLangHints(contentDom.window.document, langHints);
  absolutizeAssetUrls(contentDom.window.document, baseUrl);
  const patchedHtml = contentDom.window.document.body?.innerHTML || contentHtml;

  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  // Preserve inline diagram blocks (especially SVG inside <figure>) so we can
  // rehydrate them in-place during translation apply.
  turndown.keep([
    'figure', 'figcaption', 'svg', 'defs', 'g', 'path', 'rect', 'circle', 'ellipse',
    'line', 'polyline', 'polygon', 'text', 'marker', 'pattern', 'lineargradient',
    'radialgradient', 'stop', 'clippath', 'mask', 'symbol', 'use',
    // Embedded media (video demos, interactive embeds) must survive extraction so
    // the translated page does not lose content the original page shows.
    'iframe', 'video', 'audio',
  ]);

  // Keep the aspect-ratio wrapper around embedded media (e.g. Cloudflare blog's
  // <div style="padding-top:…"><iframe/></div>) so absolute-positioned iframes
  // keep their layout instead of collapsing to zero height.
  turndown.addRule('embeddedMediaWrapper', {
    filter(node) {
      if (['IFRAME', 'VIDEO', 'AUDIO'].includes(node.nodeName)) return false;
      if (node.nodeName !== 'DIV') return false;
      const kids = node.children || [];
      for (let i = 0; i < kids.length; i++) {
        if (['IFRAME', 'VIDEO', 'AUDIO'].includes(kids[i].nodeName)) return true;
      }
      return false;
    },
    replacement(_content, node) {
      return '\n\n' + node.outerHTML + '\n\n';
    },
  });

  const fenceLangCounts = new Map();
  const bump = (lang) => {
    if (!lang) return;
    fenceLangCounts.set(lang, (fenceLangCounts.get(lang) || 0) + 1);
  };

  turndown.addRule('fencedCodeBlockWithLanguage', {
    filter(node) {
      return node.nodeName === 'PRE' && node.textContent && node.textContent.trim().length > 0;
    },
    replacement(_content, node) {
      const pre = node;
      const codeEl = pre.querySelector?.('code') || null;

      const classSources = [
        pre.getAttribute?.('class') || '',
        codeEl?.getAttribute?.('class') || '',
        pre.parentElement?.getAttribute?.('class') || '',
      ].filter(Boolean);

      function pickLang(classes) {
        const joined = classes.join(' ');
        let m = joined.match(/\b(?:language|lang)-([a-z0-9_+-]+)\b/i);
        if (m) return normalizeLang(m[1]);
        m = joined.match(/\bext-([a-z0-9_+-]+)\b/i);
        if (m) return normalizeLang(m[1]);
        return null;
      }

      function normalizeLang(lang) {
        const l = String(lang).toLowerCase();
        if (l === 'cs' || l === 'c#') return 'csharp';
        if (l === 'js') return 'javascript';
        if (l === 'ts') return 'typescript';
        if (l === 'sh' || l === 'shell') return 'bash';
        if (l === 'py') return 'python';
        if (l === 'kt') return 'kotlin';
        return l;
      }

      let lang = pickLang(classSources);
      const raw = (codeEl ? codeEl.textContent : pre.textContent) || '';
      const text = raw.replace(/\n+$/g, '');

      if (!lang) lang = guessLangFromCode(text);
      bump(lang);

      const fence = '```';
      const info = lang ? lang : '';
      return `\n${fence}${info}\n${text}\n${fence}\n`;
    },
  });

  let md = turndown.turndown(patchedHtml);

  const defaultFenceLang = pickDefaultFenceLang(fenceLangCounts);
  if (defaultFenceLang) md = applyDefaultLangToFences(md, defaultFenceLang);
  md = normalizeLinkedImageBlocks(md);
  md = escapeBareRawTextTags(md);

  return { title: title.trim(), markdown: md.trim() + '\n' };
}

// Raw-text HTML tags (script/style/textarea/title/…) would swallow the rest of the
// rendered page when a browser parses them, so escape bare occurrences that appear
// as literal text in the extracted markdown. Fenced code blocks are left alone, and
// intentionally kept HTML blocks (figures/embeds) never contain these tags.
const RAW_TEXT_TAG_RE = /<\/?(?:script|style|textarea|title|xmp|plaintext|noscript|template)\b[^>]*>/gi;

function escapeBareRawTextTags(md) {
  const lines = String(md || '').split(/\r?\n/);
  let inFence = false;
  const out = lines.map((line) => {
    if (/^(```+|~~~+)/.test(line.trim())) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;
    return line.replace(RAW_TEXT_TAG_RE, (m) => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  });
  return out.join('\n');
}

// 1x1 transparent GIF used as a placeholder so Readability keeps the position of
// an <iframe> embed (which it would otherwise strip from the extracted content).
const TRANSCRAB_EMBED_DATA_URI =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function protectEmbeddedIframes(doc) {
  for (const el of doc.querySelectorAll('iframe')) {
    const root = findEmbedContainer(el);
    const ph = doc.createElement('img');
    ph.setAttribute('src', TRANSCRAB_EMBED_DATA_URI);
    ph.setAttribute('alt', '[video]');
    ph.setAttribute('data-embed-html', Buffer.from(root.outerHTML, 'utf8').toString('base64'));
    root.parentNode?.replaceChild(ph, root);
  }
}

// Climb from an <iframe> up through bare wrapper <div>s (aspect-ratio containers,
// video-block wrappers) that carry no text and no sibling content, so the whole
// embed block — including its sizing styles — survives Readability as one unit.
function findEmbedContainer(iframeEl) {
  let node = iframeEl;
  while (node.parentElement) {
    const p = node.parentElement;
    if (p.nodeName !== 'DIV') break;
    const text = (p.textContent || '').replace(/\s+/g, '');
    if (text) break;
    const kids = p.childNodes;
    let hasSiblingElement = false;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (c === node) continue;
      if (c.nodeType === 1) {
        hasSiblingElement = true;
        break;
      }
    }
    if (hasSiblingElement) break;
    node = p;
  }
  return node;
}

function restoreEmbeddedIframes(doc) {
  const placeholders = doc.querySelectorAll('img[data-embed-html]');
  return Promise.all(
    [...placeholders].map(async (ph) => {
      const raw = ph.getAttribute('data-embed-html') || '';
      if (!raw) return;
      const html = Buffer.from(raw, 'base64').toString('utf8');
      try {
        // Parse the embed HTML with the placeholder's own document so we do not
        // depend on a module-level JSDOM instance.
        const wrapper = doc.createElement('div');
        wrapper.innerHTML = html;
        const iframe = wrapper.querySelector('iframe');
        if (!iframe) {
          // Not an iframe embed; restore whatever was saved as-is.
          const frag = doc.createDocumentFragment();
          while (wrapper.firstChild) frag.appendChild(wrapper.firstChild);
          ph.parentNode?.replaceChild(frag, ph);
          return;
        }
        const probedRatio = await probeVideoAspectRatio(iframe);
        const paddingTop = computeEmbedPaddingTop(html, probedRatio);
        const container = doc.createElement('div');
        container.className = 'video-wrap';
        container.setAttribute(
          'style',
          `position:relative;width:100%;padding-top:${paddingTop}%;margin:1.2rem 0;border-radius:10px;overflow:hidden;background:#000`
        );
        iframe.setAttribute(
          'style',
          'border:none;position:absolute;top:0;left:0;height:100%;width:100%'
        );
        container.appendChild(iframe);
        ph.parentNode?.replaceChild(container, ph);
      } catch {
        // Leave the placeholder in place if restoration fails.
      }
    })
  );
}

// Probe the real aspect ratio of a video embed from its poster frame, so the
// container can be sized to the video instead of a hard-coded 16:9 box.
async function probeVideoAspectRatio(iframeEl) {
  try {
    let poster = iframeEl.getAttribute('poster') || '';
    const src = iframeEl.getAttribute('src') || '';
    if (!poster && src) {
      const m = src.match(/[?&]poster=([^&]+)/);
      if (m) poster = decodeURIComponent(m[1]);
    }
    if (!poster) return null;
    const res = await fetch(poster, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    return parseImageAspectRatio(buf);
  } catch {
    return null;
  }
}

// Best-effort width/height extraction for JPEG and PNG headers.
export function parseImageAspectRatio(buf) {
  if (!buf || buf.length < 16) return null;
  // JPEG: walk segments until a SOF marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        i += 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const h = (buf[i + 5] << 8) | buf[i + 6];
        const w = (buf[i + 7] << 8) | buf[i + 8];
        if (w > 0 && h > 0) return w / h;
      }
      const len = (buf[i + 2] << 8) | buf[i + 3];
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  // PNG: IHDR at fixed offset.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const w = ((buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19]) >>> 0;
    const h = ((buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23]) >>> 0;
    if (w > 0 && h > 0) return w / h;
  }
  return null;
}

// Decide the responsive padding-top (%) for a video embed.
// Priority: probed real ratio > ratio implied by the original container > 16:9.
export function computeEmbedPaddingTop(embedHtml, probedRatio) {
  if (probedRatio && probedRatio > 0) {
    const p = Math.round((100 / probedRatio) * 100) / 100;
    if (p >= 20 && p <= 150) return p;
  }
  // Original layout usually is <div style="padding-top:P%"><iframe style="width:W%">.
  // Normalize to 100% width: paddingTop = P / W.
  const pm = String(embedHtml || '').match(/padding-top:([\d.]+)%/);
  const wm = String(embedHtml || '').match(/width:([\d.]+)%/);
  if (pm && wm) {
    const p = (parseFloat(pm[1]) / parseFloat(wm[1])) * 100;
    if (p >= 20 && p <= 150) return Math.round(p * 100) / 100;
  }
  return 56.25;
}

function pickDirectContentHtml(doc) {
  const selectors = [
    'article .available-content .body.markup', // Substack article body
    'article .available-content .body',
    'article .body.markup',
  ];

  for (const sel of selectors) {
    const node = doc.querySelector(sel);
    if (!node) continue;

    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    // Avoid grabbing tiny fragments (e.g. bylines or promo blocks).
    if (text.length < 300) continue;

    return node.innerHTML || '';
  }

  return null;
}

function absolutizeAssetUrls(doc, baseUrl) {
  if (!doc || !baseUrl) return;

  const attrs = ['src', 'href', 'poster'];
  for (const attr of attrs) {
    for (const el of doc.querySelectorAll(`[${attr}]`)) {
      const raw = (el.getAttribute(attr) || '').trim();
      if (!raw) continue;
      if (raw.startsWith('http://') || raw.startsWith('https://')) continue;
      if (raw.startsWith('//')) continue;
      if (raw.startsWith('#')) continue;
      if (raw.startsWith('data:')) continue;

      try {
        const abs = new URL(raw, baseUrl).toString();
        el.setAttribute(attr, abs);
      } catch {
        // ignore malformed URL attributes
      }
    }
  }
}

function normalizeLinkedImageBlocks(md) {
  let out = String(md || '');

  // Some sites (notably Substack) wrap clickable images in block elements inside <a>.
  // Turndown can emit a multiline form that renders as stray '[' and URL text:
  // [\n\n![](img)\n\n](link)
  // Normalize to a single-line markdown link-image.
  out = out.replace(
    /\[\s*\n+\s*(!\[[^\]]*\]\([^\n)]+\))\s*\n+\s*\]\(([^\n)]+)\)/g,
    '[$1]($2)'
  );

  return out;
}

function normalizeLangHint(lang) {
  const l = String(lang || '').toLowerCase();
  if (!l) return null;
  if (l === 'cs' || l === 'c#') return 'csharp';
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'sh' || l === 'shell') return 'bash';
  if (l === 'py') return 'python';
  if (l === 'kt') return 'kotlin';
  return l;
}

function detectLangFromClass(className) {
  const c = String(className || '');
  let m = c.match(/\b(?:language|lang)-([a-z0-9_+-]+)\b/i);
  if (m) return normalizeLangHint(m[1]);
  m = c.match(/\bext-([a-z0-9_+-]+)\b/i);
  if (m) return normalizeLangHint(m[1]);
  return null;
}

function codePrefix(text) {
  const t = String(text || '').replace(/\r/g, '').trim();
  return t.slice(0, 120);
}

function collectCodeLangHints(doc) {
  const hints = [];
  for (const pre of doc.querySelectorAll('pre')) {
    const codeEl = pre.querySelector('code') || pre;
    const raw = codeEl.textContent || '';
    const prefix = codePrefix(raw);
    if (!prefix) continue;

    const lang =
      detectLangFromClass(pre.getAttribute('class')) ||
      detectLangFromClass(codeEl.getAttribute('class')) ||
      detectLangFromClass(pre.parentElement?.getAttribute('class'));

    if (!lang) continue;
    hints.push({ prefix, lang });
  }

  const counts = new Map();
  for (const h of hints) counts.set(h.lang, (counts.get(h.lang) || 0) + 1);
  let defaultLang = null;
  if (counts.size === 1) defaultLang = [...counts.keys()][0];

  return { hints, defaultLang };
}

function applyCodeLangHints(doc, pack) {
  const { hints = [], defaultLang = null } = pack || {};

  for (const pre of doc.querySelectorAll('pre')) {
    const codeEl = pre.querySelector('code') || pre;
    const raw = codeEl.textContent || '';
    const prefix = codePrefix(raw);

    let lang = null;
    if (prefix) {
      for (const h of hints) {
        if (prefix === h.prefix || prefix.startsWith(h.prefix) || h.prefix.startsWith(prefix)) {
          lang = h.lang;
          break;
        }
      }
    }

    if (!lang && defaultLang) lang = defaultLang;
    if (!lang) continue;

    const cls = pre.getAttribute('class') || '';
    if (!/\blanguage-/.test(cls)) pre.setAttribute('class', (cls + ' ' + `language-${lang}`).trim());

    const codeCls = codeEl.getAttribute('class') || '';
    if (!/\blanguage-/.test(codeCls)) codeEl.setAttribute('class', (codeCls + ' ' + `language-${lang}`).trim());
  }
}

// Conservative language guessing for code blocks when the source HTML provides no language tags.
function guessLangFromCode(code) {
  const s = String(code || '');
  const t = s.trim();
  if (!t) return null;

  if (/^#!\/(usr\/bin\/env\s+)?(bash|sh)\b/m.test(t)) return 'bash';
  if (/^#!\/(usr\/bin\/env\s+)?python\b/m.test(t)) return 'python';
  if (/^#!\/(usr\/bin\/env\s+)?node\b/m.test(t)) return 'javascript';

  const scores = new Map();
  const add = (lang, n) => scores.set(lang, (scores.get(lang) || 0) + n);

  if (/\b(useState|useEffect|useMemo|useCallback|useRef|createContext)\s*\(/.test(t)) add('javascript', 3);
  if (/\b(import|export)\b/.test(t) && /\bfrom\b/.test(t)) add('javascript', 2);
  if (/\bmodule\.exports\b|\brequire\s*\(/.test(t)) add('javascript', 2);

  if (/\breturn\s*\(<[A-Za-z]/.test(t) || /<[A-Za-z][^>]*>/.test(t)) add('jsx', 4);

  if (/\b(interface|type)\s+[A-Za-z0-9_]+\b/.test(t)) add('typescript', 4);
  if (/\b(as\s+const|satisfies)\b/.test(t)) add('typescript', 3);
  if (/(^|[\(,])\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*[A-Za-z_][A-Za-z0-9_<>\[\]\|& ]{0,60}/.test(t)) add('typescript', 2);

  // If JSX is present, it's usually the right hint even if other JS signals exist.
  if ((scores.get('jsx') || 0) >= 4 && (scores.get('typescript') || 0) >= 3) {
    return 'tsx';
  }
  if ((scores.get('jsx') || 0) >= 4) {
    return 'jsx';
  }

  if (/^\s*def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/m.test(t)) add('python', 4);
  if (/^\s*(set -e|set -euxo pipefail)\b/m.test(t)) add('bash', 4);

  const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const [bestLang, bestScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? 0;

  const minScoreByLang = { jsx: 4, tsx: 6, javascript: 4, typescript: 4, python: 4, bash: 4 };
  const minScore = minScoreByLang[bestLang] ?? 5;
  if (bestScore < minScore) return null;
  if (bestScore - secondScore < 2 && bestScore < (minScore + 2)) return null;

  if (bestLang === 'tsx') return 'tsx';
  if (bestLang === 'jsx') return 'jsx';
  if (bestLang === 'typescript') return 'typescript';
  if (bestLang === 'javascript') return 'javascript';
  return bestLang;
}

function pickDefaultFenceLang(counts) {
  const entries = [...(counts || new Map()).entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const [bestLang, bestCount] = entries[0];
  const secondCount = entries[1]?.[1] ?? 0;

  if (bestCount < 2) return null;
  if (bestCount / Math.max(1, total) < 0.6) return null;
  if (bestCount - secondCount < 2 && bestCount < 6) return null;
  return bestLang;
}

function applyDefaultLangToFences(md, lang) {
  const lines = String(md || '').split(/\r?\n/);
  let inFence = false;
  let fenceToken = '```';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(```+)(.*)$/);
    if (!m) continue;

    const token = m[1];
    const info = (m[2] || '').trim();

    if (!inFence) {
      inFence = true;
      fenceToken = token;
      if (!info) lines[i] = `${token}${lang}`;
    } else {
      if (token === fenceToken) {
        inFence = false;
        fenceToken = '```';
      }
    }
  }

  return lines.join('\n');
}
