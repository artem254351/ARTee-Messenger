FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY server.js ./
COPY public ./public

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]