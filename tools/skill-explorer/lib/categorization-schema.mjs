// JSON Schema for a single skill's classification, plus a prompt builder.
//
// Both the categorize stage (passes SCHEMA to claude -p --json-schema) and the
// merge stage (uses ENUM_COLUMNS/FREETEXT_COLUMNS for v3 CSV column ordering)
// import from this module.

export const ENUM_COLUMNS = [
  'type',
  'gradability',
  'improvement_potential',
  'author_effort',
  'land_probability',
];

export const FREETEXT_COLUMNS = ['summary', 'notable_issues', 'eval_sketch'];

export const SCHEMA = {
  type: 'object',
  required: ['source', 'name', ...ENUM_COLUMNS, ...FREETEXT_COLUMNS],
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    name: { type: 'string' },
    type: {
      type: 'string',
      enum: ['document', 'tool-use', 'code-patterns', 'meta', 'prose-guidance', 'interactive'],
    },
    gradability: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    improvement_potential: { type: 'string', enum: ['low', 'medium', 'high'] },
    author_effort: { type: 'string', enum: ['low', 'medium', 'high'] },
    land_probability: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string', maxLength: 300 },
    notable_issues: {
      type: 'array',
      items: { type: 'string', maxLength: 200 },
      maxItems: 3,
    },
    eval_sketch: { type: 'string', maxLength: 300 },
  },
};

export const SETUP_COST_SCHEMA = {
  type: 'object',
  required: ['source', 'name', 'setup_cost', 'setup_cost_reasoning'],
  additionalProperties: false,
  properties: {
    source: { type: 'string' },
    name: { type: 'string' },
    setup_cost: { type: 'string', enum: ['low', 'medium', 'high'] },
    setup_cost_reasoning: { type: 'string', maxLength: 250 },
  },
};

export function buildSetupCostPrompt(skill, skillMdContent) {
  return `You are estimating the SETUP COST of evaluating a public agent skill.

Read the SKILL.md content below and return a JSON object that matches the
provided schema. NO prose outside the JSON object.

Skill identity:
  source: ${skill.source}
  name:   ${skill.name}

setup_cost (cost to instantiate a test environment for this skill):
  low    — files only (sample PDF/docx/xlsx; sample code repos) OR local
           tools we already have in our workbench (Docker, Playwright,
           headless Chromium, sandboxed shell). Ready to test with zero
           external account setup.
  medium — free external service. Firebase project, GitHub repo, free-tier
           Vercel/Supabase, public API key. Sign up + free-tier credentials,
           no payment.
  high   — paid or credentialed external service. Azure subscription,
           Microsoft 365 tenant, paid SaaS, services that require a billed
           account. Real money or organisational provisioning to test.

setup_cost_reasoning: one sentence (<= 250 chars) explaining the choice in
terms of what the evaluator would have to provision.

==== SKILL.md content (verbatim) ====

${skillMdContent}

==== End SKILL.md ====

Return JSON only, matching the schema. Set source="${skill.source}" and name="${skill.name}".`;
}

export function buildPrompt(skill, skillMdContent) {
  return `You are categorizing a public agent skill for prioritisation.

Read the SKILL.md content below and return a JSON object that matches the
provided schema. NO prose outside the JSON object.

Skill identity:
  source: ${skill.source}
  name:   ${skill.name}

Dimension definitions (use these EXACT enum values):

type:
  document       — produces structured output files (PDF/docx/xlsx/JSON/HTML)
  tool-use       — drives MCP servers / shell tools / external APIs
  code-patterns  — prescribes code conventions, scaffolds, or transformations
  meta           — about the agent itself (planning, brainstorming, debugging)
  prose-guidance — pure conversational/written guidance with no concrete artifact
  interactive    — requires multi-turn or human-in-loop

gradability:
  easy   — deterministic file diff or regex on trace
  medium — combination of file + trace + light judgment
  hard   — subjective quality, requires LLM-as-judge

improvement_potential:
  low    — SKILL.md is polished, mostly nothing to do
  medium — gaps, minor issues, missing examples
  high   — clear quality issues OR substantial coverage gaps

author_effort (effort for our team to write the PR):
  low    — typo / add example / clarify a sentence (<1 hour)
  medium — add section / reorganise / tighten prose (~half day)
  high   — rewrite section / change architectural assumptions (>1 day)

land_probability (likelihood the maintainer accepts the PR):
  high   — demonstrably correct fix (typo, broken link, factual error)
  medium — subjective improvement (better example, clearer wording)
  low    — opinionated restructure / scope expansion / disagreement risk

Free-text fields:
  summary        — one sentence describing what the skill does
  notable_issues — up to 3 short concrete issues (each <200 chars)
  eval_sketch    — one sentence on how a workbench case would test this skill

==== SKILL.md content (verbatim) ====

${skillMdContent}

==== End SKILL.md ====

Return JSON only, matching the schema. Set source="${skill.source}" and name="${skill.name}".`;
}
