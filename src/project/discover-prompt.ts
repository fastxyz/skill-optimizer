import type { ActionDefinition } from '../actions/types.js';

export type PromptCapabilityType = 'phase' | 'instruction' | 'output' | 'decision';

export interface PromptCapability {
  name: string;
  description: string;
  section: string;
  type: PromptCapabilityType;
}

// Imperative verbs that start an instruction line.
const IMPERATIVE_VERBS = [
  'write', 'generate', 'create', 'check', 'verify', 'ensure', 'add',
  'remove', 'delete', 'update', 'modify', 'set', 'configure', 'run',
  'execute', 'build', 'deploy', 'test', 'validate', 'send', 'fetch',
  'parse', 'extract', 'transform', 'convert', 'compute', 'calculate',
  'define', 'implement', 'install', 'import', 'export', 'open', 'close',
  'start', 'stop', 'initialize', 'list', 'search', 'find', 'filter',
  'sort', 'map', 'reduce', 'merge', 'split', 'read', 'load', 'save',
  'store', 'output', 'print', 'log', 'return', 'emit', 'publish',
  'subscribe', 'ask', 'prompt', 'collect', 'gather', 'summarize',
  'analyze', 'review', 'approve', 'reject', 'iterate', 'loop', 'repeat',
  'wait', 'retry', 'handle', 'catch', 'throw', 'raise', 'assert',
  'call', 'invoke', 'trigger', 'notify', 'alert', 'warn',
];

const IMPERATIVE_RE = new RegExp(
  `^(?:[-*]\\s+)?(?:\\*\\*)?(?:${IMPERATIVE_VERBS.join('|')})\\b`,
  'i',
);

// Heading patterns for phases/steps.
const PHASE_HEADING_RE = /^##\s+(?:phase|step)\s+(\d+)[:\s—–-]*\s*(.*)/i;

// General ## heading (non-phase).
const HEADING_RE = /^##\s+(.+)/;

// Decision-point patterns (if/when/then, conditional logic).
const DECISION_RE = /\b(?:if|when|unless|otherwise|then|else|in case|provided that|assuming)\b/i;

// Code block detection.
const CODE_BLOCK_OPEN_RE = /^```(\w*)/;
const CODE_BLOCK_CLOSE_RE = /^```\s*$/;

interface MarkdownSection {
  heading: string;
  level: number;
  body: string;
  isPhase: boolean;
  phaseNumber?: number;
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const closingMatch = content.slice(3).match(/\n---\s*(\n|$)/);
  if (!closingMatch || closingMatch.index === undefined) return content;
  return content.slice(3 + closingMatch.index + closingMatch[0].length);
}

/**
 * Split markdown content into sections by ## headings.
 */
function splitSections(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;
  const bodyLines: string[] = [];

  function flushCurrent(): void {
    if (current) {
      current.body = bodyLines.join('\n').trim();
      sections.push(current);
      bodyLines.length = 0;
    }
  }

  for (const line of lines) {
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch) {
      flushCurrent();
      bodyLines.length = 0; // discard preamble lines before first heading
      const phaseMatch = PHASE_HEADING_RE.exec(line);
      current = {
        heading: headingMatch[1]!.trim(),
        level: 2,
        body: '',
        isPhase: Boolean(phaseMatch),
        phaseNumber: phaseMatch ? parseInt(phaseMatch[1]!, 10) : undefined,
      };
    } else if (current) {
      bodyLines.push(line);
    } else {
      // Lines before the first ## heading — accumulate in case there is a preamble.
      bodyLines.push(line);
    }
  }

  flushCurrent();
  return sections;
}

/**
 * Slugify a heading string into a snake_case identifier.
 *   "Phase 1: Requirements Discovery" -> "phase_1_requirements_discovery"
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Extract imperative instructions from section body text.
 * Returns an array of instruction sentences.
 */
function extractInstructions(body: string): string[] {
  const results: string[] = [];
  let inCodeBlock = false;

  for (const line of body.split('\n')) {
    if (CODE_BLOCK_OPEN_RE.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      continue;
    }
    if (CODE_BLOCK_CLOSE_RE.test(line) && inCodeBlock) {
      inCodeBlock = false;
      continue;
    }
    if (inCodeBlock) continue;

    const trimmed = line.trim();
    if (IMPERATIVE_RE.test(trimmed)) {
      // Strip leading markdown list markers and bold markers for the description.
      const clean = trimmed.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
      results.push(clean);
    }
  }

  return results;
}

/**
 * Extract code blocks that represent expected output formats.
 * Returns the raw code block content strings.
 */
function extractOutputFormats(body: string): string[] {
  const blocks: string[] = [];
  let inCodeBlock = false;
  let currentBlock: string[] = [];

  for (const line of body.split('\n')) {
    if (CODE_BLOCK_OPEN_RE.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      currentBlock = [];
      continue;
    }
    if (CODE_BLOCK_CLOSE_RE.test(line) && inCodeBlock) {
      inCodeBlock = false;
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
      }
      continue;
    }
    if (inCodeBlock) {
      currentBlock.push(line);
    }
  }

  return blocks;
}

/**
 * Detect whether the section body contains decision-point language.
 */
