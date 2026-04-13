export type { CliCommandDefinition, CliCommandOptionDefinition } from '../benchmark/types.js';

export type FrameworkKind =
  | 'commander'
  | 'yargs'
  | 'optique'
  | 'click'
  | 'typer'
  | 'argparse'
  | 'clap'
  | 'unknown';

export interface DetectionResult {
  kind: FrameworkKind;
  binaryHint?: string;
}

export interface ImportOptions {
  from: string;
  out: string;
  scrape: boolean;
  depth: number;
  cwd: string;
}
