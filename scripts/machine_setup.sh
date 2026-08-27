#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

python3 -m venv venv
venv/bin/pip install git+https://github.com/elifriedman/label-studio.git@timeseries/horizontal
venv/bin/python venv/lib/python3.11/site-packages/label_studio/manage.py collectstatic
venv/bin/pip install -r requirements.txt

# optional: if you want to run the label studio and the admin pages
# even when you're not logged in, then run the following:
sudo install -m 0644 services/label_studio.service /etc/systemd/system/label_studio.service
sudo install -m 0644 services/admin_api.service /etc/systemd/system/admin_api.service
sudo systemctl daemon-reload
sudo systemctl enable --now label_studio.service admin_api.service
