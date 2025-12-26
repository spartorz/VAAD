# VAAD Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Browser)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │   Login     │  │  Dashboard  │  │   Billing   │  │  Tickets   │ │
│  │   Page      │  │   Page      │  │   Page      │  │   Page     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
└─────────┼────────────────┼────────────────┼───────────────┼────────┘
          │                │                │               │
          ▼                ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS SERVER                               │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      MIDDLEWARE (src/middleware.ts)             │ │
│  │              NextAuth route protection for /dashboard/*         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                  │                                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    API ROUTE HANDLERS                           │ │
│  │                   (src/app/api/**/route.ts)                     │ │
│  │  ┌──────────────────────────────────────────────────────────┐  │ │
│  │  │              withAuth() Wrapper (src/lib/api-utils.ts)   │  │ │
│  │  │  • Session validation (401 if missing)                   │  │ │
│  │  │  • Role permission check (403 if insufficient)           │  │ │
│  │  │  • DB connection via dbConnect()                         │  │ │
│  │  │  • BuildingId extraction from session                    │  │ │
│  │  └──────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                  │                                   │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    MONGOOSE MODELS                              │ │
│  │                   (src/models/*.ts)                             │ │
│  │  Building, Apartment, Resident, User, Charge, Payment,         │ │
│  │  MaintenanceTicket, Vendor, Document, AuditLog                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        MONGODB ATLAS                                 │
│                                                                      │
│  Collections: buildings, apartments, residents, users, charges,     │
│               payments, maintenancetickets, vendors, documents,     │
│               auditlogs                                             │
└─────────────────────────────────────────────────────────────────────┘
```

## App Router Structure

```
src/app/
├── api/                          # API Route Handlers (server-only)
│   ├── auth/[...nextauth]/       # NextAuth endpoints
│   ├── apartments/               # Apartment CRUD
│   ├── residents/                # Resident CRUD
│   ├── charges/                  # Charge CRUD + generation
│   ├── payments/                 # Payment CRUD
│   ├── statements/               # Apartment statements
│   ├── tickets/                  # Ticket CRUD + comments
│   ├── vendors/                  # Vendor CRUD
│   ├── documents/                # Document CRUD
│   ├── upload/                   # File upload handler
│   ├── import/                   # CSV import handler
│   ├── dashboard/                # Dashboard data
│   └── audit-logs/               # Audit log queries
│
├── (dashboard)/                  # Route Group - Protected Layout
│   ├── layout.tsx                # Sidebar + auth check
│   ├── dashboard/page.tsx        # Main dashboard
│   ├── apartments/page.tsx       # Apartments management
│   ├── residents/page.tsx        # Residents management
│   ├── billing/page.tsx          # Billing (tabs: charges, payments, generate)
│   ├── tickets/                  # Tickets
│   │   ├── page.tsx              # Ticket list
│   │   └── [id]/page.tsx         # Ticket detail
│   ├── vendors/page.tsx          # Vendor management
│   ├── documents/page.tsx        # Document management
│   └── audit-log/page.tsx        # Audit log viewer
│
├── login/page.tsx                # Public login page
├── layout.tsx                    # Root layout (Providers)
├── page.tsx                      # Redirect to /dashboard
└── globals.css                   # Global styles
```

## Data Flow

### Request Flow: UI → API → DB → Response

```
1. USER ACTION
   └─> React Component (e.g., clicks "Add Apartment")

2. CLIENT REQUEST
   └─> fetch('/api/apartments', { method: 'POST', body: JSON })

3. MIDDLEWARE CHECK (src/middleware.ts)
   └─> NextAuth checks if route matches protected patterns
   └─> If unauthenticated: redirect to /login

4. API ROUTE HANDLER (src/app/api/apartments/route.ts)
   └─> withAuth() wrapper executes:
       ├─> getSession() - extracts user from JWT
       ├─> Role check (if requiredRole specified)
       ├─> dbConnect() - ensures MongoDB connection
       └─> Calls actual handler with { user, params }

5. HANDLER LOGIC
   └─> Zod validation: apartmentSchema.safeParse(body)
   └─> If invalid: return 400 with error message
   └─> Query with buildingId filter: Apartment.find({ buildingId: user.buildingId })
   └─> Perform operation (create/read/update)
   └─> Create audit log (if applicable)
   └─> Return JSON response

6. RESPONSE
   └─> { success: true, data: {...} } or { success: false, error: "..." }

7. CLIENT HANDLING
   └─> React component updates state
   └─> toast.success() or toast.error()
   └─> Refetch data if needed
```

## Auth & RBAC Enforcement

### Layer 1: Middleware (src/middleware.ts)

```typescript
// Protects all dashboard routes
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/apartments/:path*',
    '/residents/:path*',
    // ... all protected paths
  ],
};
```

**Behavior**: Unauthenticated users redirected to `/login`

### Layer 2: API Route Guards (src/lib/api-utils.ts)

```typescript
export function withAuth(handler, options = {}) {
  return async (request, context) => {
    // 1. Get session
    const user = await getSession();
    if (!user) return unauthorizedResponse(); // 401

    // 2. Check role permission (if required)
    if (options.requiredRole && !hasPermission(user.role, options.requiredRole)) {
      return forbiddenResponse(); // 403
    }

    // 3. Connect to database
    await dbConnect();

    // 4. Call handler with user context
    return handler(request, { user, params });
  };
}
```

### Layer 3: In-Handler Checks (per route)

```typescript
// Example: Resident can only access own apartment
if (user.role === 'RESIDENT' && !canAccessApartment(user, apartmentId)) {
  return errorResponse('Permission denied', 403);
}
```

## BuildingId Scoping Enforcement

### Where BuildingId Comes From

```
1. User logs in
   └─> authorize() in src/lib/auth.ts fetches User document
   └─> User.buildingId extracted

2. JWT token created
   └─> jwt callback adds buildingId to token

3. Session created
   └─> session callback exposes buildingId in session.user

4. API request
   └─> withAuth() extracts user from session
   └─> user.buildingId available to handler
```

### How BuildingId is Applied

**Every database query MUST include buildingId filter:**

```typescript
// ✅ CORRECT - Always filter by buildingId
const apartments = await Apartment.find({
  buildingId: new Types.ObjectId(user.buildingId),
  // ... other filters
});

// ❌ WRONG - Never query without buildingId
const apartments = await Apartment.find({ status: 'active' });
```

**Every create operation MUST set buildingId from session:**

```typescript
// ✅ CORRECT - Use session buildingId, ignore client value
const apartment = await Apartment.create({
  ...validation.data,
  buildingId: new Types.ObjectId(user.buildingId), // FROM SESSION
});

// ❌ WRONG - Never trust client-provided buildingId
const apartment = await Apartment.create({
  ...validation.data,
  buildingId: new Types.ObjectId(validation.data.buildingId), // FROM CLIENT
});
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/middleware.ts` | NextAuth route protection |
| `src/lib/auth.ts` | NextAuth config, role helpers |
| `src/lib/api-utils.ts` | withAuth wrapper, response helpers, audit logging |
| `src/lib/db.ts` | MongoDB connection singleton |
| `src/lib/validations.ts` | All Zod schemas |
| `src/lib/balance.ts` | Balance calculation, statement generation |
| `src/lib/types.ts` | TypeScript type definitions |
| `src/models/*.ts` | Mongoose model definitions |

