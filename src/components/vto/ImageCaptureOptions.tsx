import React, { useRef } from 'react';
import { Camera, Upload, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageCaptureOptionsProps {
  title: string;
  subtitle: string;
  onSelectCamera: () => void;
  onSelectUpload: (imageDataUrl: string) => void;
  onBack: () => void;
  backLabel?: string;
}

export const ImageCaptureOptions: React.FC<ImageCaptureOptionsProps> = ({
  title,
  subtitle,
  onSelectCamera,
  onSelectUpload,
  onBack,
  backLabel = 'Back',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size should be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      onSelectUpload(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col animate-fade-in">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header */}
      <div className="p-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          {backLabel}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <h2 className="text-3xl font-display font-semibold text-foreground text-center mb-3">
          {title}
        </h2>
        <p className="text-lg text-muted-foreground text-center mb-12 max-w-md">
          {subtitle}
        </p>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-lg">
          {/* Camera Option */}
          <button
            onClick={onSelectCamera}
            className={cn(
              'group flex flex-col items-center gap-4 p-8 rounded-3xl',
              'bg-card border-2 border-border hover:border-primary',
              'transition-all duration-300 hover:shadow-lg hover:shadow-primary/10',
              'active:scale-[0.98]'
            )}
          >
            <div className={cn(
              'w-20 h-20 rounded-2xl flex items-center justify-center',
              'bg-primary/10 text-primary',
              'group-hover:bg-primary group-hover:text-primary-foreground',
              'transition-all duration-300'
            )}>
              <Camera className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Use Camera
              </h3>
              <p className="text-sm text-muted-foreground">
                Take a photo now
              </p>
            </div>
          </button>

          {/* Upload Option */}
          <button
            onClick={handleUploadClick}
            className={cn(
              'group flex flex-col items-center gap-4 p-8 rounded-3xl',
              'bg-card border-2 border-border hover:border-primary',
              'transition-all duration-300 hover:shadow-lg hover:shadow-primary/10',
              'active:scale-[0.98]'
            )}
          >
            <div className={cn(
              'w-20 h-20 rounded-2xl flex items-center justify-center',
              'bg-primary/10 text-primary',
              'group-hover:bg-primary group-hover:text-primary-foreground',
              'transition-all duration-300'
            )}>
              <Upload className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Upload Photo
              </h3>
              <p className="text-sm text-muted-foreground">
                Choose from gallery
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
