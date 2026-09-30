from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import json
import os
import logging

from .database import Base, engine, get_db
from .models import User, Screening, VisionFeatures, SensorFeatures, SurveyResults, Explanation, TrainingData, HealthWorker
from .schemas import (
    UserCreate, UserResponse,
    ScreeningCreate, ScreeningResponse,
    SyncBatchRequest, SyncBatchResponse,
    DashboardStats, SharedReportResponse,
    ExplanationItem, WorkerLoginRequest, WorkerLoginResponse, HealthWorkerOut
)
from .ml.engine import calculate_screening_risk, MODEL_VERSION, MODEL_MODE, MLSafetyDisclaimer
from .auth import verify_pin, create_access_token, get_current_worker
from .seed_data import seed_database

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Osteo-Optix API — Multimodal Knee OA Screening System (SIH 26004)",
    description="Offline-first Multimodal Knee Osteoarthritis Screening System Backend for North Eastern Region India",
    version="1.0.0"
)

@app.on_event("startup")
def startup_event():
    try:
        seed_database()
    except Exception as e:
        print(f"Startup seed error (ignoring if initialized): {e}")

# CORS is configurable via the ALLOWED_ORIGINS env var (comma-separated),
# e.g. "https://osteo-optix.example.org,https://staging.osteo-optix.example.org".
# Falling back to "*" (any origin) with credentials allowed is fine for a
# hackathon demo but is not safe once this handles real patient data — a
# wildcard origin means any website can call these authenticated endpoints
# from a victim's browser. Set ALLOWED_ORIGINS in production.
_allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "").strip()
if _allowed_origins_env:
    _allowed_origins = [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
    _allow_credentials = True
else:
    logger.warning(
        "ALLOWED_ORIGINS not set — falling back to allow_origins=['*']. "
        "This is acceptable for local/demo use only; set ALLOWED_ORIGINS to "
        "a comma-separated allow-list before handling real patient data."
    )
    _allowed_origins = ["*"]
    # A wildcard origin combined with credentials is rejected by browsers
    # anyway (and is a bad idea even where it isn't), so only allow
    # credentialed requests once real origins are configured.
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _serve_bundled_index():
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    index_path = os.path.join(root_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(
            index_path,
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    return None

@app.get("/app", response_class=FileResponse)
def serve_frontend_app():
    response = _serve_bundled_index()
    if response:
        return response
    return HTMLResponse("<h1>Osteo-Optix Frontend index.html not found</h1>")

@app.get("/")
def read_root():
    response = _serve_bundled_index()
    if response:
        return response
    return {
        "system": "Osteo-Optix — Multimodal Knee Osteoarthritis Screening API (NER SIH 26004)",
        "status": "online",
        "model_version": MODEL_VERSION,
        "model_mode": MODEL_MODE,
        "disclaimer": MLSafetyDisclaimer.TEXT
    }

@app.get("/api/info")
def get_api_info():
    return {
        "system": "Osteo-Optix — Multimodal Knee Osteoarthritis Screening API (NER SIH 26004)",
        "status": "online",
        "model_version": MODEL_VERSION,
        "model_mode": MODEL_MODE,
        "disclaimer": MLSafetyDisclaimer.TEXT
    }

@app.get("/api/model/version")
def get_model_metadata():
    return {
        "model_name": "Osteo-Optix_Baseline_Heuristic_v1_NER",
        "model_version": MODEL_VERSION,
        "model_mode": MODEL_MODE,
        "training_dataset": "NER Multimodal Knee Cohort v1.2 (Validated Features)",
        "features_supported": [
            "vision_rom", "vision_symmetry_index", "vision_trunk_lean",
            "imu_angular_velocity_peak", "imu_impact_jerk", "imu_relative_knee_angle",
            "womac_pain", "womac_stiffness", "womac_function", "womac_total",
            "occupational_load", "terrain_exposure", "age", "sex", "previous_knee_injury"
        ],
        "risk_thresholds": {
            "normal_minimal_risk": "0 - 30%",
            "mild_oa": "31 - 55%",
            "moderate_oa": "56 - 80%",
            "severe_oa": "81 - 100%"
        }
    }

# ---------------- AUTHENTICATION ENDPOINTS ----------------

# A 4-digit PIN is only 10,000 combinations, so worker-login MUST be rate
# limited or it is trivially brute-forceable. This is a simple in-memory
# limiter (per worker_id AND per client IP) that is fine for a single-process
# deployment; a multi-process/production deployment should back this with
# Redis (or similar shared store) instead, since in-memory state does not
# survive a restart or get shared across workers.
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_LOCKOUT_SECONDS = 15 * 60  # 15 minutes
_login_failures: Dict[str, List[float]] = {}

def _prune_and_count_failures(key: str) -> int:
    now = datetime.utcnow().timestamp()
    window_start = now - _LOGIN_LOCKOUT_SECONDS
    attempts = [t for t in _login_failures.get(key, []) if t >= window_start]
    _login_failures[key] = attempts
    return len(attempts)

def _record_failure(key: str):
    _login_failures.setdefault(key, []).append(datetime.utcnow().timestamp())

def _check_rate_limit(worker_id: str, client_ip: str):
    for key in (f"worker:{worker_id}", f"ip:{client_ip}"):
        if _prune_and_count_failures(key) >= _LOGIN_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Please try again in up to {_LOGIN_LOCKOUT_SECONDS // 60} minutes."
            )

@app.post("/api/auth/worker-login", response_model=WorkerLoginResponse)
def worker_login(payload: WorkerLoginRequest, request: Request, db: Session = Depends(get_db)):
    worker_id = payload.worker_id.strip()
    pin = payload.pin.strip()
    client_ip = request.client.host if request.client else "unknown"

    _check_rate_limit(worker_id, client_ip)

    worker = db.query(HealthWorker).filter(HealthWorker.worker_id == worker_id, HealthWorker.is_active == True).first()
    if not worker:
        logger.debug("worker-login failed: no active worker for worker_id=%r", worker_id)
        _record_failure(f"worker:{worker_id}")
        _record_failure(f"ip:{client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Health Worker ID or PIN code"
        )
    if not verify_pin(pin, worker.pin_hash):
        logger.debug(
            "worker-login failed: PIN mismatch for worker_id=%r (stored hash prefix=%r)",
            worker_id,
            (worker.pin_hash or "")[:7],
        )
        _record_failure(f"worker:{worker_id}")
        _record_failure(f"ip:{client_ip}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Health Worker ID or PIN code"
        )

    # Successful login clears this worker's failure count (IP counter is left
    # alone deliberately, since it's shared across worker_ids on that IP).
    _login_failures.pop(f"worker:{worker_id}", None)

    token = create_access_token(data={"worker_id": worker.worker_id, "name": worker.name})
    return WorkerLoginResponse(
        access_token=token,
        token_type="bearer",
        worker=HealthWorkerOut.from_orm(worker)
    )

# ---------------- USER ENDPOINTS ----------------

@app.post("/api/users", response_model=UserResponse)
def create_user(user: UserCreate, db: Session = Depends(get_db)):
    user_id = user.user_id or f"NER_{uuid.uuid4().hex[:6].upper()}"
    
    existing = db.query(User).filter(User.user_id == user_id).first()
    if existing:
        return existing
        
    db_user = User(
        user_id=user_id,
        name=user.name,
        age=user.age,
        sex=user.sex,
        village=user.village,
        district=user.district,
        state=user.state,
        phone=user.phone,
        occupation=user.occupation,
        occupational_load=user.occupational_load,
        terrain_exposure=user.terrain_exposure,
        previous_knee_injury=user.previous_knee_injury,
        existing_oa_diagnosis=user.existing_oa_diagnosis,
        target_knee=user.target_knee,
        consent_given=user.consent_given,
        consent_timestamp=user.consent_timestamp or datetime.utcnow()
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/api/users/{user_id}", response_model=UserResponse)
def get_user(user_id: str, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.user_id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

# ---------------- SCREENING ENDPOINTS ----------------

def _process_and_save_screening(data: ScreeningCreate, db: Session, current_worker: Optional[HealthWorker] = None) -> ScreeningResponse:
    worker_id = (current_worker.worker_id if current_worker else None) or data.worker_id
    db_user = db.query(User).filter(User.user_id == data.user_id).first()
    if not db_user:
        db_user = User(
            user_id=data.user_id,
            name="NER User",
            age=45,
            sex="Female",
            district="Kamrup",
            state="Assam",
            occupational_load="Tea Estate",
            terrain_exposure="Hilly"
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

    screening_id = data.screening_id or f"SCR_{uuid.uuid4().hex[:8].upper()}"
    
    existing_scr = db.query(Screening).filter(Screening.screening_id == screening_id).first()
    if existing_scr:
        explanations = [
            ExplanationItem(feature=e.feature, contribution=e.contribution, direction=e.direction, description=e.description)
            for e in existing_scr.explanations
        ]
        # Reuse the triage guidance that was actually computed (and stored)
        # from the full survey/vision/sensor feature set at creation time,
        # instead of recomputing it here from demographics alone — that
        # recompute would ignore the data the stored risk score was based on
        # and could produce triage text inconsistent with it.
        triage = existing_scr.triage_guidance
        if not triage:
            _, _, _, _, triage = calculate_screening_risk(
                user_age=db_user.age, user_sex=db_user.sex,
                occupational_load=db_user.occupational_load, terrain_exposure=db_user.terrain_exposure,
                previous_knee_injury=db_user.previous_knee_injury
            )
        modalities = [m.strip() for m in existing_scr.available_modalities.split(",") if m.strip()]
        return ScreeningResponse(
            screening_id=existing_scr.screening_id,
            user_id=existing_scr.user_id,
            timestamp=existing_scr.timestamp,
            joint=existing_scr.joint,
            risk_probability=existing_scr.risk_probability,
            risk_category=existing_scr.risk_category,
            primary_driver=existing_scr.primary_driver,
            available_modalities=modalities,
            survey=data.survey,
            vision=data.vision,
            sensor=data.sensor,
            explanations=explanations,
            triage_guidance=triage,
            synced=True,
            model_version=existing_scr.model_version,
            is_demo=existing_scr.is_demo
        )

    risk_prob, risk_cat, primary_driver, explanations, triage_guidance = calculate_screening_risk(
        user_age=db_user.age,
        user_sex=db_user.sex,
        occupational_load=data.survey.occupational_load if data.survey else db_user.occupational_load,
        terrain_exposure=data.survey.terrain_exposure if data.survey else db_user.terrain_exposure,
        previous_knee_injury=db_user.previous_knee_injury,
        survey=data.survey,
        vision=data.vision,
        sensor=data.sensor,
        available_modalities=data.available_modalities
    )

    modalities_str = ",".join(data.available_modalities)
    
    db_screening = Screening(
        screening_id=screening_id,
        user_id=data.user_id,
        worker_id=worker_id,
        timestamp=data.timestamp or datetime.utcnow(),
        joint=data.joint,
        risk_probability=risk_prob,
        risk_category=risk_cat,
        primary_driver=primary_driver,
        triage_guidance=triage_guidance,
        available_modalities=modalities_str,
        synced=True,
        model_version=MODEL_VERSION,
        is_demo=data.is_demo
    )
    db.add(db_screening)
    db.commit()

    if data.vision:
        db_vis = VisionFeatures(
            screening_id=screening_id,
            rom=data.vision.rom,
            symmetry_index=data.vision.symmetry_index,
            trunk_lean=data.vision.trunk_lean,
            cadence=data.vision.cadence,
            step_duration=data.vision.step_duration,
            confidence=data.vision.confidence or 0.94
        )
        db.add(db_vis)

    if data.sensor:
        db_sen = SensorFeatures(
            screening_id=screening_id,
            angular_velocity_peak=data.sensor.angular_velocity_peak,
            impact_jerk=data.sensor.impact_jerk,
            relative_knee_angle=data.sensor.relative_knee_angle,
            signal_quality=data.sensor.signal_quality or "Good",
            wearable_available=data.sensor.wearable_available,
            sensor_source=data.sensor.sensor_source or "simulated"
        )
        db.add(db_sen)

    if data.survey:
        db_sur = SurveyResults(
            screening_id=screening_id,
            pain_score=data.survey.pain_score,
            stiffness_score=data.survey.stiffness_score,
            function_score=data.survey.function_score,
            womac_score=data.survey.womac_score,
            occupational_load=data.survey.occupational_load,
            terrain_exposure=data.survey.terrain_exposure
        )
        db.add(db_sur)

    for exp in explanations:
        db_exp = Explanation(
            screening_id=screening_id,
            feature=exp.feature,
            contribution=exp.contribution,
            direction=exp.direction,
            description=exp.description
        )
        db.add(db_exp)

    # Technical Audit Finding #6: Log Full Feature Vector to training_data table
    feature_vector_dict = {
        "user_id": data.user_id,
        "worker_id": worker_id,
        "age": db_user.age,
        "sex": db_user.sex,
        "occupational_load": data.survey.occupational_load if data.survey else db_user.occupational_load,
        "terrain_exposure": data.survey.terrain_exposure if data.survey else db_user.terrain_exposure,
        "previous_knee_injury": db_user.previous_knee_injury,
        "womac_score": data.survey.womac_score if data.survey else None,
        "pain_score": data.survey.pain_score if data.survey else None,
        "stiffness_score": data.survey.stiffness_score if data.survey else None,
        "function_score": data.survey.function_score if data.survey else None,
        "vision_rom": data.vision.rom if data.vision else None,
        "vision_symmetry_index": data.vision.symmetry_index if data.vision else None,
        "vision_trunk_lean": data.vision.trunk_lean if data.vision else None,
        "vision_cadence": data.vision.cadence if data.vision else None,
        "sensor_angular_velocity_peak": data.sensor.angular_velocity_peak if data.sensor else None,
        "sensor_impact_jerk": data.sensor.impact_jerk if data.sensor else None,
        "sensor_relative_knee_angle": data.sensor.relative_knee_angle if data.sensor else None,
        "sensor_source": data.sensor.sensor_source if data.sensor else "simulated",
        "risk_probability": risk_prob,
        "risk_category": risk_cat,
        "is_demo": data.is_demo
    }

    db_training = TrainingData(
        screening_id=screening_id,
        user_id=data.user_id,
        timestamp=db_screening.timestamp,
        is_demo=data.is_demo,
        age=db_user.age,
        sex=db_user.sex,
        occupational_load=data.survey.occupational_load if data.survey else db_user.occupational_load,
        terrain_exposure=data.survey.terrain_exposure if data.survey else db_user.terrain_exposure,
        previous_knee_injury=db_user.previous_knee_injury,
        womac_score=data.survey.womac_score if data.survey else None,
        pain_score=data.survey.pain_score if data.survey else None,
        stiffness_score=data.survey.stiffness_score if data.survey else None,
        function_score=data.survey.function_score if data.survey else None,
        vision_rom=data.vision.rom if data.vision else None,
        vision_symmetry_index=data.vision.symmetry_index if data.vision else None,
        vision_trunk_lean=data.vision.trunk_lean if data.vision else None,
        vision_cadence=data.vision.cadence if data.vision else None,
        sensor_angular_velocity_peak=data.sensor.angular_velocity_peak if data.sensor else None,
        sensor_impact_jerk=data.sensor.impact_jerk if data.sensor else None,
        sensor_relative_knee_angle=data.sensor.relative_knee_angle if data.sensor else None,
        risk_probability=risk_prob,
        risk_category=risk_cat,
        primary_driver=primary_driver,
        raw_feature_vector_json=json.dumps(feature_vector_dict)
    )
    db.add(db_training)

    db.commit()

    return ScreeningResponse(
        screening_id=screening_id,
        user_id=data.user_id,
        worker_id=worker_id,
        timestamp=db_screening.timestamp,
        joint=db_screening.joint,
        risk_probability=risk_prob,
        risk_category=risk_cat,
        primary_driver=primary_driver,
        available_modalities=data.available_modalities,
        survey=data.survey,
        vision=data.vision,
        sensor=data.sensor,
        explanations=explanations,
        triage_guidance=triage_guidance,
        synced=True,
        model_version=MODEL_VERSION,
        is_demo=data.is_demo
    )

@app.post("/api/screenings", response_model=ScreeningResponse)
def create_screening(
    data: ScreeningCreate, 
    db: Session = Depends(get_db), 
    current_worker: Optional[HealthWorker] = Depends(get_current_worker)
):
    return _process_and_save_screening(data, db, current_worker)

@app.get("/api/screenings/{screening_id}", response_model=ScreeningResponse)
def get_screening(screening_id: str, db: Session = Depends(get_db)):
    scr = db.query(Screening).filter(Screening.screening_id == screening_id).first()
    if not scr:
        raise HTTPException(status_code=404, detail="Screening not found")

    user = db.query(User).filter(User.user_id == scr.user_id).first()
    modalities = [m.strip() for m in scr.available_modalities.split(",") if m.strip()]
    
    explanations = [
        ExplanationItem(feature=e.feature, contribution=e.contribution, direction=e.direction, description=e.description)
        for e in scr.explanations
    ]

    survey_data = None
    if scr.survey_results:
        survey_data = SurveyResultsInput(
            pain_score=scr.survey_results.pain_score,
            stiffness_score=scr.survey_results.stiffness_score,
            function_score=scr.survey_results.function_score,
            womac_score=scr.survey_results.womac_score,
            occupational_load=scr.survey_results.occupational_load,
            terrain_exposure=scr.survey_results.terrain_exposure
        )

    vision_data = None
    if scr.vision_features:
        vision_data = VisionFeaturesInput(
            rom=scr.vision_features.rom,
            symmetry_index=scr.vision_features.symmetry_index,
            trunk_lean=scr.vision_features.trunk_lean,
            cadence=scr.vision_features.cadence,
            step_duration=scr.vision_features.step_duration,
            confidence=scr.vision_features.confidence
        )

    sensor_data = None
    if scr.sensor_features:
        sensor_data = SensorFeaturesInput(
            angular_velocity_peak=scr.sensor_features.angular_velocity_peak,
            impact_jerk=scr.sensor_features.impact_jerk,
            relative_knee_angle=scr.sensor_features.relative_knee_angle,
            signal_quality=scr.sensor_features.signal_quality,
            wearable_available=scr.sensor_features.wearable_available,
            sensor_source=getattr(scr.sensor_features, 'sensor_source', 'simulated')
        )

    # Use the triage guidance actually persisted at creation time — it was
    # derived from the full survey/vision/sensor feature set, the same
    # inputs the stored risk_probability/risk_category came from. Recomputing
    # it here from demographics alone (age/sex/occupational_load/terrain/
    # previous injury) would silently discard that survey/vision/sensor
    # evidence and could produce triage text that disagrees with the risk
    # score shown right next to it. Only fall back to a demographics-only
    # recompute for legacy rows saved before this field existed.
    triage = scr.triage_guidance
    if not triage:
        _, _, _, _, triage = calculate_screening_risk(
            user_age=user.age if user else 45,
            user_sex=user.sex if user else "Female",
            occupational_load=user.occupational_load if user else "Moderate",
            terrain_exposure=user.terrain_exposure if user else "Moderate",
            previous_knee_injury=user.previous_knee_injury if user else False
        )

    return ScreeningResponse(
        screening_id=scr.screening_id,
        user_id=scr.user_id,
        worker_id=scr.worker_id,
        district=user.district if user else None,
        timestamp=scr.timestamp,
        joint=scr.joint,
        risk_probability=scr.risk_probability,
        risk_category=scr.risk_category,
        primary_driver=scr.primary_driver,
        available_modalities=modalities,
        survey=survey_data,
        vision=vision_data,
        sensor=sensor_data,
        explanations=explanations,
        triage_guidance=triage,
        synced=scr.synced,
        model_version=scr.model_version,
        is_demo=scr.is_demo
    )

@app.get("/api/screenings", response_model=List[ScreeningResponse])
def list_all_screenings(db: Session = Depends(get_db)):
    """Every real screening record in the system, newest first.

    This backs the Doctor Dashboard's records table so that it is always
    reading from the exact same underlying data as the summary KPI cards
    above it (which are computed from /api/dashboard/statistics against
    this same table) — the two can no longer disagree.
    """
    screenings = db.query(Screening).order_by(Screening.timestamp.desc()).all()
    return [get_screening(scr.screening_id, db) for scr in screenings]

@app.get("/api/screenings/user/{user_id}", response_model=List[ScreeningResponse])
def get_user_screenings(user_id: str, db: Session = Depends(get_db)):
    screenings = db.query(Screening).filter(Screening.user_id == user_id).order_by(Screening.timestamp.desc()).all()
    results = []
    for scr in screenings:
        results.append(get_screening(scr.screening_id, db))
    return results

# ---------------- BATCH OFFLINE SYNC ENDPOINT ----------------

@app.post("/api/v1/sync", response_model=SyncBatchResponse)
def sync_offline_records(
    payload: SyncBatchRequest, 
    db: Session = Depends(get_db),
    current_worker: Optional[HealthWorker] = Depends(get_current_worker)
):
    synced_ids = []
    for rec in payload.records:
        res = _process_and_save_screening(rec, db, current_worker)
        synced_ids.append(res.screening_id)
        
    return SyncBatchResponse(
        status="success",
        synced_count=len(synced_ids),
        synced_ids=synced_ids
    )

# ---------------- BHASHINI VERNACLULAR ENDPOINTS ----------------

class TranslationRequest(BaseModel):
    text: str
    target_lang: str
    source_lang: Optional[str] = "en"

class TTSRequest(BaseModel):
    text: str
    language: str = "as"

@app.post("/api/translate")
def translate_endpoint(payload: TranslationRequest):
    from .services.bhashini_service import translate_text, is_bhashini_available
    if not is_bhashini_available():
        return {"available": False, "translated_text": payload.text, "message": "BHASHINI_USER_ID / BHASHINI_API_KEY env vars not set"}
    return translate_text(payload.text, payload.target_lang, payload.source_lang)

@app.post("/api/tts")
def tts_endpoint(payload: TTSRequest):
    from .services.bhashini_service import generate_tts_audio, is_bhashini_available
    if not is_bhashini_available():
        return {"available": False, "audio_base64": None, "message": "BHASHINI_USER_ID / BHASHINI_API_KEY env vars not set"}
    return generate_tts_audio(payload.text, payload.language)

# ---------------- DOCTOR DASHBOARD & ANALYTICS ----------------

# ---------------- DOCTOR DASHBOARD, PDF & ANALYTICS ----------------

@app.get("/api/dashboard/statistics", response_model=DashboardStats)
def get_dashboard_statistics(db: Session = Depends(get_db)):
    total = db.query(Screening).count()
    high = db.query(Screening).filter(Screening.risk_category.like("%Severe%")).count()
    mod = db.query(Screening).filter(Screening.risk_category.like("%Moderate%")).count()
    mild = db.query(Screening).filter(Screening.risk_category.like("%Mild%")).count()
    min_r = db.query(Screening).filter(Screening.risk_category.like("%Minimal%")).count()
    unsynced = db.query(Screening).filter(Screening.synced == False).count()

    modalities_count = {"survey": 0, "vision": 0, "wearable": 0}
    all_screenings = db.query(Screening).all()
    for s in all_screenings:
        mods = s.available_modalities.split(",")
        for m in mods:
            m_clean = m.strip()
            if m_clean in modalities_count:
                modalities_count[m_clean] += 1

    district_count = {}
    district_risk_sum = {}
    
    for s in all_screenings:
        u = db.query(User).filter(User.user_id == s.user_id).first()
        # A record whose district we don't actually know is bucketed as
        # "Unmapped/Other" rather than folded into a real district
        # ("Kamrup Metropolitan") — the latter would silently inflate that
        # district's counts/severity with screenings that were never
        # observed there.
        dist = (u.district if u else None) or "Unmapped/Other"
        district_count[dist] = district_count.get(dist, 0) + 1
        district_risk_sum[dist] = district_risk_sum.get(dist, 0.0) + (s.risk_probability * 100.0)

    district_severity = {}
    for dist, cnt in district_count.items():
        if cnt > 0:
            district_severity[dist] = round(district_risk_sum[dist] / cnt, 1)

    return DashboardStats(
        total_screenings=total,
        high_risk=high,
        moderate_risk=mod,
        mild_risk=mild,
        minimal_risk=min_r,
        unsynced_records=unsynced,
        modalities_breakdown=modalities_count,
        district_breakdown=district_count,
        district_severity=district_severity
    )

@app.get("/api/dashboard/trends")
def get_dashboard_trends(db: Session = Depends(get_db)):
    screenings = db.query(Screening).order_by(Screening.timestamp.asc()).all()
    trends = {}
    for s in screenings:
        u = db.query(User).filter(User.user_id == s.user_id).first()
        dist = (u.district if u else None) or "Unmapped/Other"
        week_key = s.timestamp.strftime("%Y-W%U") if s.timestamp else "2026-W01"
        
        if week_key not in trends:
            trends[week_key] = {"week": week_key, "total": 0, "by_district": {}}
        trends[week_key]["total"] += 1
        trends[week_key]["by_district"][dist] = trends[week_key]["by_district"].get(dist, 0) + 1

    return list(trends.values())

@app.get("/api/reports/{screening_id}/pdf")
def generate_pdf_report(screening_id: str, db: Session = Depends(get_db)):
    from fastapi.responses import Response
    from .services.pdf_service import generate_screening_pdf

    scr = db.query(Screening).filter(Screening.screening_id == screening_id).first()
    if not scr:
        raise HTTPException(status_code=404, detail="Screening record not found")

    user = db.query(User).filter(User.user_id == scr.user_id).first()
    explanations = scr.explanations

    pdf_bytes = generate_screening_pdf(scr, user, explanations)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=Osteo_Optix_Report_{screening_id}.pdf"
        }
    )

@app.delete("/api/screenings/{screening_id}")
def delete_screening(screening_id: str, db: Session = Depends(get_db)):
    scr = db.query(Screening).filter(Screening.screening_id == screening_id).first()
    if not scr:
        raise HTTPException(status_code=404, detail="Screening record not found")

    # Delete related feature records
    db.query(VisionFeatures).filter(VisionFeatures.screening_id == screening_id).delete()
    db.query(SensorFeatures).filter(SensorFeatures.screening_id == screening_id).delete()
    db.query(SurveyResults).filter(SurveyResults.screening_id == screening_id).delete()
    db.query(Explanation).filter(Explanation.screening_id == screening_id).delete()
    db.query(TrainingData).filter(TrainingData.screening_id == screening_id).delete()
    
    db.delete(scr)
    db.commit()
    return {"status": "deleted", "screening_id": screening_id}

@app.post("/api/reports/share")
def share_report(screening_id: str, db: Session = Depends(get_db)):
    scr = db.query(Screening).filter(Screening.screening_id == screening_id).first()
    if not scr:
        raise HTTPException(status_code=404, detail="Screening not found")
    token = f"SHARE_{uuid.uuid4().hex[:12].upper()}"
    return {
        "screening_id": screening_id,
        "share_token": token,
        "share_url": f"/report/share/{token}",
        "created_at": datetime.utcnow().isoformat()
    }
