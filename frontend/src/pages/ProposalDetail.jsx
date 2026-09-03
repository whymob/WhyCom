import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { eur, PROP_STATUS, dateShort } from "@/lib/fmt";
import PageHeader from "@/components/PageHeader";
import DocumentTimeline from "@/components/DocumentTimeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import SearchableSelect from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, Download, Eye, Trash2 as TrashIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function computeLine(line) {
  const net = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0) * (1 - (Number(line.discount_pct) || 0) / 100);
  const vat = net * (Number(line.vat_pct) || 0) / 100;
  const gross = net + vat;
  const vab = net - (Number(line.unit_cost) || 0) * (Number(line.quantity) || 0);
  return { net, vat, gross, vab };
}

export default function ProposalDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [proposal, setProposal] = useState(null);
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [manufs, setManufs] = useState([]);
  const [opportunity, setOpportunity] = useState(null);
  const [order, setOrder] = useState(null);
  const [planLines, setPlanLines] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [lostReason, setLostReason] = useState("");
  const [statusChangeReason, setStatusChangeReason] = useState("");
  const [sendFile, setSendFile] = useState(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replacementReason, setReplacementReason] = useState("");
  const [pendingStatus, setPendingStatus] = useState(null);
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const [p, prd, c, m, opportunitiesResponse, ordersResponse] = await Promise.all([
        api.get(`/proposals/${id}`),
        api.get("/products"),
        api.get("/clients"),
        api.get("/manufacturers"),
        api.get("/opportunities"),
        api.get("/orders"),
      ]);
      if (!active) return;
      setProposal(p.data);
      setProducts(prd.data);
      setClients(c.data);
      setManufs(m.data);
      setOpportunity(opportunitiesResponse.data.find((item) => item.id === p.data.opportunity_id) || null);

      const linkedOrder = p.data.converted_order_id
        ? ordersResponse.data.find((item) => item.id === p.data.converted_order_id) || null
        : null;
      setOrder(linkedOrder);
      if (linkedOrder) {
        const [planResponse, invoiceResponse, paymentResponse] = await Promise.all([
          api.get(`/orders/${linkedOrder.id}/plan`),
          api.get(`/invoices?order_id=${linkedOrder.id}`),
          api.get(`/payments?order_id=${linkedOrder.id}`),
        ]);
        if (!active) return;
        setPlanLines(planResponse.data.lines || []);
        setInvoices(invoiceResponse.data || []);
        setPayments(paymentResponse.data || []);
      } else {
        setPlanLines([]);
        setInvoices([]);
        setPayments([]);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id]);

  if (!proposal) return <div className="p-8 text-sm text-neutral-500">A carregar…</div>;

  const clientName = clients.find((client) => client.id === proposal.client_id)?.name || "—";
  const manufName = (manufacturerId) => manufs.find((manufacturer) => manufacturer.id === manufacturerId)?.name || "—";
  const isSubstituted = proposal.status === "substituida";
  const isConverted = Boolean(proposal.converted_order_id) || isSubstituted;
  const canEditAttachmentAfterConversion = process.env.REACT_APP_ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER !== "false";
  const attachmentLocked = isSubstituted || (isConverted && !canEditAttachmentAfterConversion);
  const isAdmin = user?.role === "admin";
  const lineManuf = (line) => {
    const prod = products.find((product) => product.id === line.product_id);
    return prod?.manufacturer_id ? manufName(prod.manufacturer_id) : "—";
  };

  const addLine = () => {
    if (isConverted) return;
    const lines = [...proposal.lines, { product_id: "", description: "", quantity: 1, unit: "unidade", unit_price: 0, discount_pct: 0, vat_pct: 23, unit_cost: 0 }];
    setProposal({ ...proposal, lines });
  };

  const removeLine = (index) => {
    if (isConverted) return;
    const lines = proposal.lines.filter((_, idx) => idx !== index);
    setProposal({ ...proposal, lines });
  };

  const updateLine = (index, patch) => {
    if (isConverted) return;
    const lines = proposal.lines.map((line, idx) => (idx === index ? { ...line, ...patch } : line));
    if (patch.product_id) {
      const prod = products.find((product) => product.id === patch.product_id);
      if (prod) {
        lines[index].description = lines[index].description || prod.name;
        lines[index].unit = prod.unit;
        lines[index].unit_price = lines[index].unit_price || prod.base_price;
        lines[index].unit_cost = lines[index].unit_cost || prod.base_cost;
      }
    }
    setProposal({ ...proposal, lines });
  };

  const totals = proposal.lines.reduce((acc, line) => {
    const computed = computeLine(line);
    return {
      net: acc.net + computed.net,
      vat: acc.vat + computed.vat,
      gross: acc.gross + computed.gross,
      vab: acc.vab + computed.vab,
    };
  }, { net: 0, vat: 0, gross: 0, vab: 0 });

  const hasValidLines = proposal.lines.some((line) => (
    (line.product_id || String(line.description || "").trim()) && (Number(line.quantity) || 0) > 0
  ));
  const activePlanLines = planLines.filter((line) => line.status !== "cancelada");
  const planTotal = activePlanLines.reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  const activeTimelineInvoices = invoices.filter((invoice) => invoice.status !== "anulada");
  const activeTimelinePayments = payments.filter((payment) => payment.status !== "anulado");
  const invoiceTotal = activeTimelineInvoices.reduce((sum, invoice) => sum + (Number(invoice.total_net) || 0), 0);
  const paymentTotal = activeTimelinePayments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const latestDate = (items, fields) => items.reduce((latest, item) => {
    const value = fields.map((field) => item[field]).find(Boolean);
    return value && (!latest || value > latest) ? value : latest;
  }, "");
  const timelineEvents = [
    {
      key: "opportunity",
      label: "Oportunidade",
      complete: Boolean(opportunity),
      date: opportunity?.created_at,
      description: opportunity?.description,
      value: opportunity?.estimated_value,
      href: opportunity ? `/oportunidades?search=${encodeURIComponent(opportunity.description || "")}` : null,
    },
    {
      key: "proposal",
      label: "Proposta",
      complete: true,
      date: proposal.created_at,
      description: proposal.number,
      value: totals.net,
    },
    {
      key: "order",
      label: "Encomenda",
      complete: Boolean(order),
      date: order?.order_date || order?.created_at,
      description: order?.number || "Ainda não criada",
      value: order?.total_net,
      href: order ? `/encomendas/${order.id}` : null,
    },
    {
      key: "plan",
      label: "Plano faturação",
      complete: activePlanLines.length > 0,
      date: activePlanLines[0]?.expected_date || activePlanLines[0]?.created_at,
      description: activePlanLines.length ? `${activePlanLines.length} linha(s) planeada(s)` : "Ainda não criado",
      value: activePlanLines.length ? planTotal : undefined,
      href: order ? `/encomendas/${order.id}#plano-faturacao` : null,
    },
    {
      key: "invoices",
      label: "Faturação",
      complete: activeTimelineInvoices.length > 0,
      date: latestDate(activeTimelineInvoices, ["issued_at", "created_at"]),
      description: invoiceTotal ? `${activeTimelineInvoices.length} fatura(s) emitida(s)` : "Sem faturas emitidas",
      value: invoiceTotal || undefined,
      href: order ? `/encomendas/${order.id}#faturas` : null,
    },
    {
      key: "payments",
      label: "Recebimento",
      complete: activeTimelinePayments.length > 0,
      date: latestDate(activeTimelinePayments, ["paid_at", "created_at"]),
      description: paymentTotal ? `${activeTimelinePayments.length} recebimento(s) registado(s)` : "Sem recebimentos",
      value: paymentTotal || undefined,
      href: order ? `/encomendas/${order.id}#recebimentos` : null,
    },
  ];

  const save = async () => {
    try {
      const payload = {
        ...(isConverted ? {} : { lines: proposal.lines }),
        notes: proposal.notes,
        valid_until: proposal.valid_until,
        sent_at: proposal.sent_at || null,
        sent_to: proposal.sent_to || "",
        next_follow_up_date: proposal.next_follow_up_date || null,
      };
      const { data } = await api.patch(`/proposals/${id}`, payload);
      setProposal(data);
      toast.success("Proposta guardada");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const uploadAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setAttachmentLoading(true);
    try {
      const { data } = await api.post(`/proposals/${id}/attachment`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setProposal(data);
      toast.success("Ficheiro associado à proposta");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setAttachmentLoading(false);
    }
  };

  const downloadAttachment = async () => {
    try {
      const response = await api.get(`/proposals/${id}/attachment`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = proposal.attachment?.filename || "anexo-proposta";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const previewAttachment = async () => {
    if (!proposal.attachment?.filename?.toLowerCase().endsWith(".pdf")) return;
    setPreviewLoading(true);
    try {
      const response = await api.get(`/proposals/${id}/attachment`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
      setPreviewOpen(true);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const removeAttachment = async () => {
    try {
      const { data } = await api.delete(`/proposals/${id}/attachment`);
      setProposal(data);
      toast.success("Ficheiro removido");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const changeStatus = async (status) => {
    if (isConverted) {
      toast.error("Proposta convertida em encomenda: o estado nao pode ser alterado");
      return;
    }
    if (status === "enviada" && proposal.status === "em_elaboracao" && !hasValidLines) {
      toast.error("Adicione pelo menos uma linha de produto ou servico antes de enviar a proposta");
      return;
    }

    if (status === "perdida" && !lostReason.trim()) {
      toast.error("Indique o motivo de perda");
      return;
    }

    setStatusChangeReason("");
    setSendFile(null);
    setPendingStatus(status);
  };

  const confirmStatusChange = async () => {
    if (!pendingStatus) return;

    try {
      const payload = { status: pendingStatus };
      if (pendingStatus === "perdida") {
        payload.lost_reason = lostReason;
      }
      if (pendingStatus === "expirada") {
        if (!statusChangeReason.trim()) { toast.error("Indique a justificação de expiração"); return; }
        payload.status_change_reason = statusChangeReason.trim();
      }
      const flow = ["em_elaboracao", "enviada", "em_negociacao", "ganha"];
      if (flow.includes(pendingStatus) && flow.indexOf(pendingStatus) < flow.indexOf(proposal.status)) {
        if (!statusChangeReason.trim()) { toast.error("Indique a justificação para retroceder"); return; }
        payload.status_change_reason = statusChangeReason.trim();
      }
      if (pendingStatus === "enviada" && proposal.status === "em_elaboracao") {
        if (!sendFile) { toast.error("Anexe o ficheiro da proposta"); return; }
        if (!proposal.sent_at || !proposal.sent_to?.trim() || !proposal.next_follow_up_date) { toast.error("Preencha a data, destinatário e fecho previsto"); return; }
        const formData = new FormData();
        formData.append("file", sendFile);
        await api.post(`/proposals/${id}/attachment`, formData, { headers: { "Content-Type": "multipart/form-data" } });
        payload.sent_at = proposal.sent_at;
        payload.sent_to = proposal.sent_to.trim();
        payload.next_follow_up_date = proposal.next_follow_up_date;
      }
      const { data } = await api.patch(`/proposals/${id}`, payload);
      setProposal(data);
      setPendingStatus(null);
      toast.success(`Estado: ${PROP_STATUS[pendingStatus]}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const replaceProposal = async () => {
    if (!replacementReason.trim()) { toast.error("Indique a justificação da substituição"); return; }
    try {
      const { data } = await api.post(`/opportunities/${proposal.opportunity_id}/proposals`, { replacement_reason: replacementReason.trim() });
      toast.success(`Nova proposta ${data.number} criada`);
      nav(`/propostas/${data.id}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const convertToOrder = async () => {
    try {
      const { data } = await api.post(`/proposals/${id}/convert`);
      toast.success(`Encomenda ${data.number} criada`);
      nav("/encomendas");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const reopenProposal = async () => {
    try {
      const { data } = await api.post(`/proposals/${id}/reopen`);
      setProposal(data);
      toast.success("Proposta reaberta para revisão");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  return (
    <div>
      <PageHeader
        kicker={`Proposta · ${dateShort(proposal.created_at)}`}
        title={proposal.number}
        actions={
          <div className="flex gap-2">
            <Link to="/propostas"><Button variant="ghost" className="rounded-none"><ChevronLeft size={14} className="mr-1" /> Voltar</Button></Link>
            {isConverted && !isSubstituted && isAdmin && <Button onClick={reopenProposal} data-testid="reopen-proposal-btn" className="rounded-none bg-[#FF2A00] text-white hover:bg-[#D62200]">Reabrir proposta</Button>}
            <Button onClick={save} disabled={isSubstituted} data-testid="save-proposal-btn" className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Guardar</Button>
          </div>
        }
      />
      <div className="p-7 space-y-6">
        <DocumentTimeline events={timelineEvents} />

        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Cliente</div>
            <div className="mt-1 font-medium">{clientName}</div>
          </div>
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Estado</div>
            <div className="mt-1"><Badge className="rounded-none">{PROP_STATUS[proposal.status]}</Badge></div>
          </div>
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">Total (s/ IVA)</div>
            <div className="mt-1 font-mono text-lg">{eur(totals.net)}</div>
          </div>
          <div className="rounded-[14px] border border-[var(--wc-border)] bg-white p-4 shadow-sm">
            <div className="text-[10px] uppercase tracking-widest text-neutral-500">VAB</div>
            <div className="mt-1 font-mono text-lg">{eur(totals.vab)}</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Linhas da proposta</div>
            <Button size="sm" onClick={addLine} disabled={isConverted} data-testid="add-line-btn" className="rounded-none bg-neutral-900 text-white hover:bg-neutral-700"><Plus size={14} className="mr-1" /> Nova linha</Button>
          </div>
          {isConverted && !isSubstituted && <div className="mb-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Esta proposta ja foi convertida em encomenda. As linhas e o estado estao bloqueados.</div>}
          {isSubstituted && <div className="mb-2 border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700"><div><span className="font-medium">Motivo da substituição:</span> {proposal.replacement_reason || "-"}</div>{proposal.replacement_proposal_id && <Link to={`/propostas/${proposal.replacement_proposal_id}`} className="mt-1 inline-block text-[#002FA7] hover:underline">Ver nova proposta que substitui esta</Link>}</div>}
          <div className="wc-list-panel">
            <div className="grid grid-cols-12 text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-200 px-3 py-2 gap-2">
              <div className="col-span-3">Produto/Serviço</div>
              <div className="col-span-1 text-right">Qtd</div>
              <div className="col-span-2 text-right">Preço unit.</div>
              <div className="col-span-1 text-right">Desc %</div>
              <div className="col-span-1 text-right">IVA %</div>
              <div className="col-span-1 text-right">Custo unit.</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1 text-right">VAB</div>
              <div className="col-span-1"></div>
            </div>
            {proposal.lines.length === 0 && <div className="p-4 text-sm text-neutral-500">Sem linhas.</div>}
            {proposal.lines.map((line, index) => {
              const computed = computeLine(line);
              return (
                <div key={index} className="grid grid-cols-12 px-3 py-2 border-b border-neutral-100 items-center gap-2" data-testid={`prop-line-${index}`}>
                  <div className="col-span-3">
                      <SearchableSelect
                        value={line.product_id || ""}
                        onValueChange={(value) => updateLine(index, { product_id: value })}
                        disabled={isConverted}
                      options={products.map((product) => ({
                        value: product.id,
                        label: product.name,
                        keywords: `${product.category || ""} ${product.unit || ""}`,
                      }))}
                      placeholder="Produto/serviço"
                      searchPlaceholder="Pesquisar produto..."
                      emptyText="Sem produtos."
                      testId={`line-product-${index}`}
                      triggerClassName="h-8 text-xs"
                    />
                    <Input placeholder="Descrição" value={line.description} disabled={isConverted} onChange={(e) => updateLine(index, { description: e.target.value })} className="mt-1 rounded-none h-8 text-xs" />
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mt-1" data-testid={`prop-line-manuf-${index}`}>Fabricante: <span className="text-neutral-800 normal-case tracking-normal">{lineManuf(line)}</span></div>
                  </div>
                  <Input type="number" value={line.quantity} disabled={isConverted} onChange={(e) => updateLine(index, { quantity: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" data-testid={`line-qty-${index}`} />
                  <Input type="number" value={line.unit_price} disabled={isConverted} onChange={(e) => updateLine(index, { unit_price: e.target.value })} className="col-span-2 rounded-none h-8 text-right font-mono" data-testid={`line-price-${index}`} />
                  <Input type="number" value={line.discount_pct} disabled={isConverted} onChange={(e) => updateLine(index, { discount_pct: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" />
                  <Input type="number" value={line.vat_pct} disabled={isConverted} onChange={(e) => updateLine(index, { vat_pct: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" />
                  <Input type="number" value={line.unit_cost} disabled={isConverted} onChange={(e) => updateLine(index, { unit_cost: e.target.value })} className="col-span-1 rounded-none h-8 text-right font-mono" />
                  <div className="col-span-1 text-right font-mono text-xs">{eur(computed.net)}</div>
                  <div className="col-span-1 text-right font-mono text-xs">{eur(computed.vab)}</div>
                  <div className="col-span-1 text-right">
                    <Button size="sm" variant="ghost" disabled={isConverted} onClick={() => removeLine(index)} className="rounded-none text-[#FF2A00]" data-testid={`remove-line-${index}`}><Trash2 size={14} /></Button>
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-12 px-3 py-3 gap-2 bg-neutral-50 text-sm">
              <div className="col-span-8 text-right font-medium">Totais</div>
              <div className="col-span-1 text-right font-mono"></div>
              <div className="col-span-1 text-right font-mono">{eur(totals.net)}</div>
              <div className="col-span-1 text-right font-mono">{eur(totals.vab)}</div>
              <div className="col-span-1"></div>
            </div>
            <div className="grid grid-cols-12 px-3 py-2 gap-2 text-xs text-neutral-600">
              <div className="col-span-8 text-right">IVA: <span className="font-mono">{eur(totals.vat)}</span> · Total c/ IVA: <span className="font-mono">{eur(totals.gross)}</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-neutral-200 p-4">
            <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Notas internas</Label>
            <Textarea rows={3} value={proposal.notes || ""} onChange={(e) => setProposal({ ...proposal, notes: e.target.value })} className="rounded-none mt-2" data-testid="prop-notes" />
          </div>
          <div className="border border-neutral-200 p-4">
            <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Validade</Label>
            <Input type="date" value={(proposal.valid_until || "").slice(0, 10)} onChange={(e) => setProposal({ ...proposal, valid_until: e.target.value })} className="rounded-none mt-2 font-mono" />
          </div>
          <div className="border border-neutral-200 p-4">
            <Label className="text-[10px] uppercase tracking-widest text-neutral-500">Data prevista de fecho</Label>
            <Input type="date" value={(proposal.next_follow_up_date || "").slice(0, 10)} onChange={(e) => setProposal({ ...proposal, next_follow_up_date: e.target.value })} className="rounded-none mt-2 font-mono" data-testid="proposal-follow-up-date" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-neutral-200 p-4"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Enviada em</Label><Input type="date" value={(proposal.sent_at || "").slice(0, 10)} onChange={(e) => setProposal({ ...proposal, sent_at: e.target.value })} className="mt-2 rounded-none font-mono" /></div>
          <div className="col-span-2 border border-neutral-200 p-4"><Label className="text-[10px] uppercase tracking-widest text-neutral-500">Enviada para</Label><Input value={proposal.sent_to || ""} onChange={(e) => setProposal({ ...proposal, sent_to: e.target.value })} placeholder="Nome ou endereço de email do destinatário" className="mt-2 rounded-none" /></div>
        </div>

        <div className="border border-neutral-200 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Ficheiro da proposta</div>
          {proposal.attachment ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">{proposal.attachment.filename}</div>
                <div className="text-xs text-neutral-500">{Math.ceil((proposal.attachment.size || 0) / 1024)} KB</div>
              </div>
              <div className="flex gap-2">
                {proposal.attachment.filename?.toLowerCase().endsWith(".pdf") && <Button type="button" size="sm" variant="outline" onClick={previewAttachment} disabled={previewLoading} className="rounded-none"><Eye size={14} className="mr-1" /> Visualizar</Button>}
                <Button type="button" size="sm" variant="outline" onClick={downloadAttachment} className="rounded-none"><Download size={14} className="mr-1" /> Descarregar</Button>
                <Button type="button" size="sm" variant="ghost" onClick={removeAttachment} disabled={attachmentLocked || attachmentLoading} className="rounded-none text-[#FF2A00]"><TrashIcon size={14} className="mr-1" /> Remover</Button>
              </div>
            </div>
          ) : <div className="text-sm text-neutral-500">Nenhum ficheiro associado.</div>}
          <div className="mt-3">
            <Input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={uploadAttachment} disabled={attachmentLocked || attachmentLoading} data-testid="proposal-attachment-input" className="rounded-none" />
            <div className="mt-1 text-[11px] text-neutral-500">Formatos permitidos: PDF, Word e PowerPoint · máximo 50 MB. Um novo ficheiro substitui o atual.</div>
          </div>
        </div>

        <Dialog open={previewOpen} onOpenChange={(open) => !open && closePreview()}>
          <DialogContent className="flex h-[90vh] max-w-5xl flex-col overflow-hidden rounded-none">
            <DialogHeader className="shrink-0"><DialogTitle className="font-display">Visualizar PDF · {proposal.attachment?.filename}</DialogTitle></DialogHeader>
            <div className="min-h-0 flex-1 bg-neutral-100">
              {previewUrl && <iframe src={previewUrl} title={`Visualização de ${proposal.attachment?.filename || "PDF"}`} className="h-full w-full border-0" />}
            </div>
            <DialogFooter className="shrink-0"><Button type="button" variant="outline" onClick={closePreview} className="rounded-none">Fechar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="border border-neutral-200 p-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 mb-3">Alterar estado</div>
          <div className="flex flex-wrap gap-2 items-center">
            {["em_elaboracao", "enviada", "em_negociacao", "ganha"].map((status) => (
              <Button key={status} size="sm" onClick={() => changeStatus(status)} data-testid={`status-${status}-btn`} disabled={isConverted || proposal.status === status} className="rounded-none bg-neutral-900 hover:bg-neutral-700 text-white text-xs">
                {PROP_STATUS[status]}
              </Button>
            ))}
            <div className="flex items-center gap-2 ml-2">
              <Input placeholder="Motivo de perda" value={lostReason} disabled={isConverted} onChange={(e) => setLostReason(e.target.value)} className="rounded-none h-9 w-56" data-testid="prop-lost-reason-input" />
              <Button size="sm" onClick={() => changeStatus("perdida")} disabled={isConverted} data-testid="status-perdida-btn" className="rounded-none bg-[#FF2A00] hover:bg-[#D62200] text-white text-xs">Perdida</Button>
            </div>
            <Button size="sm" onClick={() => changeStatus("expirada")} disabled={isConverted} className="rounded-none border border-neutral-500 bg-white text-xs text-neutral-700 hover:bg-neutral-50">Expirar</Button>
            <Button size="sm" onClick={() => { setReplacementReason(""); setReplaceOpen(true); }} disabled={isConverted} className="rounded-none border border-neutral-500 bg-white text-xs text-neutral-700 hover:bg-neutral-50">Substituir</Button>
            {proposal.status === "ganha" && !proposal.converted_order_id && (
              <Button size="sm" onClick={convertToOrder} data-testid="convert-to-order-btn" className="rounded-none bg-[#00A859] hover:bg-[#008C4A] text-white text-xs ml-2">Gerar encomenda →</Button>
            )}
          </div>
          {proposal.lost_reason && <div className="mt-2 text-xs text-[#B91C1C]">Motivo: {proposal.lost_reason}</div>}
        </div>
      </div>

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent className="max-w-md rounded-none"><DialogHeader><DialogTitle>Substituir proposta</DialogTitle></DialogHeader><p className="text-sm text-neutral-600">Será criada uma nova versão. A proposta atual ficará substituída e deixará de ser exibida no quadro comercial.</p><Textarea value={replacementReason} onChange={(event) => setReplacementReason(event.target.value)} rows={3} placeholder="Justificação da substituição" className="rounded-none" /><DialogFooter><Button variant="outline" onClick={() => setReplaceOpen(false)} className="rounded-none">Cancelar</Button><Button onClick={replaceProposal} className="rounded-none bg-[#002FA7] text-white hover:bg-[#002277]">Criar nova versão</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={!!pendingStatus} onOpenChange={(nextOpen) => !nextOpen && setPendingStatus(null)}>
        <DialogContent className="max-w-md rounded-none">
          <DialogHeader>
            <DialogTitle className="font-display">Confirmar alteracao de estado</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-neutral-700">
            A proposta sera alterada para <span className="font-medium">{pendingStatus ? PROP_STATUS[pendingStatus] : ""}</span>.
            Pode cancelar agora caso precise rever os dados antes de continuar.
          </div>
          {pendingStatus === "enviada" && proposal.status === "em_elaboracao" && <div className="space-y-3 border border-neutral-200 bg-neutral-50 p-3"><div className="text-xs text-neutral-600">Para enviar, associe o ficheiro final e confirme os dados comerciais.</div><Input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={(event) => setSendFile(event.target.files?.[0] || null)} className="rounded-none" /><div className="text-xs text-neutral-500">{sendFile?.name || "Nenhum ficheiro selecionado"}</div></div>}
          {(pendingStatus === "expirada" || (["em_elaboracao", "enviada", "em_negociacao", "ganha"].includes(pendingStatus) && ["em_elaboracao", "enviada", "em_negociacao", "ganha"].indexOf(pendingStatus) < ["em_elaboracao", "enviada", "em_negociacao", "ganha"].indexOf(proposal.status))) && <Textarea value={statusChangeReason} onChange={(event) => setStatusChangeReason(event.target.value)} rows={3} placeholder="Justificação obrigatória" className="rounded-none" />}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingStatus(null)} className="rounded-none">Cancelar</Button>
            <Button onClick={confirmStatusChange} className="rounded-none bg-[#002FA7] hover:bg-[#002277] text-white">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
