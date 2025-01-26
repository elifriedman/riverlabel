#!/bin/bash
python3 -m venv venv
venv/bin/pip install git+https://github.com/elifriedman/label-studio.git@timeseries/horizontal
venv/bin/python venv/lib/python3.11/site-packages/label_studio/manage.py collectstatic
venv/bin/pip install flask
