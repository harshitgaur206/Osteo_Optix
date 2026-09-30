import React, { useState } from 'react';
import { User, MapPin, Briefcase, Mountain, Activity, ArrowRight } from 'lucide-react';
import { TRANSLATIONS } from '../translations/vernacular';
import nerGeoJSON from '../assets/ner-districts.json';

// The exact set of districts the Doctor Dashboard's choropleth map can plot.
// Sourced from the same GeoJSON the map renders, so a district picked here
// is *guaranteed* to match a polygon on the map — free-text entry here
// previously let a typo'd or unlisted district silently vanish from the map.
const DISTRICT_OPTIONS = nerGeoJSON.features
  .map(f => f.properties)
  .sort((a, b) => a.district.localeCompare(b.district));

export default function UserProfile({ currentLang, initialProfile, onSave }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;

  const [formData, setFormData] = useState({
    user_id: initialProfile?.user_id || `NER_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    name: initialProfile?.name || '',
    age: initialProfile?.age || 50,
    sex: initialProfile?.sex || 'Female',
    village: initialProfile?.village || '',
    district: initialProfile?.district || DISTRICT_OPTIONS[0].district,
    state: initialProfile?.state || DISTRICT_OPTIONS[0].state,
    occupation: initialProfile?.occupation || 'Tea Estate Worker',
    occupational_load: initialProfile?.occupational_load || 'Tea Estate',
    terrain_exposure: initialProfile?.terrain_exposure || 'Steep',
    previous_knee_injury: initialProfile?.previous_knee_injury || false,
    existing_oa_diagnosis: initialProfile?.existing_oa_diagnosis || false,
    target_knee: initialProfile?.target_knee || 'Right'
  });

  const [consentGiven, setConsentGiven] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Picking a district also fixes the state, since each district in the
  // map dataset belongs to exactly one state — keeps the two fields from
  // ever disagreeing with each other or with the map's own data.
  const handleDistrictChange = (e) => {
    const districtName = e.target.value;
    const match = DISTRICT_OPTIONS.find(d => d.district === districtName);
    setFormData(prev => ({
      ...prev,
      district: districtName,
      state: match ? match.state : prev.state
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Please enter your name or preferred identifier.");
      return;
    }
    if (!consentGiven) {
      alert("Explicit data privacy consent is required before proceeding with screening data collection.");
      return;
    }
    onSave({ 
      ...formData, 
      consent_given: true, 
      consent_timestamp: new Date().toISOString() 
    });
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <User size={26} color="var(--primary-teal)" />
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>{t.profileTitle}</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            User ID: <span style={{ color: 'var(--primary-teal-dark)', fontWeight: 600 }}>{formData.user_id}</span>
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Row 1: Name, Age, Sex */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
              {t.nameLabel} *
            </label>
            <input 
              type="text" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              placeholder="e.g. Biren Das" 
              className="form-input" 
              required 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
              {t.ageLabel} *
            </label>
            <input 
              type="number" 
              name="age" 
              value={formData.age} 
              onChange={handleChange} 
              min="18" 
              max="100" 
              className="form-input" 
              required 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
              {t.sexLabel} *
            </label>
            <select name="sex" value={formData.sex} onChange={handleChange} className="form-select">
              <option value="Female">{t.female}</option>
              <option value="Male">{t.male}</option>
              <option value="Other">{t.other}</option>
            </select>
          </div>
        </div>

        {/* Row 2: Location (District, State) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
              {t.districtLabel} *
            </label>
            <select
              name="district"
              value={formData.district}
              onChange={handleDistrictChange}
              className="form-select"
              required
            >
              {DISTRICT_OPTIONS.map(d => (
                <option key={d.district} value={d.district}>{d.district}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Matches the districts plotted on the Doctor Dashboard's severity map.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
              {t.stateLabel}
            </label>
            <input
              type="text"
              value={formData.state}
              readOnly
              className="form-input"
              style={{ background: '#f8fafc', color: 'var(--text-muted)' }}
            />
          </div>
        </div>

        {/* Row 3: NER Contextual Risk Factors (Occupational Load & Terrain Exposure) */}
        <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', color: '#0369a1', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
            <Briefcase size={18} />
            North Eastern Contextual Risk Parameters
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
                {t.occLoadLabel} *
              </label>
              <select name="occupational_load" value={formData.occupational_load} onChange={handleChange} className="form-select">
                <option value="Light">{t.occLight}</option>
                <option value="Moderate">{t.occModerate}</option>
                <option value="Heavy Agriculture">{t.occHeavyAgri}</option>
                <option value="Tea Estate">{t.occTeaEstate}</option>
                <option value="Construction">{t.occConstruction}</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
                {t.terrainLabel} *
              </label>
              <select name="terrain_exposure" value={formData.terrain_exposure} onChange={handleChange} className="form-select">
                <option value="Flat">{t.terrainFlat}</option>
                <option value="Moderate">{t.terrainModerate}</option>
                <option value="Steep">{t.terrainSteep}</option>
                <option value="Stairs">{t.terrainStairs}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Row 4: Knee Selection & History */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.4rem', fontWeight: 500, color: '#0f172a' }}>
              {t.targetKneeLabel}
            </label>
            <select name="target_knee" value={formData.target_knee} onChange={handleChange} className="form-select">
              <option value="Right">{t.kneeRight}</option>
              <option value="Left">{t.kneeLeft}</option>
              <option value="Both">{t.kneeBoth}</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.5rem', gap: '0.5rem' }}>
            <input 
              type="checkbox" 
              id="prevInjury" 
              name="previous_knee_injury" 
              checked={formData.previous_knee_injury} 
              onChange={handleChange} 
              style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
            />
            <label htmlFor="prevInjury" style={{ fontSize: '0.95rem', cursor: 'pointer', color: '#0f172a' }}>
              {t.prevInjuryLabel}
            </label>
          </div>
        </div>

        {/* Explicit Data Privacy & Clinical Consent Checkbox (Technical Audit Recommendation #4) */}
        <div style={{ background: '#f0fdfa', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #99f6e4', marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer', fontSize: '0.88rem', color: '#0f172a' }}>
            <input 
              type="checkbox" 
              checked={consentGiven} 
              onChange={(e) => setConsentGiven(e.target.checked)} 
              style={{ marginTop: '0.2rem', width: '20px', height: '20px', cursor: 'pointer', accentColor: 'var(--primary-teal)' }} 
              required
            />
            <span>
              <strong style={{ color: '#0f766e' }}>Explicit Data Privacy & Clinical Consent:</strong> I explicitly consent to the collection, processing, and anonymized storage of my demographic and biomechanical screening data for knee osteoarthritis risk assessment in accordance with clinical data privacy compliance guidelines.
            </span>
          </label>
        </div>

        {/* Submit Button */}
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-primary" style={{ width: '100%', opacity: consentGiven ? 1 : 0.6 }} disabled={!consentGiven}>
            <span>{t.btnSaveProfile}</span>
            <ArrowRight size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}
