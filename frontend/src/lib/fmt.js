export const eur = (n) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);

export const pct = (n) => `${(n ?? 0).toFixed(1)}%`;

export const dateShort = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-PT");
  } catch {
    return "—";
  }
};

export const LEAD_STATUS = {
  nova: "Nova",
  em_qualificacao: "Em qualificação",
  convertida: "Convertida",
  descartada: "Descartada",
};

export const OPP_STATUS = {
  aberta: "Aberta",
  em_analise: "Em análise",
  convertida: "Convertida",
  perdida: "Perdida",
};

export const PROP_STATUS = {
  em_elaboracao: "Em elaboração",
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  ganha: "Ganha",
  perdida: "Perdida",
  expirada: "Expirada",
};

export const ORDER_STATUS = {
  aberta: "Aberta",
  em_planeamento: "Em planeamento",
  em_faturacao: "Em faturação",
  parcialmente_faturada: "Parcialmente faturada",
  faturada: "Faturada",
  recebida: "Recebida",
  fulfilled: "Fulfilled",
  cancelada: "Cancelada",
};

export const ROLE_LABEL = {
  admin: "Admin",
  ceo: "CEO",
  diretor_tecnico: "Diretor Técnico",
  comercial: "Comercial",
  developer: "Developer",
};
