#!/bin/sh
set -eu

jq -n \
  --arg backendUrl "${REACT_APP_BACKEND_URL:-}" \
  --arg allowProposalAttachmentAfterOrder "${REACT_APP_ALLOW_PROPOSAL_ATTACHMENT_AFTER_ORDER:-true}" \
  '{backendUrl: $backendUrl, allowProposalAttachmentAfterOrder: $allowProposalAttachmentAfterOrder}' \
  | jq -r '"window.__WHYCOM_CONFIG__ = " + tojson + ";"' \
  > /usr/share/nginx/html/config.js
