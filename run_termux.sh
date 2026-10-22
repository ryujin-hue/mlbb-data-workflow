#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg update -y
pkg install -y python git
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python extract_mlbb_data.py --out MLBB_DATASET_OUTPUT --max-tournament-pages 250 --min-output-mb 100
