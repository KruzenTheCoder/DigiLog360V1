// Tree-shakeable icon registry.
//
// Several components render a lucide icon chosen by a runtime *string* (nav
// config, menu config, page-header path map, severity meta, etc.). The old
// approach was `import * as Icons from 'lucide-react'` + `Icons[name]`, which
// defeats tree-shaking — a namespace import with dynamic key access forces the
// ENTIRE lucide set (~1000 icons) into the bundle, on every page that uses the
// app shell.
//
// Instead we statically import only the icons actually referenced anywhere in
// the app and expose them via a name→component map. This is fully
// tree-shakeable, so the bundle ships ~60 icons, not ~1000. When adding a new
// `icon: '...'` string somewhere, add the matching import here too (a missing
// name simply renders the Circle fallback — no crash).

import {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowLeft, ArrowRight,
  BarChart3, Bell, BellRing, Building, Building2, CalendarClock, CalendarDays,
  CheckCircle, CheckSquare, ChevronRight, Circle, ClipboardList, Clock, Crown,
  FilePlus, FileText, Flame, Footprints, FormInput, Gauge, GitBranchPlus, History,
  Home, Hourglass, Images, Inbox, Info, Key, KeyRound, KeySquare, Layers, LayoutDashboard,
  LayoutGrid, LayoutTemplate,
  LogIn, LogOut, Map, MapPin, Menu, Moon, OctagonAlert, Palette, PieChart,
  PlusCircle, Radio, ScrollText, Settings, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Smartphone, Sun, Tags, TrendingUp, TriangleAlert,
  UserCheck, UserCog, UserPlus, UserX, Users, Users2, Webhook,
  type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  Activity, AlertCircle, AlertTriangle, Archive, ArrowLeft, ArrowRight,
  BarChart3, Bell, BellRing, Building, Building2, CalendarClock, CalendarDays,
  CheckCircle, CheckSquare, ChevronRight, Circle, ClipboardList, Clock, Crown,
  FilePlus, FileText, Flame, Footprints, FormInput, Gauge, GitBranchPlus, History,
  Home, Hourglass, Images, Inbox, Info, Key, KeyRound, KeySquare, Layers, LayoutDashboard,
  LayoutGrid, LayoutTemplate,
  LogIn, LogOut, Map, MapPin, Menu, Moon, OctagonAlert, Palette, PieChart,
  PlusCircle, Radio, ScrollText, Settings, ShieldAlert, ShieldCheck,
  SlidersHorizontal, Smartphone, Sun, Tags, TrendingUp, TriangleAlert,
  UserCheck, UserCog, UserPlus, UserX, Users, Users2, Webhook,
};

/** Resolve an icon component by name, falling back to a sensible default. */
export function getIcon(name?: string | null, fallback = 'Circle'): LucideIcon {
  return (name ? ICONS[name] : undefined) ?? ICONS[fallback] ?? Circle;
}

/** Render an icon by name. `<Icon name="Bell" className="h-4 w-4" />` */
export function Icon({
  name, className, fallback = 'Circle',
}: {
  name?: string | null;
  className?: string;
  fallback?: string;
}) {
  const C = getIcon(name, fallback);
  return <C className={className} />;
}
