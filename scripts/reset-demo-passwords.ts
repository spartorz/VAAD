/**
 * Repairs demo-account passwords after a double-hash incident.
 *
 * Run once with:  npx tsx scripts/reset-demo-passwords.ts
 *
 * This script ONLY touches passwordHash for the three demo accounts.
 * All other data (charges, payments, tickets, documents) is preserved.
 */

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

require('dotenv').config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌  MONGODB_URI not found in .env.local');
  process.exit(1);
}

const DEMO_PASSWORD = 'demo123';
const DEMO_EMAILS = ['board@demo.com', 'treasurer@demo.com', 'resident@demo.com'];

// Inline schema — no pre-save hook so the hash is stored as-is
const userSchema = new mongoose.Schema({ passwordHash: String }, { strict: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

async function main() {
  await mongoose.connect(MONGODB_URI!);
  console.log('✅  Connected to MongoDB\n');

  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const email of DEMO_EMAILS) {
    const result = await User.updateOne({ email }, { $set: { passwordHash: hash } });
    if (result.matchedCount === 0) {
      console.warn(`⚠️   User not found: ${email}`);
    } else {
      console.log(`✅  Reset password for ${email}`);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log('  Demo accounts restored (password: demo123)');
  console.log('  board@demo.com      BOARD');
  console.log('  treasurer@demo.com  TREASURER');
  console.log('  resident@demo.com   RESIDENT');
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('❌  Script failed:', err);
  process.exit(1);
});
