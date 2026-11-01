import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/settings/profile-form";
import { AppearanceForm } from "@/components/settings/appearance-form";
import { AISettingsSection } from "@/components/settings/ai-settings-section";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { getProfile, requireUser } from "@/lib/auth/session";
import { settingsFromPreferences } from "@/features/ai/services/settings";
import { getCloudStatus } from "@/features/ai/services/server";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/settings");
  const [profile, cloud] = await Promise.all([getProfile(), getCloudStatus(supabase, user.id)]);
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const { data: usage } = await supabase.from("ai_usage").select("provider,status,input_tokens,output_tokens").gte("created_at", since).limit(1000);
  const totals = (usage ?? []).reduce(
    (a, r) => ({ requests: a.requests + 1, tokens: a.tokens + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), errors: a.errors + (r.status === "error" ? 1 : 0) }),
    { requests: 0, tokens: 0, errors: 0 },
  );

  return (
    <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, API keys, AI provider and account.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm email={user.email ?? ""} displayName={profile?.display_name ?? ""} avatarUrl={profile?.avatar_url ?? ""} />
        </CardContent>
      </Card>
      <AISettingsSection
        initial={settingsFromPreferences(profile?.preferences)}
        cloud={cloud}
        usageLine={`Last 30 days: ${totals.requests} AI request${totals.requests === 1 ? "" : "s"} · ${totals.tokens.toLocaleString()} tokens · ${totals.errors} failed`}
      />
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in with Google as {user.email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
