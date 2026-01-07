import { NextRequest, NextResponse } from 'next/server';
import { getSession, createAuditLog } from '@/lib/api-utils';
import { canManageBuilding } from '@/lib/auth';
import Apartment from '@/models/Apartment';
import Resident from '@/models/Resident';
import User from '@/models/User';
import dbConnect from '@/lib/db';
import { Types } from 'mongoose';
import ExcelJS from 'exceljs';

interface ImportError {
  row: number;
  sheet: string;
  field: string;
  message: string;
}

interface PreviewRow {
  apartmentNumber: string;
  fullName: string;
  type: string;
  email: string;
  phone: string;
  moveInAt: string;
  action: 'create' | 'skip' | 'error';
  skipReason?: string;
  createUser: boolean;
  userAction?: 'create' | 'skip' | 'error';
  userSkipReason?: string;
}

interface ImportSummary {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
  usersCreated: number;
  usersSkipped: number;
}

// Generate random password (10-12 chars)
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const length = Math.floor(Math.random() * 3) + 10; // 10-12 chars
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// POST /api/import/residents - Import residents from Excel
export async function POST(request: NextRequest) {
  const user = await getSession();
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!canManageBuilding(user.role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') !== '0';

  try {
    await dbConnect();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx')) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Please upload an Excel file (.xlsx)' }, { status: 400 });
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const residentsSheet = workbook.getWorksheet('residents');
    if (!residentsSheet) {
      return NextResponse.json({ success: false, error: 'Excel file must contain a "residents" sheet' }, { status: 400 });
    }

    const buildingId = new Types.ObjectId(user.buildingId);
    
    // Get existing apartments for this building (for mapping apartmentNumber -> _id)
    const existingApartments = await Apartment.find({ buildingId }).lean();
    const apartmentsByNumber = new Map(existingApartments.map(a => [a.number.toLowerCase().trim(), a]));

    // Get existing residents for duplicate check (by email)
    const existingResidents = await Resident.find({ buildingId }).lean();
    const residentsByEmail = new Map(
      existingResidents
        .filter(r => r.email)
        .map(r => [r.email!.toLowerCase().trim(), r])
    );

    // Get existing users to check for linked accounts
    const existingUsers = await User.find({ buildingId }).lean();
    const usersByResidentId = new Map(
      existingUsers
        .filter(u => u.residentId)
        .map(u => [u.residentId!.toString(), u])
    );

    // Get existing users by email for duplicate check
    const usersByEmail = new Map(
      existingUsers
        .filter(u => u.email)
        .map(u => [u.email!.toLowerCase().trim(), u])
    );

    const errors: ImportError[] = [];
    const preview: PreviewRow[] = [];
    const summary: ImportSummary = {
      totalRows: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      usersCreated: 0,
      usersSkipped: 0,
    };

    // Get header row to find column indices
    const headerRow = residentsSheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const value = String(cell.value || '').toLowerCase().trim();
      headers[value] = colNumber;
    });

    // Validate required columns
    if (!headers['apartmentnumber']) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required column: apartmentNumber' 
      }, { status: 400 });
    }
    if (!headers['fullname']) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required column: fullName' 
      }, { status: 400 });
    }

    // Process data rows (skip header)
    const rowCount = residentsSheet.rowCount;
    interface ResidentToCreate {
      buildingId: Types.ObjectId;
      apartmentId: Types.ObjectId;
      fullName: string;
      type: string;
      email?: string;
      phone?: string;
      moveInAt: Date;
      isActive: boolean;
      createUser: boolean;
      tempPassword?: string;
    }
    const residentsToCreate: ResidentToCreate[] = [];

    for (let rowNum = 2; rowNum <= rowCount; rowNum++) {
      const row = residentsSheet.getRow(rowNum);
      
      // Skip empty rows
      const apartmentNumberCell = row.getCell(headers['apartmentnumber']);
      const fullNameCell = row.getCell(headers['fullname']);
      if (!apartmentNumberCell.value && !fullNameCell.value) continue;

      summary.totalRows++;

      // Extract values
      const apartmentNumber = String(apartmentNumberCell.value || '').trim();
      const fullName = String(fullNameCell.value || '').trim();
      const typeCell = headers['type'] ? row.getCell(headers['type']) : null;
      const emailCell = headers['email'] ? row.getCell(headers['email']) : null;
      const phoneCell = headers['phone'] ? row.getCell(headers['phone']) : null;
      const moveInAtCell = headers['moveinat'] ? row.getCell(headers['moveinat']) : null;
      const createUserCell = headers['createuser'] ? row.getCell(headers['createuser']) : null;
      const tempPasswordCell = headers['temppassword'] ? row.getCell(headers['temppassword']) : null;

      let hasError = false;

      // Validate apartment number
      if (!apartmentNumber) {
        errors.push({ row: rowNum, sheet: 'residents', field: 'apartmentNumber', message: 'Apartment number is required' });
        hasError = true;
      }

      // Validate full name
      if (!fullName) {
        errors.push({ row: rowNum, sheet: 'residents', field: 'fullName', message: 'Full name is required' });
        hasError = true;
      }

      // Check if apartment exists
      const apartment = apartmentsByNumber.get(apartmentNumber.toLowerCase());
      if (!apartment && apartmentNumber) {
        errors.push({ row: rowNum, sheet: 'residents', field: 'apartmentNumber', message: `Apartment "${apartmentNumber}" not found in this building` });
        hasError = true;
      }

      // Parse and validate type
      let residentType = 'owner';
      if (typeCell?.value) {
        const typeValue = String(typeCell.value).toLowerCase().trim();
        if (typeValue && !['owner', 'tenant'].includes(typeValue)) {
          errors.push({ row: rowNum, sheet: 'residents', field: 'type', message: 'Type must be "owner" or "tenant"' });
          hasError = true;
        } else if (typeValue) {
          residentType = typeValue;
        }
      }

      // Parse email
      let email: string | undefined;
      if (emailCell?.value) {
        email = String(emailCell.value).trim().toLowerCase();
        if (email && !isValidEmail(email)) {
          errors.push({ row: rowNum, sheet: 'residents', field: 'email', message: 'Invalid email format' });
          hasError = true;
        }
      }

      // Parse phone
      const phone = phoneCell?.value ? String(phoneCell.value).trim() : undefined;

      // Parse moveInAt
      let moveInAt = new Date();
      if (moveInAtCell?.value) {
        const dateValue = moveInAtCell.value;
        if (dateValue instanceof Date) {
          moveInAt = dateValue;
        } else {
          const parsed = new Date(String(dateValue));
          if (!isNaN(parsed.getTime())) {
            moveInAt = parsed;
          }
        }
      }

      // Parse createUser flag
      const createUserValue = createUserCell?.value ? String(createUserCell.value).toLowerCase().trim() : 'no';
      const shouldCreateUser = createUserValue === 'yes' || createUserValue === 'true' || createUserValue === '1';

      // Parse tempPassword
      let tempPassword = tempPasswordCell?.value ? String(tempPasswordCell.value).trim() : undefined;

      // If createUser=yes, email is required
      if (shouldCreateUser && !email) {
        errors.push({ row: rowNum, sheet: 'residents', field: 'email', message: 'Email is required when createUser=yes' });
        hasError = true;
      }

      if (hasError) {
        summary.errors++;
        preview.push({
          apartmentNumber,
          fullName,
          type: residentType,
          email: email || '',
          phone: phone || '',
          moveInAt: moveInAt.toISOString().split('T')[0],
          action: 'error',
          createUser: shouldCreateUser,
        });
        continue;
      }

      // Check for duplicate by email (resident)
      if (email) {
        const existingResident = residentsByEmail.get(email);
        if (existingResident) {
          // Check if this resident has a linked user account
          const linkedUser = usersByResidentId.get(existingResident._id.toString());
          if (linkedUser) {
            // Cannot modify resident with linked user account
            preview.push({
              apartmentNumber,
              fullName,
              type: residentType,
              email: email || '',
              phone: phone || '',
              moveInAt: moveInAt.toISOString().split('T')[0],
              action: 'skip',
              skipReason: 'Has linked user account - use move-out/move-in flow',
              createUser: false,
            });
            summary.skipped++;
            continue;
          }

          // Duplicate email - skip
          preview.push({
            apartmentNumber,
            fullName,
            type: residentType,
            email: email || '',
            phone: phone || '',
            moveInAt: moveInAt.toISOString().split('T')[0],
            action: 'skip',
            skipReason: 'Duplicate email - resident already exists',
            createUser: false,
          });
          summary.skipped++;
          continue;
        }
      }

      // Check for user creation
      let userAction: 'create' | 'skip' | undefined;
      let userSkipReason: string | undefined;

      if (shouldCreateUser && email) {
        // Check if user already exists by email
        const existingUser = usersByEmail.get(email);
        if (existingUser) {
          userAction = 'skip';
          userSkipReason = 'User already exists with this email';
          summary.usersSkipped++;
        } else {
          // Generate password if not provided
          if (!tempPassword) {
            tempPassword = generateRandomPassword();
          }
          userAction = 'create';
          summary.usersCreated++;

          // Add to usersByEmail for duplicate check in subsequent rows
          usersByEmail.set(email, { _id: new Types.ObjectId() } as any);
        }
      }

      // Create new resident
      residentsToCreate.push({
        buildingId,
        apartmentId: apartment!._id,
        fullName,
        type: residentType,
        email: email || undefined,
        phone: phone || undefined,
        moveInAt,
        isActive: true,
        createUser: shouldCreateUser && userAction === 'create',
        tempPassword: shouldCreateUser && userAction === 'create' ? tempPassword : undefined,
      });

      preview.push({
        apartmentNumber,
        fullName,
        type: residentType,
        email: email || '',
        phone: phone || '',
        moveInAt: moveInAt.toISOString().split('T')[0],
        action: 'create',
        createUser: shouldCreateUser,
        userAction,
        userSkipReason,
      });
      summary.created++;

      // Add to duplicate check set for subsequent rows
      if (email) {
        residentsByEmail.set(email, { _id: new Types.ObjectId() } as any);
      }
    }

    // If not dry run, commit changes
    if (!dryRun) {
      // Create residents one by one so we can link users
      for (const residentData of residentsToCreate) {
        const { createUser: shouldCreate, tempPassword, ...residentFields } = residentData;
        
        // Create resident
        const resident = await Resident.create(residentFields);

        // Create user if requested
        if (shouldCreate && tempPassword && residentFields.email) {
          // Pass plain password - User model pre-save hook will hash it
          const newUser = await User.create({
            email: residentFields.email,
            name: residentFields.fullName,
            passwordHash: tempPassword, // Will be hashed by pre-save hook
            role: 'RESIDENT',
            buildingId,
            residentId: resident._id,
            isActive: true,
          });

          // Link user to resident
          await Resident.findByIdAndUpdate(resident._id, { userId: newUser._id });
        }
      }

      // Create audit log
      await createAuditLog({
        buildingId: user.buildingId,
        actorUserId: user.id,
        actorName: user.name,
        action: 'import_residents',
        entityType: 'resident',
        entityId: new Types.ObjectId().toString(),
        metadata: {
          totalRows: summary.totalRows,
          created: summary.created,
          skipped: summary.skipped,
          errorsCount: summary.errors,
          usersCreated: summary.usersCreated,
          usersSkipped: summary.usersSkipped,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        dryRun,
        summary,
        errors: errors.slice(0, 100), // Limit errors to first 100
        preview: preview.slice(0, 100), // Limit preview to first 100 rows
      },
    });
  } catch (error) {
    console.error('[POST /api/import/residents] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to import residents' 
    }, { status: 500 });
  }
}

