/**
 * The marketing site's route list — one copy, used by the desktop nav, the
 * mobile menu and anything else that enumerates the pages. Lives apart from
 * the nav component so the mobile menu can import it without creating a
 * circular import through site-nav.
 */
export const SITE_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/why', label: 'Why it matters' },
  { href: '/platform', label: 'Platform' },
  { href: '/story', label: 'One night' },
  { href: '/console', label: 'The console' },
  { href: '/answers', label: 'Answers' },
] as const;
