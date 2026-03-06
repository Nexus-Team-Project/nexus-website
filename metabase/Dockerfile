FROM metabase/metabase:latest

# Metabase runs on port 3000 by default.
# Railway injects PORT env var — Metabase reads MB_JETTY_PORT.
ENV MB_JETTY_PORT=${PORT:-3000}

EXPOSE ${PORT:-3000}
