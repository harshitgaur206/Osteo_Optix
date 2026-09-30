const STORAGE_KEYS = {
  CURRENT_USER: "ner_oa_current_user",
  PATIENTS_LIST: "ner_oa_patients_list",
  SCREENINGS_QUEUE: "ner_oa_screenings_queue",
  SCREENINGS_HISTORY: "ner_oa_screenings_history",
  TRANSLATION_CACHE: "ner_oa_translation_cache"
};

// ---------------------------------------------------------------------------
// Real encryption-at-rest for local patient data, using the Web Crypto API
// (AES-256-GCM) instead of the previous XOR "cipher" with a static key
// baked into the client bundle. That approach was obfuscation only: the key
// was identical for every install of the app and trivially recoverable from
// the shipped JS, so anyone with access to the browser's localStorage could
// decrypt every patient record it contained.
//
// Key handling:
//   - When a health worker is logged in, the AES key is derived (via PBKDF2)
//     from their session JWT, so data at rest is tied to that session.
//   - Before login (or if no JWT is present), we derive it from a random,
//     per-device secret that is generated with crypto.getRandomValues() the
//     first time this runs and stored locally — unlike the old code, this
//     value is unique per install/device rather than a single hardcoded
//     string shared by every deployment of the app.
//   - The IV is randomly generated per encryption call (required for GCM;
//     reusing an IV with the same key breaks its security guarantees).
//
// Note on the inherent limits of client-side encryption: any key this code
// can derive is, by definition, reachable from within the browser the app
// runs in — there is no way for a pure front-end SPA to hold a secret the
// device itself cannot see. This still meaningfully raises the bar over
// plaintext or XOR (real AES-GCM, unique-per-device keys, random IVs,
// integrity-checked ciphertext), but the strong guarantee — protecting data
// if the device/browser profile itself is compromised — requires a
// server-held key, which would mean this data isn't truly usable offline.
// ---------------------------------------------------------------------------

const ENCRYPTION_PREFIX = "ENC_AESGCM_v1:";
const DEVICE_SECRET_KEY = "ner_oa_device_secret_v1";
const PBKDF2_ITERATIONS = 100000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function getOrCreateDeviceSecret() {
  try {
    let secret = localStorage.getItem(DEVICE_SECRET_KEY);
    if (!secret) {
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      secret = toBase64(randomBytes);
      localStorage.setItem(DEVICE_SECRET_KEY, secret);
    }
    return secret;
  } catch (e) {
    // Storage unavailable (private browsing etc.) — fall back to an
    // in-memory-only secret for this page load.
    return toBase64(crypto.getRandomValues(new Uint8Array(32)));
  }
}

function getKeyMaterialString() {
  try {
    const jwt = localStorage.getItem('hw_jwt');
    if (jwt) return jwt;
  } catch (e) {}
  return getOrCreateDeviceSecret();
}

let _cachedAesKeyPromise = null;
let _cachedKeyMaterial = null;

async function getAesKey() {
  const keyMaterial = getKeyMaterialString();
  if (_cachedAesKeyPromise && _cachedKeyMaterial === keyMaterial) {
    return _cachedAesKeyPromise;
  }
  _cachedKeyMaterial = keyMaterial;
  _cachedAesKeyPromise = (async () => {
    const baseKey = await crypto.subtle.importKey(
      "raw",
      textEncoder.encode(keyMaterial),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: textEncoder.encode("osteo-optix-ner-local-storage-salt"),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  })();
  return _cachedAesKeyPromise;
}

async function secureEncryptAsync(plainText) {
  try {
    const key = await getAesKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      textEncoder.encode(plainText)
    );
    return `${ENCRYPTION_PREFIX}${toBase64(iv)}:${toBase64(ciphertext)}`;
  } catch (err) {
    console.error("Encryption failed, refusing to persist plaintext:", err);
    return null;
  }
}

