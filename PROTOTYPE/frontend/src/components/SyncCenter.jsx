import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, CloudOff, ArrowRight } from 'lucide-react';
import { getOfflineSyncQueue } from '../services/offlineStorage';
import { triggerBatchSync } from '../services/apiService';
import { TRANSLATIONS } from '../translations/vernacular';

export default function SyncCenter({ currentLang, isOnline, onSyncCompleted }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  const [queue, setQueue] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  useEffect(() => {
    setQueue(getOfflineSyncQueue());
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    const res = await triggerBatchSync();
    setIsSyncing(false);
    
    if (res.status === "success") {
      setSyncStatus(`Successfully synchronized ${res.synced_count} records with the cloud server!`);
      setQueue(getOfflineSyncQueue());
      if (onSyncCompleted) onSyncCompleted();
    } else {
      setSyncStatus("Synchronization failed — server is currently offline or unreachable.");
    }
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <RefreshCw size={26} color="var(--primary-teal)" />
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>Background Cloud Synchronization Center</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Manage offline screening records queued for background upload
          </p>
        </div>
      </div>

      {syncStatus && (
        <div style={{
          background: syncStatus.includes("Successfully") ? '#ecfdf5' : '#fffbeb',
          border: `1px solid ${syncStatus.includes("Successfully") ? '#a7f3d0' : '#fde68a'}`,
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          fontSize: '0.95rem',
          color: syncStatus.includes("Successfully") ? '#047857' : '#b45309'
        }}>
          {syncStatus}
        </div>
      )}

      {/* Sync Queue Summary Box */}
      <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a' }}>Offline Pending Queue ({queue.length} Records)</span>
          <button className="btn-primary" onClick={handleManualSync} disabled={isSyncing || queue.length === 0}>
            <RefreshCw size={18} className={isSyncing ? 'pulse-animation' : ''} />
            <span>{isSyncing ? "Synchronizing..." : "Sync Now"}</span>
          </button>
        </div>

        {queue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={40} color="#059669" style={{ marginBottom: '0.5rem' }} />
            <p style={{ color: '#0f172a', fontWeight: 500 }}>All screening records are fully synchronized with the FastAPI backend!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {queue.map((item) => (
              <div key={item.screening_id} style={{ background: '#ffffff', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-color)' }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--primary-teal-dark)' }}>{item.screening_id}</span>
                  <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>User: {item.user_id}</span>
                </div>
                <span className="badge badge-moderate">Pending Sync</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
