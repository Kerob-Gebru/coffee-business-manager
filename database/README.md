# Database

The Drizzle schema is currently maintained in `apps/api/src/database/schema.ts`. Run `npm run db:push` for local development. For controlled production releases, generate and review migrations (`npm run db:generate`) and apply them (`npm run db:migrate`). Never use schema push as a production migration strategy.
