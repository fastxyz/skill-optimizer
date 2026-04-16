import type { ActionDefinition } from '../actions/types.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FormatPattern {
  name: string;
  pattern: string;
}

export interface PromptEvaluationCriteria {
  /** Required sections in the output (case-insensitive heading match). */
  requiredSections?: string[];
  /** Required format patterns (regex). */
  formatPatterns?: FormatPattern[];
  /** Minimum content length in characters. */
  minLength?: number;
  /** Keywords that must appear (case-insensitive). */
  requiredKeywords?: string[];
  /** Keywords that must NOT appear (hallucination check, case-insensitive). */
  forbiddenKeywords?: string[];
  /** Structural checks. */
  hasCodeBlocks?: boolean;
  hasNumberedList?: boolean;
  hasTable?: boolean;
}

export interface PromptCheckDetail {
  check: string;
  passed: boolean;
  detail: string;
}

export interface PromptEvaluationResult {
  /** Overall score 0.0-1.0 (weighted across all criteria categories). */
  score: number;
  /** Human-readable detail for each sub-check. */
  details: string[];
  /** Structured breakdown of individual checks. */
  checks: PromptCheckDetail[];
  /** Per-category scores before weighting. */
  categoryScores: {
    sections: number;
    format: number;
    keywords: number;
    structure: number;
  };
}

// ── Weights ───────────────────────────────────────────────────────────────────

const WEIGHT_SECTIONS = 0.4;
const WEIGHT_FORMAT = 0.2;
const WEIGHT_KEYWORDS = 0.2;
const WEIGHT_STRUCTURE = 0.2;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a regex that matches a markdown heading (any level) whose text
 * contains the given section name.  Also matches bold lines and plain
 * uppercase lines that act as section headers.
 */
function sectionRegex(section: string): RegExp {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match: ## Section Name, **Section Name**, or SECTION NAME on its own line
  return new RegExp(
    `(?:^#{1,6}\\s+.*${escaped}.*$)|(?:^\\*\\*.*${escaped}.*\\*\\*$)|(?:^${escaped}\\s*$)`,
    'im',
  );
}

function hasCodeBlock(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

function hasNumberedList(text: string): boolean {
  // At least two consecutive numbered items
  return /(?:^|\n)\s*\d+[\.\)]\s+\S.*\n\s*\d+[\.\)]\s+\S/m.test(text);
}

function hasTable(text: string): boolean {
  // Markdown table: header row, separator row, at least one data row
  return /\|.+\|[\r\n]+\|[\s:|-]+\|[\r\n]+\|.+\|/.test(text);
}

// ── Main evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate a model's response against prompt-based criteria.
 * Returns a score 0.0-1.0 (recall equivalent for prompt surface).
 */
