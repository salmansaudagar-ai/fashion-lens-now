#!/bin/bash
# VTO Edge Function Test Script
# Usage: ./test_vto.sh <person_image_b64_file> <garment_image_b64_file> [models]
# Example: ./test_vto.sh person_b64.txt garment_b64.txt "idm-vton,vertex-ai"
#
# Prerequisites:
# - Images must be resized to 768x1024 and base64 encoded
# - Supabase secrets must be updated with current Gradio URLs
# - SUPABASE_ANON_KEY env var must be set

set -euo pipefail

SUPABASE_URL="https://qfumhgipfhzubmorymbd.supabase.co"
ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmdW1oZ2lwZmh6dWJtb3J5bWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTkzNTcsImV4cCI6MjA4ODc5NTM1N30.2vG-xUX178EuSj0h2x2fat8SzP-S6GZVPiSWj3_p9J8}"

PERSON_B64_FILE="${1:?Usage: $0 <person_b64_file> <garment_b64_file> [models]}"
GARMENT_B64_FILE="${2:?Usage: $0 <person_b64_file> <garment_b64_file> [models]}"
MODELS="${3:-idm-vton,vertex-ai}"

echo "=== VTO Edge Function Test ==="
echo "Models: $MODELS"

# Step 1: Create session
echo -e "\n--- Creating session ---"
SESSION_RESPONSE=$(curl -s -X POST \
  "$SUPABASE_URL/functions/v1/create-session" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{}')

SESSION_TOKEN=$(echo "$SESSION_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sessionToken',''))" 2>/dev/null || echo "")

if [ -z "$SESSION_TOKEN" ]; then
  echo "ERROR: Failed to create session"
  echo "Response: $SESSION_RESPONSE"
  exit 1
fi
echo "Session token: ${SESSION_TOKEN:0:20}..."

# Step 2: Read base64 images
PERSON_B64=$(cat "$PERSON_B64_FILE")
GARMENT_B64=$(cat "$GARMENT_B64_FILE")
echo "Person image: ${#PERSON_B64} chars"
echo "Garment image: ${#GARMENT_B64} chars"

# Step 3: Build models array
MODELS_JSON=$(echo "$MODELS" | python3 -c "
import sys
models = sys.stdin.read().strip().split(',')
print('[' + ','.join(['\"' + m.strip() + '\"' for m in models]) + ']')
")

# Step 4: Call generate-virtual-tryon
echo -e "\n--- Calling generate-virtual-tryon ---"
echo "Models: $MODELS_JSON"
START_TIME=$(date +%s)

RESULT=$(curl -s -w "\n%{http_code}" -X POST \
  "$SUPABASE_URL/functions/v1/generate-virtual-tryon" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-session-token: $SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  --max-time 180 \
  -d "{
    \"fullBodyImage\": \"data:image/jpeg;base64,$PERSON_B64\",
    \"outfitImageUrls\": [\"data:image/jpeg;base64,$GARMENT_B64\"],
    \"category\": \"upper_body\",
    \"garmentDescription\": \"upper body garment\",
    \"models\": $MODELS_JSON
  }")

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
HTTP_CODE=$(echo "$RESULT" | tail -1)
BODY=$(echo "$RESULT" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Time: ${ELAPSED}s"

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "\n--- Results ---"
  echo "$BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f\"Success: {data.get('success')}\")
print(f\"Winner: {data.get('winner', 'N/A')}\")
for r in data.get('modelResults', []):
    print(f\"  {r.get('model')}: success={r.get('success')}, time={r.get('duration_seconds', 'N/A')}s\")
" 2>/dev/null || echo "$BODY" | head -c 500
else
  echo "ERROR: $BODY" | head -c 500
fi
