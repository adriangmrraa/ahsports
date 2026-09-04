import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import Link from "next/link";
import { Layers } from "lucide-react";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/admin");

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-md bg-primary/20 flex items-center justify-center border border-primary/50">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <span className="font-headline text-xl text-primary">AH Sports</span>
        </Link>
        <div className="glass-panel rounded-lg p-8">
          <h1 className="font-headline text-2xl text-on-surface mb-2">Acceso interno</h1>
          <p className="text-sm text-on-surface-variant mb-6">Panel administrativo y de taller.</p>
          <LoginForm />
        </div>
        <p className="text-center mt-6 text-xs text-on-surface-variant">
          ¿Sos cliente? <Link href="/presupuesto" className="text-primary hover:underline">Solicitar presupuesto</Link>
        </p>
      </div>
    </div>
  );
}