FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Ensure data dir exists
RUN mkdir -p data

EXPOSE 3000

# Run as non-root
USER node

CMD ["node", "src/server.js"]
