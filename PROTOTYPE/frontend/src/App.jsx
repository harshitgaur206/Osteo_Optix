import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import PatientSearch from './components/PatientSearch';
import UserProfile from './components/UserProfile';
import DigitalSurvey from './components/DigitalSurvey';
import GaitVision from './components/GaitVision';
import WearableSimulator from './components/WearableSimulator';
import ScreeningResult from './components/ScreeningResult';
import DoctorDashboard from './components/DoctorDashboard';
import SyncCenter from './components/SyncCenter';
import AwarenessLibrary from './components/AwarenessLibrary';
import HealthWorkerPinModal from './components/HealthWorkerPinModal';

import { getLocalUser, savePatient, getOfflineSyncQueue, saveLocalScreening, waitForStorageReady } from './services/offlineStorage';
import { checkNetworkStatus, submitScreeningAPI, triggerBatchSync } from './services/apiService';
import { TRANSLATIONS } from './translations/vernacular';

export default function App() {
  const [currentLang, setCurrentLang] = useState('en');
  const [activeTab, setActiveTab] = useState('screening'); // 'screening' | 'dashboard' | 'sync'
  const [currentStep, setCurrentStep] = useState(0); // 0: Search, 1: Profile, 2: Survey, 3: Vision, 4: Wearable, 5: Result
  const [isOnline, setIsOnline] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Health Worker PIN Session State
  const [hwSession, setHwSession] = useState(() => {
    try {
      const saved = sessionStorage.getItem('hw_session');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const handleAuthenticateWorker = (sessionData) => {
    setHwSession(sessionData);
    try {
      sessionStorage.setItem('hw_session', JSON.stringify(sessionData));
    } catch (e) {}
  };

  const handleLockSession = () => {
    setHwSession(null);
    try {
      sessionStorage.removeItem('hw_session');
    } catch (e) {}
  };

  // Workflow Data State
  const [userProfile, setUserProfile] = useState(null);
  const [surveyData, setSurveyData] = useState(null);
  const [visionData, setVisionData] = useState(null);
  const [sensorData, setSensorData] = useState(null);
  const [finalResult, setFinalResult] = useState(null);

  // Initial setup & periodic network detection
  useEffect(() => {
    const updateSyncQueueCount = () => {
      const q = getOfflineSyncQueue();
      setUnsyncedCount(q.length);
    };

    const monitorNetwork = async () => {
      const online = await checkNetworkStatus();
      setIsOnline(online);
      if (online) {
        // Auto sync if queue has items
        const queue = getOfflineSyncQueue();
        if (queue.length > 0) {
          await triggerBatchSync();
          updateSyncQueueCount();
        }
      }
    };

    // Encrypted local storage hydrates asynchronously (real AES-GCM via Web
    // Crypto rather than the old synchronous XOR obfuscation), so wait for
    // it before the first read on mount.
    waitForStorageReady().then(() => {
      const savedUser = getLocalUser();
      if (savedUser) setUserProfile(savedUser);
      updateSyncQueueCount();
    });

    monitorNetwork();
    const interval = setInterval(monitorNetwork, 5000);
    return () => clearInterval(interval);
  }, []);

  // Workflow Handlers
  const handleSelectPatient = (patient) => {
    setUserProfile(patient);
    setCurrentStep(2); // Proceed to survey directly for selected patient
  };

  const handleRegisterNewPatient = () => {
    setUserProfile(null);
    setCurrentStep(1); // Proceed to new registration form
  };

  const handleSaveProfile = (profile) => {
    const saved = savePatient(profile);
    setUserProfile(saved);
    setCurrentStep(2); // Proceed to Digital Survey
  };

  const handleSurveyComplete = (survey) => {
    setSurveyData(survey);
    setCurrentStep(3); // Proceed to Gait Vision
  };

  const handleVisionComplete = (vision) => {
    setVisionData(vision);
    setCurrentStep(4); // Proceed to Wearable Module
  };

  const handleWearableComplete = (sensor) => {
    setSensorData(sensor);
    processFinalScreening(surveyData, visionData, sensor);
  };

  const handleSkipWearable = () => {
    setSensorData(null);
    processFinalScreening(surveyData, visionData, null);
  };

  const processFinalScreening = async (survey, vision, sensor) => {
    const availableModalities = [];
    if (survey) availableModalities.push('survey');
    if (vision) availableModalities.push('vision');
    if (sensor && sensor.wearable_available) availableModalities.push('wearable');

    const screeningPayload = {
      user_id: userProfile?.user_id || userProfile?.patient_id || 'NER_DEMO_01',
      district: userProfile?.district || null,
      joint: userProfile?.target_knee ? `${userProfile.target_knee} Knee` : "Right Knee",
      available_modalities: availableModalities,
      survey,
      vision,
      sensor,
      is_demo: isDemoMode
    };

    const res = await submitScreeningAPI(screeningPayload);
    setFinalResult(res);
    setUnsyncedCount(getOfflineSyncQueue().length);
    setCurrentStep(5); // Proceed to Result Screen
  };

  const handleNewScreening = () => {
    setSurveyData(null);
    setVisionData(null);
    setSensorData(null);
    setFinalResult(null);
    setCurrentStep(0); // Return to Patient Search screen
  };

  return (
    <>
      {!hwSession && (
        <HealthWorkerPinModal onAuthenticate={handleAuthenticateWorker} />
      )}

      <Navbar 
        currentLang={currentLang}
        onLangChange={setCurrentLang}
        isOnline={isOnline}
        unsyncedCount={unsyncedCount}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isDemoMode={isDemoMode}
        setIsDemoMode={setIsDemoMode}
        hwSession={hwSession}
        onLockSession={handleLockSession}
      />

      <div className="app-container">
      <main style={{ flex: 1, paddingBottom: '3rem' }}>
        {activeTab === 'screening' && (
          <div>
            {currentStep === 0 && (
              <PatientSearch
                currentLang={currentLang}
                onSelectPatient={handleSelectPatient}
                onRegisterNew={handleRegisterNewPatient}
              />
            )}

            {currentStep === 1 && (
              <UserProfile 
                currentLang={currentLang} 
                initialProfile={userProfile} 
                onSave={handleSaveProfile} 
                onBack={() => setCurrentStep(0)}
              />
            )}

            {currentStep === 2 && (
              <DigitalSurvey 
                currentLang={currentLang} 
                onComplete={handleSurveyComplete} 
                onBack={() => setCurrentStep(userProfile ? 0 : 1)} 
              />
            )}

            {currentStep === 3 && (
              <GaitVision 
                currentLang={currentLang} 
                onComplete={handleVisionComplete} 
                onSkip={() => { setVisionData(null); setCurrentStep(4); }} 
              />
            )}

            {currentStep === 4 && (
              <WearableSimulator 
                currentLang={currentLang} 
                onComplete={handleWearableComplete} 
                onSkip={handleSkipWearable} 
              />
            )}

            {currentStep === 5 && (
              <ScreeningResult 
                currentLang={currentLang} 
                result={finalResult} 
                userProfile={userProfile} 
                onNewScreening={handleNewScreening} 
              />
            )}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DoctorDashboard currentLang={currentLang} />
        )}

        {activeTab === 'awareness' && (
          <AwarenessLibrary currentLang={currentLang} />
        )}

        {activeTab === 'sync' && (
          <SyncCenter 
            currentLang={currentLang} 
            isOnline={isOnline} 
            onSyncCompleted={() => setUnsyncedCount(getOfflineSyncQueue().length)} 
          />
        )}
      </main>

      {/* Footer Branding & Disclaimer */}
      <footer style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <p>
          Multimodal Osteoarthritis Screening System for North Eastern Region (SIH 26004) &bull; Offline-First Web Platform
        </p>
      </footer>
      </div>
    </>
  );
}
