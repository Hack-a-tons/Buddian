FROM nginx:1.25-alpine

# Install additional packages for SSL and auth
RUN apk add --no-cache \
    apache2-utils \
    openssl \
    curl

# Create directories for SSL certificates and auth files
RUN mkdir -p /etc/nginx/ssl \
    && mkdir -p /var/www/static

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create a default .htpasswd file (should be overridden in production)
RUN echo "admin:\$apr1\$ruca84Hq\$mbjdMZBAG.KWn7vfN/SNK/" > /etc/nginx/.htpasswd

# Generate self-signed SSL certificate for development
# In production, these should be replaced with real certificates
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/buddian.com.key \
    -out /etc/nginx/ssl/buddian.com.crt \
    -subj "/C=US/ST=CA/L=San Francisco/O=Buddian/OU=IT Department/CN=buddian.com/emailAddress=admin@buddian.com" \
    -addext "subjectAltName=DNS:buddian.com,DNS:*.buddian.com,DNS:app.buddian.com,DNS:db.buddian.com,DNS:monitoring.buddian.com"

# Set proper permissions
RUN chmod 600 /etc/nginx/ssl/buddian.com.key \
    && chmod 644 /etc/nginx/ssl/buddian.com.crt \
    && chmod 644 /etc/nginx/.htpasswd

# Create nginx user and set ownership
RUN chown -R nginx:nginx /var/cache/nginx \
    && chown -R nginx:nginx /var/log/nginx \
    && chown -R nginx:nginx /etc/nginx/ssl \
    && chown -R nginx:nginx /var/www/static

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Expose ports
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
