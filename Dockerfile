FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/web-verify/package.json ./apps/web-verify/
COPY packages/shared/package.json ./packages/shared/
COPY packages/validation/package.json ./packages/validation/

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "run", "start"]
