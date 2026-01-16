import { NextRequest } from 'next/server';
import { Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { withAuth, successResponse, errorResponse } from '@/lib/api-utils';
import { monthlyChargeWizardSchema, MonthlyChargeWizardInput } from '@/lib/validations';
import Charge from '@/models/Charge';
import Apartment, { IApartment } from '@/models/Apartment';
import Building from '@/models/Building';

export const POST = withAuth(async (request: NextRequest, { user }) => {
  await dbConnect();

  try {
    const body = await request.json();
    const { buildingId, ...chargeData } = body;

    // Validate input
    const validation = monthlyChargeWizardSchema.safeParse(chargeData);
    if (!validation.success) {
      return errorResponse('Invalid input data');
    }

    const data = validation.data;

    // Verify building access
    if (user.role !== 'ADMIN' && user.buildingId !== buildingId) {
      return errorResponse('Unauthorized', 403);
    }

    // Get all active apartments for the building
    const apartments = await Apartment.find({
      buildingId: new Types.ObjectId(buildingId),
      status: 'active',
    }).lean();

    if (apartments.length === 0) {
      return errorResponse('No active apartments found');
    }

    // Get building settings for currency
    const building = await Building.findById(buildingId).lean();
    const currency = building?.settings?.currency || 'ILS';

    // Calculate charges based on type
    const chargesToCreate = await calculateCharges(data, apartments, currency, buildingId);

    if (chargesToCreate.length === 0) {
      return errorResponse('No charges to create');
    }

    // Insert charges
    const insertedCharges = await Charge.insertMany(chargesToCreate);

    return successResponse({
      created: insertedCharges.length,
      charges: insertedCharges,
    });

  } catch (error) {
    console.error('Monthly charges setup error:', error);
    return errorResponse('Internal server error', 500);
  }
});

async function calculateCharges(
  data: MonthlyChargeWizardInput,
  apartments: IApartment[],
  currency: string,
  buildingId: string
): Promise<any[]> {
  const charges: any[] = [];
  const dueDate = new Date(data.startPeriod + '-01');

  // Set due date to the dueDay of the month
  dueDate.setDate(data.dueDay || 10);

  switch (data.type) {
    case 'uniform':
      // Same amount for all apartments
      for (const apartment of apartments) {
        charges.push({
          buildingId: new Types.ObjectId(buildingId),
          apartmentId: apartment._id,
          type: 'monthly_due',
          title: data.title,
          amount: data.amount,
          currency,
          period: data.startPeriod,
          dueDate,
          status: 'open',
        });
      }
      break;

    case 'by_rooms':
      // Amount based on number of rooms
      for (const apartment of apartments) {
        const config = data.roomConfigs?.find((c) => c.rooms === apartment.rooms);
        if (config) {
          charges.push({
            buildingId: new Types.ObjectId(buildingId),
            apartmentId: apartment._id,
            type: 'monthly_due',
            title: config.title || `${config.rooms} חדרים`,
            amount: config.amount,
            currency,
            period: data.startPeriod,
            dueDate,
            status: 'open',
          });
        }
      }
      break;

    case 'by_size':
      // Amount based on apartment size
      for (const apartment of apartments) {
        let amount = 0;

        if (data.calculationType === 'percentage' && apartment.size) {
          // Calculate based on percentage of base amount
          const totalSize = apartments.reduce((sum, apt) => sum + (apt.size || 0), 0);
          if (totalSize > 0) {
            const percentage = (apartment.size / totalSize) * 100;
            amount = (data.baseAmount * percentage) / 100;
          }
        } else if (data.calculationType === 'manual' && data.sizeConfigs) {
          // Find matching size configuration
          const config = data.sizeConfigs.find((c) =>
            apartment.size && apartment.size >= c.minSize && apartment.size <= c.maxSize
          );
          if (config) {
            amount = config.amount;
          }
        }

        if (amount > 0) {
          charges.push({
            buildingId: new Types.ObjectId(buildingId),
            apartmentId: apartment._id,
            type: 'monthly_due',
            title: `חיוב לפי שטח - ${apartment.size}m²`,
            amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
            currency,
            period: data.startPeriod,
            dueDate,
            status: 'open',
          });
        }
      }
      break;

    case 'by_floor':
      // Amount based on floor range
      for (const apartment of apartments) {
        const config = data.floorConfigs?.find((c) =>
          apartment.floor !== undefined &&
          apartment.floor >= c.minFloor &&
          apartment.floor <= c.maxFloor
        );

        if (config) {
          charges.push({
            buildingId: new Types.ObjectId(buildingId),
            apartmentId: apartment._id,
            type: 'monthly_due',
            title: config.title || `קומה ${config.minFloor}-${config.maxFloor}`,
            amount: config.amount,
            currency,
            period: data.startPeriod,
            dueDate,
            status: 'open',
          });
        }
      }
      break;

    case 'manual':
      // Manual configuration - specific amounts for specific apartments
      if ((data as any).manualConfigs) {
        for (const config of (data as any).manualConfigs) {
          charges.push({
            buildingId: new Types.ObjectId(buildingId),
            apartmentId: new Types.ObjectId(config.apartmentId),
            type: 'monthly_due',
            title: config.title || 'דמי ועד חודשיים',
            amount: config.amount,
            currency,
            period: data.startPeriod,
            dueDate,
            status: 'open',
          });
        }
      }
      break;
  }

  return charges;
}