FROM node:22-bookworm

ENV PATH="/app/node_modules/.bin:/work/.venv/bin:${PATH}" \
    PIP_REQUIRE_VIRTUALENV=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    file \
    findutils \
    gawk \
    git \
    grep \
    jq \
    less \
    python-is-python3 \
    python3 \
    python3-pip \
    python3-venv \
    ripgrep \
    sed \
    unzip \
    wget \
    zip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY docs ./docs

RUN npm ci \
  && npm run build \
  && useradd -m -u 10001 agent
USER agent

ENTRYPOINT ["node", "/app/dist/workbench/container-runner.js"]
