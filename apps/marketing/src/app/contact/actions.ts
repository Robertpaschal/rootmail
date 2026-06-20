"use server";

// The marketing site has no backend deps — it talks to the rootmail API over
// HTTP, server-side, exactly like the dashboard/admin do. Override per env with
// ROOTMAIL_API_URL; defaults to local dev.
const API_URL = process.env.ROOTMAIL_API_URL ?? "http://localhost:4000";

export type ContactState = { ok?: boolean; error?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export async function submitLead(_prev: ContactState, fd: FormData): Promise<ContactState> {
  const name = str(fd, "name");
  const email = str(fd, "email");

  if (!name) return { error: "Please tell us your name." };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Please enter a valid work email." };
  }

  const payload = {
    name,
    email,
    company: str(fd, "company") || undefined,
    website: str(fd, "website") || undefined,
    phone: str(fd, "phone") || undefined,
    company_size: str(fd, "company_size") || undefined,
    expected_volume: str(fd, "expected_volume") || undefined,
    current_provider: str(fd, "current_provider") || undefined,
    message: str(fd, "message") || undefined,
    source: str(fd, "source") || "contact_form",
    company_fax: str(fd, "company_fax"), // honeypot
  };

  let res: Response;
  try {
    res = await fetch(new URL("/v1/leads", API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return { error: "We couldn't reach us just now. Please try again in a moment." };
  }

  if (res.status === 429) {
    return { error: "Too many requests. Please wait a minute and try again." };
  }
  if (!res.ok) {
    return { error: "Something went wrong submitting the form. Please try again." };
  }

  return { ok: true };
}
