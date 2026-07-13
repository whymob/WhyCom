"""PDF builders for WhyMob CRM — invoices, billing orders, dashboard snapshot.

Uses reportlab (pure Python). Style follows WhyMob brand: navy #002FA7, black.
"""
import io
from datetime import datetime
from xml.sax.saxutils import escape
from fastapi.responses import Response
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer


NAVY = colors.HexColor("#002FA7")
BLACK = colors.HexColor("#111111")
GREY = colors.HexColor("#666666")
LIGHT = colors.HexColor("#F6F6F6")


def _eur(v) -> str:
    try:
        return f"{float(v):,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "—"


def _styles():
    ss = getSampleStyleSheet()
    return {
        "kicker": ParagraphStyle("kicker", parent=ss["Normal"], fontName="Helvetica-Bold",
                                 fontSize=8, textColor=colors.white, leading=10, spaceAfter=2),
        "title": ParagraphStyle("title", parent=ss["Title"], fontName="Helvetica-Bold",
                                fontSize=22, textColor=colors.white, leading=26, spaceAfter=0),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                             fontSize=11, textColor=NAVY, spaceBefore=12, spaceAfter=6,
                             letterSpace=1.2),
        "body": ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                               fontSize=9.5, textColor=BLACK, leading=13),
        "small": ParagraphStyle("small", parent=ss["Normal"], fontName="Helvetica",
                                fontSize=8, textColor=GREY, leading=11),
        "mono": ParagraphStyle("mono", parent=ss["Normal"], fontName="Courier",
                               fontSize=9, textColor=BLACK, leading=12),
    }


