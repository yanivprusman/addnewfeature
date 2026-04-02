import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      const publicRoutes = ['/login', '/register', '/', '/issues'];
      const isPublicRoute =
        publicRoutes.includes(pathname) ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/stripe/webhook') ||
        pathname.startsWith('/api/feedback');

      if (isPublicRoute) return true;
      if (!isLoggedIn) return false;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
