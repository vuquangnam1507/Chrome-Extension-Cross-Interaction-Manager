export function facebookUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (
      u.protocol !== 'https:' ||
      !(u.hostname === 'facebook.com' || u.hostname.endsWith('.facebook.com')) ||
      u.username ||
      u.password
    )
      return null;
    if (
      /^\/(login|logout|share|sharer|dialog|plugins)(\/|\.|$)/i.test(u.pathname) ||
      u.pathname === '/'
    )
      return null;
    u.hostname = 'www.facebook.com';
    u.hash = '';
    for (const k of [...u.searchParams.keys()])
      if (k.startsWith('utm_') || ['fbclid', 'ref', 'mibextid', '__tn__'].includes(k))
        u.searchParams.delete(k);
    u.searchParams.sort();
    return u.href;
  } catch {
    return null;
  }
}

// Compare resource identity, not incidental tracking parameters or mobile hostnames.
// Never use the owner `id` of story.php as the post ID.
export function sameFacebookTarget(left: string, right: string): boolean {
  function identity(raw: string): string | null {
    const canonical = facebookUrl(raw);
    if (!canonical) return null;
    const u = new URL(canonical);
    const path = u.pathname.replace(/\/+$/, '');
    const post = /^\/(?:story|permalink)\.php$/.test(path)
      ? u.searchParams.get('story_fbid')
      : null;
    const photo = /^\/photo(?:\.php)?$/.test(path) ? u.searchParams.get('fbid') : null;
    const profile = path === '/profile.php' ? u.searchParams.get('id') : null;
    const video = path === '/watch' ? u.searchParams.get('v') : null;
    const pathId =
      path.match(/\/(?:posts|videos|reel)\/(\d+|pfbid[A-Za-z0-9]+)$/)?.[1] ||
      path.match(/^\/(\d+)$/)?.[1];
    const id = post || photo || profile || video || pathId;
    if (id && /^(?:\d+|pfbid[A-Za-z0-9]+)$/.test(id)) return `object:${id}`;
    // Username/profile and other routes keep their query semantics.
    return `${u.origin}${path}${u.search}`;
  }
  const a = identity(left),
    b = identity(right);
  return a !== null && a === b;
}

export function matchesFacebookOperation(
  actual: string,
  target: string,
  documentUrl?: string,
): boolean {
  return (
    sameFacebookTarget(actual, target) ||
    (!!documentUrl && !!facebookUrl(actual) && facebookUrl(actual) === facebookUrl(documentUrl))
  );
}
