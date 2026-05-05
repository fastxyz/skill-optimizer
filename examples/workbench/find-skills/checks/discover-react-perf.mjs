import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const failures = [];
const answerPath = join(process.env.WORK, 'answer.txt');
const tracePath = join(process.env.RESULTS, 'trace.jsonl');

if (!existsSync(answerPath)) {
  failures.push('answer.txt was not created');
} else {
  const content = readFileSync(answerPath, 'utf-8');
  if (!/^\s*npx\s+skills\s+add\s+\S+/m.test(content)) {
    failures.push('answer.txt does not contain a "npx skills add <package>" line');
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
  const findCommand = bashCommands.find((cmd) => /\bnpx\s+skills\s+find\b/.test(cmd));
  if (!findCommand) {
    failures.push('trace does not contain "npx skills find" call');
  } else if (!/(react|performance|monitor|next)/i.test(findCommand)) {
    failures.push(`"npx skills find" query lacks react/performance/monitor/next keyword: ${findCommand}`);
  }
}

const pass = failures.length === 0;
console.log(JSON.stringify({
  pass,
  score: pass ? 1 : 0,
  evidence: pass
    ? ['agent searched for a relevant skill and wrote an install command']
    : failures,
}));
process.exit(pass ? 0 : 1);
