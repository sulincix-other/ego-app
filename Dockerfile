# EGO Cepte - Docker image
# Debian tabanlı, minimal ve hafif

FROM debian:stable-slim

LABEL maintainer="EGO Cepte Team"
LABEL description="EGO Cepte - Ankara otobüs takip uygulaması"

WORKDIR /app

# Bun ve gerekli paketleri yükle
RUN apt-get update \
    && apt-get install -yq --no-install-recommends ca-certificates curl bash unzip \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
RUN ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Uygulama kodunu kopyala (npm bağımlılığı yok)
COPY . .

EXPOSE 3000

CMD ["bun", "run", "server.js"]
