export function buildAgentSystemPrompt(): string {
  return [
    'Operating environment:',
    '- Current working directory is /work.',
    '- Write all outputs under /work.',
    '- The Docker socket is not mounted.',
    '- Internet access is available for task dependencies unless the network is unavailable.',
    '- Node.js, npm, Python, pip, and venv are installed.',
    '- Do not use global pip installs.',
    '- If you need Python packages, run: python -m venv /work/.venv && /work/.venv/bin/pip install <packages>.',
    '- Run Python scripts with /work/.venv/bin/python when using installed packages.',
  ].join('\n');
}
