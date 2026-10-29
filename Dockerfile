# EGO Cepte - Docker image
# Alpine edge tabanlı, minimal ve hafif

FROM bun:1.1.30-alpine

# Kurulum ayarları
LABEL maintainer="EGO Cepte Team"
LABEL description="EGO Cepte - Ankara otobüs takip uygulaması"

# Çalışma dizini
WORKDIR /app

# Bun cache'ini optimize et
RUN apk add --no-cache \
    && mkdir -p /app/node_modules/.cache/bun

# Bağımlılıkları kur
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Uygulama kodunu kopyala
COPY . .

# Sunucu portunu açıkla
EXPOSE 3000

# Uygulamayı başlat
CMD ["bun", "run", "server.js"]
