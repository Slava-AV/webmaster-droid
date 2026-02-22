import type { CmsDocument } from "./index";

function cloneDocument(document: CmsDocument): CmsDocument {
  return JSON.parse(JSON.stringify(document)) as CmsDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeMissing(target: unknown, defaults: unknown): unknown {
  if (Array.isArray(target) || Array.isArray(defaults)) {
    return target === undefined ? cloneValue(defaults) : target;
  }

  if (!isRecord(defaults)) {
    return target === undefined ? defaults : target;
  }

  if (!isRecord(target)) {
    return cloneRecord(defaults);
  }

  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === undefined) {
      out[key] = cloneValue(value);
      continue;
    }

    out[key] = mergeMissing(out[key], value);
  }

  return out;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = cloneValue(item);
  }
  return out;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isRecord(value)) {
    return cloneRecord(value);
  }

  return value;
}

export function createDefaultCmsDocument(): CmsDocument {
  const now = new Date().toISOString();

  return {
    meta: {
      schemaVersion: 2,
      contentVersion: "seed_v1",
      updatedAt: now,
      updatedBy: "system",
    },
    themeTokens: {
      brandPrimary: "#c01848",
      brandPrimaryDark: "#9c133a",
      brandPrimaryLight: "#ffd9e3",
      brandDark: "#333333",
      brandText: "#3f3f3f",
      brandSurface: "#f4f4f4",
      brandBorder: "#e7e7e7",
    },
    layout: {
      header: {
        logo: {
          image: "/assets/kompernass/logo.png",
          alt: "Kompernass logo",
        },
        primaryLinks: [
          { id: "home", label: "Home", href: "/" },
          { id: "about", label: "About", href: "/about/" },
          { id: "portfolio", label: "Portfolio", href: "/portfolio/" },
          { id: "contact", label: "Contact", href: "/contact/" },
        ],
        menuLabel: "Menu",
      },
      footer: {
        logo: {
          image: "/assets/kompernass/logo-trans.png",
          alt: "Kompernass",
        },
        brandBlurb:
          "Kompernass India delivers quality-led nonfood product programs for modern retail channels.",
        navigationTitle: "Navigation",
        contactTitle: "Contact",
        navigationLinks: [
          { id: "home", label: "Home", href: "/" },
          { id: "about", label: "About", href: "/about/" },
          { id: "portfolio", label: "Portfolio", href: "/portfolio/" },
          { id: "contact", label: "Contact", href: "/contact/" },
        ],
        legalLinks: [
          { id: "privacyPolicy", label: "Privacy Policy", href: "/privacy-policy/" },
          { id: "legalNotice", label: "Legal Notice", href: "/legal-notice/" },
        ],
        contact: {
          company: "Kompernass India Private Limited (Placeholder)",
          email: "info@kompernass.in",
          phone: "+91 00000 00000",
          addressLines: [
            "Floor 00, Business Park (Placeholder)",
            "Bengaluru, Karnataka 560000",
            "India",
          ],
        },
        copyrightTemplate: "Copyright {year} Kompernass India. All rights reserved.",
      },
      shared: {
        pageIntro: {
          image: "/assets/kompernass/inner-banner.webp",
          alt: "Kompernass",
        },
        contactCardHelperText:
          "This is a placeholder contact profile for the India branch. Final legal and office details will be updated before production launch.",
      },
    },
    pages: {
      home: {
        hero: {
          title: "Reliable Nonfood Sourcing For Modern Retail",
          subtitle:
            "Kompernass India connects global manufacturers with retail demand through quality-led product development, sourcing, and delivery.",
          ctaLabel: "About Our Business",
          ctaHref: "/about/",
          image: "/assets/kompernass/hero-home.webp",
        },
        sectionHeading: {
          title: "Business Capabilities",
          subtitle:
            "Integrated teams across product development, quality, and supply operations support dependable nonfood programs for retail partners.",
        },
        capabilities: [
          {
            id: "product-management",
            title: "Product Management",
            body: "We lead each product from market opportunity to shelf-ready execution with close alignment to retail requirements.",
            icon: "ClipboardList",
          },
          {
            id: "product-design",
            title: "Product Design",
            body: "Our design process turns concept sketches into production-ready products with clear usability and market fit.",
            icon: "PenTool",
          },
          {
            id: "technical-documentation",
            title: "Technical Documentation",
            body: "We prepare multilingual manuals and product information to ensure compliance, clarity, and customer confidence.",
            icon: "FileText",
          },
          {
            id: "packaging",
            title: "Packaging Development",
            body: "Packaging is engineered for protection, communication, and retail impact while keeping cost and logistics in balance.",
            icon: "Package",
          },
          {
            id: "quality",
            title: "Quality Assurance",
            body: "Every category follows strict internal checks and independent certifications to maintain reliable product standards.",
            icon: "ShieldCheck",
          },
          {
            id: "logistics",
            title: "Logistics And Delivery",
            body: "Our logistics teams coordinate planning, customs, and shipment monitoring for dependable and timely fulfillment.",
            icon: "Truck",
          },
        ],
        aboutTeaser: {
          eyebrow: "About Us",
          title: "Built On Long-Term Retail Partnerships",
          body: "Kompernass has grown continuously while maintaining close alignment with retail demand, product quality, and reliable delivery.",
          ctaLabel: "Learn More",
          ctaHref: "/about/",
          image: "/assets/kompernass/about-teaser.webp",
        },
        sustainabilityCallout: {
          eyebrow: "Sustainability",
          title: "Responsible Growth Across Operations And Supply Chain",
          body: "Sustainability in Kompernass operations covers supplier selection, process improvements, and practical resource management throughout the value chain.",
          ctaLabel: "Read Sustainability Focus",
          ctaHref: "/about/",
          image: "/assets/kompernass/sustainability-bg.webp",
        },
      },
      about: {
        intro: {
          title: "About",
          description:
            "Kompernass India is built on a long-term operating model covering compliance, sustainability, and growth-oriented execution.",
          eyebrow: "About",
        },
        sections: [
          {
            id: "history",
            title: "History",
            body: "Since 1992, Kompernass has grown continuously as a long-term partner for major retail channels. The company has built its reputation on dependable execution, product quality, and a practical understanding of consumer expectations.",
            image: "/assets/kompernass/history.webp",
          },
          {
            id: "compliance",
            title: "Compliance",
            body: "Compliance is integrated into daily operations across sourcing, contracts, product standards, and governance. Clear accountability, transparent processes, and responsible business conduct remain central to sustainable expansion.",
            image: "/assets/kompernass/compliance.webp",
          },
          {
            id: "sustainability",
            title: "Sustainability",
            body: "Sustainability efforts cover supplier practices, materials, and internal operations. The organization focuses on continuous reductions in environmental impact while maintaining quality and operational efficiency.",
            image: "/assets/kompernass/sustainability.webp",
          },
          {
            id: "future",
            title: "Future",
            body: "Kompernass India is designed as a scalable branch platform to serve regional growth. The roadmap focuses on stronger category depth, resilient sourcing, and closer retail collaboration in the Indian market.",
            image: "/assets/kompernass/hero-home.webp",
          },
        ],
      },
      portfolio: {
        intro: {
          title: "Portfolio",
          description:
            "Our portfolio covers practical, high-demand nonfood categories adapted to modern retail requirements.",
          eyebrow: "Portfolio",
        },
        items: [
          {
            id: "consumer-electronics",
            title: "Consumer Electronics",
            body: "Practical, value-driven electronic products developed for high-volume retail environments.",
            image: "/assets/kompernass/portfolio-consumer-electronics.webp",
          },
          {
            id: "kitchen",
            title: "Kitchen",
            body: "Everyday kitchen solutions balancing durability, functionality, and price competitiveness.",
            image: "/assets/kompernass/portfolio-kitchen.webp",
          },
          {
            id: "personal-care",
            title: "Personal Care",
            body: "Personal care ranges designed for reliable performance and broad consumer utility.",
            image: "/assets/kompernass/portfolio-personal-care.webp",
          },
          {
            id: "power-tools",
            title: "Power Tools",
            body: "Accessible tool lines with robust quality control for practical household and workshop use.",
            image: "/assets/kompernass/portfolio-power-tools.webp",
          },
          {
            id: "hand-tools",
            title: "Hand Tools",
            body: "Essential hand tools engineered for dependable use and strong retail value.",
            image: "/assets/kompernass/portfolio-hand-tools.webp",
          },
        ],
      },
      contact: {
        intro: {
          title: "Contact",
          description:
            "Get in touch with Kompernass India through direct company contact information.",
          eyebrow: "Contact",
        },
        details: {
          company: "Kompernass India Private Limited (Placeholder)",
          email: "info@kompernass.in",
          phone: "+91 00000 00000",
          addressLines: [
            "Floor 00, Business Park (Placeholder)",
            "Bengaluru, Karnataka 560000",
            "India",
          ],
        },
      },
      privacyPolicy: {
        intro: {
          title: "Privacy Policy",
          description:
            "This v1 page contains placeholder policy language for the India branch and will be updated after legal review.",
          eyebrow: "Privacy Policy",
        },
        sections: [
          {
            title: "Overview",
            body: [
              "This page is a launch placeholder for the India branch and will be replaced with the final policy approved by legal counsel.",
              "Kompernass India intends to process personal data only for legitimate business purposes, including communication, operations, and legal compliance.",
            ],
          },
          {
            title: "Data We May Collect",
            body: [
              "Basic contact details provided through direct communication channels such as email or phone.",
              "Technical browsing information required for secure website operation and basic diagnostics.",
            ],
          },
          {
            title: "Your Rights",
            body: [
              "You may request access, correction, or deletion of personal information held by the company, subject to applicable legal requirements.",
              "Requests can be submitted to the contact email listed on the Contact page.",
            ],
          },
        ],
      },
      legalNotice: {
        intro: {
          title: "Legal Notice",
          description:
            "This page contains placeholder legal entity information for the India branch launch phase.",
          eyebrow: "Legal Notice",
        },
        sections: [
          {
            title: "Company Information",
            body: [
              "Kompernass India Private Limited (Placeholder legal name and registration details).",
              "Registered office details and corporate identification numbers will be updated after final registration confirmation.",
            ],
          },
          {
            title: "Contact",
            body: ["Email: info@kompernass.in", "Phone: +91 00000 00000"],
          },
          {
            title: "Disclaimer",
            body: [
              "All content on this site is provided for general information and may be updated without prior notice.",
              "Final legal language will be published after completion of formal review.",
            ],
          },
        ],
      },
    },
    seo: {
      home: {
        title: "Kompernass India | Nonfood Retail Partner",
        description:
          "Kompernass India delivers quality-led nonfood sourcing, development, and retail support for the Indian market.",
        path: "/",
      },
      about: {
        title: "About | Kompernass India",
        description:
          "Learn about Kompernass India across company history, compliance, sustainability, and future growth plans.",
        path: "/about/",
      },
      portfolio: {
        title: "Portfolio | Kompernass India",
        description:
          "Explore Kompernass India portfolio categories including consumer electronics, kitchen, personal care, and tools.",
        path: "/portfolio/",
      },
      contact: {
        title: "Contact | Kompernass India",
        description:
          "Contact Kompernass India through direct company details. No web form is used on this page.",
        path: "/contact/",
      },
      privacyPolicy: {
        title: "Privacy Policy | Kompernass India",
        description:
          "Read the privacy policy placeholder for Kompernass India branch operations.",
        path: "/privacy-policy/",
      },
      legalNotice: {
        title: "Legal Notice | Kompernass India",
        description: "Read the legal notice placeholder for Kompernass India.",
        path: "/legal-notice/",
      },
    },
  };
}

export function normalizeCmsDocument(input: CmsDocument): CmsDocument {
  const defaults = createDefaultCmsDocument();
  const merged = mergeMissing(cloneDocument(input), defaults) as CmsDocument;

  if (merged.meta.schemaVersion < defaults.meta.schemaVersion) {
    merged.meta.schemaVersion = defaults.meta.schemaVersion;
  }

  return merged;
}
