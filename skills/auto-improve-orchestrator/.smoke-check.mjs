#!/usr/bin/env node
// Smoke check for the auto-improve-orchestrator skill.
// Validates: SKILL.md frontmatter, prompt template variables, file existence.

import { readFileSync, existsSync } from 'node:fs';
import matter from 'gray-matter';

const skillRoot = 'skills/auto-improve-orchestrator';
let failures = 0;

function check(condition, msg) {
  if (condition) {
    console.log(`OK: ${msg}`);
  } else {
    console.error(`FAIL: ${msg}`);
    failures++;
  }
}

// 1. SKILL.md exists + frontmatter parses
const skillMdPath = `${skillRoot}/SKILL.md`;
check(existsSync(skillMdPath), `${skillMdPath} exists`);
if (existsSync(skillMdPath)) {
  const parsed = matter(readFileSync(skillMdPath, 'utf-8'));
  check(parsed.data.name === 'auto-improve-orchestrator', 'SKILL.md name = "auto-improve-orchestrator"');
  check(typeof parsed.data.description === 'string' && parsed.data.description.length > 50, 'SKILL.md description is non-trivial');
}

// 2. All four prompt files exist
for (const name of ['orchestrator.md', 'research-upstream.md', 'eval-iterate.md', 'skill-iterate.md']) {
  check(existsSync(`${skillRoot}/prompts/${name}`), `prompts/${name} exists`);
}

// 3. workflow.md + lessons.md + at least one context exist
check(existsSync(`${skillRoot}/references/workflow.md`), 'references/workflow.md exists');
check(existsSync(`${skillRoot}/references/lessons.md`), 'references/lessons.md exists');
check(existsSync(`${skillRoot}/references/contexts`), 'references/contexts/ exists');

// 4. Each prompt has its expected templated variables
const expectedVars = {
  'orchestrator.md': ['SLUG', 'MAIN_REPO_PATH'],
  'research-upstream.md': ['SLUG', 'OUTPUT_PATH'],
  'eval-iterate.md': ['SKILL_ID', 'WORKBENCH_DIR', 'SUITE_RESULT_PATH', 'DIRECTION', 'LESSONS_PATH'],
  'skill-iterate.md': ['SKILL_ID', 'WORKBENCH_DIR', 'SUITE_RESULT_PATH', 'TARGET_FILE', 'CONTEXT_FILE', 'LESSONS_PATH', 'ITERATION'],
};
for (const [file, vars] of Object.entries(expectedVars)) {
  const content = readFileSync(`${skillRoot}/prompts/${file}`, 'utf-8');
  for (const v of vars) {
    check(content.includes(`\${${v}}`), `prompts/${file} contains \${${v}}`);
  }
}

// 5. Old wrapper files are gone
check(!existsSync('tools/auto-improve-skill.mjs'), 'tools/auto-improve-skill.mjs is gone');
check(!existsSync('tools/auto-improve-skill-prompt.md'), 'tools/auto-improve-skill-prompt.md is gone');
check(!existsSync('tools/auto-improve-skill-lessons.md'), 'tools/auto-improve-skill-lessons.md moved out of tools/');
check(!existsSync('tools/auto-improve-contexts'), 'tools/auto-improve-contexts/ moved out of tools/');

// 6. Lessons + contexts at new paths
check(existsSync(`${skillRoot}/references/lessons.md`), 'lessons at new path');
check(existsSync(`${skillRoot}/references/contexts/supabase-supabase-postgres-best-practices.md`), 'supabase context at new path');

if (failures > 0) {
  console.error(`\n${failures} smoke checks failed`);
  process.exit(1);
}
console.log(`\nAll smoke checks passed`);
