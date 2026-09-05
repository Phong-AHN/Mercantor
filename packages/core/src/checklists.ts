import type { AccessKind, AssetKind, MigrationType, ScopeCategory } from './enums';

/**
 * The standard onboarding checklists. Every new project is seeded from these so
 * "what are we waiting for" is answerable on day one rather than after somebody
 * remembers to build a list.
 */

export interface AccessTemplateItem {
  kind: AccessKind;
  label: string;
  /** A missing item at this position stops migration work outright. */
  blocking: boolean;
  hint: string;
}

export const DEFAULT_ACCESS_CHECKLIST: readonly AccessTemplateItem[] = [
  {
    kind: 'SHOPLINE_ADMIN',
    label: 'SHOPLINE store admin access',
    blocking: true,
    hint: 'Staff account for AHN with theme and data permissions.',
  },
  {
    kind: 'SOURCE_PLATFORM',
    label: 'Current platform admin access',
    blocking: true,
    hint: 'Shopify / Wix / WooCommerce / Magento admin or collaborator account.',
  },
  {
    kind: 'DOMAIN_DNS',
    label: 'Domain registrar / DNS access',
    blocking: true,
    hint: 'Needed at launch to point the domain. Read-only is not enough.',
  },
  {
    kind: 'PRODUCT_DATA',
    label: 'Product & inventory data export',
    blocking: true,
    hint: 'CSV export or API access covering products, variants and images.',
  },
  {
    kind: 'CUSTOMER_DATA',
    label: 'Customer data export',
    blocking: false,
    hint: 'Only if customers are in scope. Confirm consent and data handling.',
  },
  {
    kind: 'ORDER_DATA',
    label: 'Order history export',
    blocking: false,
    hint: 'Only if historical orders are in scope.',
  },
  {
    kind: 'APPS_INTEGRATIONS',
    label: 'Apps & third-party integrations',
    blocking: false,
    hint: 'Reviews, subscriptions, loyalty, ERP - list plus credentials.',
  },
  {
    kind: 'PAYMENT_GATEWAY',
    label: 'Payment gateway account',
    blocking: false,
    hint: 'Merchant configures this; AHN needs confirmation it exists.',
  },
  {
    kind: 'EMAIL_MARKETING',
    label: 'Email / marketing platform',
    blocking: false,
    hint: 'Klaviyo, Mailchimp and similar, for list and flow continuity.',
  },
  {
    kind: 'ANALYTICS',
    label: 'Analytics & tracking accounts',
    blocking: false,
    hint: 'GA4, Meta Pixel, Google Ads - so tracking survives the move.',
  },
  {
    kind: 'BRAND_ASSETS',
    label: 'Brand asset storage',
    blocking: false,
    hint: 'Drive / Dropbox folder containing logos and source files.',
  },
];

export interface AssetTemplateItem {
  kind: AssetKind;
  label: string;
  required: boolean;
  hint: string;
}

