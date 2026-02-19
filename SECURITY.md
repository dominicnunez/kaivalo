# Security Notes

## kaivalo.com SSL

Once the domain is purchased and DNS A records point to the production server:

    sudo certbot --nginx -d kaivalo.com -d www.kaivalo.com -d mechai.kaivalo.com
