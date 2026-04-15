/**
 * Prompt surface discoverer.
 *
 * Parses SKILL.md files to extract phases, capabilities, and structural
 * information. This enables benchmarking how well models follow prompt
 * templates — not just tool calls.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { DiscoveryOptions } from './types.js';

// ── Types ─────────────────────────────────────────────────────────────────

export interface PromptPhase {
  name: string;
  description: string;
  hasCodeBlocks: boolean;
  hasNumberedSteps: boolean;
  hasDecisionPoints: boolean;
}

export interface PromptCapability {
  name: string;
  description: string;
  source: 'phase' | 'instruction';
}

export interface PromptDiscoverySnapshot {
  surface: 'prompt';
  phases: PromptPhase[];
  capabilities: PromptCapability[];
  sources: string[];
}

// ── Phase parsing ─────────────────────────────────────────────────────────

const PHASE_HEADER_RE = /^##\s+(?:Phase\s+\d+\s*[—–-]\s*)?(.+)$/gm;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const NUMBERED_STEP_RE = /^\d+\.\s+/m;
const DECISION_POINT_RE = /\b(?:if|when|unless|otherwise|decide|choose|either)\b/i;

function extractPhases(content: string): PromptPhase[] {
  const phases: PromptPhase[] = [];
  const headers: { name: string; start: number }[] = [];

  // Find all phase headers (## headings)
  let match: RegExpExecArray | null;
  const headerRe = new RegExp(PHASE_HEADER_RE.source, PHASE_HEADER_RE.flags);
  while ((match = headerRe.exec(content)) !== null) {
    headers.push({ name: match[1].trim(), start: match.index });
  }

  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].start;
    const end = i + 1 < headers.length ? headers[i + 1].start : content.length;
    const sectionContent = content.slice(start, end);

    // Extract description: first non-empty, non-heading line
    const lines = sectionContent.split('\n').slice(1); // skip the heading itself
    const descLine = lines.find((l) => l.trim().length > 0 && !l.startsWith('#'));
    const description = descLine?.trim() ?? '';

    phases.push({
      name: headers[i].name,
      description,
      hasCodeBlocks: CODE_BLOCK_RE.test(sectionContent),
      hasNumberedSteps: NUMBERED_STEP_RE.test(sectionContent),
      hasDecisionPoints: DECISION_POINT_RE.test(sectionContent),
    });

    // Reset lastIndex for the stateful regex
    CODE_BLOCK_RE.lastIndex = 0;
  }

  return phases;
}

// ── Capability extraction ─────────────────────────────────────────────────

function extractCapabilities(content: string, phases: PromptPhase[]): PromptCapability[] {
  const capabilities: PromptCapability[] = [];

  if (phases.length > 0) {
    // Derive capabilities from phases
    for (const phase of phases) {
      capabilities.push({
        name: phase.name,
        description: phase.description,
        source: 'phase',
      });
    }
  } else if (content.trim().length > 0) {
    // No phases found — extract capabilities from top-level instructions
    // Look for bullet points or imperative sentences
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Match bullet points: "- Do something" or "* Do something"
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        capabilities.push({
          name: bulletMatch[1].slice(0, 60),
          description: bulletMatch[1],
          source: 'instruction',
        });
      }
    }

    // If still no capabilities, treat the whole content as one instruction block
    if (capabilities.length === 0) {
      const firstLine = lines.find((l) => l.trim().length > 0 && !l.startsWith('#') && !l.startsWith('---'));
      if (firstLine) {
        capabilities.push({
          name: firstLine.trim().slice(0, 60),
          description: firstLine.trim(),
          source: 'instruction',
        });
      }
    }
  }

  return capabilities;
}

// ── Frontmatter stripping ─────────────────────────────────────────────────

function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx !== -1) {
      return content.slice(endIdx + 3).trim();
    }
  }
  return content;
}

// ── Public API ────────────────────────────────────────────────────────────

export function discoverPromptSurfaceFromContent(content: string): PromptDiscoverySnapshot {
  const body = stripFrontmatter(content);
  const phases = extractPhases(body);
  const capabilities = extractCapabilities(body, phases);

  return {
    surface: 'prompt',
    phases,
    capabilities,
    sources: [],
  };
}

export function discoverPromptSurfaceFromSources(
  sources: string[],
  options: DiscoveryOptions = {},
): PromptDiscoverySnapshot {
  const baseDir = options.baseDir ?? process.cwd();
  const resolvedSources = sources.map((source) => resolve(baseDir, source));

  const allPhases: PromptPhase[] = [];
  const allCapabilities: PromptCapability[] = [];

  for (const sourcePath of resolvedSources) {
    if (!existsSync(sourcePath)) {
      throw new Error(`Prompt discovery source file does not exist: ${sourcePath}`);
    }

    const content = readFileSync(sourcePath, 'utf-8');
    const snapshot = discoverPromptSurfaceFromContent(content);
    allPhases.push(...snapshot.phases);
    allCapabilities.push(...snapshot.capabilities);
  }

  return {
    surface: 'prompt',
    phases: allPhases,
    capabilities: allCapabilities,
    sources: resolvedSources,
  };
}
