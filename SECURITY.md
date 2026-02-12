# Security Notes

## Webhook Endpoints (kai-tools nginx)

Two endpoints bypass basic auth and need app-level verification.

### 1. /api/deploy - GitHub Webhook

- Nginx config has auth_basic off on this path
- The app MUST validate the X-Hub-Signature-256 header using HMAC-SHA256 with your webhook secret
- Verify: check that the deploy handler rejects requests with missing/invalid signatures
- Consider also IP-whitelisting GitHub webhook IPs (see https://api.github.com/meta, hooks key)

### 2. /voice/ - Twilio Webhooks

- Nginx proxies to port 3033 with no auth
- The app MUST validate Twilio request signatures using the X-Twilio-Signature header and your auth token
- Twilio Node SDK provides validateRequest() / webhook() middleware for this
- Without validation, anyone can send fake call/SMS events to this endpoint

## kaivalo.com SSL

Once the domain is purchased and DNS A records point to 77.42.83.205:

    sudo certbot --nginx -d kaivalo.com -d www.kaivalo.com -d mechai.kaivalo.com
