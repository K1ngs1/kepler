#!/usr/bin/env bash
#
# setup-webhooks.sh — Create Supabase Database Webhooks for email notifications
#
# Prerequisites:
#   - SUPABASE_PROJECT_REF and SUPABASE_SERVICE_KEY environment variables
#   - supabase CLI installed (optional, for local testing)
#
# The Supabase Management API does not currently expose a public endpoint for
# creating Database Webhooks programmatically. Use the Dashboard instead.
#
# ──────────────────────────────────────────────────────────────────────────────
# MANUAL SETUP (Supabase Dashboard)
# ──────────────────────────────────────────────────────────────────────────────
#
# 1. Go to: https://supabase.com/dashboard/project/<your-ref>/database/hooks
#
# 2. Create Webhook #1: "New Trade Offer Email"
#    - Table: trade_offers
#    - Events: INSERT
#    - Type: Supabase Edge Function
#    - Function: send-trade-email
#    - HTTP headers: Authorization = Bearer <SUPABASE_SERVICE_KEY>
#
# 3. Create Webhook #2: "New Trade Message Email"
#    - Table: trade_messages
#    - Events: INSERT
#    - Type: Supabase Edge Function
#    - Function: send-trade-email
#    - HTTP headers: Authorization = Bearer <SUPABASE_SERVICE_KEY>
#
# ──────────────────────────────────────────────────────────────────────────────
# DEPLOYING THE EDGE FUNCTION
# ──────────────────────────────────────────────────────────────────────────────
#
# Deploy the send-trade-email function:
#   supabase functions deploy send-trade-email --project-ref $SUPABASE_PROJECT_REF
#
# Set secrets for the function:
#   supabase secrets set RESEND_API_KEY=re_your_key --project-ref $SUPABASE_PROJECT_REF
#
# ──────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"

if [ -z "$PROJECT_REF" ] || [ -z "$SERVICE_KEY" ]; then
  echo "ERROR: Set SUPABASE_PROJECT_REF and SUPABASE_SERVICE_KEY environment variables."
  echo ""
  echo "Example:"
  echo "  export SUPABASE_PROJECT_REF=yquwasetajootlgmyxan"
  echo "  export SUPABASE_SERVICE_KEY=your-service-role-key"
  echo ""
  echo "Then follow the manual steps above in the Supabase Dashboard."
  exit 1
fi

FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/send-trade-email"

echo "Edge function URL: $FUNCTION_URL"
echo ""
echo "Verifying edge function is reachable..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"type":"test","table":"","record":{},"old_record":{}}' \
  "$FUNCTION_URL")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "204" ]; then
  echo "Edge function responded with HTTP $HTTP_STATUS — working correctly."
elif [ "$HTTP_STATUS" = "401" ]; then
  echo "Edge function responded with 401 — check your SUPABASE_SERVICE_KEY."
  exit 1
else
  echo "Edge function responded with HTTP $HTTP_STATUS."
  echo "Deploy it first: supabase functions deploy send-trade-email --project-ref $PROJECT_REF"
  exit 1
fi

echo ""
echo "Database Webhooks must be configured manually in the Supabase Dashboard."
echo "See the comments at the top of this script for step-by-step instructions."
