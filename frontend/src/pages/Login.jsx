import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LOGIN } from "@/constants/testIds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { user, login, error } = useAuth();
  const [email, setEmail] = useState("admin@whymob.pt");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  if (user) return <Navigate to="/" replace />;
  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) nav("/");
  };

  return <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(1200px_600px_at_50%_-10%,#17323a_0%,#14181f_55%)]">
    <form onSubmit={onSubmit} className="w-full max-w-[380px] rounded-[18px] border border-[var(--wc-border)] bg-white p-8 shadow-[0_24px_60px_rgba(0,0,0,.35)] space-y-5">
      <div className="mb-6"><div className="flex items-center gap-2"><div className="h-7 w-7 rounded-md bg-[#14E0E0] shadow-[0_0_14px_rgba(20,224,224,.35)]" /><span className="font-display text-xl font-black tracking-tight text-slate-900">WhyMob</span></div><div className="mt-1 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-400">Gestão Comercial</div></div>
      <div><h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">Bem-vindo de volta</h1><p className="mt-1 text-[13.5px] text-slate-500">Inicie sessão para aceder ao CRM.</p></div>
      <div className="space-y-2"><Label htmlFor="email" className="text-[12.5px] font-medium text-slate-600">Email</Label><Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} data-testid={LOGIN.emailInput} required /></div>
      <div className="space-y-2"><Label htmlFor="password" className="text-[12.5px] font-medium text-slate-600">Palavra-passe</Label><Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} data-testid={LOGIN.passwordInput} required /></div>
      {error && <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700" data-testid="login-error">{error}</div>}
      <Button type="submit" disabled={loading} data-testid={LOGIN.submitButton} className="w-full h-11">{loading ? "A entrar…" : "Entrar"}</Button>
    </form>
  </div>;
}
