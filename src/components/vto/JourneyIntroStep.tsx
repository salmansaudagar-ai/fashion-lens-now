import React from 'react';
import { useVTO } from '@/contexts/VTOContext';
import { Camera, Shirt, Sparkles, ArrowRight } from 'lucide-react';
import trendsLogo from '@/assets/trends-logo.png';

const steps = [
  {
    icon: Camera,
    title: 'Quick Photo',
    desc: 'We take a selfie and a full-body photo to create your digital twin.',
  },
  {
    icon: Shirt,
    title: 'Pick an Outfit',
    desc: 'Browse thousands of styles from top brands and select what you love.',
  },
  {
    icon: Sparkles,
    title: 'See It On You',
    desc: 'Our AI instantly shows how the outfit looks on you — no changing room needed!',
  },
];

export const JourneyIntroStep: React.FC = () => {
  const { setCurrentStep } = useVTO();

  return (
    <div className="flex-1 flex flex-col items-center justify-between py-12 px-8 animate-fade-in">
      {/* Top logo */}
      <div className="flex items-center justify-center">
        <img src={trendsLogo} alt="Trends" className="h-7 object-contain" />
      </div>

      {/* Center content */}
      <div className="w-full max-w-lg flex flex-col items-center gap-10">
        <div className="text-center space-y-3">
          <h1 className="text-4xl md:text-5xl font-display font-semibold text-foreground leading-tight">
            How It Works
          </h1>
          <p className="text-lg text-muted-foreground font-light">
            Three simple steps to your perfect look
          </p>
        </div>

        {/* Steps */}
        <div className="w-full flex flex-col gap-6">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div key={idx} className="flex items-start gap-5">
                <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-primary tracking-wider uppercase">Step {idx + 1}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-1">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <button
          onClick={() => setCurrentStep(2)}
          className="w-full flex items-center justify-center gap-3 bg-foreground text-background rounded-full py-6 text-xl font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-150"
        >
          Let's Get Started
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom note */}
      <p className="text-sm text-muted-foreground/70 text-center">
        Takes less than 2 minutes · No data stored after your session
      </p>
    </div>
  );
};
