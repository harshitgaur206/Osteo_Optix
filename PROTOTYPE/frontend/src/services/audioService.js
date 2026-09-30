import { getCachedAudio } from './offlineStorage';

let currentAudioPlayer = null;

export const speakQuestionText = (text, langCode = 'en', questionId = null) => {
  // 1. Stop any currently playing HTML Audio or SpeechSynthesis
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer = null;
    } catch (e) {}
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }

  // 2. Check for cached Bhashini-generated audio (from explicit Sync Language Pack)
  const key = questionId || text;
  const cachedBase64 = getCachedAudio(langCode, key);

  if (cachedBase64) {
    try {
      const audioUrl = cachedBase64.startsWith('data:') ? cachedBase64 : `data:audio/mp3;base64,${cachedBase64}`;
      const audio = new Audio(audioUrl);
      currentAudioPlayer = audio;
      audio.play().catch(err => {
        console.warn("Cached Bhashini audio playback failed, falling back to Web Speech:", err);
        speakWithBrowserSynthesis(text, langCode);
      });
      return;
    } catch (err) {
      console.warn("Audio player error, falling back to browser synthesis:", err);
    }
  }

  // 3. Fallback to Browser SpeechSynthesis API
  speakWithBrowserSynthesis(text, langCode);
};

function speakWithBrowserSynthesis(text, langCode = 'en') {
  if (!('speechSynthesis' in window)) {
    console.warn("Speech synthesis not supported in this browser environment.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  
  utterance.rate = 0.88;
  utterance.pitch = 1.0;

  const langMap = {
    en: 'en-IN',
    as: 'hi-IN',
    bn: 'bn-IN',
    hi: 'hi-IN',
    mni: 'hi-IN',
    kha: 'en-IN',
    lus: 'en-IN'
  };

  utterance.lang = langMap[langCode] || 'en-IN';

  const voices = window.speechSynthesis.getVoices();
  const matchedVoice = voices.find(v => v.lang.startsWith(utterance.lang.slice(0, 2)));
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  window.speechSynthesis.speak(utterance);
}
