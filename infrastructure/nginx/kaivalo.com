# Kaivalo.com nginx configuration
#
# Installation:
#   sudo cp /home/kai/pets/kaivalo/infrastructure/nginx/kaivalo.com /etc/nginx/sites-available/
#   sudo ln -s /etc/nginx/sites-available/kaivalo.com /etc/nginx/sites-enabled/
#   sudo nginx -t
#   sudo systemctl reload nginx
#
# SSL (after domain registration and DNS propagation):
#   certbot --nginx -d kaivalo.com -d www.kaivalo.com -d mechai.kaivalo.com

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

    # Redirect www to non-www
    if ($host = www.kaivalo.com) {
        return 301 $scheme://kaivalo.com$request_uri;
    }

    location /auth/ {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSL configuration placeholder (certbot will add this)
    # listen 443 ssl;
    # listen [::]:443 ssl;
    # ssl_certificate /etc/letsencrypt/live/kaivalo.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/kaivalo.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}

# ============================================================================
# MechanicAI subdomain: mechai.kaivalo.com
# ============================================================================
server {
    listen 80;
    listen [::]:80;
    server_name mechai.kaivalo.com;
    server_tokens off;

    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://127.0.0.1:3101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # SSL configuration placeholder (certbot will add this)
    # listen 443 ssl;
    # listen [::]:443 ssl;
    # ssl_certificate /etc/letsencrypt/live/kaivalo.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/kaivalo.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
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

    return 301 $scheme://kaivalo.com/;
}
