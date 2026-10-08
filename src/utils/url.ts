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
