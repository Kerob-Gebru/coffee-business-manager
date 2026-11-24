# Architecture and key decisions

- **Web:** Next.js App Router, React and TypeScript.
- **API:** NestJS with REST endpoints.
- **Database:** MySQL 8.4 with Drizzle ORM.
- **Authentication:** server-side session cookie; session secret is supplied through environment configuration.
- **Offline direction:** PWA + IndexedDB + explicit sync queue; local transactions must show a pending state until confirmed by the server.
- **Currency:** keep original amount/currency and snapshot exchange rate; never add unlike currencies directly.
- **Financial integrity:** separate business documents from payments and payment allocations. Future posting service must write balanced journal entries atomically.
- **Auditability:** financial history should be corrected through reversals/adjustments, not destructive edits.

The API currently exposes `/api/health`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/contacts` and `/api/transactions`. More controllers are added as each milestone is implemented.
