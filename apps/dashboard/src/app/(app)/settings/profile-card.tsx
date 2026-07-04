"use client";

import { type ChangeEvent, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Camera, Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  removeProfileAvatar,
  saveProfileName,
  uploadProfileAvatar,
  type ProfileState,
} from "./actions";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB — generous for an avatar, under the action limit

// Initials fallback when there's no picture: first + last token of the name, or email.
function initials(name: string, email: string): string {
  const base = name.trim() || email;
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? base[0] ?? "?";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export function ProfileCard({
  name,
  email,
  verified,
  avatarUrl,
  workspace,
}: {
  name: string;
  email: string;
  verified: boolean;
  avatarUrl: string | null;
  workspace: string;
}) {
  // View-first: the profile is presented, and editing is a deliberate step.
  const [editing, setEditing] = useState(false);
  const [nameState, saveName, savingName] = useActionState<ProfileState | null, FormData>(
    saveProfileName,
    null,
  );
  const [displayName, setDisplayName] = useState(name);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Saving the name closes the editor and reflects the new value.
  useEffect(() => {
    if (nameState?.ok) {
      setDisplayName(nameState.name ?? "");
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameState]);

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-selected later
    if (!file) return;
    setAvatarError(null);
    if (!file.type.startsWith("image/")) {
      setAvatarError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Image is too large — use one under 2MB.");
      return;
    }
    setAvatar(URL.createObjectURL(file)); // optimistic preview while it uploads
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await uploadProfileAvatar(fd);
      if (res.error) {
        setAvatar(avatarUrl); // revert to the server value
        setAvatarError(res.error);
      }
    });
  };

  const onRemove = () => {
    setAvatarError(null);
    setAvatar(null);
    start(async () => {
      const res = await removeProfileAvatar();
      if (res.error) {
        setAvatar(avatarUrl);
        setAvatarError(res.error);
      }
    });
  };

  const AvatarCircle = (
    <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-lg font-semibold text-foreground">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="size-full object-cover" />
      ) : (
        initials(displayName, email)
      )}
    </span>
  );

  const IdentityGrid = (
    <div className="grid gap-5 border-t pt-5 sm:grid-cols-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{email || "—"}</span>
          {verified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Unverified</Badge>}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
        <p className="mt-1 text-sm font-medium">{workspace || "—"}</p>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>Your name and picture, shown across rootmail.</CardDescription>
        </div>
        {!editing ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Edit
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        {!editing ? (
          <>
            <div className="flex items-center gap-4">
              {AvatarCircle}
              <div className="min-w-0">
                <p className="truncate text-lg font-medium">{displayName || "—"}</p>
                <p className="truncate text-sm text-muted-foreground">{email}</p>
              </div>
            </div>
            {IdentityGrid}
          </>
        ) : (
          <>
            <div className="flex items-center gap-4">
              {AvatarCircle}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={onPick}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => fileRef.current?.click()}
                  >
                    {pending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
                    {avatar ? "Change picture" : "Upload picture"}
                  </Button>
                  {avatar ? (
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">PNG, JPEG, GIF, or WEBP — up to 2MB.</p>
                {avatarError ? <p className="text-xs text-destructive">{avatarError}</p> : null}
              </div>
            </div>

            <form action={saveName} className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  id="name"
                  name="name"
                  defaultValue={displayName}
                  maxLength={120}
                  placeholder="Your name"
                  className="sm:max-w-xs"
                />
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" disabled={savingName} className="shrink-0">
                    {savingName ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save
                    {nameState?.ok && !savingName ? <Check className="size-4" /> : null}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={savingName}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              {nameState?.error ? <p className="text-sm text-destructive">{nameState.error}</p> : null}
            </form>

            {IdentityGrid}
          </>
        )}
      </CardContent>
    </Card>
  );
}
