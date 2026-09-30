import React, { useState } from 'react';
import { Award, ShieldCheck, Download, Share2, ArrowLeft, FileText, CheckCircle2, AlertTriangle, AlertCircle, Volume2 } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { TRANSLATIONS } from '../translations/vernacular';
import { shareReportLinkAPI } from '../services/apiService';
import { speakQuestionText } from '../services/audioService';

const API_BASE_URL = window.location.origin && window.location.origin.includes("8000") 
  ? window.location.origin 
  : "http://127.0.0.1:8000";

export default function ScreeningResult({ currentLang, result, userProfile, onNewScreening }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const [shareUrl, setShareUrl] = useState('');
  const [showReferralModal, setShowReferralModal] = useState(false);

  if (!result) return null;

  const riskProbability = result.risk_probability || 0;
  const riskPct = Math.round(riskProbability * 100);
  const riskCategory = result.risk_category || "Normal/Minimal Risk";
  const explanations = result.explanations || [];

  // 4-Tier Severity Badge Color Mapping
  const getBadgeStyle = (category) => {
    if (category.includes("Severe")) {
      return { background: '#fef2f2', color: '#dc2626', borderColor: '#fecdd3' }; // Red
    }
    if (category.includes("Moderate")) {
      return { background: '#fff7ed', color: '#ea580c', borderColor: '#ffedd5' }; // Orange
    }
    if (category.includes("Mild")) {
      return { background: '#fefce8', color: '#ca8a04', borderColor: '#fef08a' }; // Yellow
    }
    return { background: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }; // Green
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${result.screening_id}/pdf`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Osteo_Optix_Report_${result.screening_id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
    } catch (err) {
      console.warn("Backend PDF generation offline, generating client PDF fallback");
    }

    // Client-side jsPDF Fallback
    const doc = new jsPDF();
    doc.setFillColor(13, 148, 136);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("Osteo-Optix — Knee Osteoarthritis Screening Report", 14, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text("North Eastern Region India AI Multimodal Risk Assessment", 14, 25);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Patient Profile Summary", 14, 42);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Patient ID: ${result.user_id} | Name: ${userProfile?.name || 'Patient'}`, 14, 50);
    doc.text(`Age: ${userProfile?.age || 50} | Sex: ${userProfile?.sex || 'Female'} | District: ${userProfile?.district || 'Kamrup'}, ${userProfile?.state || 'Assam'}`, 14, 57);
    doc.text(`Occupational Load: ${userProfile?.occupational_load || 'Tea Estate'} | Terrain Slope: ${userProfile?.terrain_exposure || 'Steep'}`, 14, 64);
    doc.text(`Date: ${new Date(result.timestamp || Date.now()).toLocaleString()}`, 14, 71);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 76, 196, 76);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Screening Risk Score: ${riskPct}% (${riskCategory})`, 14, 88);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Available Modalities Used: ${(result.available_modalities || ['survey', 'vision']).join(', ')}`, 14, 96);
    doc.text(`Model Version: ${result.model_version || 'Baseline Heuristic v1'} | Mode: ${result.is_demo ? 'DEMO MODE' : 'VALIDATED'}`, 14, 103);

    doc.line(14, 110, 196, 110);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Key Risk Contribution Factors (SHAP Analysis)", 14, 120);

    let yPos = 128;
    explanations.slice(0, 5).forEach((exp, idx) => {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}. ${exp.feature} (${exp.contribution}%)`, 14, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(exp.description, 20, yPos + 6);
      yPos += 14;
    });

    doc.line(14, yPos + 4, 196, yPos + 4);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("Clinical Triage Guidance", 14, yPos + 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const splitTriage = doc.splitTextToSize(result.triage_guidance || '', 180);
    doc.text(splitTriage, 14, yPos + 22);

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const disclaimer = "CLINICAL SAFETY NOTICE: This result is an AI-assisted risk screening estimate for North Eastern Region India. It is NOT a definitive diagnosis or medical prescription. Clinical diagnosis must be performed by a qualified healthcare professional.";
    const splitDisclaimer = doc.splitTextToSize(disclaimer, 180);
    doc.text(splitDisclaimer, 14, 275);

    doc.save(`Osteo_Optix_Report_${result.user_id}.pdf`);
  };

  const handleShareReport = async () => {
    const data = await shareReportLinkAPI(result.screening_id);
    const url = window.location.origin + data.share_url;
    setShareUrl(url);
    navigator.clipboard?.writeText(url);
    alert(`Report Share Link copied to clipboard!\n${url}`);
  };

  const isReferralRecommended = riskCategory.includes("Moderate") || riskCategory.includes("Severe");

  return (
    <div className="glass-panel" style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header Banner */}
      <div style={{
        background: '#ffffff',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '2rem',
        textAlign: 'center',
        marginBottom: '2rem',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)'
      }}>
        <div 
          className="badge" 
          style={{ 
            fontSize: '1rem', 
            fontWeight: 700, 
            padding: '0.5rem 1.5rem', 
            marginBottom: '1rem',
            border: '1px solid',
            ...getBadgeStyle(riskCategory)
          }}
        >
          {riskCategory}
        </div>

        <h2 style={{ fontSize: '3.2rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
          {riskPct}%
        </h2>
        <p style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
          Knee Osteoarthritis Risk Screening Probability (4-Tier Architecture)
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span>Screened By Worker: <strong>{result.worker_id || 'HW_NER_01'}</strong></span>
          <span>&bull;</span>
          <span>Synced: <strong style={{ color: result.synced ? '#047857' : '#b45309' }}>{result.synced ? 'Yes (Cloud)' : 'No (Saved Locally)'}</strong></span>
          <span>&bull;</span>
          <span>Modalities: <strong>{(result.available_modalities || []).join(', ')}</strong></span>
        </div>
      </div>

      {/* SHAP Factor Attribution Waterfall Chart */}
      <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '2rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Award size={20} color="var(--primary-teal)" />
          {t.shapTitle}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {explanations.map((exp, idx) => (
            <div key={idx} style={{ background: '#ffffff', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.95rem' }}>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{exp.feature}</span>
                <span style={{ fontWeight: 700, color: exp.direction === 'high' ? '#dc2626' : '#d97706' }}>
                  {exp.contribution}% Contribution
                </span>
              </div>

              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                <div style={{
                  width: `${Math.min(100, exp.contribution * 2.2)}%`,
                  height: '100%',
                  background: exp.direction === 'high' ? 'linear-gradient(90deg, #ef4444, #f87171)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  borderRadius: '4px'
                }} />
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-subtle)' }}>{exp.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Clinical Triage Guidance Box */}
      <div style={{ background: getBadgeStyle(riskCategory).background, padding: '1.5rem', borderRadius: '12px', border: `1px solid ${getBadgeStyle(riskCategory).borderColor}`, marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: getBadgeStyle(riskCategory).color, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShieldCheck size={20} />
            Clinical Triage Recommendation
          </h4>
          <button
            type="button"
            onClick={() => speakQuestionText(result.triage_guidance || '', currentLang, `triage_${result.screening_id}`)}
            aria-label="Listen to this triage guidance read aloud"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              background: '#ffffff', border: `1px solid ${getBadgeStyle(riskCategory).borderColor}`,
              color: getBadgeStyle(riskCategory).color, borderRadius: '8px',
              padding: '0.3rem 0.6rem', fontSize: '0.75rem', fontWeight: 600,
              cursor: 'pointer', flexShrink: 0
            }}
          >
            <Volume2 size={14} />
            <span>Listen</span>
          </button>
        </div>
        <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: '#0f172a', fontWeight: 500 }}>
          {result.triage_guidance}
        </p>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={handleDownloadPDF}>
            <Download size={18} />
            <span>Download PDF Report</span>
          </button>

          {isReferralRecommended && (
            <button className="btn-primary" style={{ background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)' }} onClick={() => setShowReferralModal(true)}>
              <FileText size={18} />
              <span>Generate Referral Letter</span>
            </button>
          )}

          <button className="btn-secondary" onClick={handleShareReport}>
            <Share2 size={18} />
            <span>{t.btnShareReport}</span>
          </button>
        </div>

        <button className="btn-secondary" onClick={onNewScreening}>
          <ArrowLeft size={18} />
          <span>{t.btnNewScreening}</span>
        </button>
      </div>

      {/* Referral Letter Modal */}
      {showReferralModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem'
        }}>
          <div style={{ maxWidth: '550px', width: '100%', background: '#ffffff', padding: '2rem', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>
              Orthopedic Specialist Referral Letter
            </h3>
            
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', color: '#334155', lineHeight: '1.6', marginBottom: '1.25rem' }}>
              <p><strong>To:</strong> Orthopedic Department / Referral Hospital</p>
              <p><strong>Patient:</strong> {userProfile?.name || result.user_id} ({userProfile?.age} Yrs, {userProfile?.sex})</p>
              <p><strong>District:</strong> {userProfile?.district || 'Kamrup'}, Assam</p>
              <p><strong>Screened Risk:</strong> {riskCategory} ({riskPct}%)</p>
              <hr style={{ margin: '0.75rem 0', borderColor: '#cbd5e1' }} />
              <p><strong>Clinical Recommendation:</strong></p>
              <p style={{ marginTop: '0.25rem', fontStyle: 'italic' }}>{result.triage_guidance}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button className="btn-secondary" onClick={() => setShowReferralModal(false)}>Close</button>
              <button className="btn-primary" onClick={() => { window.print(); }}>Print / Save Letter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
