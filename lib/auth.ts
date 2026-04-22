import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  trustHost: true,
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      id: 'email-password',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        };
      },
    }),
    Credentials({
      id: 'dev-auto',
      name: 'Dev Auto',
      credentials: {},
      async authorize() {
        if (process.env.NEXT_PUBLIC_IS_PROD === 'true') return null;

        let user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
        if (!user) {
          const hashedPassword = await bcrypt.hash('dev', 10);
          user = await prisma.user.create({
            data: {
              email: 'dev@localhost',
              password: hashedPassword,
              name: 'Dev User',
            },
          });
        }

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
