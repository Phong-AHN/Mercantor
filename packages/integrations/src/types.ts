import type { ProjectStage, Team } from '@relay/core';

/**
 * The provider seam, modelled on the previous project's `SocialProvider`: the
 * portal contains zero Slack-specific or ClickUp-specific logic. Everything a
 * platform knows about itself lives behind one of these interfaces, which is
 * what makes swapping the mock for the real API a configuration change.
 */

export interface ProviderResult<T = void> {
  ok: boolean;
  /** Platform id for the thing created, when there is one. */
  externalRef?: string;
  externalUrl?: string;
  data?: T;
  error?: ProviderError;
  /**
   * A failure that is not really a failure - "this person has no Slack
   * account" for a per-user DM, say. The outbox row is marked `SKIPPED`
   * rather than `FAILED`, and never retried; `error` still carries why, for
   * the audit trail.
   */
  skip?: boolean;
}

export interface ProviderError {
  code:
    | 'AUTHENTICATION'
    | 'NOT_CONFIGURED'
    | 'RATE_LIMITED'
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'UNAVAILABLE';
  /** Safe to show. Platform text is normalised, never passed through raw. */
  userMessage: string;
  retryable: boolean;
  retryAfterMs?: number;
}

export interface ProviderHealth {
  configured: boolean;
  reachable: boolean;
  mode: 'live' | 'mock';
  detail: string;
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export interface SlackDestination {
  channelId: string;
  channelName?: string;
}

export interface SlackUpdate {
  destination: SlackDestination;
  /** Short headline: "Sunrise Coffee moved to Merchant QA". */
  title: string;
  body?: string;
  /** Rendered as a coloured bar down the side of the message. */
  tone: 'info' | 'success' | 'warning' | 'danger';
  fields?: { label: string; value: string }[];
  /** Always present: every Slack message points back at the record. */
  projectUrl: string;
  projectCode: string;
}

export interface SlackImportedMessage {
  channelId: string;
  messageTs: string;
  permalink: string;
  authorName: string;
  text: string;
  postedAt: Date;
}

export interface SlackProvider {
  readonly name: 'SLACK';
  health(): Promise<ProviderHealth>;
  listChannels(): Promise<ProviderResult<SlackDestination[]>>;
  postUpdate(update: SlackUpdate): Promise<ProviderResult>;
  /** Pull one message back into the project history by permalink. */
  fetchMessage(permalink: string): Promise<ProviderResult<SlackImportedMessage>>;
  /**
   * Resolves a person's Slack user id from their work email, so a personal
   * notification can DM them directly - `chat.postMessage` sends a DM when
   * `channel` is a user id, the same call `postUpdate` already makes.
   * Nothing is stored: this runs fresh at delivery time, never at enqueue
   * time, the same "no credentials through the queue" reasoning as D-015.
   */
  findUserByEmail(email: string): Promise<ProviderResult<{ slackUserId: string }>>;
}

// ---------------------------------------------------------------------------
// ClickUp
// ---------------------------------------------------------------------------

export interface ClickUpTaskRef {
  taskId: string;
  url: string;
  name?: string;
  status?: string;
  /** The list this task lives in - there is no other way to discover a
   * project's list id, so creating a task under it means reading this back
   * from the project's already-linked task first. */
  listId?: string;
}

export interface ClickUpStatusUpdate {
  taskId: string;
  stage: ProjectStage;
  /** Portal stage mapped to the ClickUp status name for this space. */
  statusName: string;
  note?: string;
}

export interface ClickUpTaskDraft {
  listId: string;
  name: string;
  description: string;
  /** ClickUp priority: 1 urgent .. 4 low. */
  priority?: 1 | 2 | 3 | 4;
  dueDate?: Date | null;
  tags?: string[];
  /** Nests the new task under an existing one, rather than a sibling in the
   * same list. */
  parentTaskId?: string;
  assigneeTeam?: Team;
}

export interface ClickUpProvider {
  readonly name: 'CLICKUP';
  health(): Promise<ProviderHealth>;
  getTask(taskId: string): Promise<ProviderResult<ClickUpTaskRef>>;
  createTask(draft: ClickUpTaskDraft): Promise<ProviderResult<ClickUpTaskRef>>;
  updateStatus(update: ClickUpStatusUpdate): Promise<ProviderResult>;
  comment(taskId: string, body: string): Promise<ProviderResult>;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailRecipient {
  name?: string;
  email: string;
}

export interface EmailMessage {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  replyTo?: EmailRecipient;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  readonly name: 'EMAIL';
  health(): Promise<ProviderHealth>;
  send(message: EmailMessage): Promise<ProviderResult<{ messageId: string }>>;
}

export interface IntegrationRegistry {
  slack: SlackProvider;
  clickup: ClickUpProvider;
  email: EmailProvider;
}
