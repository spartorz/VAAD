import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import Charge from '@/models/Charge';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Building from '@/models/Building';
import Payment from '@/models/Payment';
import { Types } from 'mongoose';

/**
 * Format invoice number from prefix and sequential number
 * Format: PREFIX-NNNNNN (e.g., INV-000001)
 */
function formatInvoiceNumber(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(6, '0')}`;
}

/**
 * Atomically assign an invoice number to a charge if not already assigned.
 * Uses findOneAndUpdate to safely increment the building counter and update the charge.
 * Returns the invoice number (existing or newly assigned).
 */
async function assignInvoiceNumber(
  chargeId: Types.ObjectId,
  buildingId: Types.ObjectId,
  existingInvoiceNumber?: string
): Promise<{ invoiceNumber: string; isNewlyIssued: boolean }> {
  // If already has invoice number, return it
  if (existingInvoiceNumber) {
    return { invoiceNumber: existingInvoiceNumber, isNewlyIssued: false };
  }

  // Atomically increment the building counter and get the next number
  const updatedBuilding = await Building.findOneAndUpdate(
    { _id: buildingId },
    { $inc: { 'counters.invoiceNextNumber': 1 } },
    { new: false } // Return the document BEFORE the update (so we get the current number)
  );

  if (!updatedBuilding) {
    throw new Error('Building not found');
  }

  const prefix = updatedBuilding.settings?.invoicePrefix || 'INV';
  const invoiceNum = updatedBuilding.counters?.invoiceNextNumber || 1;
  const invoiceNumber = formatInvoiceNumber(prefix, invoiceNum);

  // Update the charge with the new invoice number
  // Use updateOne with a condition to handle race conditions
  const updateResult = await Charge.updateOne(
    { 
      _id: chargeId, 
      invoiceNumber: { $exists: false } // Only update if no invoice number exists
    },
    { 
      $set: { 
        invoiceNumber,
        invoicedAt: new Date()
      } 
    }
  );

  // If the update didn't match (race condition - another request already assigned),
  // fetch the charge again to get the actual invoice number
  if (updateResult.matchedCount === 0) {
    const charge = await Charge.findById(chargeId).lean();
    if (charge?.invoiceNumber) {
      return { invoiceNumber: charge.invoiceNumber, isNewlyIssued: false };
    }
    throw new Error('Failed to assign invoice number');
  }

  return { invoiceNumber, isNewlyIssued: true };
}

// GET /api/invoices/[chargeId] - Get invoice data for a charge
export const GET = withAuth(async (request, { user, params }) => {
  const chargeId = params?.chargeId;

  if (!chargeId || !Types.ObjectId.isValid(chargeId)) {
    return errorResponse('Invalid charge ID');
  }

  const chargeObjectId = new Types.ObjectId(chargeId);
  const buildingObjectId = new Types.ObjectId(user.buildingId);

  // Fetch the charge
  const charge = await Charge.findOne({
    _id: chargeObjectId,
    buildingId: buildingObjectId,
  }).lean();

  if (!charge) {
    return errorResponse('Charge not found', 404);
  }

  // RBAC: Residents can only view their own apartment's charges
  if (user.role === 'RESIDENT') {
    if (!user.apartmentId || charge.apartmentId.toString() !== user.apartmentId) {
      return errorResponse('Access denied', 403);
    }
  }

  // Assign invoice number atomically if not already assigned
  const { invoiceNumber, isNewlyIssued } = await assignInvoiceNumber(
    chargeObjectId,
    buildingObjectId,
    charge.invoiceNumber
  );

  // Fetch related data in parallel
  const [building, apartment, residents, payments] = await Promise.all([
    Building.findById(user.buildingId).lean(),
    Apartment.findById(charge.apartmentId).lean(),
    Resident.find({
      apartmentId: charge.apartmentId,
      isActive: true,
    }).lean(),
    // Get payments made for this charge's period (if monthly) or around the charge date
    Payment.find({
      buildingId: buildingObjectId,
      apartmentId: charge.apartmentId,
      status: 'confirmed',
      ...(charge.period ? {
        paidAt: {
          $gte: new Date(charge.period + '-01'),
          $lt: new Date(new Date(charge.period + '-01').setMonth(new Date(charge.period + '-01').getMonth() + 1)),
        },
      } : {}),
    }).sort({ paidAt: -1 }).lean(),
  ]);

  if (!building || !apartment) {
    return errorResponse('Building or apartment not found', 404);
  }

  // Calculate payment status
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, charge.amount - totalPaid);
  const paymentStatus = remaining <= 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid';

  // Log invoice issued if newly assigned
  if (isNewlyIssued) {
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'invoice_issued',
      entityType: 'charge',
      entityId: chargeId,
      metadata: { invoiceNumber, apartmentNumber: apartment.number },
    });
  }

  // Log invoice view
  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'invoice_view',
    entityType: 'charge',
    entityId: chargeId,
    metadata: { invoiceNumber },
  });

  return successResponse({
    invoice: {
      invoiceNumber,
      charge: {
        _id: charge._id.toString(),
        type: charge.type,
        title: charge.title,
        amount: charge.amount,
        currency: charge.currency,
        period: charge.period,
        dueDate: charge.dueDate,
        status: charge.status,
        createdAt: charge.createdAt,
      },
      paymentStatus,
      totalPaid,
      remaining,
    },
    building: {
      name: building.name,
      address: building.address,
      city: building.city,
      country: building.country,
      bankInfo: building.bankInfo,
      settings: building.settings,
    },
    apartment: {
      _id: apartment._id.toString(),
      number: apartment.number,
      floor: apartment.floor,
    },
    residents: residents.map((r) => ({
      _id: r._id.toString(),
      fullName: r.fullName,
      email: r.email,
      phone: r.phone,
      type: r.type,
    })),
    payments: payments.map((p) => ({
      _id: p._id.toString(),
      amount: p.amount,
      currency: p.currency,
      method: p.method,
      reference: p.reference,
      paidAt: p.paidAt,
    })),
  });
}, { requiredRole: 'RESIDENT' });

// POST /api/invoices/[chargeId]/download - Log invoice download
export const POST = withAuth(async (request, { user, params }) => {
  const chargeId = params?.chargeId;

  if (!chargeId || !Types.ObjectId.isValid(chargeId)) {
    return errorResponse('Invalid charge ID');
  }

  const chargeObjectId = new Types.ObjectId(chargeId);
  const buildingObjectId = new Types.ObjectId(user.buildingId);

  // Verify charge exists and user has access
  const charge = await Charge.findOne({
    _id: chargeObjectId,
    buildingId: buildingObjectId,
  }).lean();

  if (!charge) {
    return errorResponse('Charge not found', 404);
  }

  // RBAC: Residents can only download their own apartment's invoices
  if (user.role === 'RESIDENT') {
    if (!user.apartmentId || charge.apartmentId.toString() !== user.apartmentId) {
      return errorResponse('Access denied', 403);
    }
  }

  // Ensure invoice number is assigned (in case download is called directly)
  const { invoiceNumber } = await assignInvoiceNumber(
    chargeObjectId,
    buildingObjectId,
    charge.invoiceNumber
  );

  // Log invoice download
  await createAuditLog({
    buildingId: user.buildingId,
    actorUserId: user.id,
    actorName: user.name,
    action: 'invoice_download',
    entityType: 'charge',
    entityId: chargeId,
    metadata: { invoiceNumber },
  });

  return successResponse({ message: 'Download logged', invoiceNumber });
}, { requiredRole: 'RESIDENT' });

