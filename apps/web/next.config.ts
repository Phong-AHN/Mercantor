import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The bucket origins the browser uploads to. Attachments go straight from
 * the browser to object storage on a presigned POST (the bytes never pass
 * through this server), so `connect-src` must name the bucket - with only
 * `'self'`, every upload in the app was blocked by the browser. Derived from
 * the same variables `packages/storage` builds its S3 client from: an
 * explicit `S3_ENDPOINT` (MinIO, R2...) path-style or virtual-hosted, or AWS
 * itself. Read when the config loads, so on Vercel these must be set for the
 * build as well as at runtime (they are by default).
 */
function storageOrigins(): string[] {
  // Locally the variables live in the repository-root .env, which
  // packages/config loads at runtime - after this file has already run.
  // loadEnvFile never overrides a variable that is already set, so a
  // platform's own environment (Vercel's) still wins.
  try {
    process.loadEnvFile(path.join(here, '..', '..', '.env'));
  } catch {
    // No .env file (production): the platform environment is all there is.
  }
  const bucket = process.env.S3_BUCKET || 'relay-media-dev';
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    try {
      const url = new URL(endpoint);
      return [url.origin, `${url.protocol}//${bucket}.${url.host}`];
    } catch {
      return [];
    }
  }
  return [`https://${bucket}.s3.${region}.amazonaws.com`, `https://${bucket}.s3.amazonaws.com`];
}

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
  // tracing infers. Confirmed still required - a local build with this
  // removed traces zero `.node` engine binaries into any route.
  //
  // The key is `/*`, the syntax Next's own docs use for "every route"
  // (https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats)
  // - not `/**/*`, which those same docs warn against ("avoid `**/*` at the
  // repo root") for producing oversized per-route traces. Only the
  // `.pnpm`-hashed path is kept; the second, unhashed `.prisma/client`
  // pattern this project's install layout never actually has (`.prisma`
  // only exists nested under `.pnpm/@prisma+client@*/node_modules/`) was
  // dead weight matching nothing, kept previously only because it was
  // harmless - dropped now that this is being tightened anyway.
  outputFileTracingIncludes: {
    '/*': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*'],
    // The compressed Chromium that automated before/after captures launch.
    // It is read from disk by path at runtime, which tracing cannot see, and
    // only the one route whose actions take screenshots needs its ~60 MB.
    '/projects/[code]/qa/comparisons': [
      '../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**/*',
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
    '@relay/storefront',
  ],
  // These are Node libraries with dynamic requires and native bits. Bundling
  // them breaks pino's transport resolution and BullMQ's optional drivers, so
  // the server runtime loads them directly instead.
  serverExternalPackages: [
    'bullmq',
    'ioredis',
    'pino',
    'pino-pretty',
    '@prisma/client',
    '@sparticuz/chromium',
    'puppeteer-core',
  ],
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
            // blob: lets the page preview or resize an image the user just
            // picked (cover upload, screenshot dimensions) - blob URLs are
            // minted by this page itself, never loaded from another origin.
            "img-src 'self' data: blob:",
            "font-src 'self' data:",
            `connect-src 'self' ${storageOrigins().join(' ')}`,
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
