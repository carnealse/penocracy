FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jre-headless curl xz-utils unzip ca-certificates \
  && curl -fsSL -o /tmp/typst.tar.xz https://github.com/typst/typst/releases/download/v0.15.1/typst-x86_64-unknown-linux-musl.tar.xz \
  && tar -xf /tmp/typst.tar.xz -C /tmp \
  && mv /tmp/typst-x86_64-unknown-linux-musl/typst /usr/local/bin/typst \
  && curl -fsSL -o /tmp/epubcheck.zip https://github.com/w3c/epubcheck/releases/download/v5.4.0/epubcheck-5.4.0.zip \
  && unzip -q /tmp/epubcheck.zip -d /opt \
  && rm -rf /var/lib/apt/lists/* /tmp/typst.tar.xz /tmp/epubcheck.zip

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate

ENV EXPORT_MODE=worker
ENV EPUBCHECK_JAR=/opt/epubcheck-5.4.0/epubcheck.jar
ENV TYPST_BIN=typst

CMD ["npx", "tsx", "scripts/export-worker.ts"]
