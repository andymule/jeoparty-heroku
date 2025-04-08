/**
 * Sound utility functions for the Jeoparty app
 */

// Define the sound paths
export const SOUNDS = {
  BUZZER: `${window.location.origin}/sounds/ba-ding.mp3`,
  CORRECT: `${window.location.origin}/sounds/yes.flac`,
  INCORRECT: `${window.location.origin}/sounds/no.wav`,
  KNOCK: `${window.location.origin}/sounds/knock.mp3`,
  CHIME: `${window.location.origin}/sounds/chime.mp3`
};

// Pre-loaded sound instances
const soundInstances = {};

/**
 * Detect if the current device is a desktop
 * @returns {boolean} true if the device is a desktop, false otherwise
 */
export const isDesktop = () => {
  // Check if navigator and userAgent exist
  if (!navigator || !navigator.userAgent) return true;
  
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Check if the device is mobile
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile|tablet/i.test(userAgent);
  
  // Additional check for touch capabilities (most mobile devices have touch)
  const hasTouchScreen = (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (navigator.msMaxTouchPoints > 0)
  );
  
  // Consider a device desktop if it's not mobile and doesn't have touch capabilities
  // For iPads with desktop mode, we'll still consider them mobile
  return !isMobile && !hasTouchScreen;
};

/**
 * Load a sound and prepare it for playback
 * 
 * @param {string} soundKey - The key of the sound to load from SOUNDS
 * @returns {HTMLAudioElement} - The loaded audio element
 */
export const loadSound = (soundKey) => {
  // Only load sounds on desktop
  if (!isDesktop()) {
    console.log('Sound loading skipped on mobile device');
    return null;
  }
  
  if (!SOUNDS[soundKey]) {
    console.error(`Sound ${soundKey} not found in sound library`);
    return null;
  }
  
  try {
    const audio = new Audio();
    
    // Set properties before setting src to avoid race conditions
    audio.preload = 'auto';
    audio.volume = 1.0;
    
    // Add error handler
    audio.onerror = (e) => {
      console.error(`Error loading sound ${soundKey} from ${SOUNDS[soundKey]}:`, e);
      // Try to recover by using a relative path if absolute path fails
      if (audio.src.startsWith(window.location.origin)) {
        console.log(`Attempting to load ${soundKey} using relative path`);
        audio.src = SOUNDS[soundKey].replace(window.location.origin, '');
      }
    };
    
    // Set src after configuring error handling
    audio.src = SOUNDS[soundKey];
    
    // Load the sound
    audio.load();
    
    // Store the instance
    soundInstances[soundKey] = audio;
    
    return audio;
  } catch (err) {
    console.error(`Error creating audio for ${soundKey}:`, err);
    return null;
  }
};

/**
 * Play a sound by its key
 * 
 * @param {string} soundKey - The key of the sound to play from SOUNDS
 * @returns {Promise} - A promise that resolves when the sound starts playing
 */
export const playSound = (soundKey) => {
  // Don't play sounds on mobile devices
  if (!isDesktop()) {
    console.log('Sound playback skipped on mobile device');
    return Promise.resolve(); // Return resolved promise to maintain API contract
  }
  
  // Load the sound if it hasn't been loaded yet
  if (!soundInstances[soundKey]) {
    loadSound(soundKey);
  }
  
  const audio = soundInstances[soundKey];
  if (!audio) {
    return Promise.reject(new Error(`Sound ${soundKey} could not be loaded`));
  }
  
  // Reset the audio to the beginning if it was already played
  audio.currentTime = 0;
  
  // Play the sound
  return audio.play().catch(err => {
    console.error(`Error playing sound ${soundKey}:`, err);
    return Promise.reject(err);
  });
};

/**
 * Clean up all loaded sounds
 */
export const cleanupSounds = () => {
  Object.values(soundInstances).forEach(audio => {
    if (audio) {
      audio.pause();
      audio.src = '';
    }
  });
  
  // Clear the instances
  Object.keys(soundInstances).forEach(key => {
    delete soundInstances[key];
  });
};

export default {
  SOUNDS,
  loadSound,
  playSound,
  cleanupSounds,
  isDesktop
}; 