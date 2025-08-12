FROM node:20-alpine
WORKDIR /app
RUN pwd && ls -la
COPY package.json package-lock.json* ./
RUN npm ci || npm install --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm","start"]