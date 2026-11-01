import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderSettingsForm } from "@/components/ai/provider-settings";
import { ProfileForm } from "@/components/settings/profile-form";
import { AppearanceForm } from "@/components/settings/appearance-form";
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
        <p className="text-sm text-muted-foreground">Manage your profile, AI provider and appearance.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm email={user.email ?? ""} displayName={profile?.display_name ?? ""} avatarUrl={profile?.avatar_url ?? ""} />
        </CardContent>
      </Card>
      <Card id="ai">
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>Use your own Gemini API key, or run models locally with Ollama. Diagram Studio never switches providers on its own.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProviderSettingsForm initial={settingsFromPreferences(profile?.preferences)} cloud={cloud} />
          <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
            Last 30 days: {totals.requests} AI request{totals.requests === 1 ? "" : "s"} · {totals.tokens.toLocaleString()} tokens · {totals.errors} failed
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <AppearanceForm />
        </CardContent>
      </Card>
    </div>
  );
}
