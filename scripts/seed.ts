/**
 * Seed Script for VAAD - Building Committee Management System
 * 
 * Run with: npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed.ts
 * Or add to package.json scripts: "seed": "tsx scripts/seed.ts"
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables');
  console.log('Please create a .env.local file with your MongoDB connection string');
  process.exit(1);
}

// Inline schemas for seed script (to avoid import issues)
const buildingSchema = new mongoose.Schema({
  name: String,
  address: String,
  city: String,
  country: String,
  timezone: { type: String, default: 'UTC' },
  bankInfo: {
    bankName: String,
    accountNumber: String,
    routingNumber: String,
    notes: String,
  },
  settings: {
    currency: { type: String, default: 'ILS' },
    dueDay: { type: Number, default: 1 },
    monthlyDueAmount: Number,
  },
}, { timestamps: true });

const apartmentSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  number: { type: String, required: true },
  floor: Number,
  size: Number,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

const residentSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  apartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  fullName: { type: String, required: true },
  phone: String,
  email: String,
  type: { type: String, enum: ['owner', 'tenant'], default: 'owner' },
  isActive: { type: Boolean, default: true },
  moveInAt: { type: Date, default: Date.now },
  moveOutAt: { type: Date, default: null },
  moveOutNote: String,
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident' },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'BOARD', 'TREASURER', 'RESIDENT', 'MANAGEMENT'], default: 'RESIDENT' },
  isActive: { type: Boolean, default: true },
  lastLoginAt: Date,
}, { timestamps: true });

const chargeSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  apartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  type: { type: String, enum: ['monthly_due', 'one_time', 'repair', 'fund'], required: true },
  title: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  period: String,
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['open', 'voided'], default: 'open' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

const paymentSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  apartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment', required: true },
  residentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resident' },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  method: { type: String, enum: ['bank_transfer', 'cash', 'credit_card', 'other'], required: true },
  reference: String,
  paidAt: { type: Date, required: true },
  status: { type: String, enum: ['confirmed', 'pending', 'voided'], default: 'confirmed' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

const ticketSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  apartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Apartment' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_progress', 'waiting_vendor', 'resolved', 'closed'], default: 'open' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  attachments: [{ url: String, name: String, type: String, size: Number }],
  timeline: [{
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byUserName: String,
    message: String,
    createdAt: { type: Date, default: Date.now },
  }],
  resolvedAt: Date,
}, { timestamps: true });

const vendorSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  name: { type: String, required: true },
  phone: String,
  email: String,
  category: { type: String, enum: ['cleaning', 'elevator', 'electric', 'plumbing', 'security', 'landscaping', 'other'], required: true },
  contractStart: Date,
  contractEnd: Date,
  notes: String,
  documents: [{ url: String, name: String }],
}, { timestamps: true });

const documentSchema = new mongoose.Schema({
  buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', required: true },
  title: { type: String, required: true },
  category: { type: String, enum: ['insurance', 'protocol', 'receipt', 'contract', 'other'], required: true },
  visibility: { type: String, enum: ['public', 'residents_only', 'board_only'], default: 'board_only' },
  file: {
    url: { type: String, required: true },
    name: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Create models
const Building = mongoose.models.Building || mongoose.model('Building', buildingSchema);
const Apartment = mongoose.models.Apartment || mongoose.model('Apartment', apartmentSchema);
const Resident = mongoose.models.Resident || mongoose.model('Resident', residentSchema);
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Charge = mongoose.models.Charge || mongoose.model('Charge', chargeSchema);
const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
const MaintenanceTicket = mongoose.models.MaintenanceTicket || mongoose.model('MaintenanceTicket', ticketSchema);
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
const Document = mongoose.models.Document || mongoose.model('Document', documentSchema);

async function seed() {
  console.log('🌱 Starting seed...\n');

  try {
    await mongoose.connect(MONGODB_URI!);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing data (optional - comment out for production)
    console.log('🧹 Clearing existing data...');
    await Promise.all([
      Building.deleteMany({}),
      Apartment.deleteMany({}),
      Resident.deleteMany({}),
      User.deleteMany({}),
      Charge.deleteMany({}),
      Payment.deleteMany({}),
      MaintenanceTicket.deleteMany({}),
      Vendor.deleteMany({}),
      Document.deleteMany({}),
    ]);
    console.log('✅ Cleared existing data\n');

    // Create building
    console.log('🏢 Creating building...');
    const building = await Building.create({
      name: 'מגדלי השקיעה',
      address: '123 רחוב הרצל',
      city: 'תל אביב',
      country: 'Israel',
      timezone: 'Asia/Jerusalem',
      bankInfo: {
        bankName: 'בנק הפועלים',
        accountNumber: '****1234',
        routingNumber: '12-345',
        notes: 'חשבון ועד הבית - יש לציין מספר דירה בהעברה',
      },
      settings: {
        currency: 'ILS',
        dueDay: 10,
        monthlyDueAmount: 450,
      },
    });
    console.log(`✅ Created building: ${building.name}\n`);

    // Create apartments
    console.log('🏠 Creating apartments...');
    const apartmentData = [];
    for (let floor = 1; floor <= 5; floor++) {
      for (let unit = 1; unit <= 4; unit++) {
        apartmentData.push({
          buildingId: building._id,
          number: `${floor}0${unit}`,
          floor,
          size: 850 + Math.floor(Math.random() * 400),
          status: 'active',
        });
      }
    }
    const apartments = await Apartment.insertMany(apartmentData);
    console.log(`✅ Created ${apartments.length} apartments\n`);

    // Create residents
    console.log('👥 Creating residents...');
    const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'William', 'Anna', 'James', 'Maria', 'Daniel', 'Jennifer', 'Thomas', 'Elizabeth', 'Richard', 'Susan', 'Joseph', 'Karen'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'];

    const residentData = apartments.map((apt, i) => ({
      buildingId: building._id,
      apartmentId: apt._id,
      fullName: `${firstNames[i % firstNames.length]} ${lastNames[i % lastNames.length]}`,
      email: `resident${i + 1}@example.com`,
      phone: `+1 555 ${String(100 + i).padStart(3, '0')} ${String(1000 + i).padStart(4, '0')}`,
      type: i % 5 === 0 ? 'tenant' : 'owner',
      isActive: true,
      moveInAt: new Date(Date.now() - (i * 30 * 24 * 60 * 60 * 1000)), // Staggered move-in dates
      moveOutAt: null,
    }));
    const residents = await Resident.insertMany(residentData);
    console.log(`✅ Created ${residents.length} residents\n`);

    // Create users
    console.log('👤 Creating users...');
    const passwordHash = await bcrypt.hash('demo123', 12);

    // Board member
    const boardUser = await User.create({
      buildingId: building._id,
      name: 'Board Admin',
      email: 'board@demo.com',
      passwordHash,
      role: 'BOARD',
      isActive: true,
    });

    // Treasurer
    const treasurerUser = await User.create({
      buildingId: building._id,
      name: 'Treasurer User',
      email: 'treasurer@demo.com',
      passwordHash,
      role: 'TREASURER',
      isActive: true,
    });

    // Resident user (linked to first resident)
    const residentUser = await User.create({
      buildingId: building._id,
      residentId: residents[0]._id,
      name: residents[0].fullName,
      email: 'resident@demo.com',
      passwordHash,
      role: 'RESIDENT',
      isActive: true,
    });

    console.log('✅ Created users:');
    console.log('   - board@demo.com (BOARD)');
    console.log('   - treasurer@demo.com (TREASURER)');
    console.log('   - resident@demo.com (RESIDENT)\n');

    // Create vendors
    console.log('🔧 Creating vendors...');
    const vendors = await Vendor.insertMany([
      {
        buildingId: building._id,
        name: 'CleanPro Services',
        phone: '+1 555 111 2222',
        email: 'contact@cleanpro.com',
        category: 'cleaning',
        contractStart: new Date('2024-01-01'),
        contractEnd: new Date('2024-12-31'),
        notes: 'Weekly cleaning of common areas',
      },
      {
        buildingId: building._id,
        name: 'ElevatorTech Inc',
        phone: '+1 555 333 4444',
        email: 'service@elevatortech.com',
        category: 'elevator',
        contractStart: new Date('2024-01-01'),
        contractEnd: new Date('2025-01-01'),
        notes: 'Monthly maintenance and emergency repairs',
      },
      {
        buildingId: building._id,
        name: 'QuickFix Plumbing',
        phone: '+1 555 555 6666',
        email: 'jobs@quickfixplumb.com',
        category: 'plumbing',
        notes: 'On-call plumbing services',
      },
    ]);
    console.log(`✅ Created ${vendors.length} vendors\n`);

    // Create charges for current month
    console.log('💰 Creating charges...');
    const currentMonth = new Date().toISOString().slice(0, 7);
    const chargeData = apartments.slice(0, 15).map((apt) => ({
      buildingId: building._id,
      apartmentId: apt._id,
      type: 'monthly_due',
      title: 'דמי ועד בית חודשי',
      amount: 450,
      currency: 'ILS',
      period: currentMonth,
      dueDate: new Date(),
      status: 'open',
      createdBy: boardUser._id,
    }));
    const charges = await Charge.insertMany(chargeData);
    console.log(`✅ Created ${charges.length} charges\n`);

    // Create payments
    console.log('💳 Creating payments...');
    const paymentData = apartments.slice(0, 10).map((apt, i) => ({
      buildingId: building._id,
      apartmentId: apt._id,
      residentId: residents[i]._id,
      amount: 450,
      currency: 'ILS',
      method: i % 3 === 0 ? 'cash' : 'bank_transfer',
      reference: `TXN${Date.now()}${i}`,
      paidAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      status: 'confirmed',
      createdBy: treasurerUser._id,
    }));
    const payments = await Payment.insertMany(paymentData);
    console.log(`✅ Created ${payments.length} payments\n`);

    // Create tickets
    console.log('🎫 Creating tickets...');
    const tickets = await MaintenanceTicket.insertMany([
      {
        buildingId: building._id,
        apartmentId: apartments[0]._id,
        createdBy: residentUser._id,
        title: 'Leaky faucet in bathroom',
        description: 'The bathroom faucet has been dripping for a few days. It seems to be getting worse.',
        priority: 'medium',
        status: 'open',
        timeline: [{
          byUserId: residentUser._id,
          byUserName: residentUser.name,
          message: 'Ticket created',
          createdAt: new Date(),
        }],
      },
      {
        buildingId: building._id,
        createdBy: boardUser._id,
        title: 'Elevator maintenance scheduled',
        description: 'Annual elevator inspection and maintenance will be performed next week.',
        priority: 'low',
        status: 'in_progress',
        vendorId: vendors[1]._id,
        timeline: [
          {
            byUserId: boardUser._id,
            byUserName: boardUser.name,
            message: 'Ticket created',
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
          {
            byUserId: boardUser._id,
            byUserName: boardUser.name,
            message: 'Vendor assigned: ElevatorTech Inc',
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          },
        ],
      },
      {
        buildingId: building._id,
        apartmentId: apartments[5]._id,
        createdBy: boardUser._id,
        title: 'URGENT: Water leak from ceiling',
        description: 'Resident reported water leaking from the ceiling in the living room. Needs immediate attention.',
        priority: 'urgent',
        status: 'waiting_vendor',
        vendorId: vendors[2]._id,
        timeline: [{
          byUserId: boardUser._id,
          byUserName: boardUser.name,
          message: 'Ticket created - Emergency response needed',
          createdAt: new Date(),
        }],
      },
    ]);
    console.log(`✅ Created ${tickets.length} tickets\n`);

    // Create documents
    console.log('📄 Creating documents...');
    const documents = await Document.insertMany([
      {
        buildingId: building._id,
        title: 'Building Insurance Policy 2024',
        category: 'insurance',
        visibility: 'board_only',
        file: {
          url: '/uploads/demo/insurance-2024.pdf',
          name: 'insurance-2024.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
        },
        createdBy: boardUser._id,
      },
      {
        buildingId: building._id,
        title: 'Annual Meeting Minutes - January 2024',
        category: 'protocol',
        visibility: 'residents_only',
        file: {
          url: '/uploads/demo/meeting-minutes-jan-2024.pdf',
          name: 'meeting-minutes-jan-2024.pdf',
          mimeType: 'application/pdf',
          size: 256000,
        },
        createdBy: boardUser._id,
      },
      {
        buildingId: building._id,
        title: 'Building Rules & Regulations',
        category: 'other',
        visibility: 'public',
        file: {
          url: '/uploads/demo/building-rules.pdf',
          name: 'building-rules.pdf',
          mimeType: 'application/pdf',
          size: 512000,
        },
        createdBy: boardUser._id,
      },
    ]);
    console.log(`✅ Created ${documents.length} documents\n`);

    console.log('🎉 Seed completed successfully!\n');
    console.log('═══════════════════════════════════════════════');
    console.log('  Demo Accounts (password: demo123)');
    console.log('═══════════════════════════════════════════════');
    console.log('  Board Member:  board@demo.com');
    console.log('  Treasurer:     treasurer@demo.com');
    console.log('  Resident:      resident@demo.com');
    console.log('═══════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();

