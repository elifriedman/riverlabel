#!/bin/bash

#venv/bin/python scripts/api.py &
export LABEL_STUDIO_DISABLE_SIGNUP_WITHOUT_LINK=true
export CSRF_TRUSTED_ORIGINS=https://labelstudio.elifdev.com
source ./venv/bin/activate
./venv/bin/label-studio
