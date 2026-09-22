import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth is OPTIONAL: if AUTH_GOOGLE_ID/SECRET are not configured the app runs
 * open (Tailscale is the network boundary). Once env vars are set, `proxy.ts`
 * starts enforcing the login gate automatically.
 */
export const authEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: authEnabled
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
          authorization: {
            params: {
              scope:
                "openid email profile https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/drive.readonly",
              access_type: "offline",
              prompt: "consent",
            },
          },
        }),
      ]
    : [],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3500 * 1000;
        return token;
      }
      // Token still valid
      if (Date.now() < ((token.expiresAt as number) ?? 0)) return token;
      // Refresh expired token
      try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID!,
            client_secret: process.env.AUTH_GOOGLE_SECRET!,
            grant_type: "refresh_token",
            refresh_token: (token.refreshToken as string) ?? "",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw data;
        token.accessToken = data.access_token;
        token.expiresAt = Date.now() + data.expires_in * 1000;
        if (data.refresh_token) token.refreshToken = data.refresh_token;
      } catch (e) {
        console.error("[auth] token refresh failed", e);
        token.error = "RefreshTokenError";
      }
      return token;
    },
    async session({ session, token }) {
      (session as { accessToken?: string }).accessToken =
        token.accessToken as string | undefined;
      return session;
    },
  },
  session: { strategy: "jwt" },
  trustHost: true,
});
