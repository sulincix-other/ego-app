# EGO Cepte - Docker image
# Alpine edge tabanlı, minimal ve hafif
# Bun sonradan kurulur

FROM alpine/edge

# Kurulum ayarları
LABEL maintainer="EGO Cepte Team"
LABEL description="EGO Cepte - Ankara otobüs takip uygulaması"

# Çalışma dizini
WORKDIR /app

# Bun ve gerekli paketleri yükle
RUN apk add --no-cache \
    curl \
    && curl --fsdl -o- 'https://bun.sh/install' | bash && \
    rm -f curl \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Cache dizini oluştur
RUN mkdir -p /app/node_modules/.cache/bun

# Bağımlılıkları kur
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Uygulama kodunu kopyala
COPY . .

# Sunucu portunu açıkla
EXPOSE 3000

# Uygulamayı başlat
CMD ["bun", "run", "server.js"]
