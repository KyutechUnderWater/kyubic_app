# KYUBIC App

KYUBICの起動を楽にするアプリ

## Develop
### Installation
Install apt packages
```bash
sudo apt update
sudo apt install -y \
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
    xdg-utils
```

Install Nodejs
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && \
\. "$HOME/.nvm/nvm.sh" && \
nvm install 24
PATH=$PATH:~/.nvm/versions/node/v24.13.0/bin
echo "PATH=$PATH:~/.nvm/versions/node/v24.13.0/bin" >> ~/.bashrc
```

Install rust
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```

### Hot Reload
```bash
npm run tauri dev
```

### Release Build
```bash
npm run tauri build
```
