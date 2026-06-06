import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User, 
  browserSessionPersistence, 
  setPersistence 
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Track auth states
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const storedToken = localStorage.getItem('google_drive_token');
      if (storedToken) {
        cachedAccessToken = storedToken;
        onAuthSuccess(user, storedToken);
      } else {
        // Try to get token from local state or require sign in
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      localStorage.removeItem('google_drive_token');
      onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    // Set persistence to session or local storage
    await setPersistence(auth, browserSessionPersistence);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    localStorage.setItem('google_drive_token', cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem('google_drive_token');
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Search for the english_quiz_sets.json file in Drive
export const findBackupFile = async (accessToken: string): Promise<string | null> => {
  try {
    const q = encodeURIComponent("name = 'english_quiz_sets.json' and trashed = false");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Find backup error:', errorText);
      return null;
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
    return null;
  } catch (err) {
    console.error('findBackupFile error:', err);
    return null;
  }
};

// Download the backup file from Google Drive
export const downloadBackupFile = async (accessToken: string, fileId: string): Promise<any | null> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error('Download backup error:', await response.text());
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('downloadBackupFile error:', err);
    return null;
  }
};

// Create a new backup file in Google Drive
export const createBackupFile = async (accessToken: string, data: any): Promise<string | null> => {
  try {
    const metadata = {
      name: 'english_quiz_sets.json',
      mimeType: 'application/json',
      description: 'Vocabulary Quiz Sets Backup file created by English Vocabulary Quiz App',
    };

    const boundary = 'vocabulary_quiz_backup_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const body = 
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(data) +
      close_delim;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body,
      }
    );

    if (!response.ok) {
      console.error('Create backup error:', await response.text());
      return null;
    }

    const result = await response.json();
    return result.id;
  } catch (err) {
    console.error('createBackupFile error:', err);
    return null;
  }
};

// Update an existing backup file in Google Drive
export const updateBackupFile = async (accessToken: string, fileId: string, data: any): Promise<boolean> => {
  try {
    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      console.error('Update backup error:', await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error('updateBackupFile error:', err);
    return false;
  }
};
