import React, { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";

const LABELS = { name: "Nome", nif: "NIF", address: "Morada", contact_phone: "Telefone geral", contact_email: "Email geral" };

export default function ClientEnrichment({ form, onApply }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(null);
  const signature = JSON.stringify([form.contact_email || "", form.nif || ""]);
  const latestSignature = useRef(signature);
  latestSignature.current = signature;
  useEffect(() => () => request.current?.abort(), []);

  const search = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const { data } = await api.post("/clients/enrich", { email: form.contact_email || "", nif: form.nif || "" }, { signal: controller.signal, timeout: 180000 });
      if (controller.signal.aborted) return;
      if (latestSignature.current !== signature) {
        setError("O email ou NIF mudou durante a pesquisa. Faça uma nova consulta.");
        return;
      }
      const values = Object.fromEntries(Object.entries(data.suggestions).filter(([field, item]) => LABELS[field] && typeof item.value === "string").map(([field, item]) => [field, item.value]));
      onApply(values);
      setResult(data);
    } catch (err) {
      if (err.code !== "ERR_CANCELED") setError(err.code === "ECONNABORTED" ? "A consulta demorou demasiado. Tente novamente mais tarde." : formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      if (!controller.signal.aborted && request.current === controller) setLoading(false);
    }
  };

  const fields = Object.entries(result?.suggestions || {}).filter(([field]) => LABELS[field]);
  return <section className="space-y-2 border-b border-slate-200 pb-3" aria-label="Enriquecimento de dados">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-slate-600">Preencha e-mail corporativo ou NIF da empresa</p>
      <Button type="button" variant="outline" size="sm" onClick={search} disabled={loading || !(form.contact_email?.trim() || form.nif?.trim())} className="shrink-0 rounded-none" data-testid="client-enrich-btn">
        {loading ? <Loader2 size={15} className="mr-1.5 animate-spin" aria-hidden="true" /> : <Sparkles size={15} className="mr-1.5" aria-hidden="true" />}
        {loading ? "A pesquisar…" : "Enriquecimento de dados"}
      </Button>
    </div>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {loading && <p role="status" className="text-xs text-slate-500">A consulta pode demorar até dois minutos.</p>}
    {result && <div className="space-y-1 text-xs" aria-live="polite">
      <p role="status" className="text-slate-600">{fields.length ? "Pesquisa concluída. Os dados encontrados foram aplicados aos campos vazios. Reveja antes de guardar." : "Não foram encontrados dados. Pode continuar a preencher manualmente."}</p>
      {(fields.length > 0 || result.warnings.length > 0) && <details className="text-slate-500">
        <summary className="cursor-pointer">Fontes e avisos</summary>
        <div className="mt-2 space-y-1">
          {result.warnings.map((warning, index) => <p key={index} className="text-amber-800">{warning}</p>)}
          {fields.map(([field, item]) => /^https:\/\//i.test(item.source) && <p key={field}><span>{LABELS[field]}: </span><a href={item.source} target="_blank" rel="noopener noreferrer" className="break-all text-blue-700 underline">Ver fonte{item.method === "local_ai" ? " · IA local" : ""}</a></p>)}
        </div>
      </details>}
    </div>}
  </section>;
}
