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

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) nav("/");
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block relative bg-[#002FA7]">
        <img
          alt=""
          src="https://images.unsplash.com/photo-1767300258298-21f93cbe723f?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMjh8MHwxfHNlYXJjaHwzfHxwcm9mZXNzaW9uYWwlMjBtb2Rlcm4lMjBvZmZpY2UlMjBhYnN0cmFjdHxlbnwwfHx8fDE3ODI5NDI1MDR8MA&ixlib=rb-4.1.0&q=85"
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="relative h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white" />
            <span className="font-display font-black text-2xl">WhyMob</span>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/70 mb-3">Gestão Comercial</div>
            <h1 className="font-display font-black text-5xl leading-[1.05] tracking-tight max-w-md">
              Do primeiro contacto ao Fulfilled — controlado, rastreável, previsível.
            </h1>
            <p className="mt-6 text-white/80 max-w-md text-sm leading-relaxed">
              Funil comercial, VAB em paralelo com valor de venda, e reconciliação
              financeira em cada fase do ciclo.
            </p>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/50">© WhyMob</div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">Iniciar sessão</div>
            <h2 className="font-display font-black text-3xl tracking-tight mt-1">Aceder ao CRM</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid={LOGIN.emailInput}
              required
              className="rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Palavra-passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid={LOGIN.passwordInput}
              required
              className="rounded-none"
            />
          </div>

          {error && (
            <div className="text-sm text-[#FF2A00] border border-[#FF2A00]/30 bg-[#FF2A00]/5 px-3 py-2" data-testid="login-error">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            data-testid={LOGIN.submitButton}
            className="w-full rounded-none bg-[#002FA7] hover:bg-[#002277] text-white h-11"
          >
            {loading ? "A entrar…" : "Entrar"}
          </Button>

          <div className="text-xs text-neutral-500 border-t border-neutral-200 pt-4">
            
          </div>
        </form>
      </div>
    </div>
  );
}
