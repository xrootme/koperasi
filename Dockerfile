FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p auth logs credentials
ENV NODE_ENV=production
CMD ["node","index.js"]
