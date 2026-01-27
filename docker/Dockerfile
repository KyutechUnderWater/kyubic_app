FROM ubuntu:22.04

SHELL [ "/bin/bash", "-c" ]

# Install dependencies of Tauri
RUN apt-get update && apt-get install -y \
    vim \
    curl \
    wget \
    unzip \
    git \
    file \
    build-essential \
    libgtk-3-dev \
    libcanberra-gtk3-module \
    libwebkit2gtk-4.1-dev \
    librsvg2-dev \
    xdg-utils \
    # libssl-dev \
    # libayatana-appindicator3-dev \
    && apt-get clean

# Install firefox
# https://support.mozilla.org/en-US/kb/install-firefox-linux
RUN wget -q https://packages.mozilla.org/apt/repo-signing-key.gpg -O- | tee /etc/apt/keyrings/packages.mozilla.org.asc > /dev/null && \
    echo "deb [signed-by=/etc/apt/keyrings/packages.mozilla.org.asc] https://packages.mozilla.org/apt mozilla main" | tee -a /etc/apt/sources.list.d/mozilla.list > /dev/null && \
    printf "Package: *\nPin: origin packages.mozilla.org\nPin-Priority: 1000\n" | tee /etc/apt/preferences.d/mozilla && \
    apt-get update && apt-get -y install firefox && \
    apt-get clean

# Install Node.js
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
    \. "$HOME/.nvm/nvm.sh" && \
    nvm install 24

# Install rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# 作業ディレクトリの設定
WORKDIR /app

CMD ["/bin/bash"]
