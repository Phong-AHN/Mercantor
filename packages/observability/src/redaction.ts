/**
 * Secrets are stripped by key name, in the logger, so "never log a secret" is
 * enforced by code rather than by remembering. Inherited from AHN Orbit.
 */
const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'botToken',
  'apiToken',
  'apiKey',
  'secret',
  'clientSecret',
  'signingSecret',
  'authorization',
  'cookie',
  'setCookie',
  'sessionToken',
  'credential',
  'credentials',
];

const CONTAINERS = ['', '*.', 'req.headers.', 'res.headers.', 'context.', 'payload.', 'body.'];

export const REDACT_PATHS: string[] = CONTAINERS.flatMap((prefix) =>
  SENSITIVE_KEYS.map((key) => `${prefix}${key}`),
);
