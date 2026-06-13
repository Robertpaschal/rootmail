"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { KEY_COOKIE } from "@/lib/session";

export async function signOut() {
  (await cookies()).delete(KEY_COOKIE);
  redirect("/connect");
}
