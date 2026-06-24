# VAAD Documentation

## What is VAAD?

VAAD is a production-grade Building Committee (HOA) Management SaaS application. It provides multi-tenant management for residential buildings, handling apartments, residents, billing (charges/payments), maintenance tickets, vendors, documents, and full audit logging. The system enforces role-based access control (RBAC) with five distinct roles and ensures complete data isolation between buildings.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Database | MongoDB Atlas + Mongoose 9 |
| Authentication | NextAuth.js 4 (Credentials Provider) |
| Validation | Zod 3 |
| UI Components | shadcn/ui + Tailwind CSS |
| Data Tables | TanStack Table |
| Icons | Lucide React |

## Quick Start Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Seed database with demo data (development only)
npm run seed
```

## First-Run Production Setup

When deploying with an empty production database:

1. Deploy the app.
2. Open the app URL.
3. Complete `/setup` wizard.

Do not use seed scripts for production onboarding.

## ⚠️ Seed Script Warning

The seed script (`npm run seed`) is **DESTRUCTIVE**. It will:

1. **DELETE ALL EXISTING DATA** in the database
2. Create fresh demo data from scratch

**Never run on production database.** Only use for:
- Initial development setup
- Resetting local development environment
- Testing fresh installations

## Demo Users

After running `npm run seed`, these accounts are available:

| Email | Password | Role | Access Level |
|-------|----------|------|--------------|
| `board@demo.com` | `demo123` | BOARD | Full management access |
| `treasurer@demo.com` | `demo123` | TREASURER | Financial management |
| `resident@demo.com` | `demo123` | RESIDENT | Own apartment only |

## Environment Variables

Create `.env.local` with:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster/vaad
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key
UPLOAD_DIR=./public/uploads
MAX_FILE_SIZE=10485760
```

## Documentation Index

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and data flow |
| [ROUTES_AND_PAGES.md](./ROUTES_AND_PAGES.md) | UI routes and page components |
| [API_REFERENCE.md](./API_REFERENCE.md) | Complete API endpoint documentation |
| [DATA_MODEL.md](./DATA_MODEL.md) | MongoDB schemas and relationships |
| [RBAC_AND_SECURITY.md](./RBAC_AND_SECURITY.md) | Role-based access control rules |
| [LEDGER_RULES.md](./LEDGER_RULES.md) | Billing immutability and balance rules |
| [UPLOADS_AND_DOCUMENTS.md](./UPLOADS_AND_DOCUMENTS.md) | File upload system documentation |
| [KNOWN_GAPS_AND_NEXT_PHASE.md](./KNOWN_GAPS_AND_NEXT_PHASE.md) | Current limitations and roadmap |
| [DEV_GUIDELINES.md](./DEV_GUIDELINES.md) | Development conventions and safety rules |

