import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, API, formatApiErrorDetail } from "@/lib/api";
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
  const [parcelOpen, setParcelOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null);
  const [payForm, setPayForm] = useState({ amount: 0, method: "transferencia", reference: "" });
  const [invForm, setInvForm] = useState({ lines: [], vat_pct: 23 });
  const [parcelForm, setParcelForm] = useState({
    count: 2,
    type: "mensalidade",
    firstDate: "",
    lines: [],
  });

  useEffect(() => {
    let active = true;

    async function load() {
      const [orderRes, planRes, invoiceRes, paymentRes, reconRes, productRes, manufRes] = await Promise.all([
        api.get("/orders").then((r) => r.data.find((item) => item.id === id)),
        api.get(`/orders/${id}/plan`),
        api.get(`/invoices?order_id=${id}`),
        api.get(`/payments?order_id=${id}`),
        api.get(`/orders/${id}/reconcile`),
        api.get("/products"),
        api.get("/manufacturers"),
      ]);

      if (!active) return;

      setOrder(orderRes);
      setPlanLines(planRes.data.lines);
      setInvoices(invoiceRes.data);
      setPayments(paymentRes.data);
      setRecon(reconRes.data);
      setProducts(productRes.data);
      setManufs(manufRes.data);

      if (orderRes?.proposal_id) {
        try {
          const proposalRes = await api.get(`/proposals/${orderRes.proposal_id}`);
          if (!active) return;
          setProposalLines(proposalRes.data.lines || []);
        } catch {
          if (!active) return;
          setProposalLines([]);
        }
      } else {
        setProposalLines([]);
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
    const product = products.find((item) => item.id === productId);
    if (!product?.manufacturer_id) return "—";
    return manufs.find((manuf) => manuf.id === product.manufacturer_id)?.name || "—";
  };

  const reload = async () => {
    const [orderRes, planRes, invoiceRes, paymentRes, reconRes, productRes, manufRes] = await Promise.all([
      api.get("/orders").then((r) => r.data.find((item) => item.id === id)),
      api.get(`/orders/${id}/plan`),
      api.get(`/invoices?order_id=${id}`),
      api.get(`/payments?order_id=${id}`),
      api.get(`/orders/${id}/reconcile`),
      api.get("/products"),
      api.get("/manufacturers"),
    ]);

    setOrder(orderRes);
    setPlanLines(planRes.data.lines);
    setInvoices(invoiceRes.data);
    setPayments(paymentRes.data);
    setRecon(reconRes.data);
    setProducts(productRes.data);
    setManufs(manufRes.data);

    if (orderRes?.proposal_id) {
      try {
        const proposalRes = await api.get(`/proposals/${orderRes.proposal_id}`);
        setProposalLines(proposalRes.data.lines || []);
      } catch {
        setProposalLines([]);
      }
    } else {
      setProposalLines([]);
    }
  };

  const addPlanLine = () => {
    setPlanLines([
      ...planLines,
      { id: `new-${Date.now()}`, type: "mensalidade", description: "", expected_date: "", value: 0, status: "planeada", invoiced_amount: 0 },
    ]);
  };

  const shiftMonth = (dateValue, monthsToAdd) => {
    if (!dateValue) return "";
    const [year, month, day] = dateValue.split("-").map(Number);
    if (!year || !month || !day) return "";
    const next = new Date(year, month - 1 + monthsToAdd, day);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, "0");
    const dd = String(next.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const buildParcelLines = (count, type, firstDate) => {
    const safeCount = Math.max(1, Number(count) || 1);
    const totalCents = Math.round((Number(order.total_net) || 0) * 100);
    const base = Math.floor(totalCents / safeCount);
    const remainder = totalCents % safeCount;

    return Array.from({ length: safeCount }, (_, index) => {
      const cents = base + (index < remainder ? 1 : 0);
      return {
        id: `parcel-${Date.now()}-${index}`,
        type,
        description: `Parcela ${index + 1}/${safeCount}`,
        expected_date: shiftMonth(firstDate, index),
        value: (cents / 100).toFixed(2),
        status: "planeada",
        invoiced_amount: 0,
      };
    });
  };

  const openParcelModal = () => {
    setParcelForm({
      count: 2,
      type: "mensalidade",
      firstDate: "",
      lines: buildParcelLines(2, "mensalidade", ""),
    });
    setParcelOpen(true);
  };

  const regenerateParcelLines = (patch = {}) => {
    const next = {
      count: patch.count ?? parcelForm.count,
      type: patch.type ?? parcelForm.type,
      firstDate: patch.firstDate ?? parcelForm.firstDate,
    };
    setParcelForm({
      ...next,
      lines: buildParcelLines(next.count, next.type, next.firstDate),
    });
  };

  const updateParcelLine = (index, patch) => {
    setParcelForm((current) => ({
      ...current,
      lines: current.lines.map((line, idx) => (idx === index ? { ...line, ...patch } : line)),
    }));
  };

  const updatePlanLine = (index, patch) => {
    setPlanLines(planLines.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  };

  const removePlanLine = (index) => {
    const line = planLines[index];
    if ((line.invoiced_amount || 0) > 0) {
      toast.error("Linha já faturada, não pode ser removida");
      return;
    }
    setPlanLines(planLines.filter((_, idx) => idx !== index));
  };

  const savePlan = async () => {
    try {
      const clean = planLines.map((line) => ({
        id: line.id?.startsWith("new-") ? undefined : line.id,
        type: line.type,
        description: line.description,
        expected_date: line.expected_date || null,
        value: Number(line.value) || 0,
      }));
      const { data } = await api.put(`/orders/${id}/plan`, { lines: clean });
      setPlanLines(data.lines);
      toast.success("Plano guardado");
      reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const planTotal = planLines.filter((line) => line.status !== "cancelada").reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  const planDelta = planTotal - order.total_net;
  const parcelTotal = parcelForm.lines.reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  const parcelDelta = parcelTotal - (Number(order.total_net) || 0);

  const applyParcelPlan = () => {
    if ((Number(parcelForm.count) || 0) < 1) {
      toast.error("Indique uma quantidade valida de parcelas");
      return;
    }

    if (!parcelForm.lines.length) {
      toast.error("Gere pelo menos uma parcela");
      return;
    }

    if (Math.abs(parcelDelta) > 0.01) {
      toast.error("A soma das parcelas deve ser igual ao valor total da encomenda");
      return;
    }

    setPlanLines([
      ...planLines,
      ...parcelForm.lines.map((line, index) => ({
        ...line,
        id: `new-parcel-${Date.now()}-${index}`,
      })),
    ]);
    setParcelOpen(false);
    toast.success("Parcelamento adicionado ao plano");
  };

  const openInvoice = () => {
    const seed = planLines
      .filter((line) => line.status !== "cancelada" && (line.value - (line.invoiced_amount || 0)) > 0.001)
      .map((line) => ({
        plan_line_id: line.id,
        amount: 0,
        description: line.description,
        remaining: line.value - (line.invoiced_amount || 0),
        _selected: false,
      }));
    setInvForm({ lines: seed, vat_pct: 23 });
    setInvOpen(true);
  };

  const submitInvoice = async () => {
    try {
      const lines = invForm.lines
        .filter((line) => line._selected && Number(line.amount) > 0)
        .map((line) => ({
          plan_line_id: line.plan_line_id,
          amount: Number(line.amount),
          description: line.description,
        }));

      if (!lines.length) {
        toast.error("Selecione pelo menos 1 linha");
        return;
      }

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
      await api.post("/payments", {
        invoice_id: payOpen,
        amount: Number(payForm.amount),
        method: payForm.method,
        reference: payForm.reference,
      });
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

  const downloadInvoicePdf = async (invoiceId, invoiceNumber) => {
    try {
      const token = localStorage.getItem("whymob_token");
      const response = await fetch(`${API}/invoices/${invoiceId}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(`Falha ao descarregar PDF (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fatura-${invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e.message || "Não foi possível descarregar o PDF");
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
            ].map((card, index) => (
              <div key={card.label} className={`p-5 ${index < 3 ? "border-r border-neutral-200" : ""}`} data-testid={card.testid}>
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">{card.label}</div>
                <div className="mt-2 font-mono text-xl">{eur(card.value)}</div>
                {card.vab !== null && card.vab !== undefined && <div className="text-xs text-neutral-500 mt-1">VAB <span className="font-mono">{eur(card.vab)}</span></div>}
                {card.sub && <div className="text-[10px] text-neutral-400 mt-1 font-mono">{card.sub}</div>}
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
              <Button size="sm" onClick={openParcelModal} data-testid="plan-split-btn" className="rounded-none border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100"><Plus size={14} className="mr-1" /> Plano faseado</Button>
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
                <Input value={line.description || ""} onChange={(e) => updatePlanLine(index, { description: e.target.value })} className="col-span-3 rounded-none h-8 text-xs" />
                <Input type="date" value={(line.expected_date || "").slice(0, 10)} onChange={(e) => updatePlanLine(index, { expected_date: e.target.value })} className="col-span-2 rounded-none h-8 text-xs font-mono" />
                <Input type="number" value={line.value} onChange={(e) => updatePlanLine(index, { value: e.target.value })} className="col-span-2 rounded-none h-8 text-right font-mono" data-testid={`plan-value-${index}`} />
                <div className="col-span-1 text-right font-mono text-xs">{eur(line.invoiced_amount || 0)}</div>
                <div className="col-span-1"><Badge className={`${PLAN_STATUS_STYLE[line.status] || ""} rounded-none font-normal text-[10px]`}>{line.status}</Badge></div>
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
              <div className="col-span-2">Número</div>
              <div className="col-span-2">Data</div>
              <div className="col-span-2 text-right">Total s/IVA</div>
              <div className="col-span-2 text-right">Total c/IVA</div>
              <div className="col-span-1 text-right">Recebido</div>
              <div className="col-span-2">Estado</div>
              <div className="col-span-1 text-right">Ações</div>
            </div>
            {invoices.length === 0 && <div className="p-4 text-sm text-neutral-500" data-testid="invoices-empty">Sem faturas emitidas.</div>}
            {invoices.map((invoice) => (
              <div key={invoice.id} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 text-sm items-center" data-testid={`invoice-row-${invoice.id}`}>
                <div className="col-span-2 font-mono">{invoice.number}</div>
                <div className="col-span-2 text-xs font-mono text-neutral-600">{dateShort(invoice.issued_at)}</div>
                <div className="col-span-2 text-right font-mono">{eur(invoice.total_net)}</div>
                <div className="col-span-2 text-right font-mono">{eur(invoice.total_gross)}</div>
                <div className="col-span-1 text-right font-mono">{eur(invoice.received_amount)}</div>
                <div className="col-span-2"><Badge className="rounded-none font-normal">{invoice.status}</Badge></div>
                <div className="col-span-1 text-right flex justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => downloadInvoicePdf(invoice.id, invoice.number)}
                    data-testid={`pdf-invoice-${invoice.id}`}
                    className="rounded-none text-[#002FA7] text-xs h-7 flex items-center hover:underline"
                    title="Descarregar PDF"
                  >
                    PDF
                  </button>
                  {invoice.status !== "anulada" && invoice.status !== "recebida" && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setPayOpen(invoice.id);
                        setPayForm({
                          amount: (invoice.total_gross || invoice.total_net) - invoice.received_amount,
                          method: "transferencia",
                          reference: "",
                        });
                      }}
                      data-testid={`pay-invoice-${invoice.id}`}
                      className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white text-xs h-7"
                    >
                      Receber
                    </Button>
                  )}
                  {invoice.status !== "anulada" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelInvoice(invoice.id)}
                      data-testid={`cancel-invoice-${invoice.id}`}
                      className="rounded-none text-[#FF2A00] text-xs h-7"
                    >
                      ×
                    </Button>
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
              <div className="col-span-3">Data</div>
              <div className="col-span-3">Fatura</div>
              <div className="col-span-2 text-right">Valor</div>
              <div className="col-span-2">Método</div>
              <div className="col-span-2">Referência</div>
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
              {invForm.lines?.map((line, index) => (
                <div key={line.plan_line_id} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={line._selected}
                    onChange={(e) =>
                      setInvForm({
                        ...invForm,
                        lines: invForm.lines.map((item, idx) =>
                          idx === index ? { ...item, _selected: e.target.checked, amount: e.target.checked ? item.remaining : 0 } : item
                        ),
                      })
                    }
                    className="col-span-1"
                    data-testid={`inv-line-check-${index}`}
                  />
                  <div className="col-span-6 text-xs truncate">{line.description || "(sem descrição)"}</div>
                  <div className="col-span-2 text-right font-mono text-xs">{eur(line.remaining)}</div>
                  <Input
                    type="number"
                    value={line.amount}
                    disabled={!line._selected}
                    onChange={(e) =>
                      setInvForm({
                        ...invForm,
                        lines: invForm.lines.map((item, idx) => (idx === index ? { ...item, amount: e.target.value } : item)),
                      })
                    }
                    className="col-span-3 rounded-none h-8 text-right font-mono"
                    data-testid={`inv-line-amount-${index}`}
                  />
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

      <Dialog open={parcelOpen} onOpenChange={setParcelOpen}>
        <DialogContent className="max-w-3xl rounded-none">
          <DialogHeader><DialogTitle className="font-display">Criar plano parcelado</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Numero de parcelas</Label>
                <Input
                  type="number"
                  min="1"
                  value={parcelForm.count}
                  onChange={(e) => setParcelForm((current) => ({ ...current, count: e.target.value }))}
                  onBlur={() => regenerateParcelLines({ count: parcelForm.count })}
                  className="rounded-none font-mono"
                  data-testid="parcel-count-input"
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={parcelForm.type} onValueChange={(value) => regenerateParcelLines({ type: value })}>
                  <SelectTrigger className="rounded-none"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLAN_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Primeira data prevista</Label>
                <Input
                  type="date"
                  value={parcelForm.firstDate}
                  onChange={(e) => setParcelForm((current) => ({ ...current, firstDate: e.target.value }))}
                  onBlur={() => regenerateParcelLines({ firstDate: parcelForm.firstDate })}
                  className="rounded-none font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>Total da encomenda: <span className="font-mono text-neutral-900">{eur(order.total_net)}</span></span>
              <span className={Math.abs(parcelDelta) > 0.01 ? "text-[#FF2A00]" : "text-[#00A859]"}>
                Soma parcelas: <span className="font-mono">{eur(parcelTotal)}</span> · Delta {eur(parcelDelta)}
              </span>
            </div>

            <div className="border border-neutral-200">
              <div className="grid grid-cols-12 gap-2 border-b border-neutral-200 px-3 py-2 text-[10px] uppercase tracking-widest text-neutral-500">
                <div className="col-span-2">Tipo</div>
                <div className="col-span-4">Descricao</div>
                <div className="col-span-3">Data prevista</div>
                <div className="col-span-3 text-right">Valor</div>
              </div>
              {parcelForm.lines.map((line, index) => (
                <div key={line.id || index} className="grid grid-cols-12 items-center gap-2 border-b border-neutral-100 px-3 py-2">
                  <Select value={line.type} onValueChange={(value) => updateParcelLine(index, { type: value })}>
                    <SelectTrigger className="col-span-2 rounded-none h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PLAN_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={line.description || ""} onChange={(e) => updateParcelLine(index, { description: e.target.value })} className="col-span-4 rounded-none h-8 text-xs" />
                  <Input type="date" value={(line.expected_date || "").slice(0, 10)} onChange={(e) => updateParcelLine(index, { expected_date: e.target.value })} className="col-span-3 rounded-none h-8 text-xs font-mono" />
                  <Input type="number" value={line.value} onChange={(e) => updateParcelLine(index, { value: e.target.value })} className="col-span-3 rounded-none h-8 text-right font-mono" data-testid={`parcel-value-${index}`} />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setParcelOpen(false)} className="rounded-none">Cancelar</Button>
            <Button onClick={applyParcelPlan} data-testid="parcel-apply-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Adicionar ao plano</Button>
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
