import Editor from './monaco-editor';

export function CodePanel({ code }: { code: string }) {
  return <Editor value={code} />;
}
