# VAAD Ledger Rules

This document defines the immutability rules and business logic for the financial ledger (Charges and Payments).

## Core Principle: Financial Records Are Immutable

Once a Charge or Payment is created, its core data (amount, date, apartment, etc.) can **NEVER** be modified. The only allowed change is to void the record.

## Charge Immutability

### Schema Design

```typescript
// src/models/Charge.ts
{
  timestamps: { createdAt: true, updatedAt: false }
}
```

No `updatedAt` field exists, preventing any update tracking.

### Allowed Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| CREATE | ✅ | Create new charge |
| READ | ✅ | View charge details |
| UPDATE status to 'voided' | ✅ | Must audit log |
| UPDATE any other field | ❌ | PROHIBITED |
| DELETE | ❌ | PROHIBITED |

### Void Process

```typescript
// PATCH /api/charges/[id]

// 1. Validate - only status field accepted
const validation = chargeUpdateSchema.safeParse(body);
// Schema: z.object({ status: z.enum(['open', 'voided']) })

// 2. Check current status
if (charge.status === 'voided') {
  return errorResponse('Charge is already voided', 400);
}

// 3. Apply void
charge.status = 'voided';
await charge.save();

// 4. Create audit log
await createAuditLog({
  action: 'void',
  entityType: 'charge',
  before: { status: 'open', ...originalData },
  after: { status: 'voided', ...originalData },
});
```

## Payment Immutability

### Schema Design

```typescript
// src/models/Payment.ts
{
  timestamps: { createdAt: true, updatedAt: false }
}
```

### Allowed Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| CREATE | ✅ | Record new payment |
| READ | ✅ | View payment details |
| UPDATE status to 'voided' | ✅ | Must audit log |
| UPDATE status to 'confirmed' | ✅ | From 'pending' only |
| UPDATE any other field | ❌ | PROHIBITED |
| DELETE | ❌ | PROHIBITED |

## Balance Calculation

### Formula

```
Apartment Balance = SUM(open charges) - SUM(confirmed payments)
```

### Implementation

Location: `src/lib/balance.ts`

```typescript
export async function calculateApartmentBalance(buildingId, apartmentId) {
  // Sum open charges
  const chargesResult = await Charge.aggregate([
    { $match: { buildingId, apartmentId, status: 'open' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  // Sum confirmed payments
  const paymentsResult = await Payment.aggregate([
    { $match: { buildingId, apartmentId, status: 'confirmed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return {
    totalCharges: chargesResult[0]?.total || 0,
    totalPayments: paymentsResult[0]?.total || 0,
    balance: (chargesResult[0]?.total || 0) - (paymentsResult[0]?.total || 0),
  };
}
```

### What's Excluded

| Record Type | Status | Included in Balance? |
|-------------|--------|----------------------|
| Charge | open | ✅ Yes |
| Charge | voided | ❌ No |
| Payment | confirmed | ✅ Yes |
| Payment | pending | ❌ No |
| Payment | voided | ❌ No |

## Statement Generation

### Purpose

Provide chronological transaction history with running balance.

### Implementation

Location: `src/lib/balance.ts`

```typescript
export async function getApartmentStatement(buildingId, apartmentId) {
  // 1. Fetch all charges and payments
  const charges = await Charge.find({ buildingId, apartmentId });
  const payments = await Payment.find({ buildingId, apartmentId });

  // 2. Combine into single array
  const entries = [
    ...charges.map(c => ({
      date: c.dueDate,
      type: 'charge',
      amount: c.status === 'voided' ? 0 : c.amount,
      ...
    })),
    ...payments.map(p => ({
      date: p.paidAt,
      type: 'payment',
      amount: p.status === 'voided' ? 0 : -p.amount,
      ...
    })),
  ];

  // 3. Sort chronologically
  entries.sort((a, b) => a.date - b.date);

  // 4. Calculate running balance
  let runningBalance = 0;
  for (const entry of entries) {
    if (entry.status !== 'voided') {
      runningBalance += entry.amount;
    }
    entry.balance = runningBalance;
  }

  return entries;
}
```

### Statement Entry Format

```json
{
  "_id": "charge_id",
  "date": "2024-01-01T00:00:00.000Z",
  "type": "charge",
  "title": "January Maintenance",
  "amount": 250,
  "balance": 250,
  "status": "open"
}
```

## Monthly Charge Generation (Idempotent)

### Purpose

Batch-create monthly maintenance charges for all active apartments.

### Idempotency Rule

For the same `buildingId + apartmentId + type='monthly_due' + period`, only ONE open charge can exist.

### Implementation

Location: `src/app/api/charges/generate/route.ts`

```typescript
// 1. Check for existing charges
const existingCharges = await Charge.find({
  buildingId,
  type: 'monthly_due',
  period,
  status: 'open',
}).distinct('apartmentId');

// 2. Filter out apartments that already have charges
const apartmentsToCharge = apartments.filter(
  apt => !existingApartmentIds.has(apt._id.toString())
);

// 3. Create only for remaining apartments
const charges = await Charge.insertMany(
  apartmentsToCharge.map(apt => ({ ... }))
);
```

### Unique Constraint

```typescript
// src/models/Charge.ts
chargeSchema.index(
  { buildingId: 1, apartmentId: 1, type: 1, period: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      type: 'monthly_due',
      period: { $ne: null },
      status: 'open'
    } 
  }
);
```

This partial unique index ensures:
- Only `monthly_due` type is constrained
- Only when `period` is not null
- Only when `status` is 'open'

Voided charges don't block new charges for the same period.

### 409 Conflict Response

If attempting to create a duplicate:

```json
{
  "success": false,
  "error": "Monthly charge already exists for this apartment and period"
}
```

## Examples

### ✅ Correct: Void a Charge

**Before**: Charge exists with `status: 'open'`

**API Call**:
```http
PATCH /api/charges/abc123
{ "status": "voided" }
```

**Result**:
- Charge status changed to 'voided'
- Audit log created with before/after
- Balance recalculated (charge excluded)

### ❌ Incorrect: Modify Amount

**Attempt**:
```http
PATCH /api/charges/abc123
{ "amount": 300 }
```

**Result**:
- 400 Bad Request
- Error: "Validation error" (amount not in schema)
- No changes made

### ✅ Correct: Generate Monthly Charges (First Time)

**Request**:
```http
POST /api/charges/generate
{ "period": "2024-02", "amount": 250 }
```

**Result**:
- 50 charges created (one per active apartment)
- Response: `{ "created": 50, "skipped": 0 }`

### ✅ Correct: Generate Monthly Charges (Retry)

**Request** (same as above, sent again):
```http
POST /api/charges/generate
{ "period": "2024-02", "amount": 250 }
```

**Result**:
- 0 new charges created (all apartments already have charges)
- Response: `{ "created": 0, "skipped": 50 }`

### ❌ Incorrect: Delete a Payment

**Attempt**:
```http
DELETE /api/payments/xyz789
```

**Result**:
- 404 or 405 (endpoint doesn't exist)
- Payment remains unchanged

## Audit Trail Requirements

Every financial change MUST be logged:

| Action | Must Log? | What to Capture |
|--------|-----------|-----------------|
| Charge created | ✅ | after: full charge data |
| Charge voided | ✅ | before + after (status change) |
| Payment created | ✅ | after: full payment data |
| Payment voided | ✅ | before + after (status change) |
| Monthly generation | ✅ | metadata: period, count, skipped |

Audit logs are themselves immutable (no updates, no deletes).

