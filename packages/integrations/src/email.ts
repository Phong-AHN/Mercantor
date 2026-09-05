import type { EmailMessage, EmailProvider, ProviderHealth, ProviderResult } from './types';

/** Live email over Resend. One `send`, because that is all the portal needs. */
export function createResendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: 'EMAIL',

    async health(): Promise<ProviderHealth> {
      try {
        const response = await fetch('https://api.resend.com/domains', {
          headers: { authorization: `Bearer ${apiKey}` },
        });
        return {
          configured: true,
          reachable: response.ok,
          mode: 'live',
          detail: response.ok
            ? `Sending as ${from}`
            : 'Resend rejected the API key. Check the value in the environment.',
        };
      } catch {
        return {
          configured: true,
          reachable: false,
          mode: 'live',
          detail: 'Resend could not be reached.',
        };
      }
    },

    async send(message: EmailMessage): Promise<ProviderResult<{ messageId: string }>> {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: message.to.map(format),
            cc: message.cc?.map(format),
            reply_to: message.replyTo ? format(message.replyTo) : undefined,
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        });

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: response.status === 401 ? 'AUTHENTICATION' : 'UNAVAILABLE',
              userMessage:
                response.status === 401
                  ? 'The email API key is not valid.'
                  : 'The email could not be delivered right now. It is queued for retry.',
              retryable: response.status !== 401 && response.status !== 422,
            },
          };
        }

        const payload = (await response.json()) as { id?: string };
        const messageId = payload.id ?? '';
        return { ok: true, externalRef: messageId, data: { messageId } };
      } catch {
        return {
          ok: false,
          error: {
            code: 'UNAVAILABLE',
            userMessage: 'The email service could not be reached. The message is queued.',
            retryable: true,
          },
        };
      }
    },
  };
}

function format(recipient: { name?: string; email: string }): string {
  return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
}
