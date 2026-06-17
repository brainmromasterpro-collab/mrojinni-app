#!/bin/sh
# Inject Supabase env vars into the built JS at runtime
sed -i "s|PLACEHOLDER_SUPABASE_URL|$VITE_SUPABASE_URL|g" dist/assets/*.js
sed -i "s|PLACEHOLDER_SUPABASE_ANON_KEY|$VITE_SUPABASE_ANON_KEY|g" dist/assets/*.js
npx serve -s dist -l $PORT
