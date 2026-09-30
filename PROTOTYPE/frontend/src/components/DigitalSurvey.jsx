import React, { useState } from 'react';
import { Volume2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import { TRANSLATIONS, SURVEY_QUESTIONS } from '../translations/vernacular';
import { speakQuestionText } from '../services/audioService';

export default function DigitalSurvey({ currentLang, onComplete, onBack }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});

  const currentQuestion = SURVEY_QUESTIONS[currentIndex];
  const questionTitle = currentQuestion.title[currentLang] || currentQuestion.title.en;

  const options = [
    { value: 0, label: t.optionNone },
    { value: 1, label: t.optionMild },
    { value: 2, label: t.optionModerate },
    { value: 3, label: t.optionSevere },
    { value: 4, label: t.optionExtreme }
  ];

  const handleSelectOption = (value) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }));
  };

  const handleNext = () => {
    if (answers[currentQuestion.id] === undefined) {
      alert("Please select an answer option to proceed.");
      return;
    }
    if (currentIndex < SURVEY_QUESTIONS.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Calculate derived WOMAC subscores
      let painScore = 0;
      let stiffnessScore = 0;
      let functionScore = 0;

      SURVEY_QUESTIONS.forEach(q => {
        const val = answers[q.id] || 0;
        if (q.category === 'Pain') painScore += val;
        else if (q.category === 'Stiffness') stiffnessScore += val;
        else if (q.category === 'Function') functionScore += val;
      });

      const totalWomac = Math.round((painScore * 4) + (stiffnessScore * 4) + (functionScore * 3.5));

      const surveySummary = {
        pain_score: painScore * 4,
        stiffness_score: stiffnessScore * 4,
        function_score: functionScore * 3.5,
        womac_score: totalWomac,
        raw_answers: answers
      };

      onComplete(surveySummary);
    }
  };

  const progressPct = Math.round(((currentIndex + 1) / SURVEY_QUESTIONS.length) * 100);

  return (
    <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Progress Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
          <span style={{ fontWeight: 600 }}>{t.surveyTitle}</span>
          <span>Question {currentIndex + 1} of {SURVEY_QUESTIONS.length} ({progressPct}%)</span>
        </div>
        <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #0d9488, #059669)', transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Question Header & Pictogram */}
      <div style={{
        background: '#f8fafc',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>
          {currentQuestion.icon}
        </div>

        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1rem', lineHeight: '1.4' }}>
          {questionTitle}
        </h3>

        {/* Audio Assistance Button */}
        <button 
          type="button" 
          className="btn-audio" 
          onClick={() => speakQuestionText(questionTitle, currentLang)}
        >
          <Volume2 size={18} />
          <span>{t.playAudioBtn}</span>
        </button>
      </div>

      {/* Options List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {options.map((opt) => {
          const isSelected = answers[currentQuestion.id] === opt.value;
          return (
            <div 
              key={opt.value}
              className={`survey-option-card ${isSelected ? 'selected' : ''}`}
              onClick={() => handleSelectOption(opt.value)}
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: isSelected ? '2px solid #0d9488' : '2px solid #cbd5e1',
                background: isSelected ? '#0d9488' : '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {isSelected && <CheckCircle2 size={16} color="#ffffff" />}
              </div>
              <span style={{ fontSize: '1.05rem', color: '#0f172a', fontWeight: isSelected ? 600 : 500 }}>
                {opt.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Navigation Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button 
          className="btn-secondary" 
          onClick={() => currentIndex > 0 ? setCurrentIndex(currentIndex - 1) : onBack()}
        >
          <ChevronLeft size={18} />
          <span>Back</span>
        </button>

        <button className="btn-primary" onClick={handleNext}>
          <span>{currentIndex === SURVEY_QUESTIONS.length - 1 ? 'Complete Survey' : 'Next Question'}</span>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
