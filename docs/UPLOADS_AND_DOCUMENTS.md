# VAAD Uploads and Documents

## Current Upload Mechanism

### Overview

Files are uploaded to a local directory within the Next.js public folder, making them publicly accessible via URL.

### Upload Endpoint

**Location**: `src/app/api/upload/route.ts`

**Method**: `POST /api/upload`

**Content-Type**: `multipart/form-data`

### Upload Process

```
1. Client sends file via FormData
   └─> POST /api/upload with file in 'file' field

2. Server validates
   └─> Check file size (max: MAX_FILE_SIZE env, default 10MB)
   └─> ⚠️ NO MIME type validation currently

3. Generate unique filename
   └─> Format: {timestamp}-{sanitized-original-name}
   └─> Sanitization: replace non-alphanumeric with underscore

4. Create directory if needed
   └─> Path: {UPLOAD_DIR}/{buildingId}/
   └─> Default: ./public/uploads/{buildingId}/

5. Write file to disk
   └─> Using Node.js fs.writeFile

6. Return file info
   └─> { url, name, mimeType, size }
```

### File Storage Location

```
public/
└── uploads/
    └── {buildingId}/
        ├── 1234567890-document.pdf
        ├── 1234567891-photo.jpg
        └── ...
```

### URL Format

Files are accessible at: `/uploads/{buildingId}/{timestamp}-{filename}`

Example: `/uploads/abc123/1704067200000-insurance_policy.pdf`

## Document Model

### Purpose

Stores metadata about uploaded documents with visibility controls.

### Schema

```typescript
{
  buildingId: ObjectId,
  title: String,
  category: 'insurance' | 'protocol' | 'receipt' | 'contract' | 'other',
  visibility: 'public' | 'residents_only' | 'board_only',
  file: {
    url: String,      // Path like /uploads/...
    name: String,     // Original filename
    mimeType: String, // e.g., "application/pdf"
    size: Number      // Bytes
  },
  createdBy: ObjectId,
  createdAt: Date
}
```

### Document vs Upload

| Aspect | Upload API | Document Model |
|--------|------------|----------------|
| Purpose | Raw file storage | Metadata + access control |
| Creates | Physical file | Database record |
| Contains | Binary data | File reference + title/category/visibility |

**Typical flow**:
1. Upload file via `POST /api/upload` → get URL
2. Create document via `POST /api/documents` → store metadata with visibility

## Visibility Rules

### Visibility Levels

| Level | Who Can View |
|-------|--------------|
| `public` | Anyone authenticated (all roles) |
| `residents_only` | Residents + Board + Treasurer + Management + Admin |
| `board_only` | Board + Management + Admin only |

### Server-Side Enforcement

**Location**: `src/app/api/documents/route.ts`

```typescript
// GET /api/documents
if (user.role === 'RESIDENT') {
  query.visibility = { $in: ['public', 'residents_only'] };
}
// Board+ sees all (no visibility filter)
```

```typescript
// GET /api/documents/[id]
if (user.role === 'RESIDENT' && document.visibility === 'board_only') {
  return errorResponse('Permission denied', 403);
}
```

## Ticket Attachments

Maintenance tickets can have file attachments.

### Storage

Same mechanism as documents:
1. Upload via `POST /api/upload`
2. Store URL in ticket's `attachments` array

### Schema

```typescript
// In MaintenanceTicket model
attachments: [{
  url: String,
  name: String,
  type: String,  // MIME type
  size: Number   // Bytes
}]
```

### Access Control

Ticket attachments inherit ticket access:
- Residents can see attachments on their own tickets
- Board+ can see all attachments

## Known Gaps

### ⚠️ No MIME Type Validation

**Current state**: Any file type accepted

**Risk**: Malicious files (executables, scripts) could be uploaded

**Recommendation**: Whitelist allowed types:
```typescript
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
```

### ⚠️ Public File URLs

**Current state**: Files in `/public/uploads/` are directly accessible

**Risk**: 
- `board_only` documents accessible if URL known
- No expiration on file access
- Can't revoke access

**Recommendation**: 
- Move to private storage (S3, Cloudinary)
- Generate signed URLs with expiration
- Check permissions on each access

### ⚠️ No Virus Scanning

**Current state**: Files not scanned for malware

**Recommendation**: Integrate ClamAV or commercial scanning service

### ⚠️ No File Cleanup

**Current state**: Deleted documents leave orphan files on disk

**Recommendation**: 
- Delete physical file when document deleted
- Add cleanup job for orphaned files

### ⚠️ No Size Quotas

**Current state**: No per-building storage limits

**Recommendation**: Track storage per building, enforce quotas

## Recommended Future Architecture

### Cloud Storage (S3/Cloudinary)

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐
│ Client  │────▶│  Next.js    │────▶│    S3       │
│         │     │  API        │     │  Bucket     │
└─────────┘     └─────────────┘     └─────────────┘
                      │
                      ▼
               ┌─────────────┐
               │  MongoDB    │
               │  (metadata) │
               └─────────────┘
```

### Signed URL Flow

```
1. Client requests file access
   └─> GET /api/documents/{id}/download

2. Server checks permissions
   └─> Verify user can access this document

3. Generate signed URL
   └─> S3 presigned URL, expires in 5 minutes

4. Return signed URL to client
   └─> { "downloadUrl": "https://s3...?signature=..." }

5. Client downloads directly from S3
   └─> URL only works for limited time
```

### Benefits

| Aspect | Current (Local) | Future (S3) |
|--------|-----------------|-------------|
| Scalability | Limited by disk | Unlimited |
| Security | Public URLs | Signed URLs |
| CDN | None | CloudFront |
| Backup | Manual | S3 versioning |
| Cost | Hosting storage | Pay per use |

## Configuration

### Environment Variables

```env
# Current
UPLOAD_DIR=./public/uploads
MAX_FILE_SIZE=10485760

# Future (S3)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_BUCKET_NAME=vaad-uploads
AWS_REGION=us-east-1
```

### Implementation Files

| File | Purpose |
|------|---------|
| `src/app/api/upload/route.ts` | Upload handler |
| `src/app/api/documents/route.ts` | Document CRUD |
| `src/models/Document.ts` | Document schema |
| `src/models/MaintenanceTicket.ts` | Attachments schema |

