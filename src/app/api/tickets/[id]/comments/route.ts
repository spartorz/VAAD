import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { ticketCommentSchema } from '@/lib/validations';
import { canAccessApartment } from '@/lib/auth';
import MaintenanceTicket from '@/models/MaintenanceTicket';
import { Types } from 'mongoose';

// POST /api/tickets/[id]/comments - Add comment to ticket
export const POST = withAuth(async (request, { user, params }) => {
  const id = params?.id;
  
  if (!id || !Types.ObjectId.isValid(id)) {
    return errorResponse('Invalid ticket ID');
  }

  const body = await request.json();
  const validation = ticketCommentSchema.safeParse(body);

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

  // Check access for residents
  if (user.role === 'RESIDENT') {
    const isCreator = ticket.createdBy.toString() === user.id;
    const isApartmentTicket = ticket.apartmentId && canAccessApartment(user, ticket.apartmentId.toString());
    if (!isCreator && !isApartmentTicket) {
      return errorResponse('Permission denied', 403);
    }
  }

  ticket.timeline.push({
    byUserId: new Types.ObjectId(user.id),
    byUserName: user.name,
    message: validation.data.message,
    createdAt: new Date(),
  });

  await ticket.save();

  return successResponse(ticket);
});

