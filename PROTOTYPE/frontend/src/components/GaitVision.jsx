import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RefreshCw, ArrowRight, AlertTriangle, StopCircle, AlertCircle } from 'lucide-react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { TRANSLATIONS } from '../translations/vernacular';

export default function GaitVision({ currentLang, onComplete, onSkip }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedResult, setProcessedResult] = useState(null);
  const [videoSource, setVideoSource] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [qualityWarning, setQualityWarning] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const landmarkerRef = useRef(null);
  const lastLandmarksRef = useRef(null);

  // Initialize MediaPipe Tasks-Vision PoseLandmarker in VIDEO Mode
  useEffect(() => {
    let active = true;
    const initPoseLandmarker = async () => {
      try {
        setStatusMessage('Initializing MediaPipe PoseLandmarker engine...');
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (!active) return;
        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          },
          runningMode: "VIDEO",
          numPoses: 1
        });
        if (active) {
          landmarkerRef.current = landmarker;
          setStatusMessage('');
        }
      } catch (err) {
        console.warn("Tasks-Vision initialization error:", err);
      }
    };

    initPoseLandmarker();

    return () => {
      active = false;
      stopCameraStream();
      if (landmarkerRef.current) {
        try { landmarkerRef.current.close(); } catch(e) {}
      }
    };
  }, []);

  const stopCameraStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // 1. atan2 Knee Angle Calculation Formula
  // Points: p1 (Hip), p2 (Knee - Vertex), p3 (Ankle)
  const calculateJointAngle = (p1, p2, p3) => {
    if (!p1 || !p2 || !p3) return 170.0;
    const radians = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) {
      angle = 360.0 - angle;
    }
    return angle;
  };

  // 2. Moving Average Filter (Window Size = 5 frames)
  const applyMovingAverageFilter = (series, windowSize = 5) => {
    if (!series || series.length === 0) return [];
    const smoothed = [];
    const halfWindow = Math.floor(windowSize / 2);
    for (let i = 0; i < series.length; i++) {
      const start = Math.max(0, i - halfWindow);
      const end = Math.min(series.length, i + halfWindow + 1);
      const window = series.slice(start, end);
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      smoothed.push(mean);
    }
    return smoothed;
  };

  // Start 5-Second Camera Recording
  const startCameraCapture = async () => {
    setVideoSource('camera');
    setErrorMessage('');
    setQualityWarning('');
    setStatusMessage('Accessing smartphone/webcam camera stream...');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        processVideoClip(videoUrl);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(5);
      setStatusMessage('Recording 5-second gait video clip...');

      let count = 5;
      const timer = setInterval(() => {
        count -= 1;
        setRecordingTime(count);
        if (count <= 0) {
          clearInterval(timer);
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          setIsRecording(false);
          stopCameraStream();
        }
      }, 1000);

    } catch (err) {
      console.error("Camera access failed:", err);
      setErrorMessage("Camera unavailable — please check camera permissions or use the Video Upload option below.");
      setIsRecording(false);
      setStatusMessage('');
    }
  };

  // Video File Upload Handler
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setVideoSource('upload');
      setErrorMessage('');
      setQualityWarning('');
      const videoUrl = URL.createObjectURL(file);
      processVideoClip(videoUrl);
    }
  };

  // Frame-by-Frame PoseLandmarker Synchronous Processing
  const processVideoClip = async (videoUrl) => {
    setIsProcessing(true);
    setStatusMessage('Analyzing video clip frame-by-frame with PoseLandmarker...');

    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;

    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.currentTime = 0;
        resolve();
      };
    });

    const leftKneeAngles = [];
    const rightKneeAngles = [];
    const trunkAngles = [];
    let detectedFramesCount = 0;

    const fps = 15;
    const duration = Math.min(video.duration || 5.0, 5.0);
    const totalFrames = Math.floor(duration * fps);
    const frameInterval = 1.0 / fps;

    const landmarker = landmarkerRef.current;

    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      const timestampMs = Math.round(frameIdx * frameInterval * 1000);
      video.currentTime = frameIdx * frameInterval;
      
      await new Promise((res) => setTimeout(res, 40));

      if (landmarker) {
        try {
          const results = landmarker.detectForVideo(video, timestampMs);
          if (results && results.landmarks && results.landmarks.length > 0) {
            const lm = results.landmarks[0];
            lastLandmarksRef.current = lm;
            detectedFramesCount++;

            // MediaPipe Landmark Index Mapping:
            // 11: L Shoulder, 12: R Shoulder, 23: L Hip, 24: R Hip, 25: L Knee, 26: R Knee, 27: L Ankle, 28: R Ankle
            const leftAngle = calculateJointAngle(lm[23], lm[25], lm[27]);
            const rightAngle = calculateJointAngle(lm[24], lm[26], lm[28]);

            leftKneeAngles.push(leftAngle);
            rightKneeAngles.push(rightAngle);

            const shoulderMid = { x: (lm[11].x + lm[12].x) / 2, y: (lm[11].y + lm[12].y) / 2 };
            const hipMid = { x: (lm[23].x + lm[24].x) / 2, y: (lm[23].y + lm[24].y) / 2 };
            const trunkLean = Math.abs(Math.atan2(hipMid.x - shoulderMid.x, hipMid.y - shoulderMid.y) * (180 / Math.PI));
            trunkAngles.push(trunkLean);
          }
        } catch (err) {
          console.warn(`Frame ${frameIdx} detection skipped:`, err);
        }
      }
    }

    if (detectedFramesCount === 0 || leftKneeAngles.length === 0) {
      setIsProcessing(false);
      setStatusMessage('');
      setErrorMessage("Pose detection failed to locate full body keypoints in video. Please capture with full body visibility from head to feet.");
      return;
    }

    // Apply 5-frame Moving Average Filter to smooth frame noise
    const smoothedLeft = applyMovingAverageFilter(leftKneeAngles, 5);
    const smoothedRight = applyMovingAverageFilter(rightKneeAngles, 5);
    const smoothedTrunk = applyMovingAverageFilter(trunkAngles, 5);

    // Raw ROM computation WITHOUT artificial Math.max/Math.min clamping
    const maxLeft = Math.max(...smoothedLeft);
    const minLeft = Math.min(...smoothedLeft);
    const rawMeasuredROM = Math.round((maxLeft - minLeft) * 10) / 10;

    const maxRight = Math.max(...smoothedRight);
    const minRight = Math.min(...smoothedRight);
    const rawRightROM = Math.round((maxRight - minRight) * 10) / 10;

    // Gait Symmetry Index %: |Left - Right| / (0.5 * (Left + Right)) * 100
    const avgLeft = smoothedLeft.reduce((a, b) => a + b, 0) / smoothedLeft.length;
    const avgRight = smoothedRight.reduce((a, b) => a + b, 0) / smoothedRight.length;
    const rawSymmetryIndex = Math.round((Math.abs(avgLeft - avgRight) / (0.5 * (avgLeft + avgRight))) * 1000) / 10;

    // Average Trunk Lean
    const rawTrunk = Math.round((smoothedTrunk.reduce((a, b) => a + b, 0) / smoothedTrunk.length) * 10) / 10;

    // Check physiological validity (No artificial clamping!)
    let isLowQuality = false;
    if (rawMeasuredROM < 15.0 || rawMeasuredROM > 120.0 || rawSymmetryIndex > 50.0 || rawTrunk > 35.0) {
      isLowQuality = true;
      setQualityWarning("Capture quality low — partial body visibility or improper angle detected. Consider retaking clip for optimal screening precision.");
    }

    const result = {
      rom: rawMeasuredROM,
      symmetry_index: rawSymmetryIndex,
      trunk_lean: rawTrunk,
      // Cadence and step_duration are NOT derived from this clip (no reliable
      // step-timing signal is extracted here) — sending fixed numbers as if
      // they were measured would misrepresent them as real data, including
      // in the training_data table used for future model work. Leave them
      // unset rather than fabricate plausible-looking values.
      cadence: null,
      step_duration: null,
      confidence: Math.round((detectedFramesCount / totalFrames) * 100) / 100,
      isLowQuality
    };

    setProcessedResult(result);
    setIsProcessing(false);
    setStatusMessage('');

    setTimeout(() => {
      drawGaitSkeletonGraph(lastLandmarksRef.current, result.rom);
    }, 100);
  };

  // Render Dynamic Canvas Skeleton from REAL Landmarks
  const drawGaitSkeletonGraph = (landmarks, romVal) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    if (!landmarks || landmarks.length < 29) {
      // Fallback text if no landmark array available
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Outfit, sans-serif';
      ctx.fillText('No Landmarks Available', w / 4, h / 2);
      return;
    }

    // Helper to scale MediaPipe normalized coordinates (0..1) to Canvas (w, h)
    const getXY = (index) => {
      const lm = landmarks[index];
      return { x: lm.x * w, y: lm.y * h };
    };

    const lShoulder = getXY(11);
    const rShoulder = getXY(12);
    const lHip = getXY(23);
    const rHip = getXY(24);
    const lKnee = getXY(25);
    const rKnee = getXY(26);
    const lAnkle = getXY(27);
    const rAnkle = getXY(28);

    // Draw Torso & Shoulders
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lShoulder.x, lShoulder.y);
    ctx.lineTo(rShoulder.x, rShoulder.y);
    ctx.lineTo(rHip.x, rHip.y);
    ctx.lineTo(lHip.x, lHip.y);
    ctx.closePath();
    ctx.stroke();

    // Draw Left Leg (Teal)
    ctx.strokeStyle = '#0d9488';
    ctx.beginPath();
    ctx.moveTo(lHip.x, lHip.y);
    ctx.lineTo(lKnee.x, lKnee.y);
    ctx.lineTo(lAnkle.x, lAnkle.y);
    ctx.stroke();

    // Draw Right Leg (Rose)
    ctx.strokeStyle = '#e11d48';
    ctx.beginPath();
    ctx.moveTo(rHip.x, rHip.y);
    ctx.lineTo(rKnee.x, rKnee.y);
    ctx.lineTo(rAnkle.x, rAnkle.y);
    ctx.stroke();

    // Draw Keypoint Joint Dots
    const keypoints = [lShoulder, rShoulder, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle];
    ctx.fillStyle = '#d97706';
    keypoints.forEach((pt) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Annotate ROM text on Canvas
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Outfit, sans-serif';
    ctx.fillText(`Knee ROM: ${romVal}°`, Math.min(lKnee.x, rKnee.x) + 10, Math.min(lKnee.y, rKnee.y));
    ctx.fillText(`PoseLandmarker Live Frame`, 10, h - 10);
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <Camera size={26} color="var(--primary-teal)" />
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>{t.visionTitle}</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Real-time MediaPipe PoseLandmarker Gait Analysis & Joint Angle Extraction
          </p>
        </div>
      </div>

      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {errorMessage && (
        <div style={{ background: '#fef2f2', padding: '1rem', borderRadius: '12px', border: '1px solid #fecdd3', color: '#dc2626', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle size={22} />
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{errorMessage}</span>
        </div>
      )}

      {!processedResult ? (
        <div>
          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: '1rem', color: '#b45309', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <AlertTriangle size={18} />
              5-Second Walking Test Setup Instructions:
            </h4>
            <ul style={{ paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-subtle)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <li>Position smartphone camera steady at hip height, 3 meters away.</li>
              <li>Ensure adequate lighting and full body visibility (head to feet).</li>
              <li>Press <strong>Record 5s Clip</strong> and walk naturally for 5 seconds.</li>
            </ul>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <button 
              className="btn-secondary" 
              style={{ padding: '1.5rem', flexDirection: 'column', background: isRecording ? '#fef2f2' : '#ffffff', borderColor: isRecording ? '#ef4444' : 'var(--border-color)' }} 
              onClick={startCameraCapture}
              disabled={isRecording || isProcessing}
            >
              {isRecording ? <StopCircle size={32} color="#dc2626" className="pulse-animation" /> : <Camera size={32} color="var(--primary-teal)" />}
              <span style={{ marginTop: '0.5rem', fontWeight: 600, color: isRecording ? '#dc2626' : '#0f172a' }}>
                {isRecording ? `Recording Clip (${recordingTime}s remaining)` : t.btnRecordVideo}
              </span>
            </button>

            <label className="btn-secondary" style={{ padding: '1.5rem', flexDirection: 'column', background: '#ffffff', cursor: 'pointer', textAlign: 'center' }}>
              <Upload size={32} color="#0284c7" />
              <span style={{ marginTop: '0.5rem', fontWeight: 600, color: '#0f172a' }}>{t.btnUploadVideo}</span>
              <input type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
          </div>

          {isProcessing && (
            <div style={{ textAlign: 'center', padding: '2rem', background: '#f0fdfa', borderRadius: '12px', border: '1px solid #99f6e4' }}>
              <RefreshCw size={40} className="pulse-animation" color="var(--primary-teal)" style={{ animation: 'spin 1.5s infinite linear', marginBottom: '1rem' }} />
              <p style={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem' }}>Extracting Pose Landmarks with PoseLandmarker...</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)', marginTop: '0.25rem' }}>{statusMessage}</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
            <button className="btn-secondary" onClick={onSkip}>
              <span>{t.btnSkipVision}</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div>
          {qualityWarning && (
            <div style={{ background: '#fffbeb', padding: '1rem', borderRadius: '12px', border: '1px solid #fde68a', color: '#b45309', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertTriangle size={20} />
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{qualityWarning}</span>
            </div>
          )}

          {/* These three figures ARE genuinely computed from this clip's real
              MediaPipe pose landmarks (not simulated/mocked) — but this is a
              prototype-grade single-camera estimate, not a validated clinical
              measurement device, so it's labelled as such rather than
              implying clinical-grade accuracy. */}
          <div style={{ background: '#f0f9ff', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid #bae6fd', color: '#075985', marginBottom: '1.5rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Camera size={16} style={{ flexShrink: 0 }} />
            <span>
              Camera-based estimate for screening only, not a clinical diagnosis.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Landmark Skeleton & Knee Angle Overlay</h4>
              <canvas ref={canvasRef} width={300} height={300} style={{ width: '100%', maxWidth: '280px', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center' }}>
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Measured Knee Range of Motion (ROM)</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: processedResult.rom < 45 ? '#dc2626' : '#059669' }}>
                  {processedResult.rom}° <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)' }}>(Target: &ge; 60°)</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Calculated via atan2(hip, knee, ankle)</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Gait Symmetry Index (SI)</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: processedResult.symmetry_index > 12 ? '#d97706' : '#059669' }}>
                  {processedResult.symmetry_index}% <span style={{ fontSize: '0.9rem', fontWeight: 400, color: 'var(--text-muted)' }}>(Normal &lt; 10%)</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Left vs Right stance phase ratio</span>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Compensatory Trunk Lean</span>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0284c7' }}>
                  {processedResult.trunk_lean}°
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>5-frame moving average filtered</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={() => { setProcessedResult(null); setQualityWarning(''); }}>
              <RefreshCw size={18} />
              <span>Retake Test</span>
            </button>

            <button className="btn-primary" onClick={() => onComplete(processedResult)}>
              <span>Save & Continue</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
