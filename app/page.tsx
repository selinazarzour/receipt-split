import { getChatGPTUser } from "./chatgpt-auth";
import { firebaseConfig } from "@/lib/firebase-server";
import Workspace from "./workspace";

export const dynamic = "force-dynamic";
export default async function Home() {
  const config = firebaseConfig();
  const user = await getChatGPTUser();
  return <Workspace signedIn={!config && !!user} displayName={!config ? user?.fullName || user?.email || "" : ""}
    firebaseConfig={config} canTransferHistory={!!config && !!user} />;
}
