FROM node:20-alpine
WORKDIR /app
COPY members-api/package*.json ./
RUN npm ci
COPY members-api/. .
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm","start"]
