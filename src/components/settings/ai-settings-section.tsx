"use client";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProviderSettingsForm } from "@/components/ai/provider-settings";
import type { AISettings, CloudStatus } from "@/features/ai/services/settings";
import { ApiKeysCard } from "./api-keys-card";

/** API keys + AI provider, sharing one view of the user's cloud setup. */
export function AISettingsSection({ initial, cloud: initialCloud, usageLine }: { initial: AISettings; cloud: CloudStatus; usageLine: string }) {
  const [cloud, setCloud] = useState(initialCloud);
  return (
    <>
      <Card id="api-keys">
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Store your own keys. Diagram Studio never uses a shared key.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeysCard cloud={cloud} onChange={setCloud} />
        </CardContent>
      </Card>
      <Card id="ai">
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>Choose Gemini (with your key) or local Ollama, and the model to use. Diagram Studio never switches providers on its own.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProviderSettingsForm key={`${cloud.hasKey}:${cloud.keyHint}`} initial={initial} cloud={cloud} keySource="settings" onSaved={(_s, c) => setCloud(c)} />
          <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">{usageLine}</p>
        </CardContent>
      </Card>
    </>
  );
}
