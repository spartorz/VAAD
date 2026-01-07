import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageFinances } from '@/lib/auth';
import Charge from '@/models/Charge';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import Payment from '@/models/Payment';
import Building from '@/models/Building';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';

// POST /api/reminders/whatsapp/copy - Log WhatsApp reminder copy action
export async function POST(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Only BOARD/TREASURER/MANAGEMENT/ADMIN can use reminders
  if (!canManageFinances(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { chargeId, source } = body as {
      chargeId: string;
      source: 'monthly_overview' | 'invoice_page';
    };

    if (!chargeId || !source) {
      return NextResponse.json({ success: false, error: 'Missing chargeId or source' }, { status: 400 });
    }

    await dbConnect();

    const buildingId = new Types.ObjectId(user.buildingId);

    // Get the charge with building scoping
    const charge = await Charge.findOne({
      _id: new Types.ObjectId(chargeId),
      buildingId,
    }).lean();

    if (!charge) {
      return NextResponse.json({ success: false, error: 'Charge not found' }, { status: 404 });
    }

    // Get apartment
    const apartment = await Apartment.findById(charge.apartmentId).lean();
    const apartmentNumber = apartment?.number || 'Unknown';

    // Get building name
    const building = await Building.findById(buildingId).lean();
    const buildingName = building?.name || 'ועד הבית';

    // Get active resident for the apartment
    const resident = await Resident.findOne({
      apartmentId: charge.apartmentId,
      buildingId,
      isActive: true,
    }).lean();
    const residentName = resident?.fullName || 'דייר/ת';

    // Calculate remaining amount (monthlyDue - payments in period)
    const [year, month] = (charge.period || '').split('-').map(Number);
    let remaining = charge.amount;

    if (year && month) {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      const payments = await Payment.find({
        apartmentId: charge.apartmentId,
        buildingId,
        status: 'confirmed',
        paidAt: { $gte: startOfMonth, $lte: endOfMonth },
      }).lean();

      const paidAmount = payments.reduce((sum, p) => sum + p.amount, 0);
      remaining = Math.max(0, charge.amount - paidAmount);
    }

    // Format amount
    const amount = remaining > 0 ? remaining : charge.amount;

    // Build reference
    const reference = `VAAD-${apartmentNumber}-${charge.period}`;

    // Log the audit entry
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'whatsapp_reminder_copied',
      entityType: 'charge',
      entityId: chargeId,
      metadata: {
        period: charge.period,
        apartmentNumber,
        residentName,
        amount,
        reference,
        channel: 'whatsapp',
        source,
      },
    });

    return NextResponse.json({ success: true, ok: true });
  } catch (error) {
    console.error('[POST /api/reminders/whatsapp/copy] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to log reminder' 
    }, { status: 500 });
  }
}

