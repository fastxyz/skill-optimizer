// Find the SKILL.md path inside a GitHub tree response whose parent directory
// name matches the target skillId. Returns the path string, or null if no
// match.
//
// Special case: skillId === '_root' returns a top-level SKILL.md at the repo
// root if present (used for single-skill repos where the caller has no
// directory-name to match against).

export function findSkillMdPath(treeJson, skillId) {
  if (!treeJson || !Array.isArray(treeJson.tree)) return null;
  const entries = treeJson.tree.filter(
    (e) => e.type === 'blob' && typeof e.path === 'string' && e.path.endsWith('/SKILL.md'),
  );

  if (skillId === '_root') {
    const root = treeJson.tree.find((e) => e.type === 'blob' && e.path === 'SKILL.md');
    return root ? 'SKILL.md' : null;
  }

  for (const e of entries) {
    const segments = e.path.split('/');
    // Path must end "/SKILL.md", so segments[length-1] === "SKILL.md" and
    // segments[length-2] is the parent dir name.
    if (segments.length >= 2 && segments[segments.length - 2] === skillId) {
      return e.path;
    }
  }
  return null;
}
