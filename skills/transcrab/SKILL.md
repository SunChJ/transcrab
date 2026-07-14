---
name: transcrab
description: "Translate and publish an article through TransCrab only when the user explicitly sends `crab: URL`, `crab URL`, or invokes `$transcrab`. Fetch the article, produce a refined Chinese translation, complete the review artifacts, validate, commit only the article directory, push, and verify deployment. Do not use for a bare URL."
---

# TransCrab

## Outcome and authority

Finish only when the translated article is committed, pushed, and reachable at its deployment URL with HTTP 200.

Treat an explicit trigger as authorization to fetch the URL, write the generated article directory, run validation, commit that directory, push the current branch, and poll deployment. Do not request routine confirmation again.

## Preflight

1. Confirm `/Users/samsoncj/develop/transcrab`, `scripts/run-crab.sh`, and `scripts/apply-translation.mjs` exist.
2. Run `git status --short`; preserve unrelated changes and inspect changed workflow scripts before relying on them.
3. Stop and ask only when a required path or script is missing. Do not guess a replacement repository.

## Workflow

1. Fetch the article and capture the JSON result:

```bash
cd /Users/samsoncj/develop/transcrab
./scripts/run-crab.sh "<url>" --lang zh --mode auto
```

   Require `ok: true`, `slug`, `dir`, `promptPath`, and `articlePath`. Use these returned values instead of reconstructing paths. Read `promptPath`, `source.md`, and `01-analysis.md` before translating.

2. Write the Chinese draft yourself; never ask the user to supply it. Preserve Markdown structure, links, tables, images, code blocks, and canonical product/API names. Use this shape:

```text
# <translated title>

<translated body>
```

Do not wrap the translation in a code fence.

3. Save the draft to `/tmp/transcrab-<slug>-draft.md` and apply it:

```bash
node scripts/apply-translation.mjs <slug> --lang zh --in /tmp/transcrab-<slug>-draft.md --stage draft
```

   Require `ok: true`. Inspect `lint.report.json`; resolve material warnings rather than accepting auto-fixes blindly.

4. Complete the refined review:

   - Replace remaining `TODO` fields in `01-analysis.md` with actual terminology, audience, and tone decisions.
   - Review `03-draft.md` against `source.md` for factual accuracy, terminology drift, Markdown integrity, readability, and style.
   - Replace the placeholder checks in `04-critique.md` with specific findings.
   - Apply the findings to `/tmp/transcrab-<slug>-final.md`.

5. Apply the final translation:

```bash
node scripts/apply-translation.mjs <slug> --lang zh --in /tmp/transcrab-<slug>-final.md --stage final
```

   Require `ok: true`. Replace the generated `TODO` fields in `05-revision.md` with the actual changes and unresolved issues. Do not publish with unresolved material accuracy or structure problems.

6. Validate the repository:

```bash
npm test
npm run build
```

   If a failure is unrelated to the new article, name it and continue only after confirming the article is not implicated.

7. Check the article scope with `git diff --check -- content/articles/<slug>/` and
   `git diff --stat -- content/articles/<slug>/`. Inspect only unresolved or suspicious hunks that
   were not already covered by the source/draft/final review, then commit and push only that directory:

```bash
git add content/articles/<slug>/
git commit -m "Add article: <slug>"
git push origin HEAD
```

8. Build the deployment URL from the returned `articlePath`, then verify it:

```bash
curl -I -L "https://transcrab.samsoncj.link<articlePath>"
```

   Poll briefly for deployment. Reply with the final URL only after HTTP 200. If deployment remains pending, report the pushed commit, expected URL, and current status.

## Quality Rules

- Translate meaning, tone, and examples; do not invent claims.
- Make technical Chinese natural without translating canonical product or API names.
- Preserve links, images, tables, code blocks, inline SVG placeholders, and source structure.
- Keep `01-analysis.md`, `03-draft.md`, `04-critique.md`, and `05-revision.md`; do not leave review `TODO` placeholders.
