import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { generateChargesSchema } from '@/lib/validations';
import { canManageFinances } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Charge from '@/models/Charge';
import Building from '@/models/Building';
import { Types } from 'mongoose';

// POST /api/charges/generate - Generate monthly charges for all active apartments
export const POST = withAuth(async (request, { user }) => {
  if (!canManageFinances(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const validation = generateChargesSchema.safeParse({
    ...body,
    buildingId: user.buildingId,
  });

  if (!validation.success) {
    return errorResponse(validation.error.errors[0].message);
  }

  const { period, amount, title } = validation.data;
  let { dueDate } = validation.data;

  // Get building settings for due date if not provided
  if (!dueDate) {
    const building = await Building.findById(user.buildingId);
    const dueDay = building?.settings?.dueDay || 1;
    const [year, month] = period.split('-').map(Number);
    dueDate = new Date(year, month - 1, dueDay);
  }

  // Get all active apartments
  const apartments = await Apartment.find({
    buildingId: new Types.ObjectId(user.buildingId),
    status: 'active',
  });

  if (apartments.length === 0) {
    return errorResponse('No active apartments found');
  }

  // Check for existing charges for this period (idempotency)
  const existingCharges = await Charge.find({
    buildingId: new Types.ObjectId(user.buildingId),
    type: 'monthly_due',
    period,
    status: 'open',
  }).distinct('apartmentId');

  const existingApartmentIds = new Set(existingCharges.map((id: Types.ObjectId) => id.toString()));

  // Filter out apartments that already have charges for this period
  const apartmentsToCharge = apartments.filter(
    (apt) => !existingApartmentIds.has(apt._id.toString())
  );

  if (apartmentsToCharge.length === 0) {
    return successResponse({
      message: 'All apartments already have charges for this period',
      created: 0,
      skipped: apartments.length,
    });
  }

  // Create charges for remaining apartments
  const charges = await Charge.insertMany(
    apartmentsToCharge.map((apt) => ({
      buildingId: new Types.ObjectId(user.buildingId),
      apartmentId: apt._id,
      type: 'monthly_due',
      title: title || 'Monthly Maintenance Fee',
      amount,
      currency: 'USD',
      period,
      dueDate,
      status: 'open',
      createdBy: new Types.ObjectId(user.id),
    }))
  );

  // Create audit log for batch operation
  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'generate_charges',
    entityType: 'charge',
    entityId: new Types.ObjectId().toString(), // Placeholder ID for batch
    metadata: {
      period,
      amount,
      chargesCreated: charges.length,
      chargesSkipped: existingApartmentIds.size,
    },
  });

  return successResponse({
    message: `Created ${charges.length} charges for period ${period}`,
    created: charges.length,
    skipped: existingApartmentIds.size,
    charges: charges.map((c) => c._id),
  }, 201);
}, { requiredRole: 'TREASURER' });

