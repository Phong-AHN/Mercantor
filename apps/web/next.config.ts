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
  // Belt-and-suspenders alongside schema.prisma's `binaryTargets`: Next's
  // output file tracing decides what actually ships in the deployed
  // serverless function, and it resolves Prisma's query engine through a
  // dynamic `require` its static analysis can't follow - especially one more
  // level deep under pnpm's hashed `.pnpm/<pkg>@<version>_<hash>/`
  // directories. `binaryTargets` alone got this generating the right engine
  // locally and even shipping correctly on some builds, but not
  // deterministically - production still 500'd on a later deploy with
  // "Prisma Client could not locate the Query Engine for runtime
  // rhel-openssl-3.0.x" despite nothing about the schema changing. This is
  // Prisma's own documented fix for the failure (https://pris.ly/d/engine-not-found-nextjs):
  // force-include the engine binaries for every route regardless of what
  // tracing infers.
  outputFileTracingIncludes: {
    '/**/*': [
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*',
      '../../node_modules/.prisma/client/**/*',
    ],
  },
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
        // Browsers ignore this over plain HTTP, so it is harmless in dev and
        // load-bearing once the production deploy is behind TLS (RUNBOOK.md
        // assumes it is - the session cookie's own `secure` flag already
        // depends on that same assumption).
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        // Nothing here loads a remote script, an external font, or an
        // `<img>` from another origin - `next/font/google` self-hosts Inter
        // and JetBrains Mono at build time, and every avatar is CSS/SVG
        // initials rather than an uploaded image - so this stays this
        // strict without breaking anything. `script-src`/`style-src` still
        // need `unsafe-inline` for the pre-paint theme script
        // (`dangerouslySetInnerHTML` in layout.tsx) and Tailwind's runtime
        // + every component's inline `style` attribute; a nonce-based CSP
        // that drops those is a real follow-up, not this pass. `dev` also
        // needs `unsafe-eval` - webpack's Fast Refresh evaluates module code
        // as a string - which production never does; verified against a
        // real production build, not `next dev`, before trusting this.
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self' data:",
            "connect-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ],
};

export default config;
