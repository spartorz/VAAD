import { NextRequest } from 'next/server';
import { withAuth, successResponse, errorResponse, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import { Types } from 'mongoose';
import { z } from 'zod';

const importRowSchema = z.object({
  apartmentNumber: z.string().min(1),
  floor: z.coerce.number().optional(),
  size: z.coerce.number().optional(),
  residentName: z.string().optional(),
  residentEmail: z.string().email().optional().or(z.literal('')),
  residentPhone: z.string().optional(),
  residentType: z.enum(['owner', 'tenant']).optional(),
});

// POST /api/import - Import apartments and residents from CSV/Excel data
export const POST = withAuth(async (request, { user }) => {
  if (!canManageBuilding(user.role)) {
    return errorResponse('Permission denied', 403);
  }

  const body = await request.json();
  const { data, mode = 'preview' } = body;

  if (!Array.isArray(data) || data.length === 0) {
    return errorResponse('No data provided');
  }

  const results = {
    valid: [] as Array<{ row: number; apartment: string; resident?: string }>,
    errors: [] as Array<{ row: number; error: string }>,
    created: { apartments: 0, residents: 0 },
    skipped: { apartments: 0, residents: 0 },
  };

  const buildingId = new Types.ObjectId(user.buildingId);

  // Get existing apartments for duplicate check
  const existingApartments = await Apartment.find({ buildingId }).lean();
  const existingNumbers = new Set(existingApartments.map((a) => a.number));

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowNum = i + 2; // Account for header row

    try {
      const validation = importRowSchema.safeParse(row);
      
      if (!validation.success) {
        results.errors.push({
          row: rowNum,
          error: validation.error.errors[0].message,
        });
        continue;
      }

      const { apartmentNumber, floor, size, residentName, residentEmail, residentPhone, residentType } = validation.data;

      // Check if apartment already exists
      const apartmentExists = existingNumbers.has(apartmentNumber);

      if (mode === 'preview') {
        results.valid.push({
          row: rowNum,
          apartment: apartmentNumber,
          resident: residentName,
        });
        if (apartmentExists) results.skipped.apartments++;
        else results.created.apartments++;
        if (residentName) results.created.residents++;
      } else if (mode === 'import') {
        let apartmentId: Types.ObjectId;

        if (apartmentExists) {
          const existing = existingApartments.find((a) => a.number === apartmentNumber);
          apartmentId = existing!._id;
          results.skipped.apartments++;
        } else {
          const apartment = await Apartment.create({
            buildingId,
            number: apartmentNumber,
            floor,
            size,
            status: 'active',
          });
          apartmentId = apartment._id;
          results.created.apartments++;
          existingNumbers.add(apartmentNumber);
        }

        // Create resident if name provided
        if (residentName) {
          await Resident.create({
            buildingId,
            apartmentId,
            fullName: residentName,
            email: residentEmail || undefined,
            phone: residentPhone || undefined,
            type: residentType || 'owner',
            isActive: true,
          });
          results.created.residents++;
        }

        results.valid.push({
          row: rowNum,
          apartment: apartmentNumber,
          resident: residentName,
        });
      }
    } catch (error) {
      results.errors.push({
        row: rowNum,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  if (mode === 'import' && (results.created.apartments > 0 || results.created.residents > 0)) {
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'import_data',
      entityType: 'apartment',
      entityId: new Types.ObjectId().toString(),
      metadata: {
        apartmentsCreated: results.created.apartments,
        residentsCreated: results.created.residents,
        apartmentsSkipped: results.skipped.apartments,
        errors: results.errors.length,
      },
    });
  }

  return successResponse(results);
}, { requiredRole: 'BOARD' });

