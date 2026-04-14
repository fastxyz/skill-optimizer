import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ImportOptions, CliCommandDefinition } from './types.js';
import { detectFramework } from './detect.js';
import { extractCommander } from './extractors/ts-commander.js';
import { extractYargs } from './extractors/ts-yargs.js';
import { extractClick } from './extractors/py-click.js';
import { extractArgparse } from './extractors/py-argparse.js';
import { extractClap } from './extractors/rs-clap.js';
import { scrapeHelp } from './extractors/help-scraper.js';
import { discoverCliSurfaceFromSources } from '../discovery/cli.js';
import { promptOverwrite, writeOutput } from './output.js';

export async function importCommands(opts: ImportOptions): Promise<void> {
  const { from, out, scrape, depth, cwd } = opts;
  const absFrom = resolve(cwd, from);
  const absOut = resolve(cwd, out);

  const detection = scrape ? { kind: 'unknown' as const, binaryHint: from } : detectFramework(from, cwd);
  console.log(`\nnpx skill-optimizer import-commands — detecting framework from ${from}`);
  if (detection.kind !== 'unknown') {
    console.log(`  Detected: ${detection.kind}`);
  }

  let commands: CliCommandDefinition[] = [];
  if (!scrape) {
    console.log('  Extracting commands...');
    try {
      if (detection.kind === 'commander') {
        commands = extractCommander(absFrom);
      } else if (detection.kind === 'yargs') {
        commands = extractYargs(absFrom);
      } else if (detection.kind === 'optique') {
        const snapshot = discoverCliSurfaceFromSources([absFrom]);
        commands = snapshot.actions.map(a => ({
          command: a.name,
          description: a.description,
          options: a.args.map(arg => ({
            name: arg.name,
            description: arg.description,
            takesValue: arg.type === 'string',
          })),
        }));
      } else if (detection.kind === 'click' || detection.kind === 'typer') {
        commands = await extractClick(absFrom);
      } else if (detection.kind === 'argparse') {
        commands = await extractArgparse(absFrom);
      } else if (detection.kind === 'clap') {
        commands = await extractClap(absFrom);
      }
    } catch (err) {
      console.error(`  Warning: static extraction failed: ${err instanceof Error ? err.message : err}`);
      commands = [];
    }
  }

  if (commands.length === 0 && detection.binaryHint) {
    console.log('  Static extraction yielded 0 commands — falling back to --help scraping...');
    try {
      commands = await scrapeHelp(detection.binaryHint, { depth, cwd });
    } catch (err) {
      console.error(`  Warning: --help scraping failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (commands.length === 0) {
    throw new Error('No commands found after all strategies. Try: npx skill-optimizer import-commands --from <binary> --scrape');
  }

  console.log(`  Found ${commands.length} commands`);

  if (existsSync(absOut) && !opts.force) {
    const overwrite = await promptOverwrite(absOut);
    if (!overwrite) {
      console.log('\n  Aborted. Output file unchanged.');
      return;
    }
  }

  mkdirSync(dirname(absOut), { recursive: true });
  writeOutput(commands, absOut);
  console.log(`\n  Wrote ${commands.length} commands to ${out}`);
  console.log(`  Done. Review the file and run 'npx skill-optimizer doctor' to validate.\n`);
}
