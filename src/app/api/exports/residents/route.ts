import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Resident from '@/models/Resident';
import Apartment from '@/models/Apartment';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import { createExportWorkbook, workbookToBuffer, formatExcelDate } from '@/lib/excel/writeExports';

// GET /api/exports/residents - Export residents to Excel
export async function GET(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'active'; // active | all

  try {
    await dbConnect();

    const buildingId = new Types.ObjectId(user.buildingId);

    // Build query based on status filter
    const query: Record<string, unknown> = { buildingId };
    if (status === 'active') {
      query.isActive = true;
    }

    // Get residents with apartment info
    const residents = await Resident.find(query)
      .populate('apartmentId', 'number')
      .sort({ fullName: 1 })
      .lean();

    // Build export data
    const exportData = residents.map((resident) => {
      const apt = resident.apartmentId as unknown as { number: string } | null;
      return {
        fullName: resident.fullName,
        type: resident.type === 'owner' ? 'בעלים' : 'שוכר',
        email: resident.email || '',
        phone: resident.phone || '',
        apartmentNumber: apt?.number || '',
        moveInAt: formatExcelDate(resident.moveInAt),
        moveOutAt: resident.moveOutAt ? formatExcelDate(resident.moveOutAt) : '',
        status: resident.isActive ? 'פעיל' : 'עזב',
      };
    });

    // Create Excel workbook
    const workbook = await createExportWorkbook({
      sheetName: 'דיירים',
      title: status === 'active' ? 'רשימת דיירים פעילים' : 'רשימת כל הדיירים',
      columns: [
        { header: 'שם מלא', key: 'fullName', width: 25 },
        { header: 'סוג', key: 'type', width: 12 },
        { header: 'אימייל', key: 'email', width: 25 },
        { header: 'טלפון', key: 'phone', width: 15 },
        { header: 'דירה', key: 'apartmentNumber', width: 12 },
        { header: 'תאריך כניסה', key: 'moveInAt', width: 15 },
        { header: 'תאריך עזיבה', key: 'moveOutAt', width: 15 },
        { header: 'סטטוס', key: 'status', width: 10 },
      ],
      data: exportData,
      headerColor: 'ED7D31',
    });

    const buffer = await workbookToBuffer(workbook);

    // Create audit log
    await createAuditLog({
      buildingId: user.buildingId,
      actorUserId: user.id,
      actorName: user.name,
      action: 'export_residents',
      entityType: 'resident',
      entityId: buildingId.toString(),
      metadata: {
        statusFilter: status,
        totalRecords: residents.length,
      },
    });

    const filename = `residents_export_${status}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/exports/residents] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to export residents' 
    }, { status: 500 });
  }
}

