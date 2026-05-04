'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  userCardId: string;
  userId: string;
  currentPhotoUrl: string | null;
  onUploaded: (url: string) => void;
}

function compressImage(file: File, maxSizeKB: number = 500): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      // Scale down if needed
      const MAX_DIM = 1200;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      // Try quality levels until under maxSizeKB
      let quality = 0.85;
      const tryCompress = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Compression failed')); return; }
            if (blob.size > maxSizeKB * 1024 && quality > 0.3) {
              quality -= 0.1;
              tryCompress();
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          quality
        );
      };
      tryCompress();
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

export default function PhotoUpload({ userCardId, userId, currentPhotoUrl, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;

    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const supabase = createClient();
      if (!supabase) return;

      const path = `${userId}/${userCardId}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('card-photos')
        .upload(path, compressed, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        setUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('card-photos')
        .getPublicUrl(path);

      const photoUrl = urlData.publicUrl + '?t=' + Date.now();

      await supabase
        .from('user_cards')
        .update({ photo_url: photoUrl })
        .eq('id', userCardId);

      onUploaded(photoUrl);
    } catch (err) {
      console.error('Photo upload failed:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        onClick={handleClick}
        disabled={uploading}
        title={currentPhotoUrl ? 'Replace photo' : 'Upload a photo of your card'}
        style={{
          background: 'none',
          border: 'none',
          cursor: uploading ? 'wait' : 'pointer',
          color: currentPhotoUrl ? '#e5a000' : '#bbb',
          fontSize: 15,
          padding: '2px 4px',
          lineHeight: 1,
          transition: 'color 0.12s',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.color = '#e5a000'; }}
        onMouseLeave={(e) => { if (!currentPhotoUrl) e.currentTarget.style.color = '#bbb'; }}
      >
        {uploading ? '...' : '📷'}
      </button>
    </>
  );
}
