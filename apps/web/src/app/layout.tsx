import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ToastProvider } from '@relay/ui';
import './globals.css';

const sans = Geist({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-geist',
  display: 'swap',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Mercantor - AHN x SHOPLINE Migration Portal',
    template: '%s - Mercantor',
  },
  description:
    'One merchant, one project record, one source of truth. Live migration status, blockers, approvals and deployment readiness for AHN and SHOPLINE.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
    { media: '(prefers-color-scheme: dark)', color: '#121316' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * The theme is resolved before paint by a tiny inline script. Without it the
 * page flashes light for a frame on a dark-theme reload, which looks broken on
 * every navigation.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('relay-theme');
    var system = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || stored === 'light' ? stored : system ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="bg-canvas text-ink min-h-dvh antialiased">
        <a
          href="#main"
          className="focus:bg-primary focus:text-on-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[var(--radius-sm)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
