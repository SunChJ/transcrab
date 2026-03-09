#!/usr/bin/env node

/**
 * Beacon script: track transcrab.onev.cat homepage sources ("原文" links)
 *
 * Usage:
 *   node scripts/check-onevcat-sources.mjs            # show diff vs last snapshot
 *   node scripts/check-onevcat-sources.mjs --update  # update snapshot
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, ".cache");
const SNAPSHOT_PATH = path.join(CACHE_DIR, "onevcat-sources.json");

const HOMEPAGE = "https://transcrab.onev.cat/";

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function extractOrigLinks(html) {
  const re = /<a href="(https?:\/\/[^"]+)" target="_blank" rel="noreferrer">原文<\/a>/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

function domain(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (TransCrab Beacon)",
      accept: "text/html,*/*",
    },
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function loadPrev() {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveSnapshot(snapshot) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
}

function diffSets(prevArr, curArr) {
  const prev = new Set(prevArr);
  const cur = new Set(curArr);
  const added = [...cur].filter((x) => !prev.has(x));
  const removed = [...prev].filter((x) => !cur.has(x));
  return { added, removed };
}

function topDomains(urls) {
  const m = new Map();
  for (const u of urls) {
    const d = domain(u);
    if (!d) continue;
    m.set(d, (m.get(d) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function main() {
  const args = process.argv.slice(2);
  const doUpdate = args.includes("--update");

  const prev = await loadPrev();

  const fetched = await fetchText(HOMEPAGE);
  if (!fetched.ok) {
    console.error(JSON.stringify({ ok: false, status: fetched.status, url: HOMEPAGE }, null, 2));
    process.exit(1);
  }

  const links = extractOrigLinks(fetched.text);
  const uniqueLinks = [...new Set(links)];

  const snapshot = {
    homepage: HOMEPAGE,
    fetchedAt: new Date().toISOString(),
    count: uniqueLinks.length,
    hash: sha256(uniqueLinks.join("\n")),
    links: uniqueLinks,
    domains: topDomains(uniqueLinks).map(([d, c]) => ({ domain: d, count: c })),
  };

  const result = {
    ok: true,
    homepage: HOMEPAGE,
    current: {
      fetchedAt: snapshot.fetchedAt,
      count: snapshot.count,
      hash: snapshot.hash,
      topDomains: snapshot.domains.slice(0, 12),
    },
    previous: prev
      ? {
          fetchedAt: prev.fetchedAt,
          count: prev.count,
          hash: prev.hash,
          topDomains: (prev.domains || []).slice(0, 12),
        }
      : null,
  };

  if (prev?.links) {
    const { added, removed } = diffSets(prev.links, snapshot.links);
    result.diff = {
      addedCount: added.length,
      removedCount: removed.length,
      added: added.slice(0, 50),
      removed: removed.slice(0, 50),
    };
  } else {
    result.diff = { addedCount: snapshot.links.length, removedCount: 0, added: snapshot.links.slice(0, 50), removed: [] };
  }

  if (doUpdate) {
    await saveSnapshot(snapshot);
    result.updated = true;
    result.snapshotPath = SNAPSHOT_PATH;
  } else {
    result.updated = false;
    result.snapshotPath = SNAPSHOT_PATH;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
