import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import dbConnect from './db';
import User from '@/models/User';
import Resident from '@/models/Resident';
import { SessionUser, UserRole } from './types';

declare module 'next-auth' {
  interface Session {
    user: SessionUser;
  }

  interface User extends SessionUser {}
}

declare module 'next-auth/jwt' {
  interface JWT extends SessionUser {}
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required');
        }

        // Dev-only diagnostics (never log passwords or secrets)
        try {
          await dbConnect();
          if (process.env.NODE_ENV === 'development') {
            const mongoose = await import('mongoose');
            console.log('[auth] MONGODB connected:', mongoose.default.connection.readyState === 1);
          }
        } catch (dbError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[auth] MONGODB connection failed:', (dbError as Error).message);
          }
          throw new Error('בעיה זמנית בהתחברות למסד הנתונים. נסה שוב בעוד רגע.');
        }

        const user = await User.findOne({ email: credentials.email.toLowerCase() });
        
        // Dev-only diagnostics
        if (process.env.NODE_ENV === 'development') {
          console.log('[auth] user found by email:', !!user);
          if (user) {
            console.log('[auth] user.isActive:', user.isActive);
            console.log('[auth] passwordHash exists:', !!user.passwordHash);
          }
        }

        if (!user) {
          throw new Error('Invalid credentials');
        }

        // Check if user account is active
        if (user.isActive === false) {
          throw new Error('Account is disabled. Please contact building management.');
        }

        const isValid = await user.comparePassword(credentials.password);
        
        // Dev-only diagnostics
        if (process.env.NODE_ENV === 'development') {
          console.log('[auth] bcrypt compare result:', isValid);
        }

        if (!isValid) {
          throw new Error('Invalid credentials');
        }

        // Update last login
        user.lastLoginAt = new Date();
        await user.save();

        // Get apartment ID if user is a resident
        let apartmentId: string | undefined;
        if (user.residentId) {
          const resident = await Resident.findById(user.residentId);
          apartmentId = resident?.apartmentId?.toString();
        }

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role as UserRole,
          buildingId: user.buildingId.toString(),
          residentId: user.residentId?.toString(),
          apartmentId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.buildingId = user.buildingId;
        token.residentId = user.residentId;
        token.apartmentId = user.apartmentId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        email: token.email as string,
        name: token.name as string,
        role: token.role as UserRole,
        buildingId: token.buildingId as string,
        residentId: token.residentId as string | undefined,
        apartmentId: token.apartmentId as string | undefined,
      };
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

// Role hierarchy for permission checks
const roleHierarchy: Record<UserRole, number> = {
  ADMIN: 100,
  MANAGEMENT: 80,
  BOARD: 60,
  TREASURER: 50,
  RESIDENT: 10,
};

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function canAccessApartment(user: SessionUser, apartmentId: string): boolean {
  // Admin, Board, Treasurer, and Management can access all apartments
  if (['ADMIN', 'BOARD', 'TREASURER', 'MANAGEMENT'].includes(user.role)) {
    return true;
  }
  // Residents can only access their own apartment
  return user.apartmentId === apartmentId;
}

export function canManageBuilding(role: UserRole): boolean {
  return ['ADMIN', 'BOARD', 'MANAGEMENT'].includes(role);
}

export function canManageFinances(role: UserRole): boolean {
  return ['ADMIN', 'BOARD', 'TREASURER', 'MANAGEMENT'].includes(role);
}

export function canViewAuditLog(role: UserRole): boolean {
  return ['ADMIN', 'BOARD', 'MANAGEMENT'].includes(role);
}

