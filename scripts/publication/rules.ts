export class PublicationFinding extends Error {
  constructor(code: string) {
    super('Publication check blocked (' + code + '). Matched values are not printed.');
  }
}

/** Heuristics only: no claim that every credential or private datum has a recognizable pattern. */
export function assertSafeText(text: string): void {
  const rules: [string, RegExp][] = [
    ['github-token', /\bgh[pousr]_[A-Za-z0-9]{20,}\b/],
    ['github-fine-grained-token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
    ['api-token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/],
    ['oauth-access-token', /\bya29\.[A-Za-z0-9_-]{20,}/],
    ['oauth-refresh-token', /\b1\/\/[A-Za-z0-9_-]{30,}/],
    ['cloud-access-id', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    ['private-key', /-----BEGIN (?:(?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/],
    ['url-password', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ];
  for (const [name, pattern] of rules) if (pattern.test(text)) throw new PublicationFinding(name);
  const assignments = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret[_-]?key)\b["']?\s*[:=]\s*(?:"([A-Za-z0-9+/_=.-]{20,})"|'([A-Za-z0-9+/_=.-]{20,})'|([A-Za-z0-9+/_=.-]{20,})(?=\s|$))/gi;
  for (const match of text.matchAll(assignments)) {
    if (!match[3]?.startsWith('process.env.')) throw new PublicationFinding('credential-assignment');
  }
}

export function assertSafeMetadata(text: string): void {
  assertSafeText(text);
  const legacyPath = '/atsudori-' + 'band-rating/';
  if (text.includes(legacyPath)) throw new PublicationFinding('obsolete-site-reference');
}

const userNoreply = (email: string): boolean => /^[0-9]+\+[A-Za-z0-9-]+@users\.noreply\.github\.com$/.test(email);
// GitHub records the PR creator as the author of its validation merge commits.
// The machine account is an approved PR creator, so its authorship is accepted
// only on commits GitHub itself committed.
const machineAccount = 'morimori36-muse';

export function assertCommitIdentity(text: string, tag = false): void {
  const parse = (field: string) => {
    const line = text.split('\n').find(line => line.startsWith(field + ' '));
    const match = line?.match(/^[a-z]+ (.*) <([^<>]+)> \d+ [+-]\d{4}$/);
    return { name: match?.[1] ?? '', email: match?.[2] ?? '' };
  };
  if (tag) {
    if (!userNoreply(parse('tagger').email)) throw new PublicationFinding('commit-identity');
    return;
  }
  const author = parse('author'), committer = parse('committer');
  const githubCommitter = committer.name === 'GitHub' && committer.email === 'noreply@github.com';
  if (!userNoreply(author.email) && !(githubCommitter && author.name === machineAccount)) throw new PublicationFinding('commit-identity');
  if (!userNoreply(committer.email) && !githubCommitter) throw new PublicationFinding('commit-identity');
}
