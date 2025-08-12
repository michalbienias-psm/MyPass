FROM node:20-alpine
WORKDIR /
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["npm","start"]
