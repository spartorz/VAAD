# VAAD Data Model

## Collections Overview

| Collection | Model File | Purpose |
|------------|------------|---------|
| buildings | `src/models/Building.ts` | Building/tenant configuration |
| apartments | `src/models/Apartment.ts` | Physical units in building |
| residents | `src/models/Resident.ts` | People living in apartments |
| users | `src/models/User.ts` | System users with login credentials |
| charges | `src/models/Charge.ts` | Ledger: amounts owed |
| payments | `src/models/Payment.ts` | Ledger: amounts paid |
| maintenancetickets | `src/models/MaintenanceTicket.ts` | Maintenance requests |
| vendors | `src/models/Vendor.ts` | Service providers |
| documents | `src/models/Document.ts` | Uploaded files |
| auditlogs | `src/models/AuditLog.ts` | Change tracking |

## Entity Relationship Diagram

```
┌─────────────┐
│  Building   │
│─────────────│
│ _id (PK)    │
│ name        │
│ address     │
│ settings    │
└──────┬──────┘
       │
       │ 1:N
       ▼
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  ┌─────────────┐    1:N    ┌─────────────┐              │
│  │  Apartment  │◄──────────│  Resident   │              │
│  │─────────────│           │─────────────│              │
│  │ _id (PK)    │           │ _id (PK)    │              │
│  │ buildingId  │───────────│ buildingId  │              │
│  │ number      │           │ apartmentId │──────────────┤
│  │ floor       │           │ fullName    │              │
│  │ status      │           │ email       │              │
│  └──────┬──────┘           └──────┬──────┘              │
│         │                         │                      │
│         │ 1:N                     │ 1:1 (optional)      │
│         ▼                         ▼                      │
│  ┌─────────────┐           ┌─────────────┐              │
│  │   Charge    │           │    User     │              │
│  │─────────────│           │─────────────│              │
│  │ _id (PK)    │           │ _id (PK)    │              │
│  │ buildingId  │           │ buildingId  │──────────────┤
│  │ apartmentId │           │ residentId  │              │
│  │ type        │           │ email       │              │
│  │ amount      │           │ passwordHash│              │
│  │ period      │           │ role        │              │
│  │ status      │           └─────────────┘              │
│  │ createdBy   │───────────────────────────────────────►│
│  └─────────────┘                                        │
│                                                          │
│  ┌─────────────┐           ┌─────────────┐              │
│  │   Payment   │           │   Vendor    │              │
│  │─────────────│           │─────────────│              │
│  │ _id (PK)    │           │ _id (PK)    │              │
│  │ buildingId  │───────────│ buildingId  │──────────────┤
│  │ apartmentId │           │ name        │              │
│  │ amount      │           │ category    │              │
│  │ method      │           └──────┬──────┘              │
│  │ status      │                  │                      │
│  │ createdBy   │                  │ N:1 (optional)      │
│  └─────────────┘                  │                      │
│                                   ▼                      │
│  ┌─────────────┐           ┌─────────────────┐          │
│  │  Document   │           │MaintenanceTicket│          │
│  │─────────────│           │─────────────────│          │
│  │ _id (PK)    │           │ _id (PK)        │          │
│  │ buildingId  │───────────│ buildingId      │──────────┤
│  │ title       │           │ apartmentId     │          │
│  │ visibility  │           │ vendorId        │          │
│  │ file        │           │ status          │          │
│  │ createdBy   │           │ timeline[]      │          │
│  └─────────────┘           └─────────────────┘          │
│                                                          │
│  ┌─────────────┐                                        │
│  │  AuditLog   │                                        │
│  │─────────────│                                        │
│  │ _id (PK)    │                                        │
│  │ buildingId  │────────────────────────────────────────┤
│  │ actorUserId │                                        │
│  │ action      │                                        │
│  │ entityType  │                                        │
│  │ entityId    │                                        │
│  │ before/after│                                        │
│  └─────────────┘                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Schema Definitions

### Building

```typescript
{
  _id: ObjectId,
  name: String,                    // required
  address: String,                 // required
  city: String,                    // required
  country: String,                 // required
  timezone: String,                // default: 'UTC'
  bankInfo: {
    bankName: String,
    accountNumber: String,         // should be masked
    routingNumber: String,
    notes: String
  },
  settings: {
    currency: String,              // default: 'USD'
    dueDay: Number,                // 1-28, default: 1
    monthlyDueAmount: Number       // optional
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `name` - for searching
- `(city, country)` - for geographic queries

---

### Apartment

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  number: String,                  // required
  floor: Number,                   // optional
  size: Number,                    // optional (sqft)
  status: 'active' | 'inactive',   // default: 'active'
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `buildingId` - all queries filter by building
- `(buildingId, number)` - **UNIQUE** - no duplicate apartment numbers per building
- `(buildingId, status)` - filter active apartments

---

### Resident

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  apartmentId: ObjectId,           // required, ref: Apartment
  fullName: String,                // required
  phone: String,                   // optional
  email: String,                   // optional
  type: 'owner' | 'tenant',        // default: 'owner'
  isActive: Boolean,               // default: true
  moveInAt: Date,                  // default: Date.now (when added)
  moveOutAt: Date | null,          // null = active, set when moved out
  moveOutNote: String,             // optional reason for move-out
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `buildingId`
- `apartmentId`
- `(buildingId, apartmentId)` - residents per apartment
- `(buildingId, email)` - lookup by email
- `(buildingId, isActive)` - filter active
- `(buildingId, moveInAt)` - sort by move-in date
- `(buildingId, apartmentId, isActive)` - active residents per apartment

**Lifecycle Rules**:
- When resident is moved out: `isActive=false`, `moveOutAt=now`
- Active residents: `isActive=true` AND `moveOutAt=null`
- History residents: `isActive=false` OR `moveOutAt!=null`

---

### User

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  residentId: ObjectId,            // optional, ref: Resident
  name: String,                    // required
  email: String,                   // required, unique globally
  passwordHash: String,            // required, bcrypt
  role: 'ADMIN' | 'BOARD' | 'TREASURER' | 'RESIDENT' | 'MANAGEMENT',
  isActive: Boolean,               // default: true, false = cannot login
  lastLoginAt: Date,               // optional
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `email` - **UNIQUE** (global)
- `buildingId`
- `(buildingId, role)` - find users by role

**Password Hashing**: Automatic via pre-save hook (bcrypt, 12 rounds)

**Account Disable**:
- When `isActive=false`, user cannot login
- Automatically set when linked resident is moved out

---

### Charge (Ledger - Immutable)

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  apartmentId: ObjectId,           // required, ref: Apartment
  type: 'monthly_due' | 'one_time' | 'repair' | 'fund',
  title: String,                   // required
  amount: Number,                  // required, min: 0
  currency: String,                // default: 'USD'
  period: String,                  // YYYY-MM or null
  dueDate: Date,                   // required
  status: 'open' | 'voided',       // default: 'open'
  createdBy: ObjectId,             // required, ref: User
  createdAt: Date
  // NO updatedAt - immutable
}
```

**Indexes**:
- `buildingId`
- `apartmentId`
- `(buildingId, apartmentId, status)` - balance queries
- `(buildingId, period)` - period filtering
- `(buildingId, dueDate)` - date filtering
- `(buildingId, apartmentId, type, period)` - **UNIQUE PARTIAL** where type='monthly_due' AND period IS NOT NULL AND status='open'

**⚠️ IMMUTABILITY**: No `updatedAt` field. Only `status` can change (to 'voided').

---

### Payment (Ledger - Immutable)

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  apartmentId: ObjectId,           // required, ref: Apartment
  residentId: ObjectId,            // optional, ref: Resident
  amount: Number,                  // required, min: 0
  currency: String,                // default: 'USD'
  method: 'bank_transfer' | 'cash' | 'credit_card' | 'other',
  reference: String,               // optional (transaction ID)
  paidAt: Date,                    // required
  status: 'confirmed' | 'pending' | 'voided',
  createdBy: ObjectId,             // required, ref: User
  createdAt: Date
  // NO updatedAt - immutable
}
```

**Indexes**:
- `buildingId`
- `apartmentId`
- `(buildingId, apartmentId, status)` - balance queries
- `(buildingId, paidAt)` - date filtering
- `(buildingId, createdAt)` - recent payments

**⚠️ IMMUTABILITY**: No `updatedAt` field. Only `status` can change (to 'voided').

---

### MaintenanceTicket

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  apartmentId: ObjectId,           // optional, ref: Apartment
  createdBy: ObjectId,             // required, ref: User
  title: String,                   // required
  description: String,             // required
  priority: 'low' | 'medium' | 'high' | 'urgent',
  status: 'open' | 'in_progress' | 'waiting_vendor' | 'resolved' | 'closed',
  vendorId: ObjectId,              // optional, ref: Vendor
  attachments: [{
    url: String,
    name: String,
    type: String,
    size: Number
  }],
  timeline: [{
    byUserId: ObjectId,            // ref: User
    byUserName: String,
    message: String,
    createdAt: Date
  }],
  resolvedAt: Date,                // optional
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `buildingId`
- `(buildingId, status)`
- `(buildingId, priority)`
- `(buildingId, createdAt)`
- `(buildingId, apartmentId)`

---

### Vendor

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  name: String,                    // required
  phone: String,                   // optional
  email: String,                   // optional
  category: 'cleaning' | 'elevator' | 'electric' | 'plumbing' | 
            'security' | 'landscaping' | 'other',
  contractStart: Date,             // optional
  contractEnd: Date,               // optional
  notes: String,                   // optional
  documents: [{
    url: String,
    name: String
  }],
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes**:
- `buildingId`
- `(buildingId, category)`
- `(buildingId, name)`

---

### Document

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  title: String,                   // required
  category: 'insurance' | 'protocol' | 'receipt' | 'contract' | 'other',
  visibility: 'public' | 'residents_only' | 'board_only',
  file: {
    url: String,                   // required
    name: String,                  // required
    mimeType: String,              // required
    size: Number                   // required
  },
  createdBy: ObjectId,             // required, ref: User
  createdAt: Date
  // NO updatedAt - immutable after creation
}
```

**Indexes**:
- `buildingId`
- `(buildingId, category)`
- `(buildingId, visibility)`
- `(buildingId, createdAt)`

---

### AuditLog (Immutable)

```typescript
{
  _id: ObjectId,
  buildingId: ObjectId,            // required, ref: Building
  actorUserId: ObjectId,           // required, ref: User
  actorName: String,               // optional (denormalized)
  action: 'create' | 'update' | 'void' | 'delete' | 
          'login' | 'generate_charges' | 'import_data',
  entityType: 'charge' | 'payment' | 'ticket' | 'document' | 
              'resident' | 'apartment' | 'vendor' | 'building' | 'user',
  entityId: ObjectId,              // required
  before: Mixed,                   // JSON snapshot before change
  after: Mixed,                    // JSON snapshot after change
  metadata: Mixed,                 // additional context
  createdAt: Date
  // NO updatedAt - immutable
}
```

**Indexes**:
- `(buildingId, createdAt)` - chronological queries
- `(buildingId, entityType, entityId)` - entity history
- `(buildingId, actorUserId)` - user activity
- `(buildingId, action)` - action filtering

---

## Ledger Design: Immutability Rules

### Why Immutability?

Financial records (charges and payments) must be immutable for:
1. **Audit compliance** - Complete history preserved
2. **Dispute resolution** - Can trace all changes
3. **Integrity** - Prevents accidental data corruption

### How Immutability is Enforced

1. **No `updatedAt` field**: Schema explicitly excludes it
   ```typescript
   { timestamps: { createdAt: true, updatedAt: false } }
   ```

2. **API restrictions**: Only `status` field can be changed
   ```typescript
   // Only accepts { status: 'voided' }
   const validation = chargeUpdateSchema.safeParse(body);
   ```

3. **Void instead of delete**: No DELETE endpoints for charges/payments

4. **Audit logging**: Every void operation logged with before/after state

### Balance Calculation Formula

```
Balance = SUM(charges WHERE status='open') 
        - SUM(payments WHERE status='confirmed')
```

Voided records are excluded from calculations.

See [LEDGER_RULES.md](./LEDGER_RULES.md) for complete ledger documentation.