export const DEFAULT_ASSET_CHECKLIST: readonly AssetTemplateItem[] = [
  {
    kind: 'LOGO',
    label: 'Logo files',
    required: true,
    hint: 'SVG or high-resolution PNG, light and dark variants.',
  },
  {
    kind: 'BRAND_GUIDELINES',
    label: 'Brand guidelines',
    required: false,
    hint: 'PDF or link. Voice, spacing, do and do-not.',
  },
  {
    kind: 'FONTS',
    label: 'Fonts and licences',
    required: true,
    hint: 'Web font files or the licence covering web use.',
  },
  {
    kind: 'COLORS',
    label: 'Colour palette',
    required: true,
    hint: 'Hex values for primary, secondary and accents.',
  },
  {
    kind: 'PRODUCT_IMAGES',
    label: 'Product images',
    required: true,
    hint: 'Source-resolution imagery, named to match SKUs.',
  },
  {
    kind: 'PRODUCT_DATA',
    label: 'Product data',
    required: true,
    hint: 'Titles, descriptions, options, pricing, inventory.',
  },
  { kind: 'SITEMAP', label: 'Sitemap', required: true, hint: 'Page inventory for the new store.' },
  {
    kind: 'URL_STRUCTURE',
    label: 'URL structure',
    required: true,
    hint: 'Agreed handle format for products and collections.',
  },
  {
    kind: 'REDIRECT_MAP',
    label: 'Approved redirect map',
    required: true,
    hint: 'Old URL to new URL. Merchant sign-off required.',
  },
  {
    kind: 'POLICIES',
    label: 'Store policies',
    required: true,
    hint: 'Returns, privacy, terms, shipping.',
  },
  {
    kind: 'SHIPPING_INFO',
    label: 'Shipping configuration',
    required: true,
    hint: 'Zones, rates, carriers, packaging rules.',
  },
  {
    kind: 'TAX_INFO',
    label: 'Tax configuration',
    required: true,
    hint: 'Registrations, rates and exemptions per region.',
  },
  {
    kind: 'PAYMENT_INFO',
    label: 'Payment configuration',
    required: true,
    hint: 'Gateways, methods and currencies to enable.',
  },
  {
    kind: 'LEGAL_INFO',
    label: 'Legal entity information',
    required: false,
    hint: 'Company details shown in the footer and invoices.',
  },
  {
    kind: 'STORE_CREDENTIALS',
    label: 'Store credentials handover',
    required: true,
    hint: 'Recorded in the access checklist, confirmed here.',
  },
];

export interface ScopeTemplateItem {
  category: ScopeCategory;
  label: string;
  /** Included by default for this migration type. */
  defaultIn: readonly MigrationType[];
  hint: string;
}

export const DEFAULT_SCOPE_TEMPLATE: readonly ScopeTemplateItem[] = [
  {
    category: 'PRODUCTS',
    label: 'Products',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Titles, descriptions, SEO, status.',
  },
  {
    category: 'VARIANTS',
    label: 'Variants',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Options, SKUs, barcodes, pricing, inventory.',
  },
  {
    category: 'IMAGES',
    label: 'Images',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Product and collection media, alt text.',
  },
  {
    category: 'COLLECTIONS',
    label: 'Collections',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Manual and automated, with rules.',
  },
  {
    category: 'CUSTOMERS',
    label: 'Customers',
    defaultIn: ['ONE_TO_ONE', 'HYBRID'],
    hint: 'Accounts, addresses, marketing consent.',
  },
  {
    category: 'ORDERS',
    label: 'Orders',
    defaultIn: ['ONE_TO_ONE', 'HYBRID'],
    hint: 'Historical orders, line items and fulfilment state.',
  },
  {
    category: 'PAGES',
    label: 'Pages',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'About, contact, FAQ and other content pages.',
  },
  {
    category: 'NAVIGATION',
    label: 'Navigation',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Header, footer and mega-menu structure.',
  },
  {
    category: 'POLICIES',
    label: 'Policies',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Refund, privacy, terms, shipping.',
  },
  {
    category: 'THEME_DESIGN',
    label: 'Theme / design',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: 'Visual rebuild on SHOPLINE.',
  },
  {
    category: 'REDIRECTS',
    label: 'Redirects',
    defaultIn: ['ONE_TO_ONE', 'CUSTOM_BUILD', 'HYBRID'],
    hint: '301 map from old URLs, to protect SEO.',
  },
  {
    category: 'APPS_INTEGRATIONS',
    label: 'Apps & integrations',
    defaultIn: ['CUSTOM_BUILD', 'HYBRID'],
    hint: 'Reviews, subscriptions, ERP, loyalty.',
  },
];

export function defaultScopeFor(type: MigrationType) {
  return DEFAULT_SCOPE_TEMPLATE.map((item) => ({
    category: item.category,
    label: item.label,
    hint: item.hint,
    disposition: item.defaultIn.includes(type) ? ('IN_SCOPE' as const) : ('OUT_OF_SCOPE' as const),
  }));
}
