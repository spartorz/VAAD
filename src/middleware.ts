import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/apartments/:path*',
    '/residents/:path*',
    '/billing/:path*',
    '/tickets/:path*',
    '/vendors/:path*',
    '/documents/:path*',
    '/audit-log/:path*',
  ],
};

