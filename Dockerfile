FROM node:20-bullseye-slim
# cache-bust: 3
WORKDIR /app

# Install dependencies first (cached layer)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend and frontend
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Run from the backend folder (server.js uses __dirname to find ../frontend)
WORKDIR /app/backend

EXPOSE 3000

ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

CMD ["node", "server.js"]
