import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { githubUserIdToUuid } from "./src/lib/auth/identity";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "github" && user?.id) {
        token.sub = githubUserIdToUuid(user.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
