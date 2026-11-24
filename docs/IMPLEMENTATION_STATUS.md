# Implementation status

## Runnable foundation in this release
- [x] Monorepo with separate Next.js web and NestJS API apps
- [x] MySQL + Drizzle schema foundation
- [x] Server-side session login/logout and role model foundation
- [x] Contact list/create API and UI
- [x] Financial transaction list/create API and UI foundation
- [x] Dashboard overview and API health indicator
- [x] Light/dark theme toggle
- [x] Language selector foundation (English, Amharic, Afaan Oromoo)
- [x] Docker Compose MySQL service
- [x] Development seed administrator

## Planned implementation stages
1. Harden foundation, authorization guards, audit events, schema constraints and automated tests.
2. Complete contact profiles, roles and statements.
3. Implement accounting ledger, receivables, payables, payment allocation, credit and loans.
4. Implement cash/bank accounts, reconciliation and historical exchange rates.
5. Complete coffee purchasing, sales, stock movements and machine processing calculations.
6. Complete vehicles, trips, employees and salaries.
7. Add document storage, PDF/Excel reports and exports.
8. Complete translations and per-user preferences.
9. Implement IndexedDB offline queue, idempotency, sync confirmation and conflict review.
10. Implement encrypted desktop/USB backups, restore validation, monitoring, security review and production deployment.

## Not yet production-complete
The initial schema contains many domain tables, but the full workflows and reports for every module are not implemented yet. Offline support currently has schema/planning foundations only; do not assume local edits sync automatically. Financial postings are not yet a complete audited double-entry accounting system.
