// ============================================================================
// DigiLog 360 — Minimal i18n.
// No runtime dependency: we ship a dictionary per locale and look up keys with
// a fallback to English. Apps can wrap this with a context provider, persist
// the chosen locale, and pass it to the lookup.
// ============================================================================

export type Locale = 'en' | 'af' | 'zu' | 'xh';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'af', 'zu', 'xh'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  af: 'Afrikaans',
  zu: 'isiZulu',
  xh: 'isiXhosa',
};

const messages: Record<Locale, Record<string, string>> = {
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm',
    'common.search': 'Search',
    'nav.dashboard': 'Dashboard',
    'nav.live': 'Live Occurrences',
    'nav.all': 'All Occurrences',
    'nav.new': 'Log Incident',
    'nav.reports': 'Reports',
    'nav.history': 'History',
    'nav.patrols': 'Patrols',
    'nav.checkpoints': 'Checkpoints',
    'nav.team': 'Team Status',
    'nav.visitors': 'Visitor Log',
    'nav.keys': 'Key Register',
    'nav.shifts': 'Shifts',
    'nav.map': 'Guard Map',
    'mobile.login.pin.title': 'PIN login',
    'mobile.login.password.title': 'Email & password',
    'mobile.login.org': 'Organisation slug',
    'mobile.login.employee': 'Employee number',
    'mobile.login.pin': 'PIN',
    'mobile.login.signin': 'Sign In',
  },
  af: {
    'common.save': 'Stoor',
    'common.cancel': 'Kanselleer',
    'common.delete': 'Skrap',
    'common.confirm': 'Bevestig',
    'common.search': 'Soek',
    'nav.dashboard': 'Dashboard',
    'nav.live': 'Lewendige Voorvalle',
    'nav.all': 'Alle Voorvalle',
    'nav.new': 'Voorval Aanteken',
    'nav.reports': 'Verslae',
    'nav.history': 'Geskiedenis',
    'nav.patrols': 'Patrollies',
    'nav.checkpoints': 'Kontrolepunte',
    'nav.team': 'Spanstatus',
    'nav.visitors': 'Besoekers',
    'nav.keys': 'Sleutels',
    'nav.shifts': 'Skofte',
    'nav.map': 'Wagters Kaart',
    'mobile.login.pin.title': 'PIN-aanmelding',
    'mobile.login.password.title': 'E-pos & wagwoord',
    'mobile.login.org': 'Organisasie-slug',
    'mobile.login.employee': 'Werknemer nr.',
    'mobile.login.pin': 'PIN',
    'mobile.login.signin': 'Meld aan',
  },
  zu: {
    'common.save': 'Londoloza',
    'common.cancel': 'Khansela',
    'common.delete': 'Susa',
    'common.confirm': 'Qinisekisa',
    'common.search': 'Sesha',
    'nav.dashboard': 'Ideshibhodi',
    'nav.live': 'Izehlakalo Eziphilayo',
    'nav.all': 'Zonke Izehlakalo',
    'nav.new': 'Bhalisa Isigameko',
    'nav.reports': 'Imibiko',
    'nav.history': 'Umlando',
    'nav.patrols': 'Amaphetroli',
    'nav.checkpoints': 'Amaphoyinti',
    'nav.team': 'Isimo Seqembu',
    'nav.visitors': 'Izivakashi',
    'nav.keys': 'Okhiye',
    'nav.shifts': 'Izikhathi Zomsebenzi',
    'nav.map': 'Imephu Yonogada',
    'mobile.login.pin.title': 'Ngena nge-PIN',
    'mobile.login.password.title': 'I-imeyili & iphasiwedi',
    'mobile.login.org': 'Slug yenhlangano',
    'mobile.login.employee': 'Inombolo yomsebenzi',
    'mobile.login.pin': 'I-PIN',
    'mobile.login.signin': 'Ngena',
  },
  xh: {
    'common.save': 'Gcina',
    'common.cancel': 'Rhoxisa',
    'common.delete': 'Cima',
    'common.confirm': 'Qinisekisa',
    'common.search': 'Khangela',
    'nav.dashboard': 'Ideshbhodi',
    'nav.live': 'Iziganeko Eziphilayo',
    'nav.all': 'Zonke Iziganeko',
    'nav.new': 'Bhala Isiganeko',
    'nav.reports': 'Iingxelo',
    'nav.history': 'Imbali',
    'nav.patrols': 'Iipatrol',
    'nav.checkpoints': 'Iindawo zokukhangela',
    'nav.team': 'Isimo seqela',
    'nav.visitors': 'Iindwendwe',
    'nav.keys': 'Izitshixo',
    'nav.shifts': 'Iishifti',
    'nav.map': 'Imephu yabalindi',
    'mobile.login.pin.title': 'Ngena nge-PIN',
    'mobile.login.password.title': 'I-imeyile & i-password',
    'mobile.login.org': 'I-slug yombutho',
    'mobile.login.employee': 'Inombolo yomsebenzi',
    'mobile.login.pin': 'I-PIN',
    'mobile.login.signin': 'Ngena',
  },
};

export function t(locale: Locale, key: string, fallback?: string): string {
  return messages[locale]?.[key] ?? messages.en[key] ?? fallback ?? key;
}

/** Pick the closest supported locale from a string like "en-ZA" or "af". */
export function detectLocale(raw: string | null | undefined, fallback: Locale = 'en'): Locale {
  if (!raw) return fallback;
  const norm = raw.toLowerCase().split(/[-_]/)[0] ?? '';
  return (SUPPORTED_LOCALES as string[]).includes(norm) ? (norm as Locale) : fallback;
}
