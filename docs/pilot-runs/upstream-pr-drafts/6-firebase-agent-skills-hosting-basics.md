# PR #6 — firebase/agent-skills: configuration review (two-pass)

**Target:** `firebase/agent-skills`
**File:** `skills/firebase-hosting-basics/SKILL.md`
**Base branch:** `main`
**Title:** `Add Configuration Review section to firebase-hosting-basics skill`

## Summary

Adds a `## Configuration Review` section to `skills/firebase-hosting-basics/SKILL.md`
that structures `firebase.json` audits as a **two-pass** workflow:

- **Pass 1** — Visible bad values (`public: src` not build dir; `cleanUrls: false`;
  invalid redirect `type: 200`). Includes an explicit "**Check every entry in the
  `redirects` array**" nudge that closes a real failure mode where models stop
  validating after seeing valid early entries.
- **Pass 2** — Required-but-absent settings (missing `**/.*` or
  `**/node_modules/**` in `ignore`; missing SPA catch-all rewrite). These are
  absence-type rules that are systematically missed without explicit framing.

Purely additive (+33 lines). No existing rules deleted or reworded.

## PR body

```markdown
## Summary

- Adds a `## Configuration Review` section that frames `firebase.json` audits as a two-pass workflow (visible bad values, then required-but-absent settings). Useful for both human and AI reviewers.
- Includes a per-array enumeration nudge ("Check every entry in the redirects array") that closes a measured failure mode where models stop validating after seeing valid early entries.
- Purely additive — no existing rules touched. ~33 lines added.

## Evidence

Eval against the v1.3 auto-pilot orchestrator on the frontier model matrix
(claude-sonnet-4.6, openai/gpt-5, google/gemini-2.5-pro × 3 trials × 3 cases = 27 trials):

| Metric | Baseline | After this change |
|---|---|---|
| Per-case-min rule coverage | **0.89** | **1.00** (+0.11 uplift) |

Eval cases (3, including 2 harder cases the orchestrator added to surface frontier-model headroom):

- `review-firebase-config` — original case, 5 seeded violations
- `review-firebase-config-multi-redirect` — buries `type: 200` in the 3rd redirect entry (first two valid 301s) + missing SPA catch-all. Tests whether models enumerate ALL redirect entries.
- `review-firebase-config-mostly-correct` — `ignore` array missing only `**/.*` (not both patterns) + `cleanUrls: false`. Tests partial-violation detection.

After the additive change, all 3 cases × 3 models × 3 trials = 27/27 PASS.

The "Check every entry in the redirects array" instruction was the targeted fix: gemini went from 2/3 to 3/3 on the multi-redirect case.
```

## File diff

Target: `skills/firebase-hosting-basics/SKILL.md` (the canonical skill file).

The full proposed file is committed in our repo at:

- [`examples/workbench/firebase-hosting-basics/proposed-upstream-changes/firebase-agent-skills/after-SKILL.md`](../../../examples/workbench/firebase-hosting-basics/proposed-upstream-changes/firebase-agent-skills/after-SKILL.md)

Unified diff against upstream `main` (the substantive ~33-line addition;
ignore the link-path tweaks `references/configuration.md` → `configuration.md`
in the workbench copy — those are a vendoring artifact and should NOT be
included in the upstream PR):

```diff
@@ end of "### 3. Emulation" section, before EOF @@

 This serves your app at `http://localhost:5000` by default.
