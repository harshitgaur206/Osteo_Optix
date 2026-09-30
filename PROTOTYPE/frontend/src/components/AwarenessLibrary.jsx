import React, { useState } from 'react';
import { BookOpen, Activity, HeartPulse, ShieldCheck, CheckCircle2, Info, ArrowRight, Volume2, Leaf, Droplets, Sun, Mountain, Footprints, Scale } from 'lucide-react';
import { TRANSLATIONS } from '../translations/vernacular';
import { speakQuestionText } from '../services/audioService';

// Simple stick-figure movement pictograms for the exercise cards. These are
// plain inline SVG (no image files, no network fetch) so they render
// instantly offline and work for a low-literacy audience who may not read
// the English instructions below them.
const ExercisePictogram = ({ variant }) => {
  const common = {
    viewBox: "0 0 120 90",
    width: "100%",
    height: "84",
    fill: "none",
    stroke: "#0f766e",
    strokeWidth: "3.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  };
  const head = (cx, cy) => <circle cx={cx} cy={cy} r="7" fill="#ccfbf1" stroke="#0f766e" strokeWidth="3" />;

  if (variant === "quad-set") {
    // Seated figure, legs straight out, arrow pressing knee down into floor.
    return (
      <svg {...common} role="img" aria-label="Sitting with legs straight, pressing the knee down">
        {head(30, 18)}
        <path d="M30 25 L34 46 L96 46" />{/* torso to hip to straight leg */}
        <path d="M34 46 L20 60" />{/* arm resting behind for support */}
        <line x1="10" y1="60" x2="112" y2="60" stroke="#94a3b8" strokeWidth="2.5" />{/* floor */}
        <path d="M70 46 L70 60" stroke="#dc2626" strokeWidth="3.5" markerEnd="url(#arrowQ)" />
        <defs>
          <marker id="arrowQ" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
          </marker>
        </defs>
      </svg>
    );
  }

  if (variant === "slr") {
    // Figure lying on back, one leg lifted at ~45 degrees.
    return (
      <svg {...common} role="img" aria-label="Lying on back, lifting one straight leg upward">
        {head(14, 60)}
        <path d="M14 67 L46 67" />{/* torso lying flat */}
        <path d="M46 67 L70 67" />{/* bent-knee leg stays on floor */}
        <path d="M46 67 L88 28" />{/* raised straight leg */}
        <line x1="8" y1="67" x2="112" y2="67" stroke="#94a3b8" strokeWidth="2.5" />{/* floor */}
        <path d="M60 55 A22 22 0 0 1 82 34" stroke="#dc2626" strokeWidth="2.5" strokeDasharray="3 4" markerEnd="url(#arrowS)" />
        <defs>
          <marker id="arrowS" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
          </marker>
        </defs>
      </svg>
    );
  }

  // "seated-extension": seated on a chair, lower leg extends out horizontally.
  return (
    <svg {...common} role="img" aria-label="Sitting on a chair, straightening the leg out">
      {head(38, 16)}
      <path d="M38 23 L40 44" />{/* torso */}
      <path d="M40 44 L40 64" />{/* thigh down to seat */}
      <path d="M40 44 L98 44" />{/* extended lower leg, horizontal */}
      <path d="M20 64 L64 64" stroke="#94a3b8" strokeWidth="3" />{/* chair seat */}
      <path d="M20 64 L20 80" stroke="#94a3b8" strokeWidth="3" />{/* chair leg */}
      <path d="M64 64 L64 80" stroke="#94a3b8" strokeWidth="3" />{/* chair leg */}
      <path d="M80 44 L80 30" stroke="#dc2626" strokeWidth="3.5" markerEnd="url(#arrowE)" />
      <defs>
        <marker id="arrowE" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#dc2626" />
        </marker>
      </defs>
    </svg>
  );
};

// Simple icon-based pictograms for the Nutrition and Joint Care cards. These
// aren't body movements (like the exercise stick-figures above), so a single
// clear symbolic icon does the same job — a quick, language-independent
// visual anchor for a low-literacy audience — without over-engineering a
// pose diagram for "drink more water" or "use a walking stick".
const iconPictogramMap = {
  herbs: Leaf,
  hydration: Droplets,
  sunlight: Sun,
  terrain: Mountain,
  footwear: Footprints,
  weight: Scale
};

const IconPictogram = ({ variant, label }) => {
  const IconComp = iconPictogramMap[variant];
  if (!IconComp) return null;
  return (
    <div
      role="img"
      aria-label={label}
      style={{
        width: '100%',
        height: '84px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0f766e'
      }}
    >
      <IconComp size={48} strokeWidth={1.75} />
    </div>
  );
};

// Plays the card's title + description aloud via the shared vernacular
// audio pipeline (bhashini-cached audio when available, else the browser's
// built-in speech synthesis) — the same mechanism already wired up for the
// Digital Survey questions, just not previously used here.
const ListenButton = ({ text, langCode, ttsKey }) => (
  <button
    type="button"
    onClick={() => speakQuestionText(text, langCode, ttsKey)}
    aria-label="Listen to this guidance read aloud"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35rem',
      background: '#f0fdfa',
      border: '1px solid #ccfbf1',
      color: '#0f766e',
      borderRadius: '8px',
      padding: '0.3rem 0.6rem',
      fontSize: '0.75rem',
      fontWeight: 600,
      cursor: 'pointer',
      flexShrink: 0
    }}
  >
    <Volume2 size={14} />
    <span>Listen</span>
  </button>
);

