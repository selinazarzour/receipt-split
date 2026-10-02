import { env } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; appId: string };

export function firebaseConfig(): FirebaseConfig | null {
  const values = env as unknown as Record<string, string | undefined>;
  const apiKey = values.FIREBASE_API_KEY;
  const authDomain = values.FIREBASE_AUTH_DOMAIN;
  const projectId = values.FIREBASE_PROJECT_ID;
  const appId = values.FIREBASE_APP_ID;
  return apiKey && authDomain && projectId && appId ? { apiKey, authDomain, projectId, appId } : null;
}

const keys = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
));

export async function firebaseUser(request: Request) {
  const config = firebaseConfig();
  if (!config) return null;
  const match = request.headers.get("authorization")?.match(/^Bearer (\S+)$/);
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], keys, {
      algorithms: ["RS256"],
      audience: config.projectId,
      issuer: `https://securetoken.google.com/${config.projectId}`,
    });
    if (!payload.sub || payload.sub.length > 128 ||
        typeof payload.auth_time !== "number" || payload.auth_time > Date.now() / 1000 ||
        typeof payload.iat !== "number" || payload.iat > Date.now() / 1000) return null;
    return { userId: `firebase:${payload.sub}`, displayName: String(payload.name || payload.email || "") };
  } catch {
    return null;
  }
}

export async function ownerUser(request: Request) {
  if (firebaseConfig()) return firebaseUser(request);
  return getChatGPTUser();
}
