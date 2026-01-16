import mongoose from 'mongoose';
import User from './src/models/User';

async function testAuth() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Test board user
    const user = await User.findOne({ email: 'board@demo.com' });
    if (user) {
      console.log('Testing password for board@demo.com...');
      const isValid = await user.comparePassword('demo123');
      console.log('Password valid:', isValid);

      if (!isValid) {
        console.log('❌ Password comparison failed!');
        console.log('Password hash length:', user.passwordHash.length);
        console.log('Password hash starts with:', user.passwordHash.substring(0, 10));
      } else {
        console.log('✅ Password comparison successful!');
      }
    } else {
      console.log('❌ User not found!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

require('dotenv').config({ path: '.env.local' });
testAuth();