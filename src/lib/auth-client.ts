// app/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	// En production ou dev, il se base sur l'URL courante du navigateur
	baseURL: typeof window !== "undefined" ? window.location.origin : undefined,
});
