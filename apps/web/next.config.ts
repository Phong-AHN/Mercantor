import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

const config: NextConfig = {
  reactStrictMode: true,
  // The default bottom-left dev badge sits on top of the user menu.
  devIndicators: { position: 'bottom-right' },
  // Pin the workspace root. Left to infer it, the build walks up past the
  // repository looking for a lockfile and trips over the junctions Windows
  // keeps in the user profile.
  outputFileTracingRoot: path.join(here, '..', '..'),
  // Workspace packages ship TypeScript source, not a build artefact.
  transpilePackages: [
    '@relay/ui',
    '@relay/core',
    '@relay/rbac',
    '@relay/auth',
    '@relay/db',
    '@relay/queue',
    '@relay/integrations',
    '@relay/config',
    '@relay/observability',
  ],
  // These are Node libraries with dynamic requires and native bits. Bundling
  // them breaks pino's transport resolution and BullMQ's optional drivers, so
  // the server runtime loads them directly instead.
  serverExternalPackages: ['bullmq', 'ioredis', 'pino', 'pino-pretty', '@prisma/client'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // BullMQ can talk to Valkey through an optional native driver we do not
      // install. Without this, webpack reports a missing module for a branch
      // that is never taken.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals]).filter(
          Boolean,
        ),
        { '@valkey/valkey-glide': 'commonjs @valkey/valkey-glide' },
      ];
    }
    return config;
  },
  typedRoutes: false,
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
};

export default config;
