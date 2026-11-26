import type { PublicPerson, Role } from '../types';

export const ALL_TABS = ['Overview', 'Revenue Channels', 'Reviews & Ratings', '3rd Party Delivery', 'Loyalty', 'Marketing', 'Catering', 'Location', 'Scorecard'] as const;

/** Tabs a role may see. The Admin tab is added for admins only. */
export function tabsFor(role: Role): string[] {
  if (role === 'admin') return [...ALL_TABS, 'Admin'];
  if (role === 'location') return ALL_TABS.filter((t) => t !== 'Marketing' && t !== 'Scorecard');   // a restaurant login sees only its own location, so there is nothing to rank
  return [...ALL_TABS];
}

/**
 * Locations a person may see, in the configured order.
 * `visible` = locations that are not hidden. Admin and Client see all of them; Location sees only theirs.
 */
export function allowedLocations(p: Pick<PublicPerson, 'role' | 'locations'>, visible: string[]): string[] {
  if (p.role !== 'location') return visible;
  const mine = new Set(p.locations);
  return visible.filter((l) => mine.has(l));
}

export function isAdmin(p: { role: Role } | null | undefined): boolean {
  return !!p && p.role === 'admin';
}
