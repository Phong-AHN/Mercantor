import { can, canAny, isConfinedToOwnProjects, type Principal } from './engine';
import type { Permission } from './permissions';

/**
 * Navigation is derived from the permission matrix rather than hand-written per
 * role. The predecessor project shipped a bug where a hand-built menu hid whole
 * sections from the role they existed for; deriving it makes that impossible.
 */
export interface NavItem {
  href: string;
  label: string;
  /** Lucide icon name, resolved in the design system. */
  icon: string;
  /** Shown when any of these is held. */
  permissions: readonly Permission[];
  description?: string;
  /** Renders a live count badge fed by the layout. */
  badge?: 'notifications' | 'blockers' | 'approvals' | 'handoffs';
}

export interface NavGroup {
  id: string;
  label: string;
  items: readonly NavItem[];
}

const GROUPS: readonly NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: 'LayoutDashboard',
        permissions: ['portfolio:read'],
        description: 'Portfolio health, stages, time and blockers.',
      },
      {
        href: '/analytics',
        label: 'Analytics',
        icon: 'LineChart',
        permissions: ['portfolio:read'],
        description: 'Trends over time: throughput, cycle time, SLA breaches.',
      },
      {
        href: '/projects',
        label: 'Projects',
        icon: 'FolderKanban',
        permissions: ['project:read'],
        description: 'Every migration, filterable.',
      },
      {
        href: '/my-work',
        label: 'My work',
        icon: 'CircleUser',
        permissions: ['project:read'],
        description: 'What is waiting on you.',
      },
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery',
    items: [
      {
        href: '/blockers',
        label: 'Blockers',
        icon: 'OctagonAlert',
        permissions: ['blocker:read'],
        badge: 'blockers',
        description: 'Everything that is stopping a launch.',
      },
      {
        href: '/issues',
        label: 'Issues',
        icon: 'Bug',
        permissions: ['issue:read'],
        description: 'Escalations by severity and owner.',
      },
      {
        href: '/approvals',
        label: 'Approvals',
        icon: 'BadgeCheck',
        permissions: ['approval:read'],
        badge: 'approvals',
        description: 'Design, development, QA and deployment sign-off.',
      },
      {
        href: '/handoffs',
        label: 'SHOPLINE review',
        icon: 'PackageCheck',
        permissions: ['handoff:decide', 'handoff:submit'],
        badge: 'handoffs',
        description: 'Submitted packages awaiting a decision.',
      },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    items: [
      {
        href: '/invoices',
        label: 'Invoices',
        icon: 'Receipt',
        permissions: ['invoice:read'],
        description: 'Milestones, outstanding balances and overdue accounts.',
      },
      {
        href: '/bank-transactions',
        label: 'Bank transactions',
        icon: 'Landmark',
        permissions: ['bank_transaction:read'],
        description: 'Imported from screenshots of the bank app - vendor payments and expenses.',
      },
      {
        href: '/merchants',
        label: 'Merchants',
        icon: 'Store',
        permissions: ['merchant:read'],
        description: 'Contact database.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administration',
    items: [
      {
        href: '/people',
        label: 'People',
        icon: 'Users',
        permissions: ['user:read'],
        description: 'AHN, SHOPLINE and merchant users.',
      },
      {
        href: '/integrations',
        label: 'Integrations',
        icon: 'Plug',
        permissions: ['integration:manage'],
        description: 'Slack, ClickUp and email delivery.',
      },
      {
        href: '/settings',
        label: 'Settings',
        icon: 'Settings',
        permissions: ['settings:manage'],
        description: 'Ageing thresholds, checklists, notification rules.',
      },
      {
        href: '/audit',
        label: 'Audit log',
        icon: 'ScrollText',
        permissions: ['audit:read'],
        description: 'Every write that crossed a permission boundary.',
      },
    ],
  },
];

/** The merchant surface is a different product, so it gets its own menu. */
const MERCHANT_GROUPS: readonly NavGroup[] = [
  {
    id: 'merchant',
    label: 'Your migration',
    items: [
      {
        href: '/portal',
        label: 'Overview',
        icon: 'LayoutDashboard',
        permissions: ['project:read'],
        description: 'Where your migration stands.',
      },
      {
        href: '/portal/access',
        label: 'Access',
        icon: 'KeyRound',
        permissions: ['access:read'],
        description: 'Credentials we still need from you.',
      },
      {
        href: '/portal/assets',
        label: 'Assets',
        icon: 'FolderOpen',
        permissions: ['asset:read'],
        description: 'Brand and product material to upload.',
      },
      {
        href: '/portal/approvals',
        label: 'Approvals',
        icon: 'BadgeCheck',
        permissions: ['approval:read'],
        badge: 'approvals',
        description: 'Designs and builds waiting on you.',
      },
      {
        href: '/portal/activity',
        label: 'Activity',
        icon: 'MessagesSquare',
        permissions: ['activity:read'],
        description: 'Updates and conversation.',
      },
    ],
  },
];

export function navigationFor(principal: Principal): NavGroup[] {
  const groups = isConfinedToOwnProjects(principal) ? MERCHANT_GROUPS : GROUPS;
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAny(principal, item.permissions)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Where signing in should land this principal. */
export function landingPathFor(principal: Principal): string {
  if (isConfinedToOwnProjects(principal)) return '/portal';
  if (can(principal, 'portfolio:read')) return '/dashboard';
  return '/projects';
}
