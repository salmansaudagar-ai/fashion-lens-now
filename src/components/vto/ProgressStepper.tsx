import React from 'react';
import { Check, Camera, Shirt, Sparkles } from 'lucide-react';
import { useVTO } from '@/contexts/VTOContext';
import { cn } from '@/lib/utils';

const steps = [
  { number: 2, label: 'Capture', icon: Camera },
  { number: 3, label: 'Choose Outfit', icon: Shirt },
  { number: 4, label: 'Your Look', icon: Sparkles },
];

export const ProgressStepper: React.FC = () => {
  const { currentStep } = useVTO();

  // Map 2.5 to step 2 for display purposes
  const displayStep = currentStep === 2.5 ? 2 : currentStep;

  return (
    <div className="w-full py-6 px-8">
      <div className="flex items-center justify-center gap-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = displayStep > step.number;
          const isActive = displayStep === step.number || (step.number === 2 && currentStep === 2.5);
          const isUpcoming = displayStep < step.number;

          return (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    'progress-step',
                    isCompleted && 'completed',
                    isActive && 'active',
                    isUpcoming && 'upcoming'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={cn(
                    'text-sm font-medium transition-colors duration-300',
                    isActive && 'text-primary',
                    isCompleted && 'text-primary/70',
                    isUpcoming && 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-16 transition-colors duration-500 mt-[-24px]',
                    currentStep > step.number ? 'bg-primary' : 'bg-border'
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
