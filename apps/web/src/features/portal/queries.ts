import 'server-only';
import { cache } from 'react';
import { isAppError, NotFoundError } from '@relay/core';
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

/**
 * The same, for pages: `null` when this merchant is not attached to a
 * project yet, so every portal page can show the "no project yet" state
 * rather than crash. A merchant account exists before its `ProjectMember`
 * row does whenever someone creates the login first, so this is a normal
 * state, not an error. Anything other than "not found" still throws.
 */
export const findPortalProject = cache(async (principal: Principal) => {
  try {
    return await getPortalProject(principal);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') return null;
    throw error;
  }
});

export const listPortalProjects = cache(async (principal: Principal) =>
  listProjects(principal, { includeCompleted: true, sort: 'recent' }),
);
