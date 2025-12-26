# VAAD Development Guidelines

## Coding Conventions

### TypeScript

- Strict mode enabled
- Use interfaces for data shapes, types for unions
- Explicit return types on exported functions
- No `any` - use `unknown` and narrow

### Naming

| Item | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `api-utils.ts` |
| Components | PascalCase | `DataTable.tsx` |
| Functions | camelCase | `calculateBalance()` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE` |
| Interfaces | PascalCase, I prefix | `IUser` |
| Types | PascalCase | `UserRole` |

### Imports

```typescript
// 1. External packages
import { NextRequest } from 'next/server';
import mongoose from 'mongoose';

// 2. Internal - absolute (@/)
import { withAuth } from '@/lib/api-utils';
import Apartment from '@/models/Apartment';

// 3. Relative (same directory)
import { columns } from './columns';
```

## File Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes only
│   │   └── {resource}/    # One folder per resource
│   │       ├── route.ts   # Collection routes (GET list, POST)
│   │       └── [id]/      # Item routes (GET one, PATCH, DELETE)
│   │           └── route.ts
│   └── (dashboard)/       # Route group for protected pages
├── components/            # React components
│   ├── ui/               # shadcn primitives
│   └── layout/           # Layout components
├── lib/                   # Utilities and shared code
│   ├── auth.ts           # Auth config
│   ├── api-utils.ts      # API helpers
│   ├── db.ts             # DB connection
│   ├── types.ts          # Type definitions
│   └── validations.ts    # Zod schemas
└── models/               # Mongoose models (one file each)
```

## Adding a New API Route

### Step 1: Create Zod Schema

```typescript
// src/lib/validations.ts
export const newEntitySchema = z.object({
  buildingId: z.string().min(1),
  name: z.string().min(1),
  // ...
});
```

### Step 2: Create Mongoose Model

```typescript
// src/models/NewEntity.ts
const schema = new Schema({
  buildingId: { type: Schema.Types.ObjectId, ref: 'Building', required: true },
  // Always include buildingId!
});
```

### Step 3: Create Route Handler

```typescript
// src/app/api/new-entities/route.ts
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { newEntitySchema } from '@/lib/validations';

export const GET = withAuth(async (request, { user }) => {
  // ALWAYS filter by buildingId
  const items = await NewEntity.find({
    buildingId: new Types.ObjectId(user.buildingId),
  });
  return successResponse({ data: items });
});

export const POST = withAuth(async (request, { user }) => {
  // ALWAYS set buildingId from session
  const item = await NewEntity.create({
    ...validation.data,
    buildingId: new Types.ObjectId(user.buildingId),
  });
  return successResponse(item, 201);
}, { requiredRole: 'BOARD' });
```

## Adding a New Model

### Required Fields

Every model MUST have:
- `buildingId` - ObjectId ref to Building
- `createdAt` - Timestamp (via timestamps: true)

### BuildingId Index

```typescript
schema.index({ buildingId: 1 });
```

### Export from Index

```typescript
// src/models/index.ts
export { default as NewEntity } from './NewEntity';
```

## Audit Logging

### When to Log

- Create charge/payment
- Void charge/payment
- Generate monthly charges
- Create/update/delete documents
- Admin actions

### How to Log

```typescript
import { createAuditLog } from '@/lib/api-utils';

await createAuditLog({
  buildingId: user.buildingId,
  actorUserId: user.id,
  actorName: user.name,
  action: 'create',  // create | update | void | delete
  entityType: 'charge',
  entityId: charge._id.toString(),
  after: charge.toObject(),
});
```

## "Do Not Break" Checklist

### Before Every PR

- [ ] **BuildingId Scope**: Every query filters by `user.buildingId`
- [ ] **Create Uses Session BuildingId**: Never trust client buildingId
- [ ] **Residents Restricted**: Check apartmentId for resident role
- [ ] **Ledger Immutable**: No edits to charge/payment fields (void only)
- [ ] **Audit Logged**: Financial changes create audit log
- [ ] **Zod Validated**: All inputs validated before use
- [ ] **Errors Handled**: Try/catch with proper error responses
- [ ] **Types Correct**: No TypeScript errors
- [ ] **No Console.logs**: Remove debug logs

### Security Invariants

1. **NEVER** query without buildingId filter
2. **NEVER** trust client-provided buildingId in create
3. **NEVER** let residents see other apartments
4. **NEVER** delete charges or payments
5. **NEVER** modify charge/payment amount/date
6. **ALWAYS** log financial changes to audit
7. **ALWAYS** validate with Zod before database ops
8. **ALWAYS** check role permissions
9. **ALWAYS** disable linked user when moving out resident
10. **ALWAYS** set moveOutAt when deactivating resident

## Common Patterns

### Pagination

```typescript
const params = getPaginationParams(request);
const { page, limit, search, sortBy, sortOrder } = params;
const skip = (page - 1) * limit;

const [data, total] = await Promise.all([
  Model.find(query).sort(buildSortObject(sortBy, sortOrder)).skip(skip).limit(limit),
  Model.countDocuments(query),
]);
```

### Role Check

```typescript
if (!canManageBuilding(user.role)) {
  return errorResponse('Permission denied', 403);
}
```

### Resident Filter

```typescript
if (user.role === 'RESIDENT' && user.apartmentId) {
  query.apartmentId = new Types.ObjectId(user.apartmentId);
}
```

### Resident Move-Out Pattern

When moving out a resident, follow this pattern:

```typescript
// 1. Set move-out data on resident
resident.moveOutAt = new Date();
resident.isActive = false;
resident.moveOutNote = note;
await resident.save();

// 2. Disable linked user if exists
const linkedUser = await User.findOne({ residentId: resident._id });
if (linkedUser) {
  linkedUser.isActive = false;
  await linkedUser.save();
  // Log user deactivation
  await createAuditLog({ ... });
}

// 3. Log resident move-out
await createAuditLog({
  action: 'update',
  entityType: 'resident',
  metadata: { action: 'move_out' },
});
```

## Testing Locally

```bash
# Run dev server
npm run dev

# Login as board member
# Email: board@demo.com
# Password: demo123

# Login as resident
# Email: resident@demo.com
# Password: demo123
```

