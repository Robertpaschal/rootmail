import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/app/nav";
import { Topbar } from "@/components/app/topbar";
import { getSessionToken } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Belt-and-braces alongside middleware: never render the shell without a session.
  const token = await getSessionToken();
  if (!token) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-60">
        <Topbar />
        <MobileNav />
        <main className="mx-auto max-w-6xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
