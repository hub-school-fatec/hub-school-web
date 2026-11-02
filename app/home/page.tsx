import { redirect } from "next/navigation";
import Dashboard from "./dashboard";
import { createClient } from "../../lib/supabase/server";
import { isSupabaseConfigured } from "../../lib/supabase/config";

export default async function HomePage() {
  let profile = { name: "Bruno Eduardo", email: "" };
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) redirect("/login");

    const { data: userData, error } = await supabase.auth.getUser();
    if (!error && userData.user) {
      const email = userData.user.email ?? "";
      const metadata = userData.user.user_metadata as Record<string, unknown>;
      const metadataName = metadata.full_name ?? metadata.name;
      profile = {
        name: typeof metadataName === "string" && metadataName.trim() ? metadataName : email.split("@")[0] || "Estudante",
        email,
      };
    }
  }
  return <Dashboard profile={profile} />;
}
