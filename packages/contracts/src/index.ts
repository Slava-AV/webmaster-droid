export type CmsStage = "live" | "draft";

// Engine-level page identifier: any string key is valid.
export type CmsPageId = string;

// Opinionated starter page identifiers for the bundled starter schema/content.
export type StarterCmsPageId =
  | "home"
  | "about"
  | "portfolio"
  | "contact"
  | "privacyPolicy"
  | "legalNotice";

export interface HeroContent {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  image: string;
}

export interface Capability {
  id: string;
  title: string;
  body: string;
  icon?: string;
}

export interface AboutSection {
  id: string;
  title: string;
  body: string;
  image?: string;
}

export interface PortfolioItem {
  id: string;
  title: string;
  body: string;
  image: string;
}

export interface ContactDetails {
  company: string;
  email: string;
  phone: string;
  addressLines: string[];
}

export interface TextSection {
  title: string;
  body: string[];
}

export interface LayoutLink {
  id: string;
  label: string;
  href: string;
}

export interface SeoEntry {
  title: string;
  description: string;
  path: string;
}

export interface ThemeTokens {
  brandPrimary: string;
  brandPrimaryDark: string;
  brandPrimaryLight: string;
  brandDark: string;
  brandText: string;
  brandSurface: string;
  brandBorder: string;
}

export interface HomePageContent {
  hero: HeroContent;
  sectionHeading: {
    title: string;
    subtitle: string;
  };
  capabilities: Capability[];
  aboutTeaser: {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
    image: string;
  };
  sustainabilityCallout: {
    eyebrow: string;
    title: string;
    body: string;
    ctaLabel: string;
    ctaHref: string;
    image: string;
  };
}

export interface GenericPageIntro {
  title: string;
  description: string;
  eyebrow?: string;
}

export interface AboutPageContent {
  intro: GenericPageIntro;
  sections: AboutSection[];
}

export interface PortfolioPageContent {
  intro: GenericPageIntro;
  items: PortfolioItem[];
}

export interface ContactPageContent {
  intro: GenericPageIntro;
  details: ContactDetails;
}

export interface LegalPageContent {
  intro: GenericPageIntro;
  sections: TextSection[];
}

export interface HeaderLayoutContent {
  logo: {
    image: string;
    alt: string;
  };
  primaryLinks: LayoutLink[];
  menuLabel: string;
}

export interface FooterLayoutContent {
  logo: {
    image: string;
    alt: string;
  };
  brandBlurb: string;
  navigationTitle: string;
  contactTitle: string;
  navigationLinks: LayoutLink[];
  legalLinks: LayoutLink[];
  contact: ContactDetails;
  copyrightTemplate: string;
}

export interface SharedLayoutContent {
  pageIntro: {
    image: string;
    alt: string;
  };
  contactCardHelperText: string;
}

export interface SiteLayoutContent {
  header: HeaderLayoutContent;
  footer: FooterLayoutContent;
  shared: SharedLayoutContent;
}

export interface StarterCmsPages {
  home: HomePageContent;
  about: AboutPageContent;
  portfolio: PortfolioPageContent;
  contact: ContactPageContent;
  privacyPolicy: LegalPageContent;
  legalNotice: LegalPageContent;
}

export interface CmsDocument<
  TPages extends object = Record<string, unknown>,
  TLayout extends object = Record<string, unknown>,
  TSeoPageId extends string = string,
> {
  meta: {
    schemaVersion: number;
    contentVersion: string;
    updatedAt: string;
    updatedBy?: string;
    sourceCheckpointId?: string;
  };
  themeTokens: ThemeTokens;
  layout: TLayout;
  pages: TPages;
  seo: Record<TSeoPageId, SeoEntry>;
}

export type StarterCmsDocument = CmsDocument<
  StarterCmsPages,
  SiteLayoutContent,
  StarterCmsPageId
>;

export type PatchOperation = {
  op: "set";
  path: EditablePath;
  value: unknown;
};

export type CmsPatch = {
  operations: PatchOperation[];
};

export type ThemeTokenPatch = Partial<ThemeTokens>;

export interface CheckpointMeta {
  id: string;
  createdAt: string;
  createdBy?: string;
  reason: string;
}

export interface PublishedVersionMeta {
  id: string;
  createdAt: string;
  createdBy?: string;
  sourceContentVersion: string;
}

export interface AuditEvent {
  id: string;
  type:
    | "chat_mutation"
    | "publish"
    | "rollback"
    | "auth"
    | "system_warning";
  actor?: string;
  createdAt: string;
  detail: Record<string, unknown>;
}

export interface RollbackRequest {
  sourceType: "checkpoint" | "published";
  sourceId: string;
}

export interface PublishRequest {
  confirmationText: string;
}

export interface ModelProviderConfig {
  openaiEnabled: boolean;
  geminiEnabled: boolean;
  defaultModelId: string;
}

export interface AgentSessionConfig {
  modelId?: string;
  includeThinking?: boolean;
}

export type SelectedElementKind = "text" | "image" | "link" | "section";

export interface SelectedElementContext {
  path: string;
  label: string;
  kind: SelectedElementKind;
  pagePath: string;
  relatedPaths?: string[];
  preview?: string;
}

export type EditablePath =
  | `pages.${string}`
  | `layout.${string}`
  | `seo.${string}.${"title" | "description"}`
  | `themeTokens.${keyof ThemeTokens}`;

export const REQUIRED_PUBLISH_CONFIRMATION = "PUBLISH";

export function isHttpsUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("https://") &&
    value.length > "https://".length
  );
}

export function isImageLikePath(path: string): boolean {
  const normalized = path.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.endsWith(".image") ||
    normalized.endsWith(".imageurl") ||
    normalized.endsWith(".icon") ||
    normalized.endsWith(".logo")
  );
}

export function isEditablePath(path: string): path is EditablePath {
  return (
    path.startsWith("pages.") ||
    path.startsWith("layout.") ||
    path.startsWith("seo.") ||
    path.startsWith("themeTokens.")
  );
}

export function requiresStrictImageValidation(path: string): boolean {
  return isImageLikePath(path);
}

export { createDefaultCmsDocument, normalizeCmsDocument } from "./default-document";
export {
  createStarterCmsDocument,
  normalizeStarterCmsDocument,
} from "./starter-document";
