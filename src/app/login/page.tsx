import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import Link from "next/link";
import { Layers } from "lucide-react";
import { PublicShell } from "@/components/layout/PublicShell";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/admin");

  return (
    <PublicShell>
      <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10 sm:px-6 sm:py-16">
        <Link href="/" className="mb-8 flex min-h-11 items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/50 bg-primary/20">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <span className="font-headline text-xl text-primary">AH Sports</span>
        </Link>
        <div className="rounded-md border border-outline-variant bg-surface-container-low p-5 sm:p-8">
          <h1 className="mb-2 font-headline text-2xl text-on-surface">Acceso interno</h1>
          <p className="mb-6 text-sm text-on-surface-variant">Panel administrativo y de taller.</p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-on-surface-variant">
          ¿Sos cliente? <Link href="/presupuesto" className="text-primary hover:underline">Solicitar presupuesto</Link>
        </p>
      </div>
    </PublicShell>
  );
}