export function evaluatePromptResponse(
  response: string,
  criteria: PromptEvaluationCriteria,
): PromptEvaluationResult {
  const checks: PromptCheckDetail[] = [];
  const details: string[] = [];

  // Track per-category numerator / denominator
  let sectionHits = 0;
  let sectionTotal = 0;
  let formatHits = 0;
  let formatTotal = 0;
  let keywordHits = 0;
  let keywordTotal = 0;
  let structureHits = 0;
  let structureTotal = 0;

  // ── 1. Required sections (weight: 40%) ──────────────────────────────────
  if (criteria.requiredSections && criteria.requiredSections.length > 0) {
    sectionTotal = criteria.requiredSections.length;
    for (const section of criteria.requiredSections) {
      const found = sectionRegex(section).test(response);
      if (found) sectionHits++;
      const msg = found
        ? `section "${section}": found`
        : `section "${section}": MISSING`;
      checks.push({ check: `section:${section}`, passed: found, detail: msg });
      details.push(msg);
    }
  }

  // ── 2. Format patterns (part of format weight: 20%) ─────────────────────
  if (criteria.formatPatterns && criteria.formatPatterns.length > 0) {
    formatTotal += criteria.formatPatterns.length;
    for (const fp of criteria.formatPatterns) {
      let matched = false;
      try {
        const re = new RegExp(fp.pattern, 'm');
        matched = re.test(response);
      } catch {
        // Invalid regex — treat as not matched
      }
      if (matched) formatHits++;
      const msg = matched
        ? `format "${fp.name}": matched`
        : `format "${fp.name}": NOT matched`;
      checks.push({ check: `format:${fp.name}`, passed: matched, detail: msg });
      details.push(msg);
    }
  }

  // Minimum length is also a format check
  if (criteria.minLength !== undefined && criteria.minLength > 0) {
    formatTotal++;
    const lengthOk = response.length >= criteria.minLength;
    if (lengthOk) formatHits++;
    const msg = lengthOk
      ? `minLength (${criteria.minLength}): OK (${response.length} chars)`
      : `minLength (${criteria.minLength}): TOO SHORT (${response.length} chars)`;
    checks.push({ check: 'format:minLength', passed: lengthOk, detail: msg });
    details.push(msg);
  }

  // ── 3. Keywords (weight: 20%) ───────────────────────────────────────────
  const responseLower = response.toLowerCase();

  if (criteria.requiredKeywords && criteria.requiredKeywords.length > 0) {
    keywordTotal += criteria.requiredKeywords.length;
    for (const kw of criteria.requiredKeywords) {
      const found = responseLower.includes(kw.toLowerCase());
      if (found) keywordHits++;
      const msg = found
        ? `keyword "${kw}": found`
        : `keyword "${kw}": MISSING`;
      checks.push({ check: `keyword:${kw}`, passed: found, detail: msg });
      details.push(msg);
    }
  }

  if (criteria.forbiddenKeywords && criteria.forbiddenKeywords.length > 0) {
    keywordTotal += criteria.forbiddenKeywords.length;
    for (const kw of criteria.forbiddenKeywords) {
      const absent = !responseLower.includes(kw.toLowerCase());
      if (absent) keywordHits++;
      const msg = absent
        ? `forbidden "${kw}": absent (good)`
        : `forbidden "${kw}": PRESENT (hallucination)`;
      checks.push({ check: `forbidden:${kw}`, passed: absent, detail: msg });
      details.push(msg);
    }
  }

  // ── 4. Structural checks (weight: 20%) ─────────────────────────────────
  if (criteria.hasCodeBlocks !== undefined) {
    structureTotal++;
    const found = hasCodeBlock(response);
    const pass = criteria.hasCodeBlocks ? found : !found;
    if (pass) structureHits++;
    const label = criteria.hasCodeBlocks ? 'expected' : 'unexpected';
    const msg = pass
      ? `codeBlocks (${label}): OK`
      : `codeBlocks (${label}): ${found ? 'PRESENT' : 'MISSING'}`;
    checks.push({ check: 'structure:codeBlocks', passed: pass, detail: msg });
    details.push(msg);
  }

  if (criteria.hasNumberedList !== undefined) {
    structureTotal++;
    const found = hasNumberedList(response);
    const pass = criteria.hasNumberedList ? found : !found;
    if (pass) structureHits++;
    const label = criteria.hasNumberedList ? 'expected' : 'unexpected';
    const msg = pass
      ? `numberedList (${label}): OK`
      : `numberedList (${label}): ${found ? 'PRESENT' : 'MISSING'}`;
    checks.push({ check: 'structure:numberedList', passed: pass, detail: msg });
    details.push(msg);
  }

  if (criteria.hasTable !== undefined) {
    structureTotal++;
    const found = hasTable(response);
    const pass = criteria.hasTable ? found : !found;
    if (pass) structureHits++;
    const label = criteria.hasTable ? 'expected' : 'unexpected';
    const msg = pass
      ? `table (${label}): OK`
      : `table (${label}): ${found ? 'PRESENT' : 'MISSING'}`;
    checks.push({ check: 'structure:table', passed: pass, detail: msg });
    details.push(msg);
  }

  // ── Compute category scores ─────────────────────────────────────────────

  const sectionScore = sectionTotal > 0 ? sectionHits / sectionTotal : 1.0;
  const formatScore = formatTotal > 0 ? formatHits / formatTotal : 1.0;
  const keywordScore = keywordTotal > 0 ? keywordHits / keywordTotal : 1.0;
  const structureScore = structureTotal > 0 ? structureHits / structureTotal : 1.0;

  // If a category has no checks, redistribute its weight proportionally
  // to the categories that do have checks.
  const activeParts: { weight: number; score: number }[] = [];
  if (sectionTotal > 0) activeParts.push({ weight: WEIGHT_SECTIONS, score: sectionScore });
  if (formatTotal > 0) activeParts.push({ weight: WEIGHT_FORMAT, score: formatScore });
  if (keywordTotal > 0) activeParts.push({ weight: WEIGHT_KEYWORDS, score: keywordScore });
  if (structureTotal > 0) activeParts.push({ weight: WEIGHT_STRUCTURE, score: structureScore });

  let score: number;
  if (activeParts.length === 0) {
    // No criteria specified at all — vacuously pass
    score = 1.0;
  } else {
    const totalActiveWeight = activeParts.reduce((s, p) => s + p.weight, 0);
    score = activeParts.reduce((s, p) => s + (p.weight / totalActiveWeight) * p.score, 0);
  }

  return {
    score,
    details,
    checks,
    categoryScores: {
      sections: sectionScore,
      format: formatScore,
      keywords: keywordScore,
      structure: structureScore,
    },
  };
}

// ── Auto-generation from capability ───────────────────────────────────────────

/**
 * Instruction verbs that signal the model should produce something specific.
 * We look for "verb <object>" patterns to extract required keywords.
 */
const INSTRUCTION_VERBS = [
  'include', 'list', 'show', 'display', 'provide', 'output', 'generate',
  'create', 'write', 'produce', 'return', 'describe', 'explain', 'summarize',
  'format', 'use', 'add', 'specify', 'mention', 'contain',
];

/**
 * Generate evaluation criteria from a prompt capability's section content.
 * Extracts expected output patterns from code blocks and instruction verbs
 * found in the skill section text.
 */
