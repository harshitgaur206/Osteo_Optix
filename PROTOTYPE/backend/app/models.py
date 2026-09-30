from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class HealthWorker(Base):
    __tablename__ = "health_workers"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    pin_hash = Column(String, nullable=False)
    assigned_camp = Column(String, nullable=True)
    assigned_district = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    screenings = relationship("Screening", back_populates="health_worker")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    sex = Column(String, nullable=False)
    village = Column(String, nullable=True)
    district = Column(String, nullable=False)
    state = Column(String, nullable=False, default="Assam")
    phone = Column(String, nullable=True)
    occupation = Column(String, nullable=True)
    occupational_load = Column(String, nullable=False) # Light, Moderate, Heavy Agriculture, Tea Estate, Construction
    terrain_exposure = Column(String, nullable=False) # Flat, Moderate, Steep, Stairs
    previous_knee_injury = Column(Boolean, default=False)
    existing_oa_diagnosis = Column(Boolean, default=False)
    target_knee = Column(String, default="Right") # Right, Left, Both
    consent_given = Column(Boolean, default=True)
    consent_timestamp = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    screenings = relationship("Screening", back_populates="user")

class Screening(Base):
    __tablename__ = "screenings"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    worker_id = Column(String, ForeignKey("health_workers.worker_id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    joint = Column(String, default="Right Knee")
    risk_probability = Column(Float, nullable=False) # 0.0 to 1.0
    risk_category = Column(String, nullable=False) # Normal/Minimal Risk, Mild OA, Moderate OA, Severe OA
    primary_driver = Column(String, nullable=True)
    # Persist the triage guidance computed at creation time (from the FULL
    # feature set: survey + vision + sensor, whatever was available) so that
    # reads never have to recompute it later from demographics alone, which
    # would silently drift out of sync with the stored risk_probability /
    # risk_category.
    triage_guidance = Column(String, nullable=True)
    available_modalities = Column(String, nullable=False) # Comma-separated: "survey,vision,wearable"
    synced = Column(Boolean, default=True)
    model_version = Column(String, default="Baseline Heuristic v1")
    is_demo = Column(Boolean, default=True)

    user = relationship("User", back_populates="screenings")
    health_worker = relationship("HealthWorker", back_populates="screenings")
    vision_features = relationship("VisionFeatures", back_populates="screening", uselist=False)
    sensor_features = relationship("SensorFeatures", back_populates="screening", uselist=False)
    survey_results = relationship("SurveyResults", back_populates="screening", uselist=False)
    explanations = relationship("Explanation", back_populates="screening")

class VisionFeatures(Base):
    __tablename__ = "vision_features"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, ForeignKey("screenings.screening_id"), nullable=False)
    rom = Column(Float, nullable=False) # Knee Range of Motion in degrees
    symmetry_index = Column(Float, nullable=False) # Gait Symmetry Index %
    trunk_lean = Column(Float, nullable=False) # Compensatory trunk lean degrees
    cadence = Column(Float, nullable=True) # Steps per min
    step_duration = Column(Float, nullable=True) # Seconds
    confidence = Column(Float, default=0.92)

    screening = relationship("Screening", back_populates="vision_features")

class SensorFeatures(Base):
    __tablename__ = "sensor_features"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, ForeignKey("screenings.screening_id"), nullable=False)
    angular_velocity_peak = Column(Float, nullable=False) # deg/s
    impact_jerk = Column(Float, nullable=False) # g/s
    relative_knee_angle = Column(Float, nullable=False) # degrees
    signal_quality = Column(String, default="Good")
    wearable_available = Column(Boolean, default=True)
    sensor_source = Column(String, default="simulated") # "simulated" or "live"

    screening = relationship("Screening", back_populates="sensor_features")

class SurveyResults(Base):
    __tablename__ = "survey_results"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, ForeignKey("screenings.screening_id"), nullable=False)
    pain_score = Column(Float, nullable=False) # 0 to 20
    stiffness_score = Column(Float, nullable=False) # 0 to 8
    function_score = Column(Float, nullable=False) # 0 to 40
    womac_score = Column(Float, nullable=False) # 0 to 68 total
    occupational_load = Column(String, nullable=False)
    terrain_exposure = Column(String, nullable=False)

    screening = relationship("Screening", back_populates="survey_results")

class Explanation(Base):
    __tablename__ = "explanations"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, ForeignKey("screenings.screening_id"), nullable=False)
    feature = Column(String, nullable=False)
    contribution = Column(Float, nullable=False) # Relative percentage contribution or SHAP value
    direction = Column(String, nullable=False) # "high", "moderate", "low"
    description = Column(String, nullable=False)

    screening = relationship("Screening", back_populates="explanations")

class TrainingData(Base):
    __tablename__ = "training_data"

    id = Column(Integer, primary_key=True, index=True)
    screening_id = Column(String, index=True, nullable=False)
    user_id = Column(String, index=True, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_demo = Column(Boolean, default=True) # Explicit flag to isolate demo/synthetic data from future ML training

    # Demographics & Context
    age = Column(Integer, nullable=True)
    sex = Column(String, nullable=True)
    occupational_load = Column(String, nullable=True)
    terrain_exposure = Column(String, nullable=True)
    previous_knee_injury = Column(Boolean, default=False)

    # WOMAC Survey Features
    womac_score = Column(Float, nullable=True)
    pain_score = Column(Float, nullable=True)
    stiffness_score = Column(Float, nullable=True)
    function_score = Column(Float, nullable=True)

    # MediaPipe Computer Vision Features
    vision_rom = Column(Float, nullable=True)
    vision_symmetry_index = Column(Float, nullable=True)
    vision_trunk_lean = Column(Float, nullable=True)
    vision_cadence = Column(Float, nullable=True)

    # Wearable IMU Sensor Features
    sensor_angular_velocity_peak = Column(Float, nullable=True)
    sensor_impact_jerk = Column(Float, nullable=True)
    sensor_relative_knee_angle = Column(Float, nullable=True)

    # System Output & Labels
    risk_probability = Column(Float, nullable=False)
    risk_category = Column(String, nullable=False)
    primary_driver = Column(String, nullable=True)
    raw_feature_vector_json = Column(Text, nullable=True)

