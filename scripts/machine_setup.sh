#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

python3 -m venv venv
venv/bin/pip install git+https://github.com/elifriedman/label-studio.git@timeseries/horizontal
venv/bin/python venv/lib/python3.11/site-packages/label_studio/manage.py collectstatic
venv/bin/pip install -r requirements.txt

install_services="n"
if [[ -t 0 ]]; then
    read -r -p "Should Label Studio and the RiverLabel admin website start automatically in the background, including after a restart? This is for if you're running on a server. Respond with y or n " install_services || true
fi

if [[ "$install_services" =~ ^[Yy]$ ]]; then
    sudo install -m 0644 services/label_studio.service /etc/systemd/system/label_studio.service
    sudo install -m 0644 services/admin_api.service /etc/systemd/system/admin_api.service
    sudo systemctl daemon-reload
    sudo systemctl enable --now label_studio.service admin_api.service
else
    echo "Skipping systemd service installation."
fi
