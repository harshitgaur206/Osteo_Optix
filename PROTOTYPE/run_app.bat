@echo off
echo =======================================================================
echo  Osteo-Optix — Multimodal Knee OA Screening System (SIH 26004)
echo  Starting Integrated Backend Server & Web Application...
echo =======================================================================

:: Change directory to backend
cd /d "%~dp0backend"

:: Check & seed database if needed
echo [1/3] Initializing SQLite Database & Demo Records...
python -m app.seed_data

:: Launch Browser to local backend & app URL after 2 seconds
echo [2/3] Opening Web Browser...
start "" "http://127.0.0.1:8000/app"

:: Start Uvicorn Server
echo [3/3] Starting FastAPI REST Backend Server on Port 8000...
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

pause
