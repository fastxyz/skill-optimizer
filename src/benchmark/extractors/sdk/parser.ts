import Parser from 'web-tree-sitter';
import { createRequire } from 'node:module';

import type { SdkLanguage } from '../../types.js';

const require = createRequire(import.meta.url);

const WASM_BY_LANGUAGE: Record<SdkLanguage, string> = {
  typescript: 'tree-sitter-wasms/out/tree-sitter-typescript.wasm',
  python: 'tree-sitter-wasms/out/tree-sitter-python.wasm',
  rust: 'tree-sitter-wasms/out/tree-sitter-rust.wasm',
};

let parserInit: Promise<void> | null = null;
const parserCache = new Map<SdkLanguage, Promise<Parser>>();

async function ensureParserInit(): Promise<void> {
  if (!parserInit) {
    parserInit = Parser.init();
  }
  await parserInit;
}

export async function getSdkParser(language: SdkLanguage): Promise<Parser> {
  if (!parserCache.has(language)) {
    parserCache.set(language, (async () => {
      await ensureParserInit();
      const parser = new Parser();
      const wasmPath = require.resolve(WASM_BY_LANGUAGE[language]);
      const grammar = await Parser.Language.load(wasmPath);
      parser.setLanguage(grammar);
      return parser;
    })());
  }

  return parserCache.get(language)!;
}
