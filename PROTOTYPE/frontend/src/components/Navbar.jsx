import React, { useState } from 'react';
import { Activity, Globe, Wifi, WifiOff, RefreshCw, UserCheck, Stethoscope, ShieldAlert, BookOpen, DownloadCloud, Loader2, Lock } from 'lucide-react';
import { TRANSLATIONS } from '../translations/vernacular';
import { saveCachedTranslation, saveCachedAudio } from '../services/offlineStorage';
import logoSrc from '../assets/osteo-optix-logo.png';

const API_BASE_URL = window.location.origin && window.location.origin.includes("8000") 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

const pillOnTeal = {
  padding: '0.45rem 0.9rem',
  fontSize: '0.82rem',
  fontWeight: 600,
  borderRadius: '999px',
  border: '1px solid rgba(255,255,255,0.85)',
  background: '#ffffff',
  color: '#0f766e',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  whiteSpace: 'nowrap',
};

const tabBtnBase = (active) => ({
  padding: '0.65rem 1.35rem',
  fontSize: '0.92rem',
  fontWeight: active ? 600 : 500,
  borderRadius: '999px',
  border: `2px solid ${active ? '#0d9488' : '#cbd5e1'}`,
  background: active ? '#ffffff' : '#ffffff',
  color: active ? '#0f766e' : '#64748b',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.5rem',
  cursor: 'pointer',
  boxShadow: active ? '0 2px 8px rgba(13, 148, 136, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
  flexShrink: 0,
});

export default function Navbar({ 
  currentLang, 
  onLangChange, 
  isOnline, 
  unsyncedCount, 
  activeTab, 
  setActiveTab,
  isDemoMode,
  setIsDemoMode,
  hwSession,
  onLockSession
}) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const [syncingLang, setSyncingLang] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  const handleSyncLanguagePack = async () => {
    if (!isOnline) {
      alert("Language Pack Sync requires an active server connection. Currently in Offline Mode.");
      return;
    }

    setSyncingLang(true);
    setSyncStatus('Syncing Bhashini translations & TTS...');

    try {
      const termsToTranslate = [
        { key: 'appTitle', text: 'Osteo-Optix' },
        { key: 'subTitle', text: 'Multimodal Knee OA Risk Screening System' },
        { key: 'navNewScreening', text: 'New Screening' },
        { key: 'navDoctorDashboard', text: 'Doctor Portal' }
      ];

      for (const item of termsToTranslate) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: item.text, target_lang: currentLang, source_lang: 'en' })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.available && data.translated_text) {
              saveCachedTranslation(currentLang, item.key, data.translated_text);
            }
          }
        } catch (e) {}
      }

      const sampleQuestionTexts = [
        "How much knee pain do you experience when walking on flat ground?",
        "How much knee stiffness do you experience after first awakening in the morning?",
        "How much difficulty do you experience going up or down stairs?"
      ];

      for (let i = 0; i < sampleQuestionTexts.length; i++) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sampleQuestionTexts[i], language: currentLang })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.available && data.audio_base64) {
              saveCachedAudio(currentLang, `q_sample_${i}`, data.audio_base64);
            }
          }
        } catch (e) {}
      }

      setSyncStatus('Language Pack Cached Offline!');
      setTimeout(() => setSyncStatus(''), 3000);
    } catch (err) {
      setSyncStatus('Sync Failed');
    }
    setSyncingLang(false);
  };

  return (
    <header style={{
      width: '100%',
      alignSelf: 'stretch',
      boxSizing: 'border-box',
      margin: 0,
      marginBottom: '1.5rem',
      background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 45%, #0f766e 100%)',
      borderRadius: '0 0 16px 16px',
      boxShadow: '0 4px 18px rgba(15, 23, 42, 0.08)',
      overflow: 'hidden',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'stretch',
        minHeight: '132px',
      }}>
        {/* Shield logo — spans full height, cropped to remove off-white border */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('screening')}
          onKeyDown={(e) => { if (e.key === 'Enter') setActiveTab('screening'); }}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.5rem 1rem 0.5rem 1.25rem',
            cursor: 'pointer',
            background: 'transparent',
            borderRight: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          <div style={{
            width: '110px',
            height: '130px',
            overflow: 'hidden',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <img
              src={logoSrc}
              alt="Osteo-Optix"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
                filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))',
              }}
            />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Top band — title + status pills (transparent, inherits header bg) */}
          <div style={{
            position: 'relative',
            background: 'transparent',
            padding: '0.85rem 1.25rem 0.85rem 0.65rem',
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
          }}>
            <Activity
              size={120}
              color="rgba(255,255,255,0.07)"
              style={{ position: 'absolute', left: '-2rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />
            <Activity
              size={100}
              color="rgba(255,255,255,0.06)"
              style={{ position: 'absolute', right: '18%', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            />

            <div style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              width: '100%',
            }}>
              <div style={{ minWidth: '180px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.2, letterSpacing: '0.02em' }}>
                  {t.appTitle}
                </h1>
                <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.92)', marginTop: '0.15rem', maxWidth: '420px', lineHeight: 1.35 }}>
                  {t.subTitle} for North Eastern Region India
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {hwSession ? (
                  <button type="button" onClick={onLockSession} title="Click to lock health worker session" style={{ ...pillOnTeal, color: '#166534' }}>
                    <Lock size={14} />
                    <span>{hwSession.workerId || 'HW Session Active'} (Lock)</span>
                  </button>
                ) : (
                  <button type="button" onClick={onLockSession} style={{ ...pillOnTeal, color: '#dc2626', borderColor: '#fecdd3' }}>
                    <Lock size={14} />
                    <span>PIN Session Locked</span>
                  </button>
                )}

                <div style={{
                  ...pillOnTeal,
                  cursor: 'default',
                  color: isOnline ? '#047857' : '#c2410c',
                  background: isOnline ? '#ffffff' : '#fffbeb',
                  borderColor: isOnline ? '#a7f3d0' : '#fde68a',
                }}>
                  {isOnline ? <Wifi size={15} /> : <WifiOff size={15} />}
                  <span>{isOnline ? 'Online Server' : 'Offline Mode'}</span>
                  {unsyncedCount > 0 && (
                    <span style={{
                      background: '#d97706',
                      color: '#ffffff',
                      padding: '0.05rem 0.45rem',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                    }}>
                      {unsyncedCount} Queued
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsDemoMode(!isDemoMode)}
                  style={{
                    ...pillOnTeal,
                    background: isDemoMode ? 'rgba(255,255,255,0.22)' : '#ffffff',
                    color: isDemoMode ? '#ffffff' : '#64748b',
                    borderColor: isDemoMode ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)',
                  }}
                >
                  <ShieldAlert size={14} />
                  <span>{isDemoMode ? 'DEMO MODE (ON)' : 'VALIDATED MODE'}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ ...pillOnTeal, padding: '0.35rem 0.5rem 0.35rem 0.65rem' }}>
                    <Globe size={15} color="#0f766e" />
                    <select
                      value={currentLang}
                      onChange={(e) => onLangChange(e.target.value)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#0f766e',
                        cursor: 'pointer',
                        outline: 'none',
                        padding: '0.2rem 0.25rem',
                      }}
                    >
                      <option value="en">English</option>
                      <option value="hi">हिन्दी (Hindi)</option>
                      <option value="as">অসমীয়া (Assamese)</option>
                      <option value="bn">বাংলা (Bengali)</option>
                      <option value="mni">মৈতৈলোন্ (Manipuri)</option>
                      <option value="kha">Ka Ktien Khasi (Khasi)</option>
                      <option value="lus">Mizo ṭawng (Mizo)</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleSyncLanguagePack}
                    disabled={syncingLang || !isOnline}
                    title="Pre-fetch and cache Bhashini translations & TTS audio for offline use"
                    style={{ ...pillOnTeal, color: '#0f766e' }}
                  >
                    {syncingLang ? <Loader2 size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                    <span>{syncStatus || 'Sync Pack'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tab navigation row — consistent teal background, spread buttons */}
          <div style={{
            display: 'flex',
            gap: '2rem',
            padding: '0.75rem 1.25rem 0.85rem 0.65rem',
            overflowX: 'auto',
            background: 'rgba(0,0,0,0.08)',
            borderTop: '1px solid rgba(255,255,255,0.15)',
            justifyContent: 'space-evenly',
            flexWrap: 'wrap',
          }}>
            <button type="button" className={activeTab === 'screening' ? 'pulse-animation' : ''} style={tabBtnBase(activeTab === 'screening')} onClick={() => setActiveTab('screening')}>
              <UserCheck size={18} />
              <span>{t.navNewScreening}</span>
            </button>

            <button type="button" style={tabBtnBase(activeTab === 'dashboard')} onClick={() => setActiveTab('dashboard')}>
              <Stethoscope size={18} />
              <span>{t.navDoctorDashboard}</span>
            </button>

            <button type="button" style={tabBtnBase(activeTab === 'awareness')} onClick={() => setActiveTab('awareness')}>
              <BookOpen size={18} />
              <span>Awareness Library</span>
            </button>

            <button type="button" style={tabBtnBase(activeTab === 'sync')} onClick={() => setActiveTab('sync')}>
              <RefreshCw size={18} />
              <span>{t.navSyncCenter} ({unsyncedCount})</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
