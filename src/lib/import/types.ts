import { ClientSession, Types } from 'mongoose';

export interface ImportError {
  row: number;
  sheet: string;
  field: string;
  message: string;
}

export interface ApartmentsPreviewRow {
  apartmentNumber: string;
  floor: number | null;
  sizeSqft: number | null;
  status: string;
  notes: string;
  action: 'create' | 'update' | 'skip';
}

export interface ApartmentsImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface ApartmentsImportResult {
  dryRun: boolean;
  summary: ApartmentsImportSummary;
  errors: ImportError[];
  preview: ApartmentsPreviewRow[];
}

export interface ResidentsPreviewRow {
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

export interface ResidentsImportSummary {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
  usersCreated: number;
  usersSkipped: number;
}

export interface ResidentsImportResult {
  dryRun: boolean;
  summary: ResidentsImportSummary;
  errors: ImportError[];
  preview: ResidentsPreviewRow[];
}

export interface ImportActorContext {
  userId: string;
  userName: string;
}

export interface ImportExecutionContext {
  buildingId: Types.ObjectId;
  dryRun: boolean;
  actor?: ImportActorContext;
  session?: ClientSession;
}
