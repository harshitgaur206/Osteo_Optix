from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class WorkerLoginRequest(BaseModel):
    worker_id: str
    pin: str

class HealthWorkerOut(BaseModel):
    worker_id: str
    name: str
    assigned_camp: Optional[str] = None
    assigned_district: str
    is_active: bool = True

    class Config:
        from_attributes = True

class WorkerLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    worker: HealthWorkerOut

class UserBase(BaseModel):
    user_id: Optional[str] = None
    name: str
    age: int
    sex: str
    village: Optional[str] = ""
    district: str
    state: str = "Assam"
    phone: Optional[str] = ""
    occupation: Optional[str] = ""
    occupational_load: str = "Moderate" # Light, Moderate, Heavy Agriculture, Tea Estate, Manual Labor
    terrain_exposure: str = "Moderate" # Flat, Moderate, Steep, Stairs
    previous_knee_injury: bool = False
    existing_oa_diagnosis: bool = False
    target_knee: str = "Right"
    consent_given: bool = True
    consent_timestamp: Optional[datetime] = None

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int
    user_id: str
    created_at: datetime

    class Config:
        from_attributes = True

class VisionFeaturesInput(BaseModel):
    rom: float = Field(..., description="Knee Range of Motion in degrees")
    symmetry_index: float = Field(..., description="Gait Symmetry Index %")
    trunk_lean: float = Field(..., description="Compensatory trunk lean in degrees")
    # No default value here: cadence isn't reliably derivable from a single
    # short gait clip, so a fixed fallback (previously 95.0) would silently
    # present a fabricated number as measured data — both in the API
    # response and in the training_data table logged for future model work.
    cadence: Optional[float] = None
    step_duration: Optional[float] = None
    confidence: Optional[float] = 0.94

class SensorFeaturesInput(BaseModel):
    angular_velocity_peak: float = Field(..., description="Peak angular velocity deg/s")
    impact_jerk: float = Field(..., description="Impact jerk g/s")
    relative_knee_angle: float = Field(..., description="Thigh-shank angle degrees")
    signal_quality: Optional[str] = "Good"
    wearable_available: bool = True
    sensor_source: Optional[str] = "simulated" # "simulated" | "live"

class SurveyResultsInput(BaseModel):
    pain_score: float = Field(..., description="WOMAC Pain subscore (0-20)")
    stiffness_score: float = Field(..., description="WOMAC Stiffness subscore (0-8)")
    function_score: float = Field(..., description="WOMAC Function subscore (0-40)")
    womac_score: float = Field(..., description="Total WOMAC Score (0-68)")
    occupational_load: str = "Moderate"
    terrain_exposure: str = "Moderate"

class ExplanationItem(BaseModel):
    feature: str
    contribution: float
    direction: str
    description: str

class ScreeningCreate(BaseModel):
    screening_id: Optional[str] = None
    user_id: str
    worker_id: Optional[str] = None
    timestamp: Optional[datetime] = None
    joint: str = "Right Knee"
    available_modalities: List[str] # ["survey", "vision", "wearable"]
    survey: Optional[SurveyResultsInput] = None
    vision: Optional[VisionFeaturesInput] = None
    sensor: Optional[SensorFeaturesInput] = None
    synced: bool = False
    is_demo: bool = True

class ScreeningResponse(BaseModel):
    screening_id: str
    user_id: str
    worker_id: Optional[str] = None
    district: Optional[str] = None
    timestamp: datetime
    joint: str
    risk_probability: float
    risk_category: str
    primary_driver: Optional[str]
    available_modalities: List[str]
    survey: Optional[SurveyResultsInput]
    vision: Optional[VisionFeaturesInput]
    sensor: Optional[SensorFeaturesInput]
    explanations: List[ExplanationItem]
    triage_guidance: str
    synced: bool
    model_version: str
    is_demo: bool

    class Config:
        from_attributes = True

class SyncBatchRequest(BaseModel):
    device_id: Optional[str] = "WEB_CLIENT_01"
    records: List[ScreeningCreate]

class SyncBatchResponse(BaseModel):
    status: str
    synced_count: int
    synced_ids: List[str]

class DashboardStats(BaseModel):
    total_screenings: int
    high_risk: int # Severe OA (81-100%)
    moderate_risk: int # Moderate OA (56-80%)
    mild_risk: int # Mild OA (31-55%)
    minimal_risk: int # Normal/Minimal Risk (0-30%)
    unsynced_records: int
    modalities_breakdown: Dict[str, int]
    district_breakdown: Dict[str, int]
    district_severity: Dict[str, float] = {}

class SharedReportResponse(BaseModel):
    share_token: str
    screening: ScreeningResponse
    user: UserResponse
    doctor_notes: Optional[str] = None
