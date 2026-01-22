# KYUBIC App

KYUBICの起動を楽にするアプリ

<img width="480" height="1116" alt="image" src="https://github.com/user-attachments/assets/d3f49f49-62db-4aab-ab9d-e8c1b0379251" />


<br><br>

## Install App

Download file from [release](https://github.com/KyutechUnderWater/kyubic_app/releases/latest)

```bash
# .dev
sudo dpkg -i {your download dir}/kyubic-app_0.1.0_amd64.deb
kyubic-app

# appimage
./{your download dir}/kyubic-app_0.1.0_amd64.AppImage
```

<br>

## Develop
### Installation
#### == Native ==
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
. "$HOME/.cargo/env"
```

<br>

#### == Docker ==
```
# Before executing the following command, clone it.
cd docker
docker compose up -d
docker compose exec tauri-dev bash
```

<br>

### Clone and Sync
```bash
# Clone repo
git clone

# Install npm dependencies
npm install
```

<br>

### Hot Reload
```bash
npm run tauri dev
```

<br>

###  Generate icon
```bash
npm run tauri icon src-tauri/icons/KYUBIC_RoboSub2022_v3.png
```

<br>

### Release Build
```bash
npm run tauri build
```
