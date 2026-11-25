#!/usr/bin/env bash
# يشغّل المنصة تلقائيًا داخل GitHub Codespaces (مناسب للتجربة من الجوال).
# الرابط العام للمنفذ 3000 يكون HTTPS، فتعمل الكاميرا في صفحة التحضير.
if [ -n "$CODESPACE_NAME" ]; then
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
export DEMO_MODE=true
nohup npm run dev:local > /tmp/wafda.log 2>&1 &
echo "وفدة تعمل في الخلفية. السجل: /tmp/wafda.log — الرابط: ${APP_URL:-http://localhost:3000}"
