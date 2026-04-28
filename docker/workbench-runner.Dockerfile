FROM node:22-bookworm

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY docs ./docs

RUN npm ci
RUN npm run build

ENTRYPOINT ["node", "dist/workbench/container-runner.js"]