def _header(kicker: str, title: str, subtitle: str = ""):
    """Bloco de cabeçalho azul WhyMob — devolve uma Table pronta a inserir."""
    st = _styles()
    inner = [
        [Paragraph(f'<font color="white">WhyMob CRM · {kicker}</font>', st["kicker"])],
        [Paragraph(f'<font color="white">{title}</font>', st["title"])],
    ]
    if subtitle:
        inner.append([Paragraph(f'<font color="#DDE3F4">{subtitle}</font>', st["small"])])
    t = Table(inner, colWidths=[170 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    return t


def _footer(text: str = ""):
    st = _styles()
    text = text or f"Gerado por WhyMob CRM · {datetime.now().strftime('%d/%m/%Y %H:%M')}"
    return Paragraph(f'<font color="#888888">{text}</font>', st["small"])


def _pdf_response(story: list, filename: str) -> Response:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title=filename,
    )
    doc.build(story)
    buf.seek(0)
    return Response(
        content=buf.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# =========================================================
# Invoice PDF
# =========================================================
def build_invoice_pdf(invoice: dict, client: dict, order: dict, plan_lines_map: dict, payments: list) -> Response:
    st = _styles()
    story = []
    story.append(_header(f"Fatura · {invoice['issued_at'][:10]}", invoice["number"], client.get("name", "")))
    story.append(Spacer(1, 8 * mm))

    # Metadata block
    meta_rows = [
        ["Cliente", client.get("name", "—"), "NIF", client.get("nif", "—")],
        ["Encomenda", order.get("number", "—"), "Data", invoice["issued_at"][:10]],
        ["Estado", invoice["status"].upper(), "IVA", f"{invoice.get('vat_pct', 0):.0f}%"],
    ]
    meta = Table(meta_rows, colWidths=[25 * mm, 65 * mm, 20 * mm, 60 * mm])
    meta.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("TEXTCOLOR", (2, 0), (2, -1), GREY),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta)
    story.append(Spacer(1, 6 * mm))

    # Lines
    story.append(Paragraph("LINHAS DE FATURA", st["h2"]))
    header_row = ["#", "Descrição", "Plano", "Valor s/IVA"]
    line_rows = [header_row]
    for i, il in enumerate(invoice.get("lines", []), start=1):
        pl = plan_lines_map.get(il.get("plan_line_id"), {})
        line_rows.append([
            str(i),
            il.get("description") or pl.get("description") or "—",
            pl.get("type", "—"),
            _eur(il.get("amount", 0)),
        ])
    lines_t = Table(line_rows, colWidths=[10 * mm, 95 * mm, 30 * mm, 35 * mm])
    lines_t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("FONTNAME", (3, 1), (3, -1), "Courier"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, colors.HexColor("#EEEEEE")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(lines_t)
    story.append(Spacer(1, 6 * mm))

    # Totals
    total_rows = [
        ["Total s/IVA", _eur(invoice["total_net"])],
        [f"IVA {invoice.get('vat_pct', 0):.0f}%", _eur(invoice["total_vat"])],
        ["TOTAL c/IVA", _eur(invoice["total_gross"])],
        ["Recebido (c/IVA)", _eur(invoice.get("received_amount", 0))],
        ["Em aberto", _eur(invoice["total_gross"] - invoice.get("received_amount", 0))],
    ]
    totals = Table(total_rows, colWidths=[130 * mm, 40 * mm])
    totals.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 0), (1, -1), "Courier"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("BACKGROUND", (0, 2), (-1, 2), LIGHT),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 2), (0, 2), NAVY),
        ("FONTNAME", (1, 2), (1, 2), "Courier-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(totals)

    # Payments
    if payments:
        story.append(Spacer(1, 6 * mm))
        story.append(Paragraph("RECEBIMENTOS", st["h2"]))
        pay_rows = [["Data", "Método", "Referência", "Valor (c/IVA)"]]
        for p in payments:
            pay_rows.append([
                p.get("paid_at", "")[:10],
                p.get("method", ""),
                p.get("reference") or "—",
                _eur(p.get("amount", 0)),
            ])
        pt = Table(pay_rows, colWidths=[30 * mm, 30 * mm, 75 * mm, 35 * mm])
        pt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
            ("ALIGN", (3, 0), (3, -1), "RIGHT"),
            ("FONTNAME", (3, 1), (3, -1), "Courier"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(pt)

    story.append(Spacer(1, 8 * mm))
    story.append(_footer())
    return _pdf_response(story, f"fatura-{invoice['number']}.pdf")


# =========================================================
# Billing Orders (monthly) PDF
# =========================================================
def build_billing_orders_pdf(month: str, invoices: list, clients_map: dict, orders_map: dict, plan_lines_map: dict) -> Response:
    st = _styles()
    story = []
    total_net = sum(i["total_net"] for i in invoices)
    total_vat = sum(i.get("total_vat", 0) for i in invoices)
    total_gross = sum(i.get("total_gross", i["total_net"]) for i in invoices)
    total_received = sum(i.get("received_amount", 0) for i in invoices)

    story.append(_header("Ordem de Faturação", month, f"{len(invoices)} faturas emitidas neste mês"))
    story.append(Spacer(1, 8 * mm))

    # Sumário
    summary_rows = [
        ["Total s/IVA", _eur(total_net)],
        ["IVA", _eur(total_vat)],
        ["TOTAL c/IVA", _eur(total_gross)],
        ["Recebido", _eur(total_received)],
        ["Em aberto", _eur(total_gross - total_received)],
    ]
    st_t = Table(summary_rows, colWidths=[100 * mm, 70 * mm])
    st_t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 0), (1, -1), "Courier"),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("BACKGROUND", (0, 2), (-1, 2), LIGHT),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 2), (0, 2), NAVY),
        ("FONTNAME", (1, 2), (1, 2), "Courier-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(st_t)
    story.append(Spacer(1, 8 * mm))

    # Detalhe
    story.append(Paragraph("DETALHE POR FATURA", st["h2"]))
    header_row = ["Nº", "Data", "Cliente", "Encomenda", "s/IVA", "c/IVA", "Recebido", "Estado"]
    rows = [header_row]
    for inv in invoices:
        descriptions = []
        for line in inv.get("lines", []):
            description = str(line.get("description") or "").strip()
            if description and description not in descriptions:
                descriptions.append(description)
        invoice_description = " / ".join(descriptions) or "Sem descriÃ§Ã£o"
        invoice_label = Paragraph(
            f"<b>{escape(str(inv['number']))}</b><br/><font size=7 color='#666666'>{escape(invoice_description)}</font>",
            st["small"],
        )
        rows.append([
            invoice_label,
            inv["issued_at"][:10],
            (clients_map.get(inv["client_id"], "")[:22]),
            (orders_map.get(inv["order_id"], {}).get("number", "")),
            _eur(inv["total_net"]),
            _eur(inv.get("total_gross", inv["total_net"])),
            _eur(inv.get("received_amount", 0)),
            inv["status"],
        ])
    t = Table(rows, colWidths=[22 * mm, 18 * mm, 34 * mm, 22 * mm, 22 * mm, 22 * mm, 20 * mm, 20 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("ALIGN", (4, 0), (6, -1), "RIGHT"),
        ("FONTNAME", (4, 1), (6, -1), "Courier"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
        ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#EEEEEE")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 6 * mm))

    story.append(_footer())
    return _pdf_response(story, f"ordem-faturacao-{month}.pdf")

    # Kept below for reference while older generated PDFs are being compared.
    story.append(Paragraph("COMPOSICAO DAS FATURAS", st["h2"]))
    for inv in invoices:
        order = orders_map.get(inv["order_id"], {})
        client_name = clients_map.get(inv["client_id"], "")
        story.append(Paragraph(
            f"{inv['number']} · {client_name} · {order.get('number', '')}",
            st["body"],
        ))

        invoice_line_rows = [["Descricao", "Ref. plano", "Valor s/IVA"]]
        for line in inv.get("lines", []):
            plan_line = plan_lines_map.get(line.get("plan_line_id"), {})
            invoice_line_rows.append([
                line.get("description") or plan_line.get("description") or plan_line.get("type") or "Linha sem descricao",
                plan_line.get("id", ""),
                _eur(line.get("amount", 0)),
            ])

        item_table = Table(invoice_line_rows, colWidths=[100 * mm, 40 * mm, 30 * mm])
        item_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("FONTNAME", (2, 1), (2, -1), "Courier"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.4, NAVY),
            ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#EEEEEE")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(item_table)
        story.append(Spacer(1, 4 * mm))

    story.append(_footer())
    return _pdf_response(story, f"ordem-faturacao-{month}.pdf")


# =========================================================
# Dashboard Executive Snapshot PDF
# =========================================================
def build_dashboard_pdf(kpis: dict, forecast_receiving: dict, forecast_invoicing: list, vab: dict,
                        by_commercial: list, by_client: list, by_manufacturer: list) -> Response:
    st = _styles()
    story = []
    today = datetime.now().strftime("%d/%m/%Y")
    story.append(_header("Snapshot Executivo", "Dashboards", f"Gerado a {today}"))
    story.append(Spacer(1, 8 * mm))

    # KPIs
    kpi_rows = [
        ["Valor Ganho", _eur(kpis.get("won_value", 0)),
         "VAB Ganho", _eur(kpis.get("won_vab", 0))],
        ["Encomendas", _eur(kpis.get("orders_value", 0)),
         "Fulfilled", f"{kpis.get('fulfilled', 0)} enc."],
        ["Propostas Ganhas", str(kpis.get("props", 0)),
         "Em aberto p/ receber", _eur(forecast_receiving.get("total_open", 0))],
    ]
    kt = Table(kpi_rows, colWidths=[40 * mm, 45 * mm, 40 * mm, 45 * mm])
    kt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("TEXTCOLOR", (2, 0), (2, -1), GREY),
        ("FONTNAME", (1, 0), (1, -1), "Courier-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Courier-Bold"),
        ("ALIGN", (1, 0), (1, -1), "LEFT"),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(kt)

    # VAB detail
    story.append(Paragraph("VAB (VALOR ACRESCENTADO BRUTO)", st["h2"]))
    vab_rows = [
        ["Pipeline (opps abertas)", _eur(vab.get("pipeline_vab", 0))],
        ["Ganho (propostas ganhas)", _eur(vab.get("won_vab", 0))],
        ["Encomendas ativas", _eur(vab.get("orders_vab", 0))],
    ]
    vt = Table(vab_rows, colWidths=[100 * mm, 70 * mm])
    vt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 0), (1, -1), "Courier"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(vt)

    # Forecast receiving buckets
    story.append(Paragraph("PREVISÃO DE RECEBIMENTO (AGING)", st["h2"]))
    buckets = forecast_receiving.get("buckets", {})
    ar_rows = [
        ["0-30 dias", _eur(buckets.get("0_30", 0))],
        ["31-60 dias", _eur(buckets.get("31_60", 0))],
        ["61-90 dias", _eur(buckets.get("61_90", 0))],
        [">90 dias", _eur(buckets.get("gt_90", 0))],
        ["Em atraso (>30d)", _eur(buckets.get("em_atraso", 0))],
    ]
    at = Table(ar_rows, colWidths=[100 * mm, 70 * mm])
    at.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), GREY),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (1, 0), (1, -1), "Courier"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(at)

    # Top 5 comerciais
    if by_commercial:
        story.append(Paragraph("TOP 5 COMERCIAIS (POR VALOR GANHO)", st["h2"]))
        rows = [["Comercial", "Ganhas", "Valor", "VAB", "Conversão"]]
        for r in by_commercial[:5]:
            rows.append([
                r.get("name", "")[:24],
                str(r.get("won", 0)),
                _eur(r.get("won_value", 0)),
                _eur(r.get("won_vab", 0)),
                f"{r.get('conversion_rate', 0):.0f}%",
            ])
        t = Table(rows, colWidths=[60 * mm, 20 * mm, 32 * mm, 32 * mm, 26 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("FONTNAME", (2, 1), (3, -1), "Courier"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
            ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#EEEEEE")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)

    # Top 5 clientes
    if by_client:
        story.append(Paragraph("TOP 5 CLIENTES (POR VALOR ENCOMENDA)", st["h2"]))
        rows = [["Cliente", "Encomendas", "Valor", "VAB"]]
        for r in by_client[:5]:
            rows.append([
                r.get("name", "")[:30],
                str(r.get("orders", 0)),
                _eur(r.get("orders_value", 0)),
                _eur(r.get("orders_vab", 0)),
            ])
        t = Table(rows, colWidths=[70 * mm, 25 * mm, 37 * mm, 37 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("FONTNAME", (2, 1), (3, -1), "Courier"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
            ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#EEEEEE")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)

    # Top 5 fabricantes
    if by_manufacturer:
        story.append(Paragraph("TOP 5 FABRICANTES (POR VAB GANHO)", st["h2"]))
        rows = [["Fabricante", "Ganhas", "Valor", "VAB"]]
        for r in by_manufacturer[:5]:
            rows.append([
                r.get("name", "")[:30],
                str(r.get("won", 0)),
                _eur(r.get("won_value", 0)),
                _eur(r.get("won_vab", 0)),
            ])
        t = Table(rows, colWidths=[70 * mm, 25 * mm, 37 * mm, 37 * mm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, 0), (-1, 0), NAVY),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("FONTNAME", (2, 1), (3, -1), "Courier"),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, NAVY),
            ("LINEBELOW", (0, 1), (-1, -1), 0.2, colors.HexColor("#EEEEEE")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t)

    story.append(Spacer(1, 8 * mm))
    story.append(_footer())
    return _pdf_response(story, f"dashboard-{today.replace('/', '-')}.pdf")
