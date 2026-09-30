import { saveLocalScreening, getOfflineSyncQueue, clearSyncedFromQueue } from './offlineStorage';

// Dynamic API Base URL detection
const API_BASE_URL = window.location.origin && window.location.origin.includes("8000") 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

const getAuthHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const jwt = localStorage.getItem('hw_jwt');
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }
  } catch (e) {}
  return headers;
};

export const checkNetworkStatus = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/info`, { method: 'GET', signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch (err) {
    return false;
  }
};

export const loginWorkerAPI = async (worker_id, pin) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/worker-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_id, pin })
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, ...data };
    }
    const errData = await res.json().catch(() => ({}));
    return { success: false, error: errData.detail || "Invalid Credentials" };
  } catch (err) {
    return { success: false, isOffline: true, error: "Network unavailable — checking offline cache" };
  }
};

export const registerUserAPI = async (userData) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData)
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("Backend unavailable, using local registration fallback");
  }
  return userData;
};

export const submitScreeningAPI = async (screeningData) => {
  const isOnline = await checkNetworkStatus();
  if (isOnline) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/screenings`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(screeningData)
      });
      if (res.ok) {
        const data = await res.json();
        saveLocalScreening({ ...data, synced: true });
        return data;
      }
    } catch (err) {
      console.warn("API submission failed, falling back to local storage offline mode.");
    }
  }

  // Client-side Fallback Inference when offline
  const fallbackResult = calculateClientFallbackRisk(screeningData);
  saveLocalScreening(fallbackResult);
  return fallbackResult;
};

export const shareReportLinkAPI = async (screeningId) => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/reports/share?screening_id=${screeningId}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("API share link generation offline fallback");
  }
  return { share_token: `SHARE_${Math.random().toString(36).substr(2, 8).toUpperCase()}`, share_url: `${window.location.origin}/?share=${screeningId}` };
};

export const triggerBatchSync = async () => {
  const queue = getOfflineSyncQueue();
  if (queue.length === 0) return { status: "empty", synced_count: 0 };

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ device_id: "WEB_CLIENT_PWA", records: queue })
    });
    if (res.ok) {
      const data = await res.json();
      clearSyncedFromQueue(data.synced_ids);
      return data;
    }
  } catch (err) {
    console.warn("Sync attempt failed - server still offline");
  }
  return { status: "failed", synced_count: 0 };
};

export const fetchDoctorDashboardStats = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/dashboard/statistics`, {
      headers: getAuthHeaders()
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn("Failed to fetch server dashboard stats");
  }
  return null;
};

// Client-side ML Risk Inference Fallback for Offline Mode
function calculateClientFallbackRisk(data) {
  const { survey, vision, sensor, available_modalities = [] } = data;
  
  let score = 0.15; // baseline demography
  const explanations = [];

  if (survey) {
    const surveyScore = (survey.womac_score / 68.0) * 0.35;
    score += surveyScore;
    explanations.push({
      feature: "WOMAC Questionnaire",
      contribution: Math.round((surveyScore / 0.7) * 100),
      direction: survey.womac_score > 30 ? "high" : "moderate",
      description: `Pain and functional limitation survey score (${survey.womac_score}/68)`
    });
  }

  if (vision) {
    const romDeficit = Math.max(0, (60.0 - vision.rom) / 60.0) * 0.25;
    score += romDeficit;
    explanations.push({
      feature: "Reduced Knee ROM",
      contribution: Math.round((romDeficit / 0.7) * 100),
      direction: vision.rom < 45 ? "high" : "moderate",
      description: `Measured knee ROM ${vision.rom.toFixed(1)}° vs threshold 60°`
    });

    const symmetryRisk = Math.min(1.0, Math.max(0, vision.symmetry_index - 5.0) / 30.0) * 0.20;
    score += symmetryRisk;
    explanations.push({
      feature: "Gait Symmetry Index",
      contribution: Math.round((symmetryRisk / 0.7) * 100),
      direction: vision.symmetry_index > 12 ? "high" : "low",
      description: `Left/Right gait stance imbalance (${vision.symmetry_index.toFixed(1)}%)`
    });
  }

  if (sensor && sensor.wearable_available) {
    const jerkRisk = Math.min(1.0, Math.max(0, sensor.impact_jerk - 1.5) / 5.0) * 0.25;
    score += jerkRisk;
    explanations.push({
      feature: "Impact Jerk (Wearable IMU)",
      contribution: Math.round((jerkRisk / 0.7) * 100),
      direction: sensor.impact_jerk > 3.0 ? "high" : "moderate",
      description: `High heel-strike impact force detected (${sensor.impact_jerk.toFixed(2)} g/s)`
    });
  }

  const riskProb = Math.min(0.95, Math.max(0.05, score));
  const riskPct = Math.round(riskProb * 100);

  let riskCategory = "Normal/Minimal Risk";
  let triage = "Local Discharge: joint hygiene education, active lifestyle guidelines, re-screening in 12 months.";
  if (riskPct > 80) {
    riskCategory = "Severe OA";
    triage = "Priority Referral: urgent referral, imaging recommendation, mobility/pain management.";
  } else if (riskPct > 55) {
    riskCategory = "Moderate OA";
    triage = "Specialist Referral: automatic referral generated, PDF summary with ROM deficits, unloader knee brace recommendation.";
  } else if (riskPct > 30) {
    riskCategory = "Mild OA";
    triage = "Local Management: quadriceps strengthening, low-impact PT guidance, weight management.";
  }

  let currentWorkerId = null;
  try {
    const profile = JSON.parse(localStorage.getItem('hw_profile') || '{}');
    currentWorkerId = profile.worker_id || null;
  } catch (e) {}

  return {
    screening_id: data.screening_id || `SCR_${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
    user_id: data.user_id,
    district: data.district || null,
    worker_id: currentWorkerId,
    timestamp: new Date().toISOString(),
    joint: data.joint || "Right Knee",
    risk_probability: riskProb,
    risk_category: riskCategory,
    primary_driver: explanations[0]?.feature || "Clinical Survey",
    available_modalities,
    survey,
    vision,
    sensor,
    explanations,
    triage_guidance: triage,
    synced: false,
    model_version: "Baseline Heuristic v1",
    is_demo: true
  };
}
