import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';

// Version from package.json or env
const VERSION = process.env.APP_VERSION || '0.1.0';

export async function GET() {
  try {
    await dbConnect();
    const isConnected = mongoose.connection.readyState === 1;
    
    return NextResponse.json({
      status: 'ok',
      db: isConnected ? 'connected' : 'disconnected',
      version: VERSION,
    }, { status: isConnected ? 200 : 503 });
  } catch {
    return NextResponse.json({
      status: 'error',
      db: 'disconnected',
      version: VERSION,
    }, { status: 503 });
  }
}

