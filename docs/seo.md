SEO polish

- canonicalOf(path, stripParams?) helper in src/config/site.ts
- JSON-LD server components:
  - ServiceLd: Service entity
  - ProgramLd: Course entity
  - HealerLd: Person entity
  - BreadcrumbsLd: BreadcrumbList
- Metadata:
  - List pages (/services, /programs, /healers, /store): title, description, canonical via generateMetadata
  - Detail pages: generateMetadata includes canonical; Services canonical strips openBooking and programSlug.

Sitemap

- Helper: src/lib/seo/sitemap.ts builds absolute canonical URLs using canonicalOf.
- Included pages: / (static root), public lists (/services, /programs, /healers, /courses, /store, /blog, /audio), and public detail pages. There is no /about route yet, so the sitemap does not advertise it.
- Detail entries for services and programs require isActive; healer entries require isActive and isVerified, matching currently visible catalogs. Course, product, blog, and audio publication rules are retained.
- Canonical-only policy: no query params (e.g., openBooking, programSlug) are ever emitted.
- lastModified fallback: updatedAt if present, otherwise current date.
- Cadence: weekly for Services/Healers, monthly for Programs; lists are weekly; detail priorities set to 0.8, lists to 0.6.

Robots
Breadcrumbs

- Helpers: `src/lib/seo/breadcrumbs.ts` expose typed crumb builders for Services/Programs/Healers/Store, including index variants (Home › Section) for list pages.
- UI: `src/components/seo/Breadcrumbs.tsx` renders a simple nav with Home › … separators; last crumb is not linked.
- JSON-LD: `src/components/seo/BreadcrumbsLd.tsx` emits a `BreadcrumbList` with absolute URLs using `canonicalOf`.
- Wired on detail and list pages (Home › Section on list pages).

404s & Metadata

- For not found states, pages still resolve canonical metadata (title/alternates). No JSON-LD is emitted for missing entities.


- Served via app/robots.ts.
- Disallows private surfaces: /api/, /admin/, /dashboard/, and auth paths.
- Points to the canonical sitemap at /sitemap.xml.

Canonical deployment origins

- `NEXT_PUBLIC_SITE_URL` is the approved HTTPS canonical origin and takes precedence over deployment metadata. Configure it explicitly at commercial launch after domain ownership/DNS review.
- Without that variable, Vercel deployments use their actual `VERCEL_URL` hostname for canonical metadata, structured links and sitemap/robots rather than emitting the invalid `https://<your-prod-domain>` placeholder. Local development uses `http://localhost:3000`.
- An invalid non-HTTPS public site URL falls back to a valid deployment host. Local HTTP is accepted only for localhost or 127.0.0.1. This does not certify the eventual production domain or remove Preview deployment protection.
- Verify `/sitemap.xml`, `/robots.txt` and rendered canonical tags on the **exact merged Preview** before sign-off. Robots/indexing policy remains independently configured by `NEXT_PUBLIC_ROBOTS`.