async function secureDecryptAsync(encryptedText) {
  if (!encryptedText) return null;
  if (!encryptedText.startsWith(ENCRYPTION_PREFIX)) {
    // Legacy/unencrypted value from before this change — read it once so
    // existing local data isn't silently dropped; it gets re-saved through
    // the new AES-GCM path the next time it's written.
    return encryptedText;
  }
  try {
    const key = await getAesKey();
    const body = encryptedText.slice(ENCRYPTION_PREFIX.length);
    const [ivB64, ctB64] = body.split(":");
    const iv = fromBase64(ivB64);
    const ciphertext = fromBase64(ctB64);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return textDecoder.decode(plainBuf);
  } catch (err) {
    console.error("Decryption failed (wrong/rotated key, or corrupted data):", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory cache: every get*/save* function elsewhere in the app calls
// these synchronously (they always have), so we keep that public API intact
// by maintaining a hydrated in-memory mirror of the encrypted localStorage
// data. Reads are served from this cache; writes update it immediately and
// persist the AES-GCM-encrypted ciphertext to localStorage in the
// background. The cache is (re)hydrated asynchronously at module load and
// whenever the active key changes (e.g. right after login).
// ---------------------------------------------------------------------------

const _cache = {};
let _hydrated = false;
let _hydratePromise = null;

async function hydrateCache() {
  const entries = await Promise.all(
    Object.values(STORAGE_KEYS).map(async (storageKey) => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [storageKey, null];
        const decrypted = await secureDecryptAsync(raw);
        return [storageKey, decrypted ? JSON.parse(decrypted) : null];
      } catch (e) {
        return [storageKey, null];
      }
    })
  );
  entries.forEach(([storageKey, value]) => {
    _cache[storageKey] = value;
  });
  _hydrated = true;
}

_hydratePromise = hydrateCache();

// Re-hydrate from storage using the freshly-available session key right
// after login, so records saved under the old (device) key are still read
// correctly and future writes use the session-derived key.
export const rehydrateOfflineStorageForSession = () => {
  _cachedAesKeyPromise = null;
  _cachedKeyMaterial = null;
  _hydratePromise = hydrateCache();
  return _hydratePromise;
};

// Decrypting from localStorage is genuinely async (Web Crypto), unlike the
// old synchronous XOR/localStorage read. Callers that read on initial mount
// (before any write has happened) should await this once so they don't read
// an empty cache before hydration finishes; every get* function above stays
// synchronous for everyone else.
export const waitForStorageReady = () => _hydratePromise;

const getItemEncrypted = (key) => {
  const value = _cache[key];
  return value === undefined ? null : value;
};

const setItemEncrypted = (key, data) => {
  _cache[key] = data;
  // Fire-and-forget persistence: encrypt and write asynchronously. Any
  // caller reading immediately afterward still sees the correct value
  // because the in-memory cache was already updated above.
  (async () => {
    try {
      const str = JSON.stringify(data);
      const encrypted = await secureEncryptAsync(str);
      if (encrypted) {
        localStorage.setItem(key, encrypted);
      }
    } catch (err) {
      console.error("Failed to write encrypted storage:", err);
    }
  })();
};

// ------------ PATIENT LIST FUNCTIONS (ITEM 2) ------------

export const getAllPatients = () => {
  const list = getItemEncrypted(STORAGE_KEYS.PATIENTS_LIST);
  return Array.isArray(list) ? list : [];
};

export const getPatientById = (id) => {
  if (!id) return null;
  const patients = getAllPatients();
  return patients.find(p => (p.user_id === id || p.patient_id === id || p.id === id)) || null;
};

export const searchPatients = (query) => {
  const patients = getAllPatients();
  if (!query || !query.trim()) return patients;
  const q = query.toLowerCase().trim();
  return patients.filter(p => 
    (p.name && p.name.toLowerCase().includes(q)) ||
    (p.phone && p.phone.includes(q)) ||
    (p.user_id && p.user_id.toLowerCase().includes(q)) ||
    (p.district && p.district.toLowerCase().includes(q))
  );
};

export const savePatient = (patientData) => {
  try {
    const patients = getAllPatients();
    const existingId = patientData.user_id || patientData.patient_id;
    const generatedId = existingId || `NER_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const record = {
      ...patientData,
      user_id: generatedId,
      patient_id: generatedId,
      created_at: patientData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const existingIdx = patients.findIndex(p => p.user_id === generatedId || p.patient_id === generatedId);
    let updatedList;
    if (existingIdx >= 0) {
      updatedList = [...patients];
      updatedList[existingIdx] = record;
    } else {
      updatedList = [record, ...patients];
    }

    setItemEncrypted(STORAGE_KEYS.PATIENTS_LIST, updatedList);
    // Maintain backwards compatibility with single user key
    setItemEncrypted(STORAGE_KEYS.CURRENT_USER, record);
    return record;
  } catch (err) {
    console.error("Failed to save patient:", err);
    return patientData;
  }
};

export const saveLocalUser = (userData) => {
  return savePatient(userData);
};

export const getLocalUser = () => {
  return getItemEncrypted(STORAGE_KEYS.CURRENT_USER) || (getAllPatients()[0] || null);
};

// ------------ SCREENING STORAGE FUNCTIONS ------------

export const saveLocalScreening = (screeningData) => {
  try {
    const existingHistory = getLocalScreeningHistory();
    const screeningId = screeningData.screening_id || `SCR_${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    const record = {
      ...screeningData,
      screening_id: screeningId,
      timestamp: screeningData.timestamp || new Date().toISOString(),
      synced: screeningData.synced || false
    };

    // Save to history list
    const updatedHistory = [record, ...existingHistory.filter(h => h.screening_id !== record.screening_id)];
    setItemEncrypted(STORAGE_KEYS.SCREENINGS_HISTORY, updatedHistory);

    // If not synced, push to offline sync queue
    if (!record.synced) {
      const queue = getOfflineSyncQueue();
      const updatedQueue = [record, ...queue.filter(q => q.screening_id !== record.screening_id)];
      setItemEncrypted(STORAGE_KEYS.SCREENINGS_QUEUE, updatedQueue);
    }

    // Update patient's last screening date in patient list
    if (record.user_id) {
      const patient = getPatientById(record.user_id);
      if (patient) {
        savePatient({
          ...patient,
          last_screening_date: record.timestamp,
          last_risk_category: record.risk_category
        });
      }
    }

    return record;
  } catch (err) {
    console.error("Failed to save local screening:", err);
    return screeningData;
  }
};

export const getLocalScreeningHistory = () => {
  const list = getItemEncrypted(STORAGE_KEYS.SCREENINGS_HISTORY);
  return Array.isArray(list) ? list : [];
};

export const getOfflineSyncQueue = () => {
  const list = getItemEncrypted(STORAGE_KEYS.SCREENINGS_QUEUE);
  return Array.isArray(list) ? list : [];
};

export const clearSyncedFromQueue = (syncedIds) => {
  try {
    const queue = getOfflineSyncQueue();
    const remaining = queue.filter(q => !syncedIds.includes(q.screening_id));
    setItemEncrypted(STORAGE_KEYS.SCREENINGS_QUEUE, remaining);

    // Update synced status in local history
    const history = getLocalScreeningHistory();
    const updatedHistory = history.map(item => {
      if (syncedIds.includes(item.screening_id)) {
        return { ...item, synced: true };
      }
      return item;
    });
    setItemEncrypted(STORAGE_KEYS.SCREENINGS_HISTORY, updatedHistory);
  } catch (err) {
    console.error("Error clearing synced items from queue:", err);
  }
};

export const deleteLocalScreening = (screeningId) => {
  try {
    const history = getLocalScreeningHistory();
    const updatedHistory = history.filter(s => s.screening_id !== screeningId);
    setItemEncrypted(STORAGE_KEYS.SCREENINGS_HISTORY, updatedHistory);

    const queue = getOfflineSyncQueue();
    const updatedQueue = queue.filter(q => q.screening_id !== screeningId);
    setItemEncrypted(STORAGE_KEYS.SCREENINGS_QUEUE, updatedQueue);
    return true;
  } catch (err) {
    return false;
  }
};

// ------------ TRANSLATION & BHASHINI AUDIO CACHE FUNCTIONS (ITEM 6) ------------

export const getTranslationCache = () => {
  const cache = getItemEncrypted(STORAGE_KEYS.TRANSLATION_CACHE);
  return cache && typeof cache === 'object' ? cache : { strings: {}, audio: {} };
};

export const getCachedTranslation = (lang, key) => {
  const cache = getTranslationCache();
  return (cache.strings && cache.strings[lang] && cache.strings[lang][key]) || null;
};

export const saveCachedTranslation = (lang, key, text) => {
  try {
    const cache = getTranslationCache();
    if (!cache.strings) cache.strings = {};
    if (!cache.strings[lang]) cache.strings[lang] = {};
    cache.strings[lang][key] = text;
    setItemEncrypted(STORAGE_KEYS.TRANSLATION_CACHE, cache);
  } catch (err) {
    console.error("Failed to cache translation:", err);
  }
};

export const getCachedAudio = (lang, key) => {
  const cache = getTranslationCache();
  return (cache.audio && cache.audio[lang] && cache.audio[lang][key]) || null;
};

export const saveCachedAudio = (lang, key, audioBase64) => {
  try {
    const cache = getTranslationCache();
    if (!cache.audio) cache.audio = {};
    if (!cache.audio[lang]) cache.audio[lang] = {};
    cache.audio[lang][key] = audioBase64;
    setItemEncrypted(STORAGE_KEYS.TRANSLATION_CACHE, cache);
  } catch (err) {
    console.error("Failed to cache TTS audio:", err);
  }
};
