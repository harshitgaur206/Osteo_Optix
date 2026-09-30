import React, { useState, useEffect } from 'react';
import { Search, UserPlus, UserCheck, Calendar, Phone, MapPin, Activity } from 'lucide-react';
import { getAllPatients, searchPatients } from '../services/offlineStorage';
import { TRANSLATIONS } from '../translations/vernacular';

export default function PatientSearch({ currentLang = 'en', onSelectPatient, onRegisterNew }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const [query, setQuery] = useState('');
  const [patientList, setPatientList] = useState([]);

  useEffect(() => {
    setPatientList(searchPatients(query));
  }, [query]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', background: '#ffffff', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UserCheck size={24} color="var(--primary-teal)" />
              <span>Select or Register Patient</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Search existing offline patient records or register a new patient for screening.
            </p>
          </div>

          <button
            onClick={onRegisterNew}
            className="btn-primary"
            style={{ padding: '0.65rem 1.25rem', fontSize: '0.9rem', gap: '0.5rem' }}
          >
            <UserPlus size={18} />
            <span>Register New Patient</span>
          </button>
        </div>

        {/* Search Input Box */}
        <div style={{ marginTop: '1.25rem', position: 'relative' }}>
          <Search size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Patient Name, Phone Number, Patient ID (NER_XXXXXX), or District..."
            style={{ paddingLeft: '2.5rem', fontSize: '0.95rem', borderRadius: '10px' }}
            autoFocus
          />
        </div>
      </div>

      {/* Patient Search Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
            Found {patientList.length} Patient Record(s)
          </span>
        </div>

        {patientList.length === 0 ? (
          <div className="glass-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
            <Activity size={40} color="var(--text-subtle)" style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#334155' }}>No Patients Found</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
              {query ? `No records matching "${query}" in local storage.` : "No patients registered in local storage yet."}
            </p>
            <button onClick={onRegisterNew} className="btn-primary" style={{ margin: '0 auto', gap: '0.5rem' }}>
              <UserPlus size={18} />
              <span>Register New Patient Now</span>
            </button>
          </div>
        ) : (
          patientList.map((patient) => (
            <div
              key={patient.user_id || patient.patient_id}
              className="glass-panel"
              style={{
                padding: '1.25rem',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease'
              }}
              onClick={() => onSelectPatient(patient)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#f0fdfa',
                  color: 'var(--primary-teal)',
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #99f6e4'
                }}>
                  {patient.name ? patient.name.charAt(0).toUpperCase() : 'P'}
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{patient.name}</h3>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#f1f5f9', color: '#475569', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                      {patient.user_id || patient.patient_id}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>{patient.age} Yrs &bull; {patient.sex}</span>
                    {patient.district && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <MapPin size={13} /> {patient.district}, {patient.state || 'Assam'}
                      </span>
                    )}
                    {patient.phone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Phone size={13} /> {patient.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {patient.last_screening_date && (
                  <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <Calendar size={13} /> Last Screened:
                    </div>
                    <strong style={{ color: '#334155' }}>
                      {new Date(patient.last_screening_date).toLocaleDateString()}
                    </strong>
                  </div>
                )}

                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPatient(patient);
                  }}
                  style={{ fontSize: '0.85rem', padding: '0.5rem 0.85rem', background: '#f0fdfa', borderColor: 'var(--primary-teal)', color: '#0f766e', fontWeight: 600 }}
                >
                  Start Screening &rarr;
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
