import { NextResponse } from 'next/server';
import { clock, ForbiddenError, toAppError } from '@relay/core';
import { can } from '@relay/rbac';
import { buildProjectsCsv } from '@/features/projects/csv';
import { parseFilters } from '@/features/projects/filters';
import { listProjects } from '@/features/projects/queries';
import { requirePrincipal } from '@/server/session';

/**
 * The portfolio table, as a file. Reads the same query string the `/projects`
 * page already puts filters in - a filtered view is a link either way - and
 * runs it through the exact `parseFilters` + `listProjects` the page calls,
 * so the export can never show a row the screen would not, or vice versa.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    if (!can(principal, 'project:read')) {
      throw new ForbiddenError('You do not have access to the portfolio.');
    }

    const url = new URL(request.url);
    const params: Record<string, string> = {};
    for (const [key, value] of url.searchParams) params[key] = value;

    const filters = parseFilters(params);
    const projects = await listProjects(principal, filters);
    const showMoney = can(principal, 'invoice:read');

    const csv = buildProjectsCsv(projects, showMoney);
    const filename = `relay-portfolio-${clock.now().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const appError = toAppError(error);
    return NextResponse.json(appError.toJSON(), { status: appError.status });
  }
}
