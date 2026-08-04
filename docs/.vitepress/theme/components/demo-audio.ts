import { ref } from "vue";

const STORAGE_KEY = "svml-demo-audio-enabled";

export const demoAudioEnabled = ref(false);

let initialized = false;
let storedPreference: boolean | null = null;

function savePreference(value: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Audio still persists for the current page when storage is unavailable.
  }
}

export function initializeDemoAudio() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (storedValue === "true" || storedValue === "false") {
      storedPreference = storedValue === "true";
    }
  } catch {
    storedPreference = null;
  }

  if (storedPreference === true && navigator.userActivation?.hasBeenActive) {
    demoAudioEnabled.value = true;
  }
}

export function enableDemoAudioAfterInteraction() {
  initializeDemoAudio();
  if (storedPreference === false || demoAudioEnabled.value) return false;

  storedPreference = true;
  demoAudioEnabled.value = true;
  savePreference(true);
  return true;
}

export function toggleDemoAudio() {
  initializeDemoAudio();
  const nextValue = !demoAudioEnabled.value;
  storedPreference = nextValue;
  demoAudioEnabled.value = nextValue;
  savePreference(nextValue);
  return nextValue;
}
