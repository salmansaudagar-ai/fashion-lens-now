import React, { useState } from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { cn } from '@/lib/utils';
import { Camera, RotateCcw, Check, ArrowRight, User, PersonStanding } from 'lucide-react';

type CapturePhase = 'selfie' | 'fullbody' | 'complete';

const selfiePlaceholder = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=500&fit=crop&crop=face';
const fullBodyPlaceholder = 'https://images.unsplash.com/photo-1506634572416-48cdfe530110?w=400&h=600&fit=crop';

export const ImageCaptureStep: React.FC = () => {
  const { capturedImages, setCapturedImages, setCurrentStep } = useVTO();
  const [phase, setPhase] = useState<CapturePhase>(
    capturedImages.selfie ? (capturedImages.fullBody ? 'complete' : 'fullbody') : 'selfie'
  );
  const [isCapturing, setIsCapturing] = useState(false);

  const handleCapture = async () => {
    setIsCapturing(true);
    
    // Simulate camera capture delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    if (phase === 'selfie') {
      setCapturedImages({ ...capturedImages, selfie: selfiePlaceholder });
    } else if (phase === 'fullbody') {
      setCapturedImages({ ...capturedImages, fullBody: fullBodyPlaceholder });
    }
    
    setIsCapturing(false);
  };

  const handleRetake = () => {
    if (phase === 'selfie' || (phase === 'fullbody' && !capturedImages.fullBody)) {
      setCapturedImages({ ...capturedImages, selfie: null });
      setPhase('selfie');
    } else {
      setCapturedImages({ ...capturedImages, fullBody: null });
    }
  };

  const handleConfirm = () => {
    if (phase === 'selfie' && capturedImages.selfie) {
      setPhase('fullbody');
    } else if (phase === 'fullbody' && capturedImages.fullBody) {
      setPhase('complete');
    }
  };

  const handleContinue = () => {
    setCurrentStep(3);
  };

  const currentImage = phase === 'selfie' ? capturedImages.selfie : capturedImages.fullBody;
  const isSelfiePhase = phase === 'selfie';
  const isComplete = phase === 'complete' || (capturedImages.selfie && capturedImages.fullBody);

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-display font-semibold text-foreground mb-2">
            {isComplete ? 'Perfect!' : isSelfiePhase ? 'Capture Your Selfie' : 'Full Body Photo'}
          </h1>
          <p className="text-lg text-muted-foreground">
            {isComplete 
              ? 'Your photos are ready for the virtual try-on'
              : isSelfiePhase 
                ? 'Position your face in the frame for best results'
                : 'Stand back and capture your full body'
            }
          </p>
        </div>

        {isComplete ? (
          // Review both photos
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-6">
              {/* Selfie Preview */}
              <div className="glass-card rounded-3xl p-4">
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden mb-4">
                  <img
                    src={capturedImages.selfie!}
                    alt="Selfie"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Selfie
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCapturedImages({ ...capturedImages, selfie: null });
                    setPhase('selfie');
                  }}
                  className="btn-secondary-vto w-full flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
              </div>

              {/* Full Body Preview */}
              <div className="glass-card rounded-3xl p-4">
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden mb-4">
                  <img
                    src={capturedImages.fullBody!}
                    alt="Full Body"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2">
                    <PersonStanding className="w-4 h-4" />
                    Full Body
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCapturedImages({ ...capturedImages, fullBody: null });
                    setPhase('fullbody');
                  }}
                  className="btn-secondary-vto w-full flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retake
                </button>
              </div>
            </div>

            <button
              onClick={handleContinue}
              className="btn-primary-vto w-full flex items-center justify-center gap-3"
            >
              Looks Good, Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        ) : (
          // Camera capture view
          <div className="flex gap-8">
            {/* Camera Preview Area */}
            <div className="flex-1">
              <div className="glass-card rounded-3xl p-6">
                <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted">
                  {currentImage ? (
                    <img
                      src={currentImage}
                      alt="Captured"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center relative">
                      {/* Camera simulation background */}
                      <div className="absolute inset-0 bg-gradient-to-b from-card to-muted" />
                      
                      {/* Guide outline */}
                      <div
                        className={cn(
                          'relative z-10 border-2 border-dashed border-primary/50 rounded-full transition-all duration-500',
                          isSelfiePhase ? 'w-48 h-56' : 'w-32 h-72 rounded-lg'
                        )}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          {isSelfiePhase ? (
                            <User className="w-20 h-20 text-primary/30" />
                          ) : (
                            <PersonStanding className="w-16 h-16 text-primary/30" />
                          )}
                        </div>
                      </div>

                      {/* Posture hints */}
                      <div className="absolute bottom-6 left-0 right-0 text-center">
                        <p className="text-muted-foreground text-sm">
                          {isSelfiePhase 
                            ? 'Center your face within the oval'
                            : 'Stand 3-4 feet away, arms slightly apart'
                          }
                        </p>
                      </div>

                      {/* Capturing overlay */}
                      {isCapturing && (
                        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-foreground font-medium">Capturing...</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Phase indicator */}
                  <div className="absolute top-4 right-4 flex gap-2">
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      capturedImages.selfie ? 'bg-success' : isSelfiePhase ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                    )} />
                    <div className={cn(
                      'w-3 h-3 rounded-full',
                      capturedImages.fullBody ? 'bg-success' : !isSelfiePhase ? 'bg-primary animate-pulse' : 'bg-muted-foreground'
                    )} />
                  </div>
                </div>

                {/* Capture Controls */}
                <div className="flex gap-4 mt-6">
                  {currentImage ? (
                    <>
                      <button
                        onClick={handleRetake}
                        className="btn-secondary-vto flex-1 flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-5 h-5" />
                        Retake
                      </button>
                      <button
                        onClick={handleConfirm}
                        className="btn-primary-vto flex-1 flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        Use This Photo
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCapture}
                      disabled={isCapturing}
                      className="btn-primary-vto w-full flex items-center justify-center gap-3"
                    >
                      <Camera className="w-6 h-6" />
                      {isCapturing ? 'Capturing...' : 'Capture Photo'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Instructions Panel */}
            <div className="w-72 space-y-6">
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">
                  {isSelfiePhase ? 'Selfie Tips' : 'Full Body Tips'}
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  {isSelfiePhase ? (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Face the camera directly
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Good lighting on your face
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Neutral expression works best
                      </li>
                    </>
                  ) : (
                    <>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Stand with feet shoulder-width apart
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Arms slightly away from body
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        Face forward, relaxed posture
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* Progress Indicator */}
              <div className="glass-card rounded-2xl p-6">
                <h4 className="text-sm font-medium text-muted-foreground mb-4">Progress</h4>
                <div className="space-y-3">
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-xl transition-all',
                    capturedImages.selfie ? 'bg-success/10' : isSelfiePhase ? 'bg-primary/10' : 'bg-secondary'
                  )}>
                    {capturedImages.selfie ? (
                      <Check className="w-5 h-5 text-success" />
                    ) : (
                      <User className={cn('w-5 h-5', isSelfiePhase ? 'text-primary' : 'text-muted-foreground')} />
                    )}
                    <span className={cn(
                      'font-medium',
                      capturedImages.selfie ? 'text-success' : isSelfiePhase ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      Selfie
                    </span>
                  </div>
                  <div className={cn(
                    'flex items-center gap-3 p-3 rounded-xl transition-all',
                    capturedImages.fullBody ? 'bg-success/10' : !isSelfiePhase ? 'bg-primary/10' : 'bg-secondary'
                  )}>
                    {capturedImages.fullBody ? (
                      <Check className="w-5 h-5 text-success" />
                    ) : (
                      <PersonStanding className={cn('w-5 h-5', !isSelfiePhase ? 'text-primary' : 'text-muted-foreground')} />
                    )}
                    <span className={cn(
                      'font-medium',
                      capturedImages.fullBody ? 'text-success' : !isSelfiePhase ? 'text-primary' : 'text-muted-foreground'
                    )}>
                      Full Body
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
