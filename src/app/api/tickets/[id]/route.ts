import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { ticketUpdateSchema } from '@/lib/validations';
import { canAccessApartment } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import Apartment from '@/models/Apartment';
import Vendor from '@/models/Vendor';
import User from '@/models/User';
import { Types } from 'mongoose';

// Ensure models are registered for populate
void Apartment;
void Vendor;
void User;

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
  }

  // Update fields
  if (validation.data.title) ticket.title = validation.data.title;
  if (validation.data.description) ticket.description = validation.data.description;
  if (validation.data.priority) ticket.priority = validation.data.priority;
  if (validation.data.status) ticket.status = validation.data.status;
  if (validation.data.vendorId) ticket.vendorId = new Types.ObjectId(validation.data.vendorId);
  if (validation.data.attachments) ticket.attachments = validation.data.attachments;

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

  return successResponse(ticket);
});

