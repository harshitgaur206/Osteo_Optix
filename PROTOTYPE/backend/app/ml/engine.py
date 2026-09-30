import math
from typing import Dict, Any, List, Tuple
from ..schemas import SurveyResultsInput, VisionFeaturesInput, SensorFeaturesInput, ExplanationItem

# Updated Model Metadata per Technical Audit Finding #3
MODEL_VERSION = "Baseline Heuristic v1"
MODEL_MODE = "DEMO"

class MLSafetyDisclaimer:
    TEXT = (
        "This result is an AI-assisted risk screening estimate for North Eastern Region India. "
        "It is NOT a definitive diagnosis or medical prescription. Clinical diagnosis must be "
        "performed by a qualified healthcare professional."
    )

def calculate_screening_risk(
    user_age: int,
    user_sex: str,
    occupational_load: str,
    terrain_exposure: str,
    previous_knee_injury: bool,
    survey: SurveyResultsInput = None,
    vision: VisionFeaturesInput = None,
    sensor: SensorFeaturesInput = None,
    available_modalities: List[str] = None
) -> Tuple[float, str, str, List[ExplanationItem], str]:
    """
    Reconciled Multimodal Risk Scoring Engine (Technical Audit Recommendation #2).
    
    Unified Formula Specification:
        Severity = (0.35 * Gait_Score + 0.40 * Sensor_Score + 0.25 * Survey_Score) / Total_Available_Weight
        
        Where:
        - Gait_Score (Vision Modality, Weight = 0.35):
            Combines Knee Range of Motion (ROM) deficit, Gait Symmetry Index (SI), and Trunk Lean.
        - Sensor_Score (Wearable Modality, Weight = 0.40):
            Combines Heel-Strike Impact Jerk (g/s) and Peak Angular Velocity Deficit (deg/s).
        - Survey_Score (Clinical Survey & Demographics, Weight = 0.25):
            Combines WOMAC Pain/Stiffness/Function Score and NER contextual risk factors 
            (Age > 40, Occupational Physical Load, Hilly Terrain Slope, Previous Injury).

    Returns:
    - risk_probability (0.0 to 1.0)
    - risk_category ("Minimal Risk", "Mild to Moderate Risk", "Severe Risk")
    - primary_driver string
    - list of SHAP ExplanationItems
    - triage_guidance string
    """
    if available_modalities is None:
        available_modalities = []

    # Track sub-scores (0.0 to 1.0) and individual feature explanations for SHAP inspection
    explanation_items = []
    
    # ---------------- 1. CONTEXTUAL & DEMOGRAPHIC SUB-SCORE ----------------
    age_factor = max(0.0, (user_age - 35) / 45.0)
    if age_factor > 0:
        explanation_items.append(("Age Risk Factor", age_factor * 0.25, f"Age ({user_age} yrs) increases baseline joint wear", "demographics"))

    occ_weights = {
        "Light": 0.0,
        "Moderate": 0.25,
        "Heavy Agriculture": 0.75,
        "Tea Estate": 0.85,
        "Construction": 0.80,
        "Manual Labor": 0.80
    }
    occ_score = occ_weights.get(occupational_load, 0.30)
    if occ_score > 0:
        explanation_items.append(("Occupational Physical Load", occ_score * 0.30, f"High joint stress occupation ({occupational_load})", "context"))

    terrain_weights = {
        "Flat": 0.0,
        "Moderate": 0.25,
        "Steep": 0.70,
        "Stairs": 0.55
    }
    terrain_score = terrain_weights.get(terrain_exposure, 0.25)
    if terrain_score > 0:
        explanation_items.append(("Hilly Terrain Exposure", terrain_score * 0.25, f"Navigating slope ({terrain_exposure}) strains knee joint", "context"))

    injury_score = 0.60 if previous_knee_injury else 0.0
    if previous_knee_injury:
        explanation_items.append(("Previous Knee Injury", 0.20, "Prior joint trauma accelerates OA progression", "history"))

    demo_subscore = min(1.0, 0.3 * age_factor + 0.3 * occ_score + 0.2 * terrain_score + 0.2 * injury_score)

    # ---------------- 2. SURVEY MODALITY SUB-SCORE (Weight = 0.25) ----------------
    survey_subscore = demo_subscore
    if "survey" in available_modalities and survey is not None:
        womac_ratio = min(1.0, survey.womac_score / 68.0)
        survey_subscore = 0.70 * womac_ratio + 0.30 * demo_subscore
        explanation_items.append(("WOMAC Pain & Function Questionnaire", womac_ratio * 100, f"WOMAC clinical score ({survey.womac_score}/68)", "survey"))

    # ---------------- 3. GAIT (VISION) MODALITY SUB-SCORE (Weight = 0.35) ----------------
    gait_subscore = 0.0
    if "vision" in available_modalities and vision is not None:
        # ROM Deficit relative to 60 deg threshold
        rom_deficit = max(0.0, (60.0 - vision.rom) / 60.0)
        explanation_items.append(("Reduced Knee ROM (Vision)", rom_deficit * 100, f"Knee ROM {vision.rom:.1f}° vs threshold 60°", "vision"))

        # Gait Symmetry Index (SI) % (Normal < 10%)
        symmetry_risk = min(1.0, max(0.0, vision.symmetry_index - 5.0) / 30.0)
        explanation_items.append(("Gait Asymmetry Index (Vision)", symmetry_risk * 100, f"Left/Right stance imbalance ({vision.symmetry_index:.1f}%)", "vision"))

        # Compensatory Trunk Lean (> 3 deg)
        trunk_risk = min(1.0, max(0.0, vision.trunk_lean - 3.0) / 12.0)
        explanation_items.append(("Compensatory Trunk Lean (Vision)", trunk_risk * 100, f"Lateral trunk lean ({vision.trunk_lean:.1f}°)", "vision"))

        gait_subscore = min(1.0, 0.50 * rom_deficit + 0.35 * symmetry_risk + 0.15 * trunk_risk)

    # ---------------- 4. SENSOR (WEARABLE IMU) SUB-SCORE (Weight = 0.40) ----------------
    sensor_subscore = 0.0
    if "wearable" in available_modalities and sensor is not None and sensor.wearable_available:
        jerk_risk = min(1.0, max(0.0, sensor.impact_jerk - 1.5) / 5.0)
        explanation_items.append(("Impact Jerk (Wearable IMU)", jerk_risk * 100, f"High impact loading at heel-strike ({sensor.impact_jerk:.2f} g/s)", "wearable"))

        ang_vel_deficit = max(0.0, (200.0 - sensor.angular_velocity_peak) / 200.0)
        explanation_items.append(("Angular Velocity Deficit (Wearable)", ang_vel_deficit * 100, f"Flexion speed ({sensor.angular_velocity_peak:.1f} deg/s)", "wearable"))

        sensor_subscore = min(1.0, 0.60 * jerk_risk + 0.40 * ang_vel_deficit)

    # ---------------- RECONCILED MULTIMODAL WEIGHTED FUSION ----------------
    # Architecture weights: Gait = 0.35, Sensor = 0.40, Survey = 0.25 (Total = 1.0)
    gait_weight = 0.35 if "vision" in available_modalities and vision is not None else 0.0
    sensor_weight = 0.40 if "wearable" in available_modalities and sensor is not None and sensor.wearable_available else 0.0
    survey_weight = 0.25 if ("survey" in available_modalities or True) else 0.0

    total_weight = gait_weight + sensor_weight + survey_weight
    if total_weight > 0:
        weighted_sum = (gait_weight * gait_subscore) + (sensor_weight * sensor_subscore) + (survey_weight * survey_subscore)
        raw_risk = weighted_sum / total_weight
    else:
        raw_risk = demo_subscore

    # Normalize risk probability within clinical bounds [0.04, 0.96]
    normalized_risk = min(0.96, max(0.04, raw_risk))
    risk_pct = round(normalized_risk * 100, 1)

    # 4-Tier Risk Classification mapping per Architecture Spec (Section 5.2):
    # 0 - 30%   -> Normal/Minimal Risk (Local Discharge)
    # 31 - 55%  -> Mild OA (Local Management)
    # 56 - 80%  -> Moderate OA (Specialist Referral)
    # 81 - 100% -> Severe OA (Priority Referral)
    if risk_pct <= 30.0:
        risk_category = "Normal/Minimal Risk"
        triage = (
            "Local Discharge: Joint hygiene education, active lifestyle guidelines, and routine re-screening recommended in 12 months."
        )
    elif risk_pct <= 55.0:
        risk_category = "Mild OA"
        triage = (
            "Local Management: Quadriceps strengthening exercises, low-impact PT guidance, and weight management recommendations."
        )
    elif risk_pct <= 80.0:
        risk_category = "Moderate OA"
        triage = (
            "Specialist Referral: Automatic orthopedic referral generated, PDF summary with ROM deficits, and unloader knee brace evaluation recommended."
        )
    else:
        risk_category = "Severe OA"
        triage = (
            "Priority Referral: Urgent orthopedic referral required, diagnostic imaging (X-Ray/MRI) recommendation, and mobility/pain management plan."
        )

    # Construct SHAP Explanations List
    explanations: List[ExplanationItem] = []
    sorted_items = sorted(explanation_items, key=lambda x: x[1], reverse=True)
    primary_driver = sorted_items[0][0] if sorted_items else "Demographic Context"

    total_contrib = sum(item[1] for item in sorted_items) or 1.0
    for name, val, desc, cat in sorted_items:
        contrib_pct = round((val / total_contrib) * 100, 1)
        direction = "high" if contrib_pct >= 25.0 else ("moderate" if contrib_pct >= 12.0 else "low")
        explanations.append(ExplanationItem(
            feature=name,
            contribution=contrib_pct,
            direction=direction,
            description=desc
        ))

    return normalized_risk, risk_category, primary_driver, explanations, triage

