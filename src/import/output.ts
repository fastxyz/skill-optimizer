import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { CliCommandDefinition } from './types.js';

export async function promptOverwrite(outPath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('error', (err) => {
      rl.close();
      reject(err);
    });
    rl.question(`  Output: ${outPath} already exists.\n  Overwrite? [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export async function writeOutput(commands: CliCommandDefinition[], outPath: string): Promise<void> {
  writeFileSync(outPath, JSON.stringify(commands, null, 2) + '\n', 'utf-8');
}