function hasDecisionPoints(body: string): boolean {
  let inCodeBlock = false;

  for (const line of body.split('\n')) {
    if (CODE_BLOCK_OPEN_RE.test(line) && !inCodeBlock) {
      inCodeBlock = true;
      continue;
    }
    if (CODE_BLOCK_CLOSE_RE.test(line) && inCodeBlock) {
      inCodeBlock = false;
      continue;
    }
    if (inCodeBlock) continue;

    if (DECISION_RE.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Convert a PromptCapability into an ActionDefinition compatible with the
 * benchmark runner and surface snapshot system.
 */
function capabilityToAction(cap: PromptCapability): ActionDefinition {
  const key = slugify(cap.name);

  // Build args based on the capability type.
  const args: ActionDefinition['args'] = [];

  if (cap.type === 'phase') {
    args.push({
      name: 'user_brief',
      required: true,
      type: 'string',
      description: 'The product brief from the user',
    });
  } else if (cap.type === 'instruction') {
    args.push({
      name: 'input',
      required: true,
      type: 'string',
      description: 'The input to process for this instruction',
    });
  } else if (cap.type === 'output') {
    args.push({
      name: 'content',
      required: true,
      type: 'string',
      description: 'The content to format into the expected output',
    });
  } else if (cap.type === 'decision') {
    args.push(
      {
        name: 'condition',
        required: true,
        type: 'string',
        description: 'The condition or context to evaluate',
      },
      {
        name: 'context',
        required: false,
        type: 'string',
        description: 'Additional context for the decision',
      },
    );
  }

  return {
    key,
    name: key,
    description: cap.description,
    args,
    source: 'prompt',
  };
}

export interface PromptCapabilityWithSection {
  action: ActionDefinition;
  /** Raw markdown body text of the section this capability was extracted from. */
  section: string;
}

/**
 * Discover capabilities from a markdown prompt/skill file, returning each
 * capability paired with its raw section body text.
 */
export function discoverPromptCapabilitiesWithSections(
  skillContent: string,
): PromptCapabilityWithSection[] {
  const content = stripFrontmatter(skillContent);
  const sections = splitSections(content);
  const result: PromptCapabilityWithSection[] = [];
  const seenNames = new Set<string>();

  function addWithSection(cap: PromptCapability): void {
    const key = slugify(cap.name);
    if (seenNames.has(key)) return;
    seenNames.add(key);
    result.push({ action: capabilityToAction(cap), section: cap.section });
  }

  for (const section of sections) {
    // 1. Phase capabilities (## Phase N / ## Step N headings).
    if (section.isPhase && section.phaseNumber !== undefined) {
      const phaseName = `phase_${section.phaseNumber}_${slugify(section.heading.replace(/^(?:phase|step)\s+\d+[:\s—–-]*/i, ''))}`;
      const firstSentence = section.body.split(/[.!?\n]/)[0]?.trim() ?? section.heading;
      addWithSection({
        name: phaseName,
        description: firstSentence || section.heading,
        section: section.body,
        type: 'phase',
      });
    }

    // 2. Instruction capabilities from imperative sentences.
    const instructions = extractInstructions(section.body);
    for (const instruction of instructions) {
      const instructionName = `${slugify(section.heading)}_${slugify(instruction.slice(0, 60))}`;
      addWithSection({
        name: instructionName,
        description: instruction,
        section: section.body,
        type: 'instruction',
      });
    }

    // 3. Output format capabilities from code blocks.
    const outputs = extractOutputFormats(section.body);
    for (let i = 0; i < outputs.length; i++) {
      const snippet = outputs[i]!;
      const outputName = `${slugify(section.heading)}_output${outputs.length > 1 ? `_${i + 1}` : ''}`;
      const preview = snippet.split('\n')[0]?.trim().slice(0, 80) ?? 'code block';
      addWithSection({
        name: outputName,
        description: `Expected output format: ${preview}`,
        section: snippet,
        type: 'output',
      });
    }

    // 4. Decision-point capabilities.
    if (hasDecisionPoints(section.body)) {
      const decisionName = `${slugify(section.heading)}_decision`;
      addWithSection({
        name: decisionName,
        description: `Decision point in "${section.heading}" — evaluate conditional logic`,
        section: section.body,
        type: 'decision',
      });
    }
  }

  // Fallback: no ## sections were found — extract from whole content.
  if (sections.length === 0) {
    const fallbackInstructions = extractInstructions(content);
    for (const instruction of fallbackInstructions) {
      addWithSection({
        name: slugify(instruction.slice(0, 60)) || 'instruction',
        description: instruction,
        section: content,
        type: 'instruction',
      });
    }
    // Last resort: use the first non-empty content line as a single capability.
    // Only do this for non-empty content; empty files should still return [] so
    // buildPromptSurfaceSnapshot's 0-capability guard fires correctly.
    if (result.length === 0 && content.trim().length > 0) {
      const firstLine = content.trim().split('\n').find(l => l.trim().length > 0) ?? 'skill';
      const cleaned = firstLine.replace(/^#+\s*/, '').trim();
      addWithSection({
        name: slugify(cleaned) || 'skill',
        description: cleaned || 'Skill capability',
        section: content,
        type: 'instruction',
      });
    }
  }

  return result;
}

/**
 * Discover capabilities from a markdown prompt/skill file.
 * Parses headings, imperative instructions, code-block output formats,
 * and decision-point logic into ActionDefinition[] compatible with the
 * benchmark runner.
 */
export function discoverPromptCapabilities(skillContent: string): ActionDefinition[] {
  return discoverPromptCapabilitiesWithSections(skillContent).map(({ action }) => action);
}
