import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import Onboarding from "./wizard";

export default async function FirstAccessPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) redirect("/login");
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.user_metadata?.hub_school_onboarding_completed === true) redirect("/home");
  }
  return <Onboarding />;
}
