import type { ProjectStage } from '@relay/core';
import type {
  ClickUpProvider,
  ClickUpStatusUpdate,
  ClickUpTaskDraft,
  ClickUpTaskRef,
  ProviderError,
  ProviderHealth,
  ProviderResult,
} from './types';

const CLICKUP_API = 'https://api.clickup.com/api/v2';

/**
 * Portal stage to ClickUp status name. ClickUp remains AHN's internal
 * execution layer, so the portal pushes stage changes at it and never reads
 * status back as the truth - one direction, one source of truth.
 *
 * Overridable per project through `IntegrationLink.config.statusMap`.
 */
export const DEFAULT_CLICKUP_STATUS_MAP: Record<ProjectStage, string> = {
  INTRODUCTION: 'to do',
  MERCHANT_CONTACTED: 'to do',
  KICKOFF_SCHEDULED: 'planning',
  WAITING_FOR_ACCESS: 'blocked',
  ASSETS_COLLECTION: 'planning',
  MIGRATION: 'in progress',
  DESIGN: 'in progress',
  MERCHANT_DESIGN_REVIEW: 'client review',
  DEVELOPMENT: 'in progress',
  INTERNAL_QA: 'qa',
  MERCHANT_QA: 'client review',
  MIGRATION_VALIDATION: 'qa',
  READY_FOR_SHOPLINE_REVIEW: 'review',
  SHOPLINE_REVIEW: 'review',
  READY_FOR_DEPLOYMENT: 'ready to launch',
  DEPLOYED_LIVE: 'launched',
  COMPLETED: 'complete',
  ON_HOLD_BLOCKED: 'blocked',
};

export function clickUpStatusFor(
  stage: ProjectStage,
  overrides?: Partial<Record<ProjectStage, string>>,
): string {
  return overrides?.[stage] ?? DEFAULT_CLICKUP_STATUS_MAP[stage];
}

export function createClickUpProvider(apiToken: string): ClickUpProvider {
  async function call<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<ProviderResult<T>> {
    let response: Response;
    try {
      response = await fetch(`${CLICKUP_API}${path}`, {
        method: init.method,
        headers: {
          authorization: apiToken,
          'content-type': 'application/json',
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      return {
        ok: false,
        error: {
          code: 'UNAVAILABLE',
          userMessage: 'ClickUp could not be reached. The change is queued and will be retried.',
          retryable: true,
        },
      };
    }

    if (!response.ok) return { ok: false, error: normalise(response.status) };
    const data = (await response.json().catch(() => ({}))) as T;
    return { ok: true, data };
  }

  return {
    name: 'CLICKUP',

    async health(): Promise<ProviderHealth> {
      const result = await call<{ user?: { username?: string } }>('/user', { method: 'GET' });
      return {
        configured: true,
        reachable: result.ok,
        mode: 'live',
        detail: result.ok
          ? `Connected to ClickUp as ${result.data?.user?.username ?? 'the API user'}`
          : (result.error?.userMessage ?? 'ClickUp did not answer.'),
      };
    },

    async getTask(taskId: string): Promise<ProviderResult<ClickUpTaskRef>> {
      const result = await call<{
        id: string;
        url: string;
        name: string;
        status?: { status: string };
        list?: { id: string };
      }>(`/task/${encodeURIComponent(taskId)}`, { method: 'GET' });
      if (!result.ok || !result.data) return { ok: false, error: result.error };
      return {
        ok: true,
        externalRef: result.data.id,
        externalUrl: result.data.url,
        data: {
          taskId: result.data.id,
          url: result.data.url,
          name: result.data.name,
          status: result.data.status?.status,
          listId: result.data.list?.id,
        },
      };
    },

    async createTask(draft: ClickUpTaskDraft): Promise<ProviderResult<ClickUpTaskRef>> {
      const result = await call<{ id: string; url: string; name: string }>(
        `/list/${encodeURIComponent(draft.listId)}/task`,
        {
          method: 'POST',
          body: {
            name: draft.name,
            description: draft.description,
            priority: draft.priority ?? null,
            due_date: draft.dueDate ? draft.dueDate.getTime() : null,
            tags: draft.tags ?? [],
            parent: draft.parentTaskId ?? null,
          },
        },
      );
      if (!result.ok || !result.data) return { ok: false, error: result.error };
      return {
        ok: true,
        externalRef: result.data.id,
        externalUrl: result.data.url,
        data: { taskId: result.data.id, url: result.data.url, name: result.data.name },
      };
    },

    async updateStatus(update: ClickUpStatusUpdate): Promise<ProviderResult> {
      const result = await call(`/task/${encodeURIComponent(update.taskId)}`, {
        method: 'PUT',
        body: { status: update.statusName },
      });
      if (!result.ok) return { ok: false, error: result.error };
      if (update.note) {
        await call(`/task/${encodeURIComponent(update.taskId)}/comment`, {
          method: 'POST',
          body: { comment_text: update.note, notify_all: false },
        });
      }
      return { ok: true, externalRef: update.taskId };
    },

    async comment(taskId: string, body: string): Promise<ProviderResult> {
      const result = await call(`/task/${encodeURIComponent(taskId)}/comment`, {
        method: 'POST',
        body: { comment_text: body, notify_all: false },
      });
      return result.ok ? { ok: true, externalRef: taskId } : { ok: false, error: result.error };
    },
  };
}

function normalise(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return {
      code: 'AUTHENTICATION',
      userMessage: 'The ClickUp token is not valid for this workspace.',
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      code: 'NOT_FOUND',
      userMessage: 'That ClickUp task or list no longer exists.',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      userMessage: 'ClickUp is rate limiting us. The change will be retried automatically.',
      retryable: true,
      retryAfterMs: 60_000,
    };
  }
  return {
    code: 'UNAVAILABLE',
    userMessage: 'ClickUp rejected the change. It is queued and will be retried.',
    retryable: status >= 500,
  };
}
