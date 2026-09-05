import * as React from 'react';
import {
  BadgeCheck,
  Bug,
  CircleUser,
  FolderKanban,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  OctagonAlert,
  PackageCheck,
  Plug,
  Receipt,
  ScrollText,
  Settings,
  Store,
  Users,
} from 'lucide-react';
import { cn } from './cn';

/**
 * The navigation icon set, resolved from the name the RBAC package puts in the
 * menu definition. An explicit map rather than a dynamic import keeps the
 * bundle honest and makes a typo a visible fallback rather than a crash.
 */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FolderKanban,
  CircleUser,
  OctagonAlert,
  Bug,
  BadgeCheck,
  PackageCheck,
  Receipt,
  Store,
  Users,
  Plug,
  Settings,
  ScrollText,
  KeyRound,
  FolderOpen,
  MessagesSquare,
  LineChart,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Component = ICONS[name] ?? LayoutDashboard;
  return <Component className={cn('size-4', className)} />;
}
