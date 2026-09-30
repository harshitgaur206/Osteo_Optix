import React, { useState, useEffect } from 'react';
import { Stethoscope, Users, Activity, AlertTriangle, ShieldCheck, MapPin, Eye, FileText, Download, BarChart2, TrendingUp, Trash2, Filter, RefreshCw } from 'lucide-react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { getLocalScreeningHistory, deleteLocalScreening } from '../services/offlineStorage';
import nerGeoJSON from '../assets/ner-districts.json';

const API_BASE_URL = window.location.origin && window.location.origin.includes("8000") 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function DoctorDashboard({ currentLang }) {
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [trendData, setTrendData] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  // Derive every dashboard number — the KPI cards, the map colors, and the
  // records table — from ONE combined array of real records, so they can
  // never disagree with each other again. Nothing here is invented: it is
  // either a screening this device recorded locally, or one this server
  // already has on file.
  const computeStatsFrom = (records) => {
    const total = records.length;
    const high = records.filter(r => r.risk_category?.includes('Severe')).length;
    const mod = records.filter(r => r.risk_category?.includes('Moderate')).length;
    const mild = records.filter(r => r.risk_category?.includes('Mild')).length;
    const minR = Math.max(0, total - high - mod - mild);

    const district_breakdown = {};
    const district_severity_sum = {};

    records.forEach(r => {
      // A record with no district on file is NOT the same as a record from
      // Kamrup Metropolitan — defaulting it there would silently inflate
      // that one district's numbers with data that was never actually
      // observed there. Bucket it separately instead so it stays visible
      // as "unmapped" rather than distorting a real district's stats.
      const d = r.district || "Unmapped/Other";
      district_breakdown[d] = (district_breakdown[d] || 0) + 1;
      district_severity_sum[d] = (district_severity_sum[d] || 0) + ((r.risk_probability || 0) * 100);
    });

    const district_severity = {};
    Object.keys(district_severity_sum).forEach(d => {
      district_severity[d] = Math.round(district_severity_sum[d] / district_breakdown[d]);
    });

    return {
      total_screenings: total,
      high_risk: high,
      moderate_risk: mod,
      mild_risk: mild,
      minimal_risk: minR,
      unsynced_records: records.filter(r => !r.synced).length,
      modalities_breakdown: {
        survey: records.filter(r => r.available_modalities?.includes('survey') || r.survey).length,
        vision: records.filter(r => r.available_modalities?.includes('vision') || r.vision).length,
        wearable: records.filter(r => r.available_modalities?.includes('wearable') || r.sensor?.wearable_available).length,
      },
      district_breakdown,
      district_severity
    };
  };

  const loadData = async () => {
    const localRecords = getLocalScreeningHistory();

    // Pull every screening the server actually has on file. This is what
    // the records table below reads — the same records the KPI cards are
    // counted from — instead of only ever showing this device's own local
    // cache (which is empty on a fresh browser/session even when the
    // server already has real records).
    let serverRecords = [];
    try {
      const res = await fetch(`${API_BASE_URL}/api/screenings`);
      if (res.ok) serverRecords = await res.json();
    } catch (e) {
      console.warn("Screening list API unavailable — using local-only records.");
    }

    // Merge: server is authoritative for anything it already knows about;
    // add any local record not yet synced to the server (offline-first).
    const serverIds = new Set(serverRecords.map(r => r.screening_id));
    const localOnly = localRecords.filter(r => !serverIds.has(r.screening_id));
    const combined = [...serverRecords, ...localOnly];

    setHistory(combined);
    setStats(computeStatsFrom(combined));

    // Fetch real time series trends
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/trends`);
      if (res.ok) {
        const trends = await res.json();
        setTrendData(trends);
      }
    } catch (e) {
      console.warn("Trends API offline fallback");
    }
  };

  const handleDeleteRecord = async (screeningId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to permanently delete screening record ${screeningId}?`)) return;

    try {
      await fetch(`${API_BASE_URL}/api/screenings/${screeningId}`, { method: 'DELETE' });
    } catch (err) {}

    deleteLocalScreening(screeningId);
    if (selectedRecord?.screening_id === screeningId) {
      setSelectedRecord(null);
    }
    loadData();
  };

  // Choropleth Color Scaler for Leaflet District Map
  // A district with zero recorded screenings has no risk signal at all — it
  // is colored neutral gray rather than guessed as "minimal risk" (green),
  // which would misrepresent an absence of data as a clean bill of health.
  const getDistrictColor = (districtName) => {
    const severityMap = stats?.district_severity || {};
    const countMap = stats?.district_breakdown || {};

    if (!countMap[districtName]) return '#cbd5e1'; // No data (Gray)

    const avgRisk = severityMap[districtName];
    if (avgRisk == null) return '#cbd5e1'; // No data (Gray)
    if (avgRisk >= 65) return '#dc2626'; // Severe Risk (Red)
    if (avgRisk >= 45) return '#ea580c'; // Moderate Risk (Orange)
    if (avgRisk >= 30) return '#ca8a04'; // Mild Risk (Yellow)
    return '#16a34a'; // Minimal Risk (Green)
  };

  const geoJsonStyle = (feature) => {
    const districtName = feature.properties.district;
    const isSelected = selectedDistrict === districtName;
    return {
      fillColor: getDistrictColor(districtName),
      weight: isSelected ? 3 : 1.5,
      opacity: 1,
      color: isSelected ? '#0f172a' : '#ffffff',
      dashArray: isSelected ? '' : '3',
      fillOpacity: isSelected ? 0.85 : 0.6
    };
  };

  const onEachDistrict = (feature, layer) => {
    const districtName = feature.properties.district;
    const avgRisk = stats?.district_severity?.[districtName] || 'N/A';
    const count = stats?.district_breakdown?.[districtName] || 0;

    layer.bindTooltip(`<strong>${districtName}</strong><br/>Screenings: ${count}<br/>Avg Risk: ${count > 0 ? `${avgRisk}%` : 'No data'}`);

    layer.on({
      click: () => {
        if (selectedDistrict === districtName) {
          setSelectedDistrict(null);
        } else {
          setSelectedDistrict(districtName);
        }
      }
    });
  };

  // Filtered History Records by District Selection
  const filteredHistory = selectedDistrict
    ? history.filter(r => (r.district === selectedDistrict || r.user_id.includes(selectedDistrict.slice(0, 3))))
    : history;

  // Real SHAP Bar Chart Data derivation (Item 8)
  // Returns null when there is no real basis for a chart — the caller renders
  // an explicit "no data yet" state instead of a chart in that case.
  const getShapChartData = () => {
    if (selectedRecord && selectedRecord.explanations && selectedRecord.explanations.length > 0) {
      return {
        labels: selectedRecord.explanations.map(e => e.feature),
        datasets: [{
          label: `SHAP Contribution (%) — ${selectedRecord.screening_id}`,
          data: selectedRecord.explanations.map(e => e.contribution),
          backgroundColor: selectedRecord.explanations.map(e => e.direction === 'high' ? 'rgba(225, 29, 72, 0.85)' : 'rgba(13, 148, 136, 0.85)'),
          borderColor: selectedRecord.explanations.map(e => e.direction === 'high' ? '#e11d48' : '#0d9488'),
          borderWidth: 1.5,
          borderRadius: 6
        }]
      };
    }

    // No record selected: derive a genuine population-level average by
    // aggregating the real `explanations` recorded against every completed
    // screening in local history — nothing here is invented.
    const recordsWithExplanations = history.filter(r => Array.isArray(r.explanations) && r.explanations.length > 0);
    if (recordsWithExplanations.length === 0) {
      return null; // No screenings yet (or none carry explanations) — nothing to chart.
    }

    const totals = {};
    const counts = {};
    recordsWithExplanations.forEach(r => {
      r.explanations.forEach(e => {
        totals[e.feature] = (totals[e.feature] || 0) + (e.contribution || 0);
        counts[e.feature] = (counts[e.feature] || 0) + 1;
      });
    });

    const features = Object.keys(totals)
      .map(feature => ({ feature, avg: Math.round(totals[feature] / counts[feature]) }))
      .sort((a, b) => b.avg - a.avg);

    const palette = ['rgba(13, 148, 136, 0.85)', 'rgba(2, 132, 199, 0.85)', 'rgba(217, 119, 6, 0.85)', 'rgba(225, 29, 72, 0.85)', 'rgba(100, 116, 139, 0.85)', 'rgba(16, 185, 129, 0.85)'];

    return {
      labels: features.map(f => f.feature),
      datasets: [{
        label: `Population Average SHAP Contribution (%) — n=${recordsWithExplanations.length} screening${recordsWithExplanations.length === 1 ? '' : 's'}`,
        data: features.map(f => f.avg),
        backgroundColor: features.map((_, i) => palette[i % palette.length]),
        borderWidth: 1.5,
        borderRadius: 6
      }]
    };
  };

  // Real Trend Line Chart Data derivation (Item 8)
  // Returns null when there is no real basis for a trend — the caller renders
  // an explicit "no data yet" state instead of a chart in that case.
  const getTrendChartData = () => {
    if (trendData && trendData.length > 0) {
      const labels = trendData.map(t => t.week);
      const totals = trendData.map(t => t.total);
      return {
        labels,
        datasets: [{
          label: 'Weekly Screening Volume',
          data: totals,
          borderColor: '#0d9488',
          backgroundColor: 'rgba(13, 148, 136, 0.1)',
          tension: 0.35,
          fill: true
        }]
      };
    }

    // Server trend endpoint unavailable (offline mode): derive real weekly
    // counts from local screening history's own timestamps instead of
    // fabricating an upward-trending line.
    const recordsWithTimestamps = history.filter(r => r.timestamp);
    if (recordsWithTimestamps.length === 0) {
      return null; // No screenings recorded locally yet — nothing to trend.
    }

    // Bucket by ISO year-week (Mon-Sun), most recent 6 weeks that actually
    // contain data.
    const getIsoWeekKey = (dateStr) => {
      const d = new Date(dateStr);
      const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = (target.getUTCDay() + 6) % 7;
      target.setUTCDate(target.getUTCDate() - dayNum + 3);
      const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
      const week = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
      return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
    };

    const weekCounts = {};
    recordsWithTimestamps.forEach(r => {
      const key = getIsoWeekKey(r.timestamp);
      weekCounts[key] = (weekCounts[key] || 0) + 1;
    });

    const sortedWeeks = Object.keys(weekCounts).sort();

    return {
      labels: sortedWeeks,
      datasets: [{
        label: `Weekly Screening Volume (local device, n=${recordsWithTimestamps.length})`,
        data: sortedWeeks.map(w => weekCounts[w]),
        borderColor: '#0d9488',
        backgroundColor: 'rgba(13, 148, 136, 0.1)',
        tension: 0.35,
        fill: true
      }]
    };
  };

  return (
    <div className="glass-panel" style={{ maxWidth: '1250px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Stethoscope size={28} color="var(--primary-teal)" />
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a' }}>Doctor & Specialist Clinical Dashboard</h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              North Eastern Region Geo-Spatial Severity Map, Real SHAP Inspection & Case Management
            </p>
          </div>
        </div>

        <button className="btn-secondary" onClick={loadData} style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
          <RefreshCw size={15} /> Refresh Dashboard
        </button>
      </div>

      {/* 4-Tier Summary KPI Badges (Item 5) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#f8fafc', padding: '1.15rem', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Screenings</span>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#0f172a' }}>{stats?.total_screenings || 0}</div>
        </div>

        <div style={{ background: '#fff1f2', padding: '1.15rem', borderRadius: '12px', border: '1px solid #fecdd3' }}>
          <span style={{ fontSize: '0.8rem', color: '#be123c', fontWeight: 600 }}>Severe OA (81-100%)</span>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#dc2626' }}>{stats?.high_risk || 0}</div>
        </div>

        <div style={{ background: '#fff7ed', padding: '1.15rem', borderRadius: '12px', border: '1px solid #ffedd5' }}>
          <span style={{ fontSize: '0.8rem', color: '#c2410c', fontWeight: 600 }}>Moderate OA (56-80%)</span>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#ea580c' }}>{stats?.moderate_risk || 0}</div>
        </div>

        <div style={{ background: '#fefce8', padding: '1.15rem', borderRadius: '12px', border: '1px solid #fef08a' }}>
          <span style={{ fontSize: '0.8rem', color: '#a16207', fontWeight: 600 }}>Mild OA (31-55%)</span>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#ca8a04' }}>{stats?.mild_risk || 0}</div>
        </div>

        <div style={{ background: '#f0fdf4', padding: '1.15rem', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
          <span style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>Minimal Risk (0-30%)</span>
          <div style={{ fontSize: '1.9rem', fontWeight: 800, color: '#16a34a' }}>{stats?.minimal_risk || 0}</div>
        </div>
      </div>

      {/* Item 7: Leaflet Interactive GeoJSON NER District Map */}
      <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '14px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPin size={20} color="var(--primary-teal)" />
              North Eastern Region District Severity Map
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Click any district polygon to filter screening records table below.
            </p>
          </div>

          {selectedDistrict && (
            <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setSelectedDistrict(null)}>
              Clear Filter ({selectedDistrict})
            </button>
          )}
        </div>

        <div style={{ height: '360px', width: '100%', borderRadius: '10px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
          {/* No tile layer: every piece of information on this map (shapes, colors,
              click-to-filter, tooltips) comes entirely from our own bundled GeoJSON,
              not from any tile server. Rendering on a plain background means this
              map works fully offline and never depends on a third-party tile
              provider's availability, rate limits, or usage policy. */}
          <MapContainer
            center={[26.2006, 92.9376]}
            zoom={6.2}
            style={{ height: '100%', width: '100%', background: '#eef2f7' }}
            zoomControl={true}
            attributionControl={false}
          >
            <GeoJSON data={nerGeoJSON} style={geoJsonStyle} onEachFeature={onEachDistrict} />
          </MapContainer>
        </div>

        {/* Map Choropleth Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Severity Scale:</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '14px', height: '14px', background: '#dc2626', borderRadius: '3px', display: 'inline-block' }} /> Severe (&ge;65%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '14px', height: '14px', background: '#ea580c', borderRadius: '3px', display: 'inline-block' }} /> Moderate (45-64%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '14px', height: '14px', background: '#ca8a04', borderRadius: '3px', display: 'inline-block' }} /> Mild (30-44%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '14px', height: '14px', background: '#16a34a', borderRadius: '3px', display: 'inline-block' }} /> Minimal (&lt;30%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '14px', height: '14px', background: '#cbd5e1', borderRadius: '3px', display: 'inline-block' }} /> No screenings yet
          </span>
        </div>
      </div>

      {/* Item 8: Interactive Chart.js Visualizations (Real SHAP Bar + Trend Line) */}
      {(() => {
        const shapData = getShapChartData();
        const trendChartData = getTrendChartData();
        return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', height: '320px' }}>
          {shapData ? (
            <Bar data={shapData} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { max: 60, ticks: { callback: v => `${v}%` } } } }} />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: '0.5rem' }}>
              <BarChart2 size={28} style={{ opacity: 0.4 }} />
              <p style={{ fontWeight: 600, color: '#475569', margin: 0 }}>No SHAP data yet</p>
              <p style={{ fontSize: '0.82rem', maxWidth: '280px', margin: 0 }}>
                This chart averages real feature-contribution data from completed screenings. Complete at least one screening to populate it — select a specific record above to see its individual breakdown.
              </p>
            </div>
          )}
        </div>

        <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', height: '320px' }}>
          {trendChartData ? (
            <Line data={trendChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }} />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--text-muted)', gap: '0.5rem' }}>
              <TrendingUp size={28} style={{ opacity: 0.4 }} />
              <p style={{ fontWeight: 600, color: '#475569', margin: 0 }}>No screening volume yet</p>
              <p style={{ fontSize: '0.82rem', maxWidth: '280px', margin: 0 }}>
                This trend line plots real weekly screening counts once records exist, either from the server or from this device's local history.
              </p>
            </div>
          )}
        </div>
      </div>
        );
      })()}

      {/* Screening Records Table with Delete Action */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={20} color="var(--primary-teal)" />
          Screening Records Table {selectedDistrict ? `(Filtered: ${selectedDistrict})` : ''}
        </h3>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Showing {filteredHistory.length} record(s)</span>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Screening ID</th>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Patient ID</th>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Date</th>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Risk Score</th>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Risk Category</th>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Screened By</th>
              <th style={{ padding: '0.85rem 1rem', color: '#0f172a' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No screening records matching criteria.
                </td>
              </tr>
            ) : (
              filteredHistory.map((rec) => (
                <tr key={rec.screening_id} style={{ borderBottom: '1px solid var(--border-color)', background: '#ffffff' }}>
                  <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', color: 'var(--primary-teal-dark)', fontWeight: 600 }}>{rec.screening_id}</td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#0f172a' }}>{rec.user_id}</td>
                  <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>{new Date(rec.timestamp).toLocaleDateString()}</td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#0f172a' }}>{Math.round((rec.risk_probability || 0) * 100)}%</td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span className="badge" style={{
                      background: rec.risk_category?.includes('Severe') ? '#fef2f2' : rec.risk_category?.includes('Moderate') ? '#fff7ed' : rec.risk_category?.includes('Mild') ? '#fefce8' : '#f0fdf4',
                      color: rec.risk_category?.includes('Severe') ? '#dc2626' : rec.risk_category?.includes('Moderate') ? '#ea580c' : rec.risk_category?.includes('Mild') ? '#ca8a04' : '#16a34a',
                      borderColor: rec.risk_category?.includes('Severe') ? '#fecdd3' : rec.risk_category?.includes('Moderate') ? '#ffedd5' : rec.risk_category?.includes('Mild') ? '#fef08a' : '#bbf7d0',
                      border: '1px solid', fontSize: '0.78rem'
                    }}>
                      {rec.risk_category}
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                    {rec.worker_id || 'HW_NER_01'}
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }} onClick={() => setSelectedRecord(rec)}>
                        <Eye size={14} /> Inspect SHAP
                      </button>
                      <button className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: '#dc2626', borderColor: '#fecdd3' }} onClick={(e) => handleDeleteRecord(rec.screening_id, e)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Extended SHAP Inspector Panel (Item 8) */}
      {selectedRecord && (
        <div className="glass-panel" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1.5px solid var(--primary-teal)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f766e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart2 size={20} />
              Full SHAP Feature Attribution Inspector — {selectedRecord.screening_id}
            </h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-secondary" style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: '#dc2626' }} onClick={(e) => handleDeleteRecord(selectedRecord.screening_id, e)}>
                <Trash2 size={14} /> Delete Record
              </button>
              <button className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => setSelectedRecord(null)}>Close</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Patient ID</span>
              <p style={{ fontWeight: 700, color: '#0f172a' }}>{selectedRecord.user_id}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Risk Probability</span>
              <p style={{ fontWeight: 700, color: '#0f172a' }}>{Math.round((selectedRecord.risk_probability || 0) * 100)}% ({selectedRecord.risk_category})</p>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Primary Driver</span>
              <p style={{ fontWeight: 700, color: '#b45309' }}>{selectedRecord.primary_driver || "WOMAC Survey"}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Screened By Worker</span>
              <p style={{ fontWeight: 700, color: '#047857' }}>{selectedRecord.worker_id || "HW_NER_01"}</p>
            </div>
          </div>

          <h5 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#334155', marginBottom: '0.75rem' }}>
            Complete SHAP Feature Contributions & Clinical Explanations:
          </h5>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(selectedRecord.explanations || []).map((exp, idx) => (
              <div key={idx} style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>
                  <span>{exp.feature}</span>
                  <span style={{ color: exp.direction === 'high' ? '#dc2626' : '#d97706' }}>
                    {exp.contribution}% Contribution ({exp.direction.toUpperCase()})
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-subtle)' }}>{exp.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
