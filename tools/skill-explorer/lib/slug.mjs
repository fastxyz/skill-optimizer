// Filename-friendly slug for (source, skillId). Encodes any non-[A-Za-z0-9-_.]
// chars in the skillId via percent-encoding. The first two `__` separators are
// significant: <owner>__<repo>__<skillId-encoded>.

export function sourceSlug({ source, skillId }) {
  if (typeof source !== 'string' || typeof skillId !== 'string') {
    throw new TypeError('sourceSlug requires { source, skillId } strings');
  }
  const slash = source.indexOf('/');
  if (slash <= 0 || slash === source.length - 1) {
    throw new Error(`source must be "owner/repo", got: ${source}`);
  }
  const owner = source.slice(0, slash);
  const repo = source.slice(slash + 1);
  const safeSkill = encodeSkillId(skillId);
  return `${owner}__${repo}__${safeSkill}`;
}

export function parseSlug(slug) {
  const parts = slug.split('__');
  if (parts.length !== 3) return null;
  const [owner, repo, encodedSkill] = parts;
  return {
    source: `${owner}/${repo}`,
    skillId: decodeURIComponent(encodedSkill),
  };
}

function encodeSkillId(s) {
  // Allow A-Za-z0-9-_. as-is; percent-encode everything else.
  return s.replace(/[^A-Za-z0-9\-_.]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
}
