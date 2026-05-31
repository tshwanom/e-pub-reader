import { compare } from 'bcryptjs';
import { type GetServerSidePropsContext, type NextApiRequest, type NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import {
  generateMagicLoginCode,
  MAGIC_LOGIN_MAX_AGE_MINUTES,
  normalizeAuthEmail,
  sendMagicLoginEmail,
} from '@/lib/auth-email';
import { prisma } from '@/lib/prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    EmailProvider({
      from: process.env.RESEND_FROM_EMAIL,
      maxAge: MAGIC_LOGIN_MAX_AGE_MINUTES * 60,
      // allowDangerousEmailAccountLinking is a valid next-auth v4 runtime option
      // but is absent from the EmailUserConfig TS type in this version — cast required.
      ...(({ allowDangerousEmailAccountLinking: true } as any)),
      normalizeIdentifier(identifier) {
        return normalizeAuthEmail(identifier);
      },
      async generateVerificationToken() {
        return generateMagicLoginCode();
      },
      async sendVerificationRequest({ identifier, url, token }) {
        await sendMagicLoginEmail({
          identifier,
          url,
          token,
        });
      },
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'hello@example.com' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const email = normalizeAuthEmail(credentials.email);

        // 1. Check if password is a valid secure one-time verification token
        const verificationToken = await prisma.verificationToken.findFirst({
          where: {
            identifier: email,
            token: credentials.password,
            expires: { gt: new Date() },
          },
        });

        if (verificationToken) {
          // Token matches and is valid! Consume it immediately
          await prisma.verificationToken.delete({
            where: { token: verificationToken.token },
          });

          // Find or silently create the user (since they verified via payment/email)
          let user = await prisma.user.findUnique({
            where: {
              email,
            },
          });

          if (!user) {
            user = await prisma.user.create({
              data: {
                email,
                emailVerified: new Date(),
              },
            });
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          };
        }

        // 2. Fall back to standard password verification
        const user = await prisma.user.findUnique({
          where: {
            email,
          },
        });

        if (!user || !user.password) {
          return null;
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || token.role || 'READER';
      }

      if (trigger === "update" && session) {
        token = { ...token, ...session };
      }
      return token;
    },
  },
};

export function auth(
  ...args:
    | [GetServerSidePropsContext["req"], GetServerSidePropsContext["res"]]
    | [NextApiRequest, NextApiResponse]
    | []
) {
  return getServerSession(...args, authOptions);
}
