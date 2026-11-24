# Coffee Business Manager And Cash Flow

A web-based business and financial record system for a coffee buying, processing and trading business. This repository is the initial runnable foundation for the agreed multi-stage project.

## Included in this initial release

- Next.js + React + TypeScript web application with light/dark theme toggle and English/Amharic/Afaan Oromoo language selector foundation.
- NestJS API with server-side session authentication, role-aware user structure, health endpoint, contacts and financial transaction endpoints.
- MySQL database using Drizzle ORM, typed schema and migration configuration.
- Initial schema groups for users/roles, contacts, currencies/exchange rates, financial accounts, transactions/payments, loans, coffee products/purchases/sales, inventory, processing machines/batches/outputs, vehicles/trips, employees/salaries, documents, audit logs and sync records/conflicts.
- Docker Compose for local MySQL.
- Seed script for initial roles and a development administrator.
- Setup, security and implementation notes.

Some advanced workflows (full double-entry posting, multi-device offline synchronization, encrypted USB backup orchestration, PDF/Excel reporting, and complete Amharic/Afaan Oromoo translations) are planned foundations, not claimed as production-complete in this first release. See `docs/IMPLEMENTATION_STATUS.md`.

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+
- Docker Desktop (recommended for local MySQL)

## Windows setup (PowerShell)

1. Extract the ZIP and open the extracted `coffee-business-manager` folder in VS Code or Windsurf.
2. Copy the environment template:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Start MySQL:

   ```powershell
   docker compose up -d mysql
   ```

4. Install packages:

   ```powershell
   npm install
   ```

5. Create/update the database tables:

   ```powershell
   npm run db:push
   ```

6. Seed development roles and the initial admin:

   ```powershell
   npm run db:seed
   ```

7. Start the web app and API together:

   ```powershell
   npm run dev
   ```

8. Open `http://localhost:3000`. API health: `http://localhost:4000/api/health`.

### Development administrator

The seed script creates `admin@coffee.local` with password `ChangeMe123!`. Change this password immediately after the first login and before using real business records. The seed account is for local development only.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run API and web app |
| `npm run build` | Build both applications |
| `npm run db:push` | Push Drizzle schema to MySQL (development) |
| `npm run db:generate` | Generate migration files |
| `npm run db:migrate` | Apply generated migrations |
| `npm run db:seed` | Seed initial roles/admin |
| `docker compose down` | Stop MySQL |

## Important financial-data rule

Do not silently edit or delete posted financial history. The production workflow must use reversals/adjustments with audit history. Preserve the transaction's original currency and the exchange rate used at the time. Transfers between cash and bank accounts are movements, not income or expenses. Offline entries must remain visibly pending until the server confirms synchronization.

## Project layout

```text
apps/
  api/                 NestJS backend
  web/                 Next.js frontend
packages/
  shared/              Shared types and constants
  validation/          Shared validation foundation
database/              Database notes and SQL reference
docs/                  Setup, security, workflows, roadmap
infrastructure/        Deployment and backup scripts
```

## Production warning

This is a development starter, not yet a production deployment. Before real financial use, configure strong secrets, HTTPS, secure cookie settings, managed database backups, access controls, monitoring, restore tests, and independent financial workflow testing. Do not expose MySQL publicly.
