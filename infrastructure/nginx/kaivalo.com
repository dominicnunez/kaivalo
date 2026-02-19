# Kaivalo.com nginx configuration
#
# Installation:
#   sudo bash infrastructure/nginx/install.sh
#   sudo systemctl reload nginx
#
# SSL (after domain registration and DNS propagation):
#   certbot --nginx -d kaivalo.com -d www.kaivalo.com -d mechai.kaivalo.com

# ============================================================================
# WebSocket upgrade mapping — only set Connection: upgrade when client requests it
# ============================================================================
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

# ============================================================================
# Rate limiting zones (applied in location blocks below)
# ============================================================================
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;

# ============================================================================
# HTTP to HTTPS redirect (uncomment after SSL is configured)
# ============================================================================
# server {
#     listen 80;
#     listen [::]:80;
#     server_name kaivalo.com www.kaivalo.com mechai.kaivalo.com;
#
#     location /.well-known/acme-challenge/ {
#         root /var/www/html;
#     }
#
#     location / {
#         return 301 https://$host$request_uri;
#     }
# }

# ============================================================================
# Main site: kaivalo.com and www.kaivalo.com
# ============================================================================
server {
    listen 80;
    listen [::]:80;
    server_name kaivalo.com www.kaivalo.com;
    server_tokens off;
    client_max_body_size 10m;

    # Redirect www to non-www
    if ($host = www.kaivalo.com) {
        return 301 $scheme://kaivalo.com$request_uri;
    }

    # Auth routes are HTTP-only request/response (OAuth callbacks) — no
    # WebSocket support needed. Upgrade/Connection upgrade headers are
    # intentionally omitted; Connection is set to "" to drop hop-by-hop headers.
    # Read timeout is higher than the general location for upstream OAuth latency.
    location /auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_connect_timeout 2s;
        proxy_read_timeout 60s;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static pages and API — 2s connect is sufficient for localhost, 30s read
    # covers SSR rendering. Increase read timeout if adding slow API routes.
    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_connect_timeout 2s;
        proxy_read_timeout 30s;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# ============================================================================
# MechanicAI subdomain: mechai.kaivalo.com
# ============================================================================
server {
    listen 80;
    listen [::]:80;
    server_name mechai.kaivalo.com;
    server_tokens off;
    client_max_body_size 10m;

    # MechanicAI app — same standard timeouts as the main site general location.
    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_connect_timeout 2s;
        proxy_read_timeout 30s;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# ============================================================================
# Catch-all: redirect *.kaivalo.com to kaivalo.com
# Note: Not using default_server since system default site already has it
# This catches any *.kaivalo.com subdomain not explicitly defined above
# ============================================================================
server {
    listen 80;
    listen [::]:80;
    server_name *.kaivalo.com;
    server_tokens off;
    limit_req zone=general burst=5 nodelay;

    return 301 $scheme://kaivalo.com$request_uri;
}
