import type { AppRole } from '@digilog/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  roles?: AppRole[]; // visible to these roles (undefined = all web roles)
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Live Occurrences', href: '/occurrences', icon: 'Radio' },
    ],
  },
  {
    title: 'Occurrences',
    items: [
      { label: 'All Occurrences', href: '/occurrences/all', icon: 'ClipboardList' },
      { label: 'Log Incident', href: '/occurrences/new', icon: 'PlusCircle' },
      { label: 'Reports', href: '/reports', icon: 'FileText' },
      { label: 'History', href: '/occurrences/history', icon: 'Archive' },
    ],
  },
  {
    title: 'Field Operations',
    items: [
      { label: 'Patrols', href: '/patrols', icon: 'Footprints' },
      { label: 'Checkpoints', href: '/checkpoints', icon: 'MapPin' },
      { label: 'Team Status', href: '/team', icon: 'Users' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Users', href: '/users', icon: 'UserCog', roles: ['admin'] },
      { label: 'Sites', href: '/sites', icon: 'Building2', roles: ['admin'] },
    ],
  },
];

export function visibleSections(role: AppRole): NavSection[] {
  return NAV
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => !i.roles || i.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}
