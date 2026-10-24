import type { UserProfile } from './types';

export const CURRENT_USER: UserProfile = {
  id: 'demo-user',
  name: 'FloodSense User',
  role: 'citizen',
  region: 'Not specified',
  prefs: {
    unit: 'metric',
    tone: 'concise_tactical',
    daylight_mode: false,
  },
};
