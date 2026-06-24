import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { ticketUpdateSchema } from '@/lib/validations';
import { canAccessApartment } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Apartment from '@/models/Apartment';
import Vendor from '@/models/Vendor';
import User from '@/models/User';
import Document from '@/models/Document';
import { Types } from 'mongoose';
import { evaluateSlaFlags } from '@/lib/tickets/sla-service';

// Ensure models are registered for populate
void Apartment;
void Vendor;
void User;
void Document;

// GET /api/tickets/[id] - Get single ticket
export const GET = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid ticket ID');
  }

  const ticket = await MaintenanceTicket.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  })
    .populate('apartmentId', 'number floor')
    .populate('createdBy', 'name email')
    .populate('vendorId', 'name category phone email')
    .populate('invoiceDocumentId', 'title visibility file metadata createdAt')
    .populate('timeline.byUserId', 'name')
    .lean();

  if (!ticket) {
    return errorResponse('Ticket not found', 404);
  }

  // Check access for residents
  if (user.role === 'RESIDENT') {
    const isCreator = ticket.createdBy._id.toString() === user.id;
    const isApartmentTicket = ticket.apartmentId && canAccessApartment(user, ticket.apartmentId._id.toString());
    if (!isCreator && !isApartmentTicket) {
      return errorResponse('Permission denied', 403);
    }

    // Do not expose vendor invoices to residents by default.
    const invoiceDoc = ticket.invoiceDocumentId as { visibility?: string } | undefined;
    if (invoiceDoc && invoiceDoc.visibility === 'board_only') {
      delete (ticket as Record<string, unknown>).invoiceDocumentId;
    }
  }

  return successResponse(ticket);
});

// PATCH /api/tickets/[id] - Update ticket
export const PATCH = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid ticket ID');
  }

  const body = await request.json();
  const validation = ticketUpdateSchema.safeParse(body);

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const ticket = await MaintenanceTicket.findOne({
    _id: new Types.ObjectId(id),
    buildingId: new Types.ObjectId(user.buildingId),
  });

  if (!ticket) {
    return errorResponse('Ticket not found', 404);
  }

  // Residents can only update their own tickets with limited fields
  if (user.role === 'RESIDENT') {
    const isCreator = ticket.createdBy.toString() === user.id;
    if (!isCreator) {
      return errorResponse('Permission denied', 403);
    }
    // Residents can only update title and description
    const allowedFields = ['title', 'description'];
    const updateKeys = Object.keys(validation.data);
    if (updateKeys.some(key => !allowedFields.includes(key))) {
      return errorResponse('Permission denied - residents can only update title and description', 403);
    }
  }

  const before = ticket.toObject();

  // Track status changes in timeline
  if (validation.data.status && validation.data.status !== ticket.status) {
    ticket.timeline.push({
      byUserId: new Types.ObjectId(user.id),
      byUserName: user.name,
      message: `Status changed from ${ticket.status} to ${validation.data.status}`,
      createdAt: new Date(),
    });

    // Set resolvedAt if status is resolved or closed
    if (['resolved', 'closed'].includes(validation.data.status) && !ticket.resolvedAt) {
      ticket.resolvedAt = new Date();
    }
    if (validation.data.status === 'in_progress' && !ticket.firstInProgressAt) {
      ticket.firstInProgressAt = new Date();
    }
  }

  // Update fields
  if (validation.data.title) ticket.title = validation.data.title;
  if (validation.data.description) ticket.description = validation.data.description;
  if (validation.data.priority) ticket.priority = validation.data.priority;
  if (validation.data.status) ticket.status = validation.data.status;
  // Handle vendorId - allow null to unset
  const previousVendorId = ticket.vendorId?.toString();
  if ('vendorId' in body) {
    ticket.vendorId = body.vendorId ? new Types.ObjectId(body.vendorId) : undefined;
    if (!body.vendorId && previousVendorId) {
      ticket.timeline.push({
        byUserId: new Types.ObjectId(user.id),
        byUserName: user.name,
        message: 'Vendor assignment removed',
        createdAt: new Date(),
      });
    }
  }
  if (validation.data.attachments) ticket.attachments = validation.data.attachments;

  const slaFlags = evaluateSlaFlags({
    now: new Date(),
    responseDueAt: ticket.responseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    firstAssignedAt: ticket.firstAssignedAt,
    resolvedAt: ticket.resolvedAt,
  });
  if (typeof slaFlags.responseMet !== 'undefined') ticket.responseMet = slaFlags.responseMet;
  if (typeof slaFlags.resolutionMet !== 'undefined') ticket.resolutionMet = slaFlags.resolutionMet;
  ticket.slaBreached = slaFlags.slaBreached;
  ticket.slaBreachReason = slaFlags.slaBreachReason;

  await ticket.save();

  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'update',
    entityType: 'ticket',
    entityId: ticket._id.toString(),
    before,
    after: ticket.toObject(),
  });

  const nextVendorId = ticket.vendorId?.toString();
  if ('vendorId' in body && previousVendorId && !nextVendorId) {
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'ticket_vendor_unassigned',
      entityType: 'ticket',
      entityId: ticket._id.toString(),
      metadata: { previousVendorId },
    });
  }

  return successResponse(ticket);
});

