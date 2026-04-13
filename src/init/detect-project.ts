import { existsSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export interface DetectedProject {
  surface: 'sdk' | 'cli' | 'mcp';
  name: string;
  repoPath: string;
  /** Relative to repoPath */
  entryFile: string;
  /** Relative to repoPath, if found */
  skillFile?: string;
  confidence: 'high' | 'medium' | 'low';
  /** Human-readable list of signals that drove detection */
  signals: string[];
}

export function detectProject(dir: string): DetectedProject {
  const signals: string[] = [];
  let surface: 'sdk' | 'cli' | 'mcp' = 'sdk';
  let name = basename(dir);
  let entryFile = 'src/index.ts';
  let confidence: 'high' | 'medium' | 'low' = 'low';

  // ── package.json ──────────────────────────────────────────────────────────
  const pkgPath = join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      name?: string;
      bin?: Record<string, string> | string;
      main?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    if (pkg.name) name = pkg.name;

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    // MCP: @modelcontextprotocol/sdk in deps
    if (allDeps['@modelcontextprotocol/sdk']) {
      surface = 'mcp';
      confidence = 'high';
      signals.push('package.json: @modelcontextprotocol/sdk dependency');
      entryFile = existsSync(join(dir, 'src', 'server.ts'))
        ? 'src/server.ts'
        : 'src/index.ts';
    } else if (pkg.bin && Object.keys(pkg.bin as Record<string, string>).length > 0) {
      surface = 'cli';
      confidence = 'high';
      signals.push('package.json: bin field');
      const binValues = typeof pkg.bin === 'string'
        ? [pkg.bin]
        : Object.values(pkg.bin as Record<string, string>);
      const firstBin = binValues[0] ?? '';
      const srcGuess = firstBin.replace(/dist\//, 'src/').replace(/\.js$/, '.ts');
      entryFile = existsSync(join(dir, srcGuess)) ? srcGuess : 'src/cli.ts';
    } else {
      surface = 'sdk';
      confidence = 'medium';
      signals.push('package.json: no bin field (SDK assumed)');
      const mainGuess = pkg.main?.replace(/dist\//, 'src/').replace(/\.js$/, '.ts');
      entryFile = mainGuess && existsSync(join(dir, mainGuess))
        ? mainGuess
        : 'src/index.ts';
    }
  }

  // ── pyproject.toml ────────────────────────────────────────────────────────
  const pyprojectPath = join(dir, 'pyproject.toml');
  if (existsSync(pyprojectPath) && confidence === 'low') {
    const content = readFileSync(pyprojectPath, 'utf-8');

    const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (nameMatch) name = nameMatch[1]!;

    if (/^\s*mcp\s*[=\[>]/m.test(content) || content.includes('"mcp"')) {
      surface = 'mcp';
      confidence = 'high';
      signals.push('pyproject.toml: mcp dependency');
      entryFile = existsSync(join(dir, 'server.py')) ? 'server.py' : 'main.py';
    } else if (/\[project\.scripts\]/m.test(content)) {
      surface = 'cli';
      confidence = 'high';
      signals.push('pyproject.toml: [project.scripts] section');
      const scriptMatch = content.match(/\[project\.scripts\][^\[]*\n\s*\S+\s*=\s*"([^:]+):/m);
      entryFile = scriptMatch ? scriptMatch[1]!.replace(/\./g, '/') + '.py' : 'main.py';
    } else {
      surface = 'sdk';
      confidence = 'medium';
      signals.push('pyproject.toml: no [project.scripts] (SDK assumed)');
      entryFile = 'src/__init__.py';
    }
  }

  // ── Cargo.toml ────────────────────────────────────────────────────────────
  const cargoPath = join(dir, 'Cargo.toml');
  if (existsSync(cargoPath) && confidence === 'low') {
    const content = readFileSync(cargoPath, 'utf-8');

    const nameMatch = content.match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (nameMatch) name = nameMatch[1]!;

    if (/^\[\[bin\]\]/m.test(content)) {
      surface = 'cli';
      confidence = 'high';
      signals.push('Cargo.toml: [[bin]] section');
      entryFile = 'src/main.rs';
    } else if (/^\[lib\]/m.test(content)) {
      surface = 'sdk';
      confidence = 'high';
      signals.push('Cargo.toml: [lib] section');
      entryFile = 'src/lib.rs';
    } else {
      surface = existsSync(join(dir, 'src', 'main.rs')) ? 'cli' : 'sdk';
      confidence = 'medium';
      signals.push('Cargo.toml: inferred from src/main.rs existence');
      entryFile = surface === 'cli' ? 'src/main.rs' : 'src/lib.rs';
    }
  }

  if (signals.length === 0) {
    signals.push('No manifest found — defaulting to sdk');
  }

  // ── Skill file ────────────────────────────────────────────────────────────
  const skillCandidates = ['SKILL.md', 'docs/SKILL.md', 'README.md'];
  const skillFile = skillCandidates.find(f => existsSync(join(dir, f)));

  return { surface, name, repoPath: dir, entryFile, skillFile, confidence, signals };
}
