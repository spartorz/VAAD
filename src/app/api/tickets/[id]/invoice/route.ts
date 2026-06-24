import { Types } from 'mongoose';
import { z } from 'zod';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Vendor from '@/models/Vendor';
import Document from '@/models/Document';

const ticketInvoiceSchema = z.object({
  invoiceDocumentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid invoice document ID'),
  vendorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid vendor ID').optional(),
  invoiceNumber: z.string().trim().min(1).max(120).optional(),
  invoiceDate: z.string().or(z.date())
    .transform((val) => new Date(val))
    .refine((value) => !Number.isNaN(value.getTime()), 'Invalid invoice date')
    .optional(),
  amount: z.number().min(0).optional(),
  currency: z.enum(['ILS', 'USD', 'EUR']).optional(),
  source: z.enum(['ticket_close', 'manual_upload']).default('manual_upload'),
});

const allowedInvoiceMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// POST /api/tickets/[id]/invoice
export const POST = withAuth(async (request, { user, params }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const ticketId = params?.id;
  if (!ticketId || !Types.ObjectId.isValid(ticketId)) {
    return errorResponse('Invalid ticket ID', 400);
  }

  const body = await request.json().catch(() => null);
  if (!body) return errorResponse('Invalid JSON body', 400);

  const parsed = ticketInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(parsed.error.errors[0]?.message || 'Validation failed', 400);
  }

  const ticket = await MaintenanceTicket.findOne({
    _id: new Types.ObjectId(ticketId),
    buildingId: new Types.ObjectId(user.buildingId),
  });
  if (!ticket) return errorResponse('Ticket not found', 404);

  const doc = await Document.findOne({
    _id: new Types.ObjectId(parsed.data.invoiceDocumentId),
    buildingId: new Types.ObjectId(user.buildingId),
  });
  if (!doc) return errorResponse('Invoice document not found', 404);
  if (!allowedInvoiceMimeTypes.has(doc.file.mimeType || '')) {
    return errorResponse('Invalid invoice file type. Allowed: PDF/JPG/PNG/WEBP/HEIC', 400);
  }

  let vendorId = parsed.data.vendorId || ticket.vendorId?.toString();
  if (vendorId) {
    const vendor = await Vendor.findOne({
      _id: new Types.ObjectId(vendorId),
      buildingId: new Types.ObjectId(user.buildingId),
    }).lean();
    if (!vendor) return errorResponse('Vendor not found in current building', 404);
  } else {
    vendorId = undefined;
  }

  const previousInvoiceId = ticket.invoiceDocumentId?.toString();
  ticket.invoiceDocumentId = new Types.ObjectId(parsed.data.invoiceDocumentId);
  if (parsed.data.invoiceNumber !== undefined) ticket.invoiceNumber = parsed.data.invoiceNumber;
  if (parsed.data.invoiceDate !== undefined) ticket.invoiceDate = parsed.data.invoiceDate;
  if (parsed.data.amount !== undefined) ticket.costAmount = parsed.data.amount;
  if (parsed.data.currency !== undefined) ticket.costCurrency = parsed.data.currency;
  if (vendorId) ticket.vendorId = new Types.ObjectId(vendorId);

  ticket.timeline.push({
    byUserId: new Types.ObjectId(user.id),
    byUserName: user.name,
    message: previousInvoiceId ? 'Invoice replaced for ticket' : 'Invoice attached to ticket',
    createdAt: new Date(),
  });

  await ticket.save();

  await Document.updateOne(
    {
      _id: new Types.ObjectId(parsed.data.invoiceDocumentId),
      buildingId: new Types.ObjectId(user.buildingId),
    },
    {
      $set: {
        metadata: {
          ...(doc.metadata as Record<string, unknown> | undefined),
          ticketId: ticket._id.toString(),
          vendorId: ticket.vendorId?.toString(),
          invoiceNumber: ticket.invoiceNumber,
          invoiceDate: ticket.invoiceDate,
          amount: ticket.costAmount,
          currency: ticket.costCurrency,
          source: parsed.data.source,
        },
      },
    }
  );

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'ticket_invoice_uploaded',
    entityType: 'ticket',
    entityId: ticket._id.toString(),
    metadata: {
      ticketId: ticket._id.toString(),
      vendorId: ticket.vendorId?.toString(),
      documentId: parsed.data.invoiceDocumentId,
      invoiceNumber: ticket.invoiceNumber,
      amount: ticket.costAmount,
      currency: ticket.costCurrency,
      source: parsed.data.source,
    },
  });

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: previousInvoiceId ? 'ticket_invoice_replaced' : 'ticket_invoice_attached',
    entityType: 'ticket',
    entityId: ticket._id.toString(),
    metadata: {
      ticketId: ticket._id.toString(),
      previousDocumentId: previousInvoiceId,
      documentId: parsed.data.invoiceDocumentId,
      vendorId: ticket.vendorId?.toString(),
      invoiceNumber: ticket.invoiceNumber,
      amount: ticket.costAmount,
      currency: ticket.costCurrency,
    },
  });

  await ticket.populate('invoiceDocumentId', 'title visibility file metadata createdAt');
  await ticket.populate('vendorId', 'name category phone email');

  return successResponse(ticket);
});
