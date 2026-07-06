import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, dateShort, ORDER_STATUS } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";

const PLAN_TYPES = ["setup", "mensalidade", "trimestralidade", "anuidade", "avos", "consumo_horas", "projeto", "outros"];
const PAY_METHODS = ["transferencia", "cartao", "mbway", "cheque", "numerario", "outro"];

const PLAN_STATUS_STYLE = {
  planeada: "bg-neutral-100 text-neutral-800",
  parcialmente_faturada: "bg-[#FEF08A] text-[#854D0E]",
  faturada: "bg-[#DCFCE7] text-[#00A859]",
  cancelada: "bg-[#FEE2E2] text-[#B91C1C]",
};

export default function OrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [planLines, setPlanLines] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [recon, setRecon] = useState(null);
  const [proposalLines, setProposalLines] = useState([]);
  const [products, setProducts] = useState([]);
  const [manufs, setManufs] = useState([]);
  const [invOpen, setInvOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null);
  const [payForm, setPayForm] = useState({ amount: 0, method: "transferencia", reference: "" });
  const [invForm, setInvForm] = useState({ lines: [] });

  useEffect(() => {
    let active = true;

    async function load() {
      const [oRes, plan, inv, pay, rec, prd, mf] = await Promise.all([
        api.get("/orders").then((r) => r.data.find((o) => o.id === id)),
        api.get(`/orders/${id}/plan`),
        api.get(`/invoices?order_id=${id}`),
        api.get(`/payments?order_id=${id}`),
        api.get(`/orders/${id}/reconcile`),
        api.get("/products"),
        api.get("/manufacturers"),
      ]);
      if (!active) return;
      setOrder(oRes);
      setPlanLines(plan.data.lines);
      setInvoices(inv.data);
      setPayments(pay.data);
      setRecon(rec.data);
      setProducts(prd.data);
      setManufs(mf.data);
      if (oRes?.proposal_id) {
        try {
          const proposal = await api.get(`/proposals/${oRes.proposal_id}`);
          if (!active) return;
          setProposalLines(proposal.data.lines || []);
        } catch {
          if (!active) return;
          setProposalLines([]);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id]);

  if (!order) return <div className="p-8 text-sm text-neutral-500">A carregar…</div>;

  const productName = (productId) => products.find((product) => product.id === productId)?.name || "—";
  const productManuf = (productId) => {
    const prod = products.find((product) => product.id === productId);
    if (!prod?.manufacturer_id) return "—";
    return manufs.find((manuf) => manuf.id === prod.manufacturer_id)?.name || "—";
  };

  const addPlanLine = () => setPlanLines([
    ...planLines,
    { id: `new-${Date.now()}`, type: "mensalidade", description: "", expected_date: "", value: 0, vab: 0, status: "planeada", invoiced_amount: 0 },
  ]);
  const updatePlanLine = (index, patch) => setPlanLines(planLines.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  const removePlanLine = (index) => {
    const line = planLines[index];
    if ((line.invoiced_amount || 0) > 0) {
      toast.error("Linha já faturada, não pode ser removida");
      return;
    }
    setPlanLines(planLines.filter((_, idx) => idx !== index));
  };

  const reload = async () => {
    const [oRes, plan, inv, pay, rec, prd, mf] = await Promise.all([
      api.get("/orders").then((r) => r.data.find((o) => o.id === id)),
      api.get(`/orders/${id}/plan`),
      api.get(`/invoices?order_id=${id}`),
      api.get(`/payments?order_id=${id}`),
      api.get(`/orders/${id}/reconcile`),
      api.get("/products"),
      api.get("/manufacturers"),
    ]);
    setOrder(oRes);
    setPlanLines(plan.data.lines);
    setInvoices(inv.data);
    setPayments(pay.data);
    setRecon(rec.data);
    setProducts(prd.data);
    setManufs(mf.data);
    if (oRes?.proposal_id) {
      try {
        const proposal = await api.get(`/proposals/${oRes.proposal_id}`);
        setProposalLines(proposal.data.lines || []);
      } catch {
        setProposalLines([]);
      }
    }
  };

  if (!order) return <div className="p-8 text-sm text-neutral-500">A carregar…</div>;

  const productName = (pid) => products.find((p) => p.id === pid)?.name || "—";
  const productManuf = (pid) => {
    const prod = products.find((p) => p.id === pid);
    if (!prod?.manufacturer_id) return "—";
    return manufs.find((m) => m.id === prod.manufacturer_id)?.name || "—";
  };

  // Plan editing
  const addPlanLine = () =>
    setPlanLines([...planLines, { id: `new-${Date.now()}`, type: "mensalidade", description: "", expected_date: "", value: 0, status: "planeada", invoiced_amount: 0 }]);
  const updatePlanLine = (idx, patch) => setPlanLines(planLines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removePlanLine = (idx) => {
    const l = planLines[idx];
    if ((l.invoiced_amount || 0) > 0) { toast.error("Linha já faturada, não pode ser removida"); return; }
    setPlanLines(planLines.filter((_, i) => i !== idx));
  };
  const savePlan = async () => {
    try {
      const clean = planLines.map((l) => ({
        id: l.id?.startsWith("new-") ? undefined : l.id,
        type: l.type, description: l.description,
        expected_date: l.expected_date || null,
        value: Number(l.value) || 0,
      }));
      const { data } = await api.put(`/orders/${id}/plan`, { lines: clean });
      setPlanLines(data.lines);
      toast.success("Plano guardado");
      reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const planTotal = planLines.filter((l) => l.status !== "cancelada").reduce((s, l) => s + (Number(l.value) || 0), 0);
  const planDelta = planTotal - order.total_net;

  const openInvoice = () => {
    const seed = planLines
      .filter((l) => l.status !== "cancelada" && (l.value - (l.invoiced_amount || 0)) > 0.001)
      .map((l) => ({ plan_line_id: l.id, amount: 0, description: l.description, remaining: l.value - (l.invoiced_amount || 0), _selected: false }));
    setInvForm({ lines: seed, vat_pct: 23 });
    setInvOpen(true);
  };

  const submitInvoice = async () => {
    try {
      const lines = invForm.lines.filter((l) => l._selected && l.amount > 0).map((l) => ({ plan_line_id: l.plan_line_id, amount: Number(l.amount), description: l.description }));
      if (!lines.length) { toast.error("Selecione pelo menos 1 linha"); return; }
      await api.post("/invoices", { order_id: id, lines, vat_pct: invForm.vat_pct });
      toast.success("Fatura emitida");
      setInvOpen(false);
      reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const submitPayment = async () => {
    try {
      await api.post("/payments", { invoice_id: payOpen, amount: Number(payForm.amount), method: payForm.method, reference: payForm.reference });
      toast.success("Recebimento registado");
      setPayOpen(null);
      reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const cancelInvoice = async (invoiceId) => {
    const reason = window.prompt("Motivo de anulação:");
    if (!reason) return;
    try {
      await api.post(`/invoices/${invoiceId}/cancel`, { reason });
      toast.success("Fatura anulada");
      reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        kicker={`Encomenda · ${dateShort(order.order_date)}`}
        title={order.number}
        actions={<Link to="/encomendas"><Button variant="ghost" className="rounded-none"><ChevronLeft size={14} className="mr-1" /> Voltar</Button></Link>}
      />
      <div className="p-8 space-y-8">
        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Reconciliação</div>
          <div className="grid grid-cols-4 gap-0 border border-neutral-200">
            {[
              { label: "Encomenda", value: recon?.order.value, vab: recon?.order.vab, sub: null, testid: "recon-order" },
              { label: "Planeado", value: recon?.plan.value, vab: null, sub: null, testid: "recon-plan" },
              { label: "Faturado (s/IVA)", value: recon?.invoiced.value, vab: null, sub: recon?.invoiced.gross ? `c/IVA ${eur(recon.invoiced.gross)}` : null, testid: "recon-invoiced" },
              { label: "Recebido (c/IVA)", value: recon?.received.value, vab: null, sub: null, testid: "recon-received" },
            ].map((c, i) => (
              <div key={c.label} className={`p-5 ${i < 3 ? "border-r border-neutral-200" : ""}`} data-testid={c.testid}>
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">{c.label}</div>
                <div className="mt-2 font-mono text-xl">{eur(c.value)}</div>
                {c.vab !== null && c.vab !== undefined && <div className="text-xs text-neutral-500 mt-1">VAB <span className="font-mono">{eur(c.vab)}</span></div>}
                {c.sub && <div className="text-[10px] text-neutral-400 mt-1 font-mono">{c.sub}</div>}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-2 items-center">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</span>
              <Badge className="rounded-none bg-neutral-900 text-white" data-testid="order-status-badge">{ORDER_STATUS[order.status]}</Badge>
            </div>
            <div className="text-xs text-neutral-500 flex gap-4 font-mono">
              <span>Δ Plano: <span className={Math.abs(recon?.deltas.plan_vs_order || 0) > 0.5 ? "text-[#FF2A00]" : "text-[#00A859]"}>{eur(recon?.deltas.plan_vs_order)}</span></span>
              <span>Δ Faturado: <span className={Math.abs(recon?.deltas.invoiced_vs_plan || 0) > 0.5 ? "text-[#FF2A00]" : "text-[#00A859]"}>{eur(recon?.deltas.invoiced_vs_plan)}</span></span>
              <span>Δ Recebido: <span className={Math.abs(recon?.deltas.received_vs_invoiced || 0) > 0.5 ? "text-[#FF2A00]" : "text-[#00A859]"}>{eur(recon?.deltas.received_vs_invoiced)}</span></span>
            </div>
          </div>
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Composição Comercial</div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2">
              <div className="col-span-4">Produto/Serviço</div>
              <div className="col-span-3">Fabricante</div>
              <div className="col-span-1 text-right">Qtd</div>
              <div className="col-span-2 text-right">Preço unit.</div>
              <div className="col-span-2 text-right">Total</div>
            </div>
            {proposalLines.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="composition-empty">Sem linhas comerciais.</div>}
            {proposalLines.map((line, index) => {
              const net = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) * (1 - (Number(line.discount_pct) || 0) / 100);
              return (
                <div key={index} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 text-sm items-center" data-testid={`order-line-${index}`}>
                  <div className="col-span-4">
                    <div className="font-medium text-xs">{line.description || productName(line.product_id)}</div>
                    <div className="text-[10px] text-neutral-500">{productName(line.product_id)}</div>
                  </div>
                  <div className="col-span-3 text-xs text-neutral-700" data-testid={`order-line-manuf-${index}`}>{productManuf(line.product_id)}</div>
                  <div className="col-span-1 text-right font-mono text-xs">{line.quantity}</div>
                  <div className="col-span-2 text-right font-mono text-xs">{eur(line.unit_price)}</div>
                  <div className="col-span-2 text-right font-mono text-xs">{eur(net)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Plano de Faturação</div>
              <div className="text-xs text-neutral-500 mt-1 font-mono">
                Total plano <span className="text-neutral-900">{eur(planTotal)}</span>
                {" · "}
                <span className={Math.abs(planDelta) > 0.5 ? "text-[#FF2A00]" : "text-[#00A859]"}>
                  Δ Encomenda {eur(planDelta)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={addPlanLine} data-testid="plan-add-line" className="rounded-none bg-neutral-900 text-white hover:bg-neutral-700"><Plus size={14} className="mr-1" /> Nova linha</Button>
              <Button size="sm" onClick={savePlan} data-testid="plan-save-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar plano</Button>
            </div>
          </div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2 gap-2">
              <div className="col-span-2">Tipo</div>
              <div className="col-span-3">Descrição</div>
              <div className="col-span-2">Data prevista</div>
              <div className="col-span-2 text-right">Valor</div>
              <div className="col-span-1 text-right">Faturado</div>
              <div className="col-span-1">Estado</div>
              <div className="col-span-1"></div>
            </div>
            {planLines.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="plan-empty">Sem plano. Adicione linhas para começar.</div>}
            {planLines.map((line, index) => (
              <div key={line.id || index} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 items-center gap-2" data-testid={`plan-line-${index}`}>
                <Select value={line.type} onValueChange={(value) => updatePlanLine(index, { type: value })}>
                  <SelectTrigger className="col-span-2 rounded-none h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLAN_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={l.description || ""} onChange={(e) => updatePlanLine(i, { description: e.target.value })} className="col-span-3 rounded-none h-8 text-xs" />
                <Input type="date" value={(l.expected_date || "").slice(0, 10)} onChange={(e) => updatePlanLine(i, { expected_date: e.target.value })} className="col-span-2 rounded-none h-8 text-xs font-mono" />
                <Input type="number" value={l.value} onChange={(e) => updatePlanLine(i, { value: e.target.value })} className="col-span-2 rounded-none h-8 text-right font-mono" data-testid={`plan-value-${i}`} />
                <div className="col-span-1 text-right font-mono text-xs">{eur(l.invoiced_amount || 0)}</div>
                <div className="col-span-1"><Badge className={`${PLAN_STATUS_STYLE[l.status] || ""} rounded-none font-normal text-[10px]`}>{l.status}</Badge></div>
                <div className="col-span-1 text-right">
                  <Button size="sm" variant="ghost" onClick={() => removePlanLine(index)} className="rounded-none text-[#FF2A00] h-7"><Trash2 size={12} /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Faturas</div>
            <Button size="sm" onClick={openInvoice} data-testid="new-invoice-btn" disabled={planLines.filter((line) => (line.value - (line.invoiced_amount || 0)) > 0.001 && line.status !== "cancelada").length === 0} className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white"><Plus size={14} className="mr-1" /> Emitir fatura</Button>
          </div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2">
              <div className="col-span-2">Número</div><div className="col-span-2">Data</div>
              <div className="col-span-2 text-right">Total s/IVA</div><div className="col-span-2 text-right">Total c/IVA</div>
              <div className="col-span-1 text-right">Recebido</div><div className="col-span-2">Estado</div><div className="col-span-1 text-right">Ações</div>
            </div>
            {invoices.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="invoices-empty">Sem faturas emitidas.</div>}
            {invoices.map((inv) => (
              <div key={inv.id} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 text-sm items-center" data-testid={`invoice-row-${inv.id}`}>
                <div className="col-span-2 font-mono">{inv.number}</div>
                <div className="col-span-2 text-xs font-mono text-neutral-600">{dateShort(inv.issued_at)}</div>
                <div className="col-span-2 text-right font-mono">{eur(inv.total_net)}</div>
                <div className="col-span-2 text-right font-mono">{eur(inv.total_gross)}</div>
                <div className="col-span-1 text-right font-mono">{eur(inv.received_amount)}</div>
                <div className="col-span-2"><Badge className="rounded-none font-normal">{inv.status}</Badge></div>
                <div className="col-span-1 text-right flex justify-end gap-1">
                  <a
                    href={`${import.meta.env ? "" : ""}${window.location.origin}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const token = localStorage.getItem("whymob_token");
                      fetch(`${window.__API_BASE__ || ""}/api/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
                        .then((r) => r.blob())
                        .then((b) => { const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `fatura-${inv.number}.pdf`; a.click(); });
                    }}
                    data-testid={`pdf-invoice-${inv.id}`}
                    className="rounded-none text-[#002FA7] text-xs h-7 flex items-center hover:underline"
                    title="Descarregar PDF"
                  >PDF</a>
                  {inv.status !== "anulada" && inv.status !== "recebida" && (
                    <Button size="sm" onClick={() => { setPayOpen(inv.id); setPayForm({ amount: (inv.total_gross || inv.total_net) - inv.received_amount, method: "transferencia", reference: "", _invGross: inv.total_gross }); }} data-testid={`pay-invoice-${inv.id}`} className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white text-xs h-7">Receber</Button>
                  )}
                  {invoice.status !== "anulada" && (
                    <Button size="sm" variant="ghost" onClick={() => cancelInvoice(invoice.id)} data-testid={`cancel-invoice-${invoice.id}`} className="rounded-none text-[#FF2A00] text-xs h-7">×</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Recebimentos</div>
          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2">
              <div className="col-span-3">Data</div><div className="col-span-3">Fatura</div>
              <div className="col-span-2 text-right">Valor</div><div className="col-span-2">Método</div><div className="col-span-2">Referência</div>
            </div>
            {payments.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="payments-empty">Sem recebimentos.</div>}
            {payments.map((payment) => {
              const invoice = invoices.find((item) => item.id === payment.invoice_id);
              return (
                <div key={payment.id} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 text-sm items-center">
                  <div className="col-span-3 font-mono text-xs">{dateShort(payment.paid_at)}</div>
                  <div className="col-span-3 font-mono text-xs">{invoice?.number || payment.invoice_id.slice(0, 8)}</div>
                  <div className="col-span-2 text-right font-mono">{eur(payment.amount)}</div>
                  <div className="col-span-2 text-xs">{payment.method}</div>
                  <div className="col-span-2 text-xs font-mono text-neutral-500">{payment.reference || "—"}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="max-w-2xl rounded-none">
          <DialogHeader><DialogTitle className="font-display">Emitir fatura</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-neutral-500">Selecione as linhas do plano e indique o valor a faturar (pode ser parcial).</div>
            <div className="border border-neutral-200">
              <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2">
                <div className="col-span-1"></div>
                <div className="col-span-6">Descrição</div>
                <div className="col-span-2 text-right">Restante</div>
                <div className="col-span-3 text-right">A faturar</div>
              </div>
              {invForm.lines?.map((l, i) => (
                <div key={l.plan_line_id} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 items-center gap-2">
                  <input type="checkbox" checked={l._selected} onChange={(e) => setInvForm({ ...invForm, lines: invForm.lines.map((x, j) => j === i ? { ...x, _selected: e.target.checked, amount: e.target.checked ? x.remaining : 0 } : x) })} className="col-span-1" data-testid={`inv-line-check-${i}`} />
                  <div className="col-span-6 text-xs truncate">{l.description || "(sem descrição)"}</div>
                  <div className="col-span-2 text-right font-mono text-xs">{eur(l.remaining)}</div>
                  <Input type="number" value={l.amount} disabled={!l._selected} onChange={(e) => setInvForm({ ...invForm, lines: invForm.lines.map((x, j) => j === i ? { ...x, amount: e.target.value } : x) })} className="col-span-3 rounded-none h-8 text-right font-mono" data-testid={`inv-line-amount-${i}`} />
                </div>
              ))}
            </div>
            <div>
              <Label>IVA %</Label>
              <Input type="number" value={invForm.vat_pct ?? 23} onChange={(e) => setInvForm({ ...invForm, vat_pct: Number(e.target.value) })} className="rounded-none font-mono w-24" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInvOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={submitInvoice} data-testid="inv-submit-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Emitir fatura</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payOpen} onOpenChange={(open) => !open && setPayOpen(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-display">Registar recebimento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-neutral-500">O valor a receber inclui IVA (valor bruto).</div>
            <div><Label>Valor recebido (c/IVA)</Label><Input type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="rounded-none font-mono" data-testid="pay-amount-input" /></div>
            <div><Label>Método</Label>
              <Select value={payForm.method} onValueChange={(value) => setPayForm({ ...payForm, method: value })}>
                <SelectTrigger className="rounded-none" data-testid="pay-method-select"><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_METHODS.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Referência</Label><Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="rounded-none font-mono" /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={submitPayment} data-testid="pay-submit-btn" className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white">Registar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
