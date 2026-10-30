# EGO Cepte - Docker image
# Debian-based, minimal and lightweight

FROM debian:stable-slim

LABEL maintainer="EGO Cepte Team"
LABEL description="EGO Cepte - Ankara bus tracking app"

WORKDIR /app

# Install Bun and required packages
RUN apt-get update \
    && apt-get install -yq --no-install-recommends ca-certificates curl bash unzip \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://bun.sh/install | bash
RUN ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Copy the application code
COPY . .

EXPOSE 3000

CMD ["bun", "run", "server.js"]
