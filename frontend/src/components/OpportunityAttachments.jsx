import React, { useState } from "react";
import { Eye, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";

const sizeLabel = (size) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export default function OpportunityAttachments({ opportunity, onUpdated, readOnly = false }) {
  const [uploading, setUploading] = useState(false);
  if (!opportunity) return null;
  const locked = opportunity.status === "convertida" || Boolean(opportunity.converted_proposal_id);
  const upload = async (event) => {
    const files = [...(event.target.files || [])]; event.target.value = "";
    if (!files.length) return;
    setUploading(true); const errors = [];
    for (const file of files) {
      const body = new FormData(); body.append("file", file);
      try { const { data } = await api.post(`/opportunities/${opportunity.id}/attachments`, body, { headers: { "Content-Type": "multipart/form-data" } }); onUpdated(data); }
      catch (error) { errors.push(`${file.name}: ${formatApiErrorDetail(error.response?.data?.detail)}`); }
    }
    setUploading(false);
    errors.length ? toast.error(errors.join(" · ")) : toast.success(`${files.length} ficheiro(s) associado(s).`);
  };
  const preview = async (attachment) => {
    const tab = window.open("", "_blank");
    try { const response = await api.get(`/opportunities/${opportunity.id}/attachments/${attachment.id}`, { responseType: "blob" }); const url = URL.createObjectURL(response.data); if (tab) tab.location.href = url; else window.open(url, "_blank"); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
    catch (error) { if (tab) tab.close(); toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
  };
  const remove = async (attachment) => {
    try { const { data } = await api.delete(`/opportunities/${opportunity.id}/attachments/${attachment.id}`); onUpdated(data); toast.success("Ficheiro removido."); }
    catch (error) { toast.error(formatApiErrorDetail(error.response?.data?.detail)); }
  };
  const attachments = opportunity.attachments || [];
  return <div className="border-t border-neutral-200 pt-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-sm font-medium">Anexos</div><div className="mt-1 text-xs text-slate-500">PDF, Excel, Word ou PowerPoint · 50 MB por ficheiro</div></div>{!readOnly && (locked ? <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500">Bloqueados após conversão</span> : <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#14E0E0] px-3 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#0B8E8E] hover:text-white"><FileUp size={14} className="mr-1.5" />{uploading ? "A enviar…" : "Adicionar ficheiros"}<input type="file" multiple disabled={uploading} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={upload} className="hidden" /></label>)}</div>{attachments.length === 0 ? <div className="py-4 text-sm text-slate-500">Sem ficheiros associados.</div> : <div className="mt-3 divide-y divide-neutral-100">{attachments.map((attachment) => <div key={attachment.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><div className="truncate text-sm font-medium">{attachment.filename}</div><div className="text-xs text-slate-500">{sizeLabel(attachment.size || 0)}</div></div><div className="flex shrink-0 gap-1"><Button type="button" variant="outline" size="sm" onClick={() => preview(attachment)}><Eye size={14} className="mr-1.5" />Visualizar</Button>{!readOnly && !locked && <Button type="button" variant="ghost" size="sm" onClick={() => remove(attachment)} className="text-red-600 hover:bg-red-50 hover:text-red-700"><Trash2 size={14} /></Button>}</div></div>)}</div>}</div>;
}
