@echo off
python -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python extract_mlbb_data.py --out MLBB_DATASET_OUTPUT --max-tournament-pages 250 --min-output-mb 100
pause
