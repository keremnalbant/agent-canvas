import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const ALLOWED_DOMAIN = "blackforestlabs.ai"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      return profile?.email?.endsWith(`@${ALLOWED_DOMAIN}`) ?? false
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