+
+## Configuration Review
+
+When auditing a `firebase.json` for compliance and best practices, review in **two passes** — both are required.
+
+### Pass 1 — Visible bad values
+
+Scan each key for incorrect values:
+
+- `"public"`: must point to the **build output directory** (`dist` or `build`), NOT the source directory (`src`). Using `src` deploys unbuilt source files.
+- `"cleanUrls"`: should be `true`. Setting it to `false` exposes `.html` extensions in all URLs.
+- Redirect `"type"`: must be `301` (permanent) or `302` (temporary). The value `200` is **not a valid redirect type** and will cause errors. **Check every entry in the `redirects` array** — a common mistake is fixing the first redirect while leaving a later entry with `type: 200` uncorrected.
+
+### Pass 2 — Required but absent settings
+
+The most-missed issues are about settings that should be present but are **missing entirely**. After Pass 1, check each section:
+
+**`ignore` array** — must include all three default patterns:
+
+```json
+"ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
+```
+
+Missing `**/.*` exposes hidden files (`.env`, `.htaccess`). Missing `**/node_modules/**` uploads tens of thousands of dependency files.
+
+**SPA catch-all rewrite** — if the project is a Single Page Application (React, Vue, Angular, etc.), the `rewrites` array MUST contain a catch-all rule:
+
+```json
+{ "source": "**", "destination": "/index.html" }
+```
+
+Without this rule, direct navigation to any deep link (e.g., `/dashboard`, `/profile/42`) returns a `404 Not Found` error from the CDN because no matching file exists. Client-side routing only works when the app is served from `index.html`.
```

## Caveats

1. **Google CLA required.** Per the repo's contribution policy, contributors
   must sign the [Google Contributor License Agreement](https://cla.developers.google.com/about)
   before the PR can be merged. One-time step per Google account; covers all
   Google-Open-Source projects.
2. **License: Apache-2.0** (assumed for Firebase / Google projects).
3. **No conventional-commit convention enforced.** Recent merged PRs use plain
   descriptive titles (`Add Remote config skills`, `Update Firestore skill for
   location selection`, `Removing hard-coded version numbers`). Title can be
   freeform.
4. **Workbench-only link-path tweak — DO NOT include upstream.** The
   `after-SKILL.md` in our repo has two small changes that are vendoring
   artifacts:

   ```
   [configuration.md](references/configuration.md) → [configuration.md](configuration.md)
   [deploying.md](references/deploying.md)         → [deploying.md](deploying.md)
   ```

   These adjusted the relative paths because the workbench vendors the skill
   files flat. Upstream uses `references/` subdirectory — KEEP the original
   paths in the upstream submission. Only the `## Configuration Review`
   section addition is in-scope.
5. **Recent merged PRs are small** — typical PR size is 1-3 files,
   8-249 added lines. This 33-line addition fits the typical merge pattern.

## Operator steps to submit

```bash
# 1. Sign the Google CLA at https://cla.developers.google.com/ if not already done.

# 2. Clone the upstream fork
git clone git@github.com:fastxyz/firebase-agent-skills.git \
  /tmp/upstream-firebase-agent-skills
cd /tmp/upstream-firebase-agent-skills
git remote add upstream https://github.com/firebase/agent-skills.git
git fetch upstream
git checkout -b feat/firebase-hosting-basics-configuration-review upstream/main

# 3. Apply ONLY the additive Configuration Review section (not the link-path
# tweaks from the workbench). Paste the +33 lines after the last line of the
# existing skills/firebase-hosting-basics/SKILL.md.

# 4. Commit + push
git add skills/firebase-hosting-basics/SKILL.md
git commit -m "Add Configuration Review section to firebase-hosting-basics skill"
git push -u origin feat/firebase-hosting-basics-configuration-review

# 5. Open PR
gh pr create --repo firebase/agent-skills --base main \
  --title "Add Configuration Review section to firebase-hosting-basics skill" \
  --body-file path/to/this-draft-body.md
```

## Provenance

- v1.3 orchestrator dispatch (frontier matrix):
  - Branch: `eval/auto-pilot/firebase-hosting-basics-v1.3`
  - Commit: `c519d28`
  - Status: `success`
  - Baseline per-case-min: 0.89 → final: 1.00 (+0.11 uplift)
  - Cost: $4.35
- **First end-to-end demo of v1.3's Phase 3.5 (eval-iteration loop):** the
  orchestrator ran a grader-vs-skill check (Recipe G1: widened a line range
  that gemini was reporting outside), then dispatched eval-iterate with
  `direction=add-harder` because the calibrated baseline was 1.00 (ceiling).
  Two harder cases were added by the eval-iterate sub-subagent, then Phase 4
  applied Recipe C (per-array enumeration) to close the gap.
- Context file (research subagent output):
  `skills/auto-improve-orchestrator/references/contexts/firebase-firebase-hosting-basics.md`
- Eval workbench: `examples/workbench/firebase-hosting-basics/`
