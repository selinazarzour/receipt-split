import { getChatGPTUser } from "@/app/chatgpt-auth";
import { firebaseUser } from "@/lib/firebase-server";
import { db, errorResponse } from "@/lib/storage";

// Both identities must be present on this request. A prior ChatGPT owner may
// move their own receipts to their Google account, without exposing either token.
export async function POST(request: Request) {
  const [previous, next] = await Promise.all([getChatGPTUser(), firebaseUser(request)]);
  if (!previous || !next) return Response.json({ error: "Sign in to both accounts to transfer history." }, { status: 401 });
  try {
    const result = await db().prepare("UPDATE receipts SET owner_id = ? WHERE owner_id = ?")
      .bind(next.userId, previous.userId).run();
    return Response.json({ moved: result.meta.changes || 0 });
  } catch (error) { return errorResponse(error); }
}
