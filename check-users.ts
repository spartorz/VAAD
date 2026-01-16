import mongoose from 'mongoose';
import User from './src/models/User';

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    const users = await User.find({}, 'email name role isActive').lean();
    console.log('Users in database:');
    users.forEach(user => {
      console.log(`- ${user.email} (${user.role}) - Active: ${user.isActive}`);
    });

    // Check specific demo users
    const demoUsers = ['board@demo.com', 'treasurer@demo.com', 'resident@demo.com'];
    for (const email of demoUsers) {
      const user = await User.findOne({ email }).select('email role isActive passwordHash').lean();
      if (user) {
        console.log(`\nFound ${email}:`);
        console.log(`  Role: ${user.role}`);
        console.log(`  Active: ${user.isActive}`);
        console.log(`  Has password: ${!!user.passwordHash}`);
      } else {
        console.log(`\n${email} not found!`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

require('dotenv').config({ path: '.env.local' });
checkUsers();