#!/usr/bin/env bash
set -euo pipefail

REPO_URL=${1:-}
APP_DIR=${2:-/opt/video-editor}
NODE_VERSION=${3:-18}
SERVICE_NAME=video-editor
APP_USER=videoeditor
PORT=${4:-3000}

if [[ -z "$REPO_URL" ]]; then
  echo "Uso: $0 <git-repo-url> [app-dir=/opt/video-editor] [node-version=18] [port=3000]"
  exit 1
fi

echo "Instalando dependências no sistema (Debian/Ubuntu)..."
sudo apt-get update
sudo apt-get install -y curl ca-certificates gnupg lsb-release git build-essential ffmpeg ufw

# Install Node.js from NodeSource
echo "Instalando Node.js v$NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
sudo apt-get install -y nodejs

# Create app user
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  echo "Criando usuário de sistema '$APP_USER'..."
  sudo useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER" || true
fi

# Clone or update repo
if [[ -d "$APP_DIR" && -d "$APP_DIR/.git" ]]; then
  echo "Atualizando repositório existente em $APP_DIR"
  sudo git -C "$APP_DIR" pull
else
  echo "Clonando $REPO_URL em $APP_DIR"
  sudo git clone "$REPO_URL" "$APP_DIR"
fi

# Set ownership
sudo chown -R "$APP_USER":"$APP_USER" "$APP_DIR" || sudo chown -R $(whoami):$(whoami) "$APP_DIR"

# Install Node dependencies
echo "Instalando dependências Node..."
cd "$APP_DIR"
sudo -u "$APP_USER" bash -lc "npm install --production"

# Create systemd service file
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
echo "Criando service em $SERVICE_PATH"
sudo tee "$SERVICE_PATH" > /dev/null <<EOF
[Unit]
Description=Video Editor API
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start service
sudo systemctl daemon-reload
sudo systemctl enable --now ${SERVICE_NAME}

# Configure UFW to allow the port
if command -v ufw >/dev/null 2>&1; then
  echo "Configurando firewall UFW para permitir porta ${PORT}..."
  sudo ufw allow ${PORT}/tcp || true
  sudo ufw reload || true
fi

echo "Instalação concluída. Serviço ativo: systemctl status ${SERVICE_NAME}"

echo "Acesse: http://<VPS_IP>:${PORT} (caso o serviço esteja escutando nessa porta)"
