#!/usr/bin/env bash
#
# Test the send-trade-email edge function with a mock payload.
#
# Usage:
#   SUPABASE_PROJECT_REF=your-ref SUPABASE_SERVICE_KEY=your-key bash test.sh
#
# Or test against local Supabase (supabase start):
#   bash test.sh local
#

set -euo pipefail

if [ "${1:-}" = "local" ]; then
  FUNCTION_URL="http://localhost:54321/functions/v1/send-trade-email"
  AUTH_HEADER="Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
else
  PROJECT_REF="${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF}"
  SERVICE_KEY="${SUPABASE_SERVICE_KEY:?Set SUPABASE_SERVICE_KEY}"
  FUNCTION_URL="https://${PROJECT_REF}.supabase.co/functions/v1/send-trade-email"
  AUTH_HEADER="Authorization: Bearer ${SERVICE_KEY}"
fi

echo "Testing send-trade-email at: $FUNCTION_URL"
echo ""

# Test 1: trade_offers INSERT (should respond 200, skipped because no real user)
echo "--- Test 1: Mock trade_offers INSERT ---"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "trade_offers",
    "record": {
      "id": "00000000-0000-0000-0000-000000000001",
      "status": "proposed",
      "initiator_id": "00000000-0000-0000-0000-000000000002",
      "recipient_id": "00000000-0000-0000-0000-000000000003"
    },
    "old_record": null
  }' \
  "$FUNCTION_URL")

BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')
STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)

echo "Status: $STATUS"
echo "Body: $BODY"

if [ "$STATUS" = "200" ]; then
  echo "PASS: Function returned 200"
else
  echo "FAIL: Expected 200, got $STATUS"
  exit 1
fi

echo ""

# Test 2: trade_messages INSERT
echo "--- Test 2: Mock trade_messages INSERT ---"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "trade_messages",
    "record": {
      "id": "00000000-0000-0000-0000-000000000010",
      "trade_id": "00000000-0000-0000-0000-000000000001",
      "sender_id": "00000000-0000-0000-0000-000000000002",
      "content": "Test message"
    },
    "old_record": null
  }' \
  "$FUNCTION_URL")

BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')
STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)

echo "Status: $STATUS"
echo "Body: $BODY"

if [ "$STATUS" = "200" ]; then
  echo "PASS: Function returned 200"
else
  echo "FAIL: Expected 200, got $STATUS"
  exit 1
fi

echo ""

# Test 3: Unhandled table (should return 200 with skipped)
echo "--- Test 3: Unhandled table ---"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "INSERT",
    "table": "other_table",
    "record": {},
    "old_record": null
  }' \
  "$FUNCTION_URL")

BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS:/d')
STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)

echo "Status: $STATUS"
echo "Body: $BODY"

if [ "$STATUS" = "200" ]; then
  echo "PASS: Function returned 200"
else
  echo "FAIL: Expected 200, got $STATUS"
  exit 1
fi

echo ""
echo "All tests passed!"
