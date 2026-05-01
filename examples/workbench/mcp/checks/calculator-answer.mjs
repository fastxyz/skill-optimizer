import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const expectedExpression = '((17 + 25) * 3 - 18) / 6';
const expectedResult = 18;
const failures = [];

const answerPath = join(process.env.WORK, 'answer.json');
if (!existsSync(answerPath)) {
  failures.push('answer.json was not created');
} else {
  try {
    const answer = JSON.parse(readFileSync(answerPath, 'utf-8'));
    if (answer.expression !== expectedExpression) {
      failures.push(`expression mismatch: ${JSON.stringify(answer.expression)}`);
    }
    if (answer.result !== expectedResult) {
      failures.push(`result mismatch: ${JSON.stringify(answer.result)}`);
    }
  } catch (error) {
    failures.push(`answer.json is not valid JSON: ${error.message}`);
  }
}

const tracePath = join(process.env.RESULTS, 'trace.jsonl');
if (!existsSync(tracePath)) {
  failures.push('trace.jsonl was not created');
} else {
  const trace = readFileSync(tracePath, 'utf-8').trim().split(/\r?\n/).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const requiredTools = [
    { tool: 'add', pattern: /\bmcp\s+call\s+calculator\.add\b/ },
    { tool: 'multiply', pattern: /\bmcp\s+call\s+calculator\.multiply\b/ },
    { tool: 'subtract', pattern: /\bmcp\s+call\s+calculator\.subtract\b/ },
    { tool: 'divide', pattern: /\bmcp\s+call\s+calculator\.divide\b/ },
  ];
  const bashCommands = trace.flatMap((entry) => {
    if (entry.type !== 'tool_call' || entry.name !== 'bash') return [];
    const args = entry.arguments ?? {};
    return typeof args.command === 'string' ? [args.command] : [];
  });
  for (const { tool, pattern } of requiredTools) {
    if (!bashCommands.some((command) => pattern.test(command))) {
      failures.push(`trace does not contain calculator.${tool} MCP call`);
    }
  }
}

const pass = failures.length === 0;
console.log(JSON.stringify({
  pass,
  score: pass ? 1 : 0,
  evidence: pass ? ['answer matched and all calculator MCP tools were used'] : failures,
}));

process.exit(pass ? 0 : 1);