export default function AwarenessLibrary({ currentLang = 'en' }) {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const [activeCategory, setActiveCategory] = useState('exercises'); // 'exercises' | 'nutrition' | 'jointcare'

  const exercises = [
    {
      title: "Quadriceps Isometric Setting",
      tag: "Daily • 15 Mins",
      description: "Sit with legs straight. Tighten thigh muscle, push knee down flat into the floor. Hold for 5-10 seconds.",
      benefits: "Builds knee stability without joint impact. Prevents cartilage wear.",
      pictogram: "quad-set"
    },
    {
      title: "Straight Leg Raises (SLR)",
      tag: "Daily • 3 Sets of 10",
      description: "Lie flat on back, bend one knee, lift the target leg 45 degrees slowly. Hold 5 seconds and lower gently.",
      benefits: "Strengthens rectus femoris and hip flexors to absorb gait impacts.",
      pictogram: "slr"
    },
    {
      title: "Seated Knee Extensions",
      tag: "2-3 Times Daily",
      description: "Sit tall on a chair. Straighten leg out horizontally, hold at full extension for 5 seconds.",
      benefits: "Improves knee Range of Motion (ROM) and Patellar tracking.",
      pictogram: "seated-extension"
    }
  ];

  const nutrition = [
    {
      title: "Anti-Inflammatory Local Herbs",
      tag: "NER Traditional Nutrition",
      description: "Incorporate Turmeric (Curcumin), Ginger, and Green Tea rich in polyphenols into daily meals.",
      benefits: "Reduces systemic inflammatory cytokines (TNF-alpha, IL-6) affecting joint synovium.",
      pictogram: "herbs"
    },
    {
      title: "Calcium & Vitamin D Fortification",
      tag: "Bone Density Support",
      description: "Consume local small fish with bones, sesame seeds, green leafy vegetables (lai xak), and daily sunlight exposure.",
      benefits: "Maintains subchondral bone integrity and prevents osteoporosis progression.",
      pictogram: "sunlight"
    },
    {
      title: "Hydration & Joint Lubrication",
      tag: "Cartilage Health",
      description: "Maintain 2.5–3 Liters of clean water intake daily. Cartilage tissue is 70-80% water.",
      benefits: "Preserves synovial fluid viscosity for smooth joint articulation.",
      pictogram: "hydration"
    }
  ];

  const jointCare = [
    {
      title: "Ergonomic Occupational Load Management",
      tag: "Tea Garden & Paddy Field Work",
      description: "Avoid prolonged squatting or heavy carrying on steep slopes without resting breaks every 45 mins.",
      benefits: "Reduces peak tibiofemoral compressive joint forces.",
      pictogram: "weight"
    },
    {
      title: "Hilly Terrain Navigation Technique",
      tag: "Slope Guidance",
      description: "Use a supportive bamboo or walking stick when ascending/descending steep hills in rural NER.",
      benefits: "Reduces ground impact force transferred to the knee joint by up to 25%.",
      pictogram: "terrain"
    },
    {
      title: "Weight Management & Footwear",
      tag: "Biomechanical Protection",
      description: "Wear cushioned, supportive footwear. Losing 1 kg of weight reduces 4 kg of pressure per knee step.",
      benefits: "Significantly decelerates medial compartment osteoarthritis progression.",
      pictogram: "footwear"
    }
  ];

  const getActiveCards = () => {
    if (activeCategory === 'nutrition') return nutrition;
    if (activeCategory === 'jointcare') return jointCare;
    return exercises;
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
      {/* Header Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '16px', marginBottom: '1.5rem', background: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.6rem', background: '#f0fdfa', borderRadius: '12px', color: 'var(--primary-teal)' }}>
              <BookOpen size={28} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a' }}>
                Preventive Joint Health & Awareness Library
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Evidence-based Knee OA guidance customized for North Eastern Region lifestyle and terrain.
              </p>
            </div>
          </div>

          <span style={{ fontSize: '0.78rem', fontWeight: 600, background: '#ecfdf5', color: '#047857', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid #a7f3d0' }}>
            ✓ Bundled & Available Offline
          </span>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <button
          className="btn-secondary"
          style={{
            background: activeCategory === 'exercises' ? '#f0fdfa' : '#ffffff',
            borderColor: activeCategory === 'exercises' ? 'var(--primary-teal)' : 'var(--border-color)',
            color: activeCategory === 'exercises' ? '#0f766e' : 'var(--text-muted)',
            fontWeight: activeCategory === 'exercises' ? 600 : 500
          }}
          onClick={() => setActiveCategory('exercises')}
        >
          <Activity size={18} />
          <span>Knee Exercises</span>
        </button>

        <button
          className="btn-secondary"
          style={{
            background: activeCategory === 'nutrition' ? '#f0fdfa' : '#ffffff',
            borderColor: activeCategory === 'nutrition' ? 'var(--primary-teal)' : 'var(--border-color)',
            color: activeCategory === 'nutrition' ? '#0f766e' : 'var(--text-muted)',
            fontWeight: activeCategory === 'nutrition' ? 600 : 500
          }}
          onClick={() => setActiveCategory('nutrition')}
        >
          <HeartPulse size={18} />
          <span>Nutrition & Herbs</span>
        </button>

        <button
          className="btn-secondary"
          style={{
            background: activeCategory === 'jointcare' ? '#f0fdfa' : '#ffffff',
            borderColor: activeCategory === 'jointcare' ? 'var(--primary-teal)' : 'var(--border-color)',
            color: activeCategory === 'jointcare' ? '#0f766e' : 'var(--text-muted)',
            fontWeight: activeCategory === 'jointcare' ? 600 : 500
          }}
          onClick={() => setActiveCategory('jointcare')}
        >
          <ShieldCheck size={18} />
          <span>Joint Care & Terrain</span>
        </button>
      </div>

      {/* Content Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
        {getActiveCards().map((card, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '1.35rem', borderRadius: '14px', background: '#ffffff', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              {card.pictogram && (
                <div style={{ background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '10px', padding: '0.5rem', marginBottom: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeCategory === 'exercises'
                    ? <ExercisePictogram variant={card.pictogram} />
                    : <IconPictogram variant={card.pictogram} label={card.title} />}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>{card.title}</h3>
                <ListenButton
                  text={`${card.title}. ${card.description}`}
                  langCode={currentLang}
                  ttsKey={`awareness_${activeCategory}_${idx}`}
                />
              </div>

              <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-teal)', background: '#f0fdfa', padding: '0.2rem 0.6rem', borderRadius: '6px', marginBottom: '0.75rem', border: '1px solid #ccfbf1' }}>
                {card.tag}
              </span>

              <p style={{ fontSize: '0.88rem', color: '#334155', lineHeight: '1.5', marginBottom: '1rem' }}>
                {card.description}
              </p>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
              <strong style={{ color: '#047857', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <CheckCircle2 size={14} /> Clinical Benefit:
              </strong>
              <span style={{ marginTop: '0.2rem', display: 'block' }}>{card.benefits}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