export function generateCriteriaFromCapability(
  capability: ActionDefinition,
  skillSection: string,
): PromptEvaluationCriteria {
  const criteria: PromptEvaluationCriteria = {};

  // ── 1. Extract required sections from markdown headings in the section ──
  // Look for sub-headings that describe expected output structure
  const headingRe = /^#{2,6}\s+(.+)$/gm;
  const sections: string[] = [];
  let headingMatch: RegExpExecArray | null;
  while ((headingMatch = headingRe.exec(skillSection)) !== null) {
    const heading = headingMatch[1].trim();
    // Skip headings that are clearly meta / instructional
    if (!/^(example|note|tip|warning|usage|syntax|overview|description)s?$/i.test(heading)) {
      sections.push(heading);
    }
  }
  if (sections.length > 0) {
    criteria.requiredSections = sections;
  }

  // ── 2. Extract format patterns from code fences ──
  // Code blocks in the skill section often show expected output templates.
  const codeBlockRe = /```\w*\n([\s\S]*?)```/g;
  const formatPatterns: FormatPattern[] = [];
  let codeBlockCount = 0;
  let codeBlockMatch: RegExpExecArray | null;
  while ((codeBlockMatch = codeBlockRe.exec(skillSection)) !== null) {
    codeBlockCount++;
    const content = codeBlockMatch[1].trim();
    // Skip very long code blocks (likely full examples, not format constraints)
    if (content.length > 500) continue;
    // Extract lines that look like template patterns (contain placeholders or fixed structure)
    const templateLines = content.split('\n').filter(
      line => /[{<\[].+[}>\]]/.test(line) || /^\s*\w+\s*[:=]/.test(line),
    );
    for (const line of templateLines) {
      // Convert template placeholders to regex wildcards
      const escaped = line.trim()
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\[{<]\\?[^}>\\]+\\?[}>]/g, '.+');
      if (escaped.length > 5) {
        formatPatterns.push({
          name: `template-line-${formatPatterns.length + 1}`,
          pattern: escaped,
        });
      }
    }
  }
  if (formatPatterns.length > 0) {
    criteria.formatPatterns = formatPatterns;
  }

  // ── 3. Detect structural expectations ──
  if (codeBlockCount > 0 || /code block|code example|snippet/i.test(skillSection)) {
    criteria.hasCodeBlocks = true;
  }
  if (/numbered list|ordered list|step[- ]by[- ]step|\d+\.\s/i.test(skillSection)) {
    criteria.hasNumberedList = true;
  }
  if (/\btable\b|markdown table|\|.*\|.*\|/i.test(skillSection)) {
    criteria.hasTable = true;
  }

  // ── 4. Extract required keywords from instruction patterns ──
  const requiredKeywords: string[] = [];
  const verbPattern = new RegExp(
    `\\b(?:${INSTRUCTION_VERBS.join('|')})\\b\\s+(?:the\\s+|a\\s+|an\\s+)?["']?([\\w][\\w\\s-]{2,30}?)["']?(?:\\s*[,;.]|\\s+(?:in|to|for|as|with|from|using))`,
    'gi',
  );
  const seenKeywords = new Set<string>();
  let verbMatch: RegExpExecArray | null;
  while ((verbMatch = verbPattern.exec(skillSection)) !== null) {
    const keyword = verbMatch[1].trim().toLowerCase();
    // Skip very generic words
    if (keyword.length < 3) continue;
    if (/^(the|this|that|your|each|all|any|it|them|these|those)$/i.test(keyword)) continue;
    if (!seenKeywords.has(keyword)) {
      seenKeywords.add(keyword);
      requiredKeywords.push(keyword);
    }
  }
  if (requiredKeywords.length > 0) {
    criteria.requiredKeywords = requiredKeywords;
  }

  // ── 5. Extract forbidden keywords from explicit "do not" / "never" instructions ──
  const forbiddenKeywords: string[] = [];
  const forbiddenPattern = /\b(?:do\s+not|don't|never|avoid|must\s+not|should\s+not|shouldn't)\b\s+(?:\w+\s+)?["']?(\w[\w\s-]{2,30}?)["']?\b/gi;
  const seenForbidden = new Set<string>();
  let forbiddenMatch: RegExpExecArray | null;
  while ((forbiddenMatch = forbiddenPattern.exec(skillSection)) !== null) {
    const keyword = forbiddenMatch[1].trim().toLowerCase();
    if (keyword.length < 3) continue;
    if (/^(the|this|that|your|each|all|any|it|them|use|include|mention)$/i.test(keyword)) continue;
    if (!seenForbidden.has(keyword)) {
      seenForbidden.add(keyword);
      forbiddenKeywords.push(keyword);
    }
  }
  if (forbiddenKeywords.length > 0) {
    criteria.forbiddenKeywords = forbiddenKeywords;
  }

  // ── 6. Infer minimum length from the capability description ──
  // Longer descriptions with many args suggest non-trivial output
  const descLength = (capability.description ?? '').length;
  const argCount = capability.args.length;
  if (descLength > 200 || argCount > 3) {
    criteria.minLength = 200;
  } else if (descLength > 50 || argCount > 1) {
    criteria.minLength = 100;
  }

  return criteria;
}
