"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Avatar } from "@/components/shared/user-menu";
import { api, errorMessage } from "@/lib/api-client";

export function ProfileForm({ email, displayName, avatarUrl }: { email: string; displayName: string; avatarUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/api/profile", { display_name: name, avatar_url: avatar.trim() || null });
      toast.success("Profile updated");
      router.refresh();
    } catch (err) {
      toast.error("Could not update profile", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={name || email} url={avatar || null} className="size-12 text-base" />
        <div className="text-sm">
          <div className="font-medium">{name || "—"}</div>
          <div className="text-muted-foreground">{email}</div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="display-name">Display name</Label>
          <Input id="display-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="avatar-url">Avatar URL</Label>
          <Input id="avatar-url" type="url" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving && <Spinner />} Save profile
        </Button>
      </div>
    </form>
  );
}
