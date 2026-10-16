import React from "react";
import { Link } from "react-router-dom";
import { dateShort, eur, ORDER_STATUS, PROP_STATUS } from "@/lib/fmt";

function inYear(record, fields, year) {
  const date = fields.map((field) => record?.[field]).find(Boolean);
  return Number(String(date || "").slice(0, 4)) === year;
}

export function buildClientCommercialRows(proposals, orders, clientId, year) {
  const clientProposals = proposals.filter((proposal) => proposal.client_id === clientId);
  const proposalMap = new Map(clientProposals.map((proposal) => [proposal.id, proposal]));
  const convertedMap = new Map(clientProposals.filter((proposal) => proposal.converted_order_id).map((proposal) => [proposal.converted_order_id, proposal]));
  const linked = new Set();
  const pairs = [];
  orders.filter((order) => order.client_id === clientId && !["cancelada", "anulada"].includes(order.status)).forEach((order) => {
    const proposal = order.proposal_id ? proposalMap.get(order.proposal_id) : convertedMap.get(order.id);
    if (!inYear(order, ["order_date", "created_at"], year) && !inYear(proposal, ["updated_at", "created_at"], year)) return;
    if (proposal) linked.add(proposal.id);
    pairs.push({ proposal, order });
  });
  const standalone = clientProposals.filter((proposal) => !linked.has(proposal.id) && inYear(proposal, ["updated_at", "created_at"], year));
  return [...standalone.map((proposal) => ({ proposal })), ...pairs].map(({ proposal, order }) => {
    const proposalValue = proposal ? Number(proposal.total_net) || 0 : null;
    const orderValue = order ? Number(order.total_net) || 0 : null;
    const proposalDate = String(proposal?.updated_at || proposal?.created_at || "").slice(0, 10);
    const orderDate = String(order?.order_date || order?.created_at || "").slice(0, 10);
    return {
      proposal, order, proposalValue, orderValue, proposalDate, orderDate,
      proposalReference: proposal?.number || "—",
      proposalStatus: proposal ? PROP_STATUS[proposal.status] || proposal.status || "—" : "—",
      orderReference: order?.number || "—",
      orderStatus: order ? ORDER_STATUS[order.status] || order.status || "—" : "—",
      rawValue: orderValue ?? proposalValue ?? 0,
      rawDate: orderDate || proposalDate,
    };
  });
}

function Reference({ record, path }) {
  return record ? <Link className="text-[#002FA7] hover:underline" to={`/${path}/${record.id}`}>{record.number || "—"}</Link> : "—";
}

function ComparedCell({ row, kind }) {
  const money = kind === "value";
  const proposalValue = money ? row.proposalValue : row.proposalDate;
  const orderValue = money ? row.orderValue : row.orderDate;
  const same = money ? Math.round(proposalValue * 100) === Math.round(orderValue * 100) : proposalValue === orderValue;
  const format = money ? eur : (value) => value ? dateShort(value) : "—";
  if (row.proposal && row.order && !same) return <div className="space-y-1 text-xs"><div><span className="font-sans text-neutral-500">Proposta: </span>{format(proposalValue)}</div><div><span className="font-sans text-neutral-500">Encomenda: </span>{format(orderValue)}</div></div>;
  return format(row.order ? orderValue : proposalValue);
}

export const clientCommercialColumns = [
  { key: "proposalReference", label: "Proposta", w: "170px", mono: true, render: (row) => <Reference record={row.proposal} path="propostas" /> },
  { key: "proposalStatus", label: "Estado proposta", w: "145px", wrap: true },
  { key: "orderReference", label: "Encomenda", w: "170px", mono: true, render: (row) => <Reference record={row.order} path="encomendas" /> },
  { key: "orderStatus", label: "Estado encomenda", w: "180px", wrap: true },
  { key: "value", label: "Valor", w: "170px", align: "right", sortValue: (row) => row.rawValue, render: (row) => <ComparedCell row={row} kind="value" /> },
  { key: "date", label: "Data", w: "180px", mono: true, sortValue: (row) => row.rawDate, render: (row) => <ComparedCell row={row} kind="date" /> },
];
