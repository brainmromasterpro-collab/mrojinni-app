#!/bin/sh
echo "Generating env-config.js..."
cat > dist/env-config.js << EOF
window.__SUPABASE_URL__ = "${VITE_SUPABASE_URL}";
window.__SUPABASE_ANON_KEY__ = "${VITE_SUPABASE_ANON_KEY}";
EOF
echo "env-config.js generated:"
cat dist/env-config.js
npx serve -s dist -l $PORT
