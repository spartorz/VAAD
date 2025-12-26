import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { canAccessApartment } from '@/lib/auth';
import { calculateApartmentBalance, getApartmentStatement } from '@/lib/balance';
import Apartment from '@/models/Apartment';
import { Types } from 'mongoose';

// GET /api/statements/[apartmentId] - Get apartment statement
export const GET = withAuth(async (request, { user, params }) => {
  const apartmentId = params?.apartmentId;
  
  if (!apartmentId || !Types.ObjectId.isValid(apartmentId)) {
    return errorResponse('Invalid apartment ID');
  }

  // Check access
  if (!canAccessApartment(user, apartmentId)) {
    return errorResponse('Permission denied', 403);
  }

  // Verify apartment exists and belongs to building
  const apartment = await Apartment.findOne({
    _id: new Types.ObjectId(apartmentId),
    buildingId: new Types.ObjectId(user.buildingId),
  }).lean();

  if (!apartment) {
    return errorResponse('Apartment not found', 404);
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const [balance, statement] = await Promise.all([
    calculateApartmentBalance(user.buildingId, apartmentId),
    getApartmentStatement(
      user.buildingId,
      apartmentId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    ),
  ]);

  return successResponse({
    apartment: {
      _id: apartment._id,
      number: apartment.number,
      floor: apartment.floor,
    },
    balance,
    statement,
  });
});

