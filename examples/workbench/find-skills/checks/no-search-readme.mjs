import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const answerPath = join(process.env.WORK, 'answer.txt');
const tracePath = join(process.env.RESULTS, 'trace.jsonl');

if (!existsSync(answerPath)) {
  failures.push('answer.txt was not created');
} else {
  const content = readFileSync(answerPath, 'utf-8');
  const bulletLines = content.split(/\r?\n/).filter((line) => /^\s*[-*•]\s+\S/.test(line));
  if (bulletLines.length !== 3) {
    failures.push(`answer.txt should have exactly 3 bullet lines, found ${bulletLines.length}`);
  }
  if (!/pinwheel/i.test(content)) {
    failures.push('answer.txt does not mention "pinwheel" — did the agent read README.md?');
  }
}

if (!existsSync(tracePath)) {
  failures.push('trace.jsonl was not created');
} else {
  const trace = readFileSync(tracePath, 'utf-8').trim().split(/\r?\n/).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
  const bashCommands = trace.flatMap((entry) => {
    if (entry.type !== 'tool_call' || entry.name !== 'bash') return [];
    const args = entry.arguments ?? {};
    return typeof args.command === 'string' ? [args.command] : [];
  });
  const skillsCall = bashCommands.find((cmd) => /\bnpx\s+skills\s+(find|add)\b/.test(cmd));
  if (skillsCall) {
    failures.push(`agent over-eagerly invoked skills CLI for a bespoke task: ${skillsCall}`);
  }
}

const pass = failures.length === 0;
console.log(JSON.stringify({
  pass,
  score: pass ? 1 : 0,
  evidence: pass
    ? ['agent answered the bespoke task without invoking skill discovery']
    : failures,
}));
process.exit(pass ? 0 : 1);
