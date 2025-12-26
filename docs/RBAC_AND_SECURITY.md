# VAAD RBAC and Security

## Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| ADMIN | 100 | System administrator (full access) |
| MANAGEMENT | 80 | Property management company |
| BOARD | 60 | Building committee members |
| TREASURER | 50 | Financial management only |
| RESIDENT | 10 | Individual resident (own data only) |

**Rule**: Higher level includes all permissions of lower levels.

## Permission Helpers

Location: `src/lib/auth.ts`

### `hasPermission(userRole, requiredRole)`

Checks if user's role level is >= required role level.

```typescript
hasPermission('BOARD', 'TREASURER')  // true (60 >= 50)
hasPermission('RESIDENT', 'BOARD')   // false (10 < 60)
```

### `canManageBuilding(role)`

Returns `true` for: ADMIN, BOARD, MANAGEMENT

Used for: Creating apartments, residents, vendors, documents

### `canManageFinances(role)`

Returns `true` for: ADMIN, BOARD, TREASURER, MANAGEMENT

Used for: Creating/voiding charges and payments

### `canAccessApartment(user, apartmentId)`

Returns `true` for:
- ADMIN, BOARD, TREASURER, MANAGEMENT (all apartments)
- RESIDENT only if `user.apartmentId === apartmentId`

### `canViewAuditLog(role)`

Returns `true` for: ADMIN, BOARD, MANAGEMENT

## Access Control Matrix

### UI Access

| Page | ADMIN | MANAGEMENT | BOARD | TREASURER | RESIDENT |
|------|-------|------------|-------|-----------|----------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ (limited) |
| Apartments | ✅ | ✅ | ✅ | ✅ | ❌ |
| Residents | ✅ | ✅ | ✅ | ✅ | ❌ |
| Billing | ✅ | ✅ | ✅ | ✅ | ✅ (own) |
| Generate Charges | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tickets | ✅ | ✅ | ✅ | ✅ | ✅ (own) |
| Vendors | ✅ | ✅ | ✅ | ❌ | ❌ |
| Documents | ✅ | ✅ | ✅ | ✅ | ✅ (limited visibility) |
| Audit Log | ✅ | ✅ | ✅ | ❌ | ❌ |

### API Access

| Endpoint | ADMIN | MANAGEMENT | BOARD | TREASURER | RESIDENT |
|----------|-------|------------|-------|-----------|----------|
| GET apartments | ✅ | ✅ | ✅ | ✅ | ✅ (own only) |
| POST apartments | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET residents | ✅ | ✅ | ✅ | ✅ | ✅ (own apt) |
| POST residents | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET charges | ✅ | ✅ | ✅ | ✅ | ✅ (own apt) |
| POST charges | ✅ | ✅ | ✅ | ✅ | ❌ |
| PATCH charges (void) | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST charges/generate | ✅ | ✅ | ✅ | ✅ | ❌ |
| GET payments | ✅ | ✅ | ✅ | ✅ | ✅ (own apt) |
| POST payments | ✅ | ✅ | ✅ | ✅ | ❌ |
| GET statements | ✅ | ✅ | ✅ | ✅ | ✅ (own apt) |
| GET tickets | ✅ | ✅ | ✅ | ✅ | ✅ (own) |
| POST tickets | ✅ | ✅ | ✅ | ✅ | ✅ (own apt) |
| PATCH tickets | ✅ | ✅ | ✅ | ✅ | ✅ (limited) |
| GET vendors | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST/PATCH/DELETE vendors | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET documents | ✅ | ✅ | ✅ | ✅ | ✅ (visibility filter) |
| POST/DELETE documents | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET audit-logs | ✅ | ✅ | ✅ | ❌ | ❌ |

## Resident-Specific Restrictions

### What Residents CAN Do

