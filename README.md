# VAAD - Building Committee (HOA) Management System

A production-ready MVP for managing building committees and HOAs. Built with Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, and MongoDB.

![VAAD Dashboard](https://via.placeholder.com/800x400?text=VAAD+Dashboard)

## Features

### Multi-Tenant Architecture
- Every record is scoped by `buildingId`
- Secure data isolation between buildings
- Designed to scale to multiple buildings

### Role-Based Access Control (RBAC)
| Role | Permissions |
|------|-------------|
| **ADMIN** | Full system access |
| **BOARD** | Manage building, residents, finances, documents |
| **TREASURER** | Manage charges, payments, view reports |
| **MANAGEMENT** | Similar to Board for management companies |
| **RESIDENT** | View own apartment data, balance, tickets, public docs |

### Core Modules

#### 🏠 Apartments & Residents
- Spreadsheet-like data tables with search, filter, pagination
- CSV import for bulk data entry
- Inline editing capabilities

#### 💰 Billing & Payments
- **Charges**: Monthly dues, one-time fees, repairs, funds
- **Payments**: Bank transfer, cash, credit card tracking
- **Ledger System**: Immutable records (void instead of delete)
- **Balance Calculation**: Real-time per-apartment balances
- **Statements**: Chronological transaction history

#### 🔧 Maintenance Tickets
- Create and track maintenance requests
- Priority levels (Low, Medium, High, Urgent)
- Status workflow (Open → In Progress → Resolved → Closed)
- Assign vendors to tickets
- Timeline with comments

#### 🏢 Vendors
- Vendor directory with contact info
- Category classification
- Contract tracking

#### 📄 Documents
- Upload and manage building documents
- Visibility controls (Public, Residents, Board-only)
- Category organization

#### 📋 Audit Log
- Track all financial changes
- Record admin actions
- Full before/after state capture

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Auth**: NextAuth.js with Credentials provider
- **Validation**: Zod
- **UI**: Tailwind CSS + shadcn/ui
- **Tables**: TanStack Table

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd vaad
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file:
   ```env
   # MongoDB Atlas Connection
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/vaad?retryWrites=true&w=majority

   # NextAuth Configuration
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-super-secret-key-generate-with-openssl

   # File Upload Directory
   UPLOAD_DIR=./public/uploads
   MAX_FILE_SIZE=10485760
   ```

   To generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open the application**
   
   Visit [http://localhost:3000](http://localhost:3000)

6. **Initialize system**
   - On a new empty database, the app redirects to `/setup`
   - Complete the setup wizard to create the first building and admin user

### Development Seed (Optional)

For local development only, you may create demo data:

```bash
npm run seed
```

Never use seed scripts as a production setup path.

### Demo Accounts (seeded development only)

After running the optional seed script, use these accounts (password: `demo123`):

| Email | Role | Access |
|-------|------|--------|
| board@demo.com | BOARD | Full management access |
| treasurer@demo.com | TREASURER | Financial management |
| resident@demo.com | RESIDENT | Personal data only |

## Project Structure

```
src/
├── app/
│   ├── api/                    # API Routes
│   │   ├── apartments/
│   │   ├── auth/
│   │   ├── charges/
│   │   ├── documents/
│   │   ├── payments/
│   │   ├── residents/
│   │   ├── tickets/
│   │   └── vendors/
│   ├── (dashboard)/            # Protected dashboard routes
│   │   ├── apartments/
│   │   ├── billing/
│   │   ├── dashboard/
│   │   ├── documents/
│   │   ├── residents/
│   │   ├── tickets/
│   │   ├── vendors/
│   │   └── audit-log/
│   └── login/                  # Auth pages
├── components/
│   ├── layout/                 # Layout components
│   ├── ui/                     # shadcn/ui components
│   └── data-table.tsx          # Reusable table component
├── lib/
│   ├── auth.ts                 # NextAuth configuration
│   ├── api-utils.ts            # API helpers & middleware
│   ├── balance.ts              # Balance calculation logic
│   ├── db.ts                   # MongoDB connection
│   ├── hooks.ts                # Custom React hooks
│   ├── types.ts                # TypeScript types
│   ├── utils.ts                # Utility functions
│   └── validations.ts          # Zod schemas
├── models/                     # Mongoose models
│   ├── Apartment.ts
│   ├── AuditLog.ts
│   ├── Building.ts
│   ├── Charge.ts
│   ├── Document.ts
│   ├── MaintenanceTicket.ts
│   ├── Payment.ts
│   ├── Resident.ts
│   ├── User.ts
│   └── Vendor.ts
└── scripts/
    └── seed.ts                 # Database seeding script
```

## API Endpoints

All endpoints require authentication and enforce building scope.

### Apartments
- `GET /api/apartments` - List apartments
- `POST /api/apartments` - Create apartment
- `GET /api/apartments/[id]` - Get apartment
- `PATCH /api/apartments/[id]` - Update apartment

### Residents
- `GET /api/residents` - List residents
- `POST /api/residents` - Create resident
- `PATCH /api/residents/[id]` - Update resident

### Charges
- `GET /api/charges` - List charges
- `POST /api/charges` - Create charge
- `PATCH /api/charges/[id]` - Void charge
- `POST /api/charges/generate` - Generate monthly charges (idempotent)

### Payments
- `GET /api/payments` - List payments
- `POST /api/payments` - Record payment
- `PATCH /api/payments/[id]` - Void payment

### Statements
- `GET /api/statements/[apartmentId]` - Get apartment statement

### Tickets
- `GET /api/tickets` - List tickets
- `POST /api/tickets` - Create ticket
- `PATCH /api/tickets/[id]` - Update ticket
- `POST /api/tickets/[id]/comments` - Add comment

### Vendors
- `GET /api/vendors` - List vendors
- `POST /api/vendors` - Create vendor
- `PATCH /api/vendors/[id]` - Update vendor
- `DELETE /api/vendors/[id]` - Delete vendor

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Create document
- `DELETE /api/documents/[id]` - Delete document

### Dashboard
- `GET /api/dashboard` - Get role-based dashboard data

### Import
- `POST /api/import` - Import apartments/residents from CSV

### Audit Log
- `GET /api/audit-logs` - List audit logs (Board+ only)

## Business Logic

### Monthly Charges Generation
The `/api/charges/generate` endpoint creates monthly maintenance charges:
- **Idempotent**: Won't create duplicates for same apartment+period
- **Batch processing**: Creates charges for all active apartments
- **Audit logged**: Records who generated charges and when

### Balance Calculation
```
Balance = SUM(open charges) - SUM(confirmed payments)
```
- Excludes voided records
- Real-time calculation per apartment
- Building-wide totals available on dashboard

### Ledger Rules
- Charges and payments are **immutable**
- Use `status: 'voided'` instead of deletion
- All changes are audit logged

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

Built with ❤️ for building committees everywhere.
