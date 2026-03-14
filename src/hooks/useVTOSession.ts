import { supabase } from '@/integrations/supabase/client';
import { SelectedOutfit } from '@/types/vto';

export interface VTOSessionData {
  id: string;
  session_token: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: string;
  selfie_url: string | null;
  full_body_url: string | null;
  generated_look_url: string | null;
  selected_topwear: any;
  selected_bottomwear: any;
  selected_footwear: any;
}

// Helper to convert base64 to File
const base64ToFile = (base64: string, filename: string): File => {
  const arr = base64.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};

// Upload image to storage using session token for folder organization
const uploadImage = async (base64: string, sessionToken: string, type: 'selfie' | 'fullbody'): Promise<string | null> => {
  try {
    // Use session token as folder name for RLS policy compliance
    const filename = `${sessionToken}/${type}-${Date.now()}.jpg`;
    const file = base64ToFile(base64, filename);
    
    const { data, error } = await supabase.storage
      .from('vto-images')
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: true
      });
    
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    
    // Use public URL (bucket is public — no expiration)
    const { data: urlData } = supabase.storage
      .from('vto-images')
      .getPublicUrl(data.path);

    if (!urlData?.publicUrl) {
      console.error('Error creating public URL');
      return null;
    }

    return urlData.publicUrl;
  } catch (err) {
    console.error('Upload failed:', err);
    return null;
  }
};

// Create a new anonymous VTO session and return both id and token
export const createVTOSession = async (): Promise<{ id: string; sessionToken: string } | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('create-session', {
      body: {},
    });

    if (error) {
      console.error('Error creating VTO session:', error);
      return null;
    }

    if (!data?.id || !data?.sessionToken) {
      console.error('Error creating VTO session: invalid response', data);
      return null;
    }

    return { id: data.id, sessionToken: data.sessionToken };
  } catch (err) {
    console.error('Failed to create VTO session:', err);
    return null;
  }
};

// Update session with selfie image
export const updateSessionSelfie = async (sessionId: string, sessionToken: string, selfieBase64: string): Promise<boolean> => {
  try {
    const selfieUrl = await uploadImage(selfieBase64, sessionToken, 'selfie');
    if (!selfieUrl) return false;
    
    const { error } = await supabase.functions.invoke('update-session', {
      body: { 
        sessionToken,
        updates: { selfie_url: selfieUrl }
      }
    });
    
    if (error) {
      console.error('Error updating selfie:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Failed to update selfie:', err);
    return false;
  }
};

// Update session with full body image
export const updateSessionFullBody = async (sessionId: string, sessionToken: string, fullBodyBase64: string): Promise<boolean> => {
  try {
    const fullBodyUrl = await uploadImage(fullBodyBase64, sessionToken, 'fullbody');
    if (!fullBodyUrl) return false;
    
    const { error } = await supabase.functions.invoke('update-session', {
      body: { 
        sessionToken,
        updates: { full_body_url: fullBodyUrl }
      }
    });
    
    if (error) {
      console.error('Error updating full body:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Failed to update full body:', err);
    return false;
  }
};

// Update session with selected outfit
export const updateSessionOutfit = async (sessionId: string, sessionToken: string, selectedOutfit: SelectedOutfit): Promise<boolean> => {
  try {
    const { error } = await supabase.functions.invoke('update-session', {
      body: { 
        sessionToken,
        updates: {
          selected_topwear: selectedOutfit.topwear ? JSON.parse(JSON.stringify(selectedOutfit.topwear)) : null,
          selected_bottomwear: selectedOutfit.bottomwear ? JSON.parse(JSON.stringify(selectedOutfit.bottomwear)) : null,
          selected_footwear: selectedOutfit.footwear ? JSON.parse(JSON.stringify(selectedOutfit.footwear)) : null,
        }
      }
    });
    
    if (error) {
      console.error('Error updating outfit:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Failed to update outfit:', err);
    return false;
  }
};

// Update session with generated look
export const updateSessionGeneratedLook = async (sessionId: string, sessionToken: string, generatedLookUrl: string): Promise<boolean> => {
  try {
    const { error } = await supabase.functions.invoke('update-session', {
      body: { 
        sessionToken,
        updates: {
          generated_look_url: generatedLookUrl,
          registration_status: 'registered',
        }
      }
    });
    
    if (error) {
      console.error('Error updating generated look:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Failed to update generated look:', err);
    return false;
  }
};
