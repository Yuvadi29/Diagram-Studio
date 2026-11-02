import { Suspense } from "react";
import { AppSidebar } from "@/components/shared/app-sidebar";
import { getProfile, requireUser } from "@/lib/auth/session";
import { checkSchema } from "@/lib/auth/schema-check";
import { SetupRequired } from "@/components/shared/setup-required";
import { Backdrop } from "@/components/shared/backdrop";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const setupProblem = await checkSchema(supabase);
  if (setupProblem) return <SetupRequired detail={setupProblem} />;
  const profile = await getProfile();
  const name = profile?.display_name || user.email?.split("@")[0] || "You";
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Suspense>
        <AppSidebar user={{ name, email: user.email ?? "", avatarUrl: profile?.avatar_url }} />
      </Suspense>
      <main className="ds-backdrop-host min-w-0 flex-1">
        <Backdrop />
        {children}
      </main>
    </div>
  );
}
