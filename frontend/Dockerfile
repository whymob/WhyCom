FROM node:20-bullseye

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
