---
name: transcrab
description: "Turn 'crab: <url>' into a translated article using the local transcrab-private repo scripts."
metadata:
  {
    "openclaw": {
      "emoji": "🦀",
      "notes": [
        "This is a starter skill template shipped with the TransCrab repo.",
        "You MUST ask the user for consent before adopting/activating this behavior."
      ]
    }
  }
---

# TransCrab Skill (Starter Template)

This skill is meant for OpenClaw assistants to **reliably remember** how to run TransCrab.

## Consent (required)

Before you run anything on the user’s machine or persist new long-term behavior:

- Explain what will happen (network fetch + writing files + committing/pushing)
- Ask the user to confirm the repo path and whether it’s okay

## Behavior contract

Trigger rules:

- Do **not** run on URL alone.
- Run only when the user sends `crab + URL`.
- Preferred syntax: `crab: <url>`.

Working directory (default):

- `~/Projects/transcrab-private`

Command:

```bash
cd ~/Projects/transcrab-private
./scripts/run-crab.sh "<url>"
```

## Pre-flight checks (do these before running)

1) Does the repo exist?
2) Is `./scripts/run-crab.sh` present and executable?
3) Is OpenClaw gateway running?

If any check fails, ask the user what to do.

## Pipeline (must complete end-to-end)

`./scripts/run-crab.sh` only **fetches + writes source + writes a translation prompt**.
You must finish the job: **translate → apply → commit/push → verify deploy**.

1) Generate files + capture JSON output (need `slug` + `promptPath` + `translationProfile`):

```bash
cd ~/Projects/transcrab-private
./scripts/run-crab.sh "<url>" --lang zh --mode auto
```

2) Read `promptPath`, translate it **yourself** (do not ask the user), and save to a temp file.
   - `promptPath` is canonical `translate.prompt.txt`.
   - `translate.<lang>.prompt.txt` may exist as deprecated compatibility copy.
   - Format: first line is `# <translated title>`, blank line, then body.
   - Do **not** wrap in code fences.

3) Execute apply in two stages (refined publish flow):

```bash
# draft stage: writes 03-draft.md (+ 04-critique.md)
node scripts/apply-translation.mjs <slug> --lang zh --in /path/to/translated.zh.md --stage draft

# final stage: writes zh.md (+ 05-revision.md)
node scripts/apply-translation.mjs <slug> --lang zh --in /path/to/translated.zh.final.md --stage final
```

4) Commit + push to the private repo:

```bash
git add content/articles/<slug>/
git commit -m "Add article: <slug>"
git push origin HEAD
```

5) Verify deployment before replying:

```bash
curl -I -L https://transcrab.samsoncj.link/a/<yyyy>/<mm>/<slug>/
```

Only reply with the final page URL after it returns **200**.

## Auto profile behavior (current default)

When running with `--mode auto`:

- Publish pipeline is fixed to `refined` (quality-first, no quick publish path)
- Topic is auto-detected and style is selected accordingly:
  - `technology` → `technical`
  - `business` → `business`
  - `life` → `conversational`

## Output

- Private repo has the new article **including `zh.md`** (and is pushed)
- Refined artifacts are preserved (`01-analysis.md`, `03-draft.md`, `04-critique.md`, `05-revision.md`)
- Deployed page URL is reachable (HTTP 200)
- Reply with the deployed page URL
  - Canonical path: `/a/<yyyy>/<mm>/<slug>/` (yyyy/mm derived from `date` in `zh.md`, UTC)

## Customization points

- Default target language
- Slug rules
- Whether to store raw source
