import 'server-only';
import { cache } from 'react';
import { NotFoundError } from '@relay/core';
import type { Principal } from '@relay/rbac';
import { getProject, listProjects } from '@/features/projects/queries';

/**
 * The merchant's own project. Resolved through the same scoped query the
 * internal pages use, so a merchant with no membership row simply has no
 * project - there is no separate "portal" code path that could be laxer.
 */
export const getPortalProject = cache(async (principal: Principal) => {
  const projects = await listProjects(principal, { includeCompleted: true, sort: 'recent' });
  const first = projects[0];
  if (!first) {
    throw new NotFoundError('You are not attached to a migration project yet.');
  }
  return getProject(principal, first.code);
});

export const listPortalProjects = cache(async (principal: Principal) =>
  listProjects(principal, { includeCompleted: true, sort: 'recent' }),
);
