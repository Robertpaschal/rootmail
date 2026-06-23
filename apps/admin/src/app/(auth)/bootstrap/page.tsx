import type { Metadata } from "next";
import { Logo } from "@/components/app/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BootstrapForm } from "./bootstrap-form";

export const metadata: Metadata = { title: "First-run setup" };

export default function BootstrapPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Create the first staff account</CardTitle>
            <CardDescription>
              One-time setup. This creates the first superadmin and only works while no staff exist yet,
              using your deployment&apos;s bootstrap secret.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BootstrapForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