1. **View own apartment** info
2. **View charges** for their apartment only
3. **View payments** for their apartment only
4. **View statement** for their apartment only
5. **Create tickets** for their apartment
6. **View tickets** they created or for their apartment
7. **Add comments** to their own tickets
8. **Update title/description** of their own tickets
9. **View documents** with visibility: `public` or `residents_only`
10. **Upload files** (for ticket attachments)

### What Residents CANNOT Do

1. Access other apartments' data
2. Create/void charges or payments
3. Generate monthly charges
4. Create/manage residents
5. Create/manage vendors
6. Upload building documents
7. Change ticket status/priority/vendor
8. View `board_only` documents
9. View audit logs
10. Access other buildings' data

## Security Invariants

### ⚠️ CRITICAL: These rules must NEVER be broken

#### 1. Every Query MUST Include BuildingId From Session

```typescript
// ✅ CORRECT
const apartments = await Apartment.find({
  buildingId: new Types.ObjectId(user.buildingId),
});

// ❌ WRONG - Cross-tenant data leak
const apartments = await Apartment.find({});
```

**Enforcement**: Every API handler receives `user` from `withAuth()` wrapper.

#### 2. Residents MUST Be Restricted to Own ApartmentId

```typescript
// ✅ CORRECT
if (user.role === 'RESIDENT' && user.apartmentId) {
  query.apartmentId = new Types.ObjectId(user.apartmentId);
}

// ❌ WRONG - Resident sees all apartments
// (no apartmentId filter applied)
```

**Enforcement**: Applied in each relevant API handler.

#### 3. Charges/Payments: NO Delete, Void Only, No Field Edits

```typescript
// ✅ CORRECT - Only status change allowed
const validation = chargeUpdateSchema.safeParse(body);
// Schema: z.object({ status: z.enum(['open', 'voided']) })

// ❌ WRONG - Never allow amount/title/etc changes
charge.amount = newAmount; // PROHIBITED
```

**Enforcement**:
- Zod schema restricts to `{ status }` only
- No DELETE endpoints exist
- Audit log records every void

#### 4. Create Operations MUST Use Session BuildingId

```typescript
// ✅ CORRECT
const apartment = await Apartment.create({
  ...validation.data,
  buildingId: new Types.ObjectId(user.buildingId), // FROM SESSION
});

// ❌ WRONG - Client could inject foreign buildingId
const apartment = await Apartment.create({
  ...validation.data,
  buildingId: validation.data.buildingId, // FROM CLIENT - DANGEROUS
});
```

#### 5. Document Visibility MUST Be Enforced Server-Side

```typescript
// ✅ CORRECT
if (user.role === 'RESIDENT') {
  query.visibility = { $in: ['public', 'residents_only'] };
}

// ❌ WRONG - Client filtering only
// (residents could see board_only via API)
```

## Authentication Flow

### Login Process

1. User submits email + password to `/api/auth/[...nextauth]`
2. `authorize()` in `src/lib/auth.ts`:
   - Finds user by email
   - Compares password with bcrypt
   - Returns user object with buildingId, role, etc.
3. JWT token created with user data
4. Cookie set with JWT

### Session Access

1. API handler calls `getSession()` via `withAuth()`
2. Session decoded from JWT cookie
3. `user` object available with:
   - `id`, `email`, `name`
   - `role`
   - `buildingId`
   - `residentId` (optional)
   - `apartmentId` (optional)

## Known Security Considerations

### Currently Implemented

- ✅ Password hashing (bcrypt, 12 rounds)
- ✅ Session-based JWT authentication
- ✅ Role-based access control
- ✅ Multi-tenant isolation via buildingId
- ✅ Input validation (Zod)
- ✅ Audit logging for financial changes

### Gaps to Address (See KNOWN_GAPS_AND_NEXT_PHASE.md)

- ❌ No rate limiting (brute force protection)
- ❌ No file type validation on uploads
- ❌ Public file URLs (should use signed URLs)
- ❌ No password reset flow
- ❌ No 2FA option
- ❌ No HTTPS enforcement (relies on hosting)

