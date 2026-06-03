FROM saschpe/android-ndk:35-jdk21.0.6_7-ndk26.3.11579264-cmake3.31.1

USER root

ENV LIBNODE_PATH=/opt/libnode

# Install nodejs 18.20.4 (same version as capacitor-nodejs)
ARG NODE_MAJOR=18

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    make \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/RockinChaos/Capacitor-NodeJS/releases/download/v1.0.0-beta.11/capacitor-nodejs-1.0.0-beta.11.tgz | tar -xz \
    && mv package/android/libnode /opt/libnode \
    && rm -rf package

WORKDIR /app