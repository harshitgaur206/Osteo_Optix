import React, { useState } from 'react';
import { Lock, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { loginWorkerAPI } from '../services/apiService';
import { rehydrateOfflineStorageForSession } from '../services/offlineStorage';

export default function HealthWorkerPinModal({ onAuthenticate }) {
  const [pin, setPin] = useState('');
  const [workerId, setWorkerId] = useState('HW_NER_01');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const trimmedWorkerId = workerId.trim();
    const trimmedPin = pin.trim();
    const result = await loginWorkerAPI(trimmedWorkerId, trimmedPin);

    if (result.success) {
      // Online login successful
      try {
        localStorage.setItem('hw_jwt', result.access_token);
        localStorage.setItem('hw_profile', JSON.stringify(result.worker));
      } catch (err) {}

      // Local patient/screening data is now encrypted with a key derived
      // from the session JWT rather than the device-only key used before
      // login — re-derive the key and re-read existing records under it.
      rehydrateOfflineStorageForSession();

      onAuthenticate({
        workerId: result.worker.worker_id,
        workerName: result.worker.name,
        assignedDistrict: result.worker.assigned_district,
        token: result.access_token,
        authenticatedAt: new Date().toISOString()
      });
    } else if (result.isOffline) {
      // Offline fallback: check localStorage cached session
      try {
        const cachedProfileStr = localStorage.getItem('hw_profile');
        const cachedJwt = localStorage.getItem('hw_jwt');
        if (cachedProfileStr && cachedJwt) {
          const cachedProfile = JSON.parse(cachedProfileStr);
          if (cachedProfile.worker_id === trimmedWorkerId) {
            onAuthenticate({
              workerId: cachedProfile.worker_id,
              workerName: cachedProfile.name,
              assignedDistrict: cachedProfile.assigned_district,
              token: cachedJwt,
              authenticatedAt: new Date().toISOString(),
              isOfflineSession: true
            });
            return;
          }
        }
      } catch (err) {}

      // Hardcoded offline demo credentials check if first-time offline before sync
      if ((trimmedWorkerId === 'HW_NER_01' && trimmedPin === '1234') ||
          (trimmedWorkerId === 'HW_NER_02' && trimmedPin === '5678') ||
          (trimmedWorkerId === 'HW_NER_03' && trimmedPin === '9999')) {
        onAuthenticate({
          workerId: trimmedWorkerId,
          workerName: "Demo Health Worker",
          assignedDistrict: "Kamrup Metropolitan",
          authenticatedAt: new Date().toISOString(),
          isOfflineSession: true
        });
      } else {
        setError('Offline Mode: Invalid Health Worker ID or PIN code.');
      }
    } else {
      setError(result.error || 'Authentication failed. Please check worker ID and PIN.');
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{ maxWidth: '440px', width: '100%', padding: '2rem', borderRadius: '16px', background: '#ffffff', boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: '#ccfbf1',
            color: 'var(--primary-teal)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem'
          }}>
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>Health Worker Authentication</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Enter your Health Worker ID and 4-digit PIN code to authenticate your field screening session.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              Health Worker ID / Badge No.
            </label>
            <input
              type="text"
              className="form-input"
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              placeholder="e.g. HW_NER_01"
              required
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
              Enter 4-Digit Security PIN
            </label>
            <input
              type="password"
              className="form-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter PIN (Demo: 1234)"
              maxLength={6}
              style={{ fontSize: '1.2rem', letterSpacing: '0.3em', textAlign: 'center' }}
              required
              autoFocus
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block', marginTop: '0.25rem', textAlign: 'center' }}>
              Demo PINs: <strong style={{ color: 'var(--primary-teal)' }}>HW_NER_01: 1234 | HW_NER_02: 5678</strong>
            </span>
          </div>

          {error && (
            <div style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '8px', border: '1px solid #fecdd3', color: '#dc2626', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', marginTop: '0.5rem' }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
            <span>{loading ? 'Authenticating...' : 'Authenticate Session'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
