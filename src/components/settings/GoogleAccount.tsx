import { auth, authEnabled, signIn, signOut } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function GoogleAccount() {
  if (!authEnabled) {
    return (
      <p className="text-xs text-muted-foreground">
        Google sign-in: not configured — set <code>AUTH_GOOGLE_ID</code> and{" "}
        <code>AUTH_GOOGLE_SECRET</code> in <code>.env</code>.
      </p>
    );
  }

  const session = await auth();
  const user = session?.user;

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">Not signed in.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/settings" });
          }}
        >
          <Button type="submit" size="sm" variant="outline">
            Sign in with Google
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-9">
        {user.image && <AvatarImage src={user.image} />}
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <form
        className="ml-auto"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button type="submit" size="sm" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
