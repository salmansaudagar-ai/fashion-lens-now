import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Scissors, Truck, MapPin, ArrowLeft, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    id: 1,
    label: 'Order Placed',
    description: 'Your order has been confirmed',
    icon: Package,
  },
  {
    id: 2,
    label: 'Order Packed',
    description: 'Items packed and ready to ship',
    icon: Scissors,
  },
  {
    id: 3,
    label: 'Out for Delivery',
    description: 'On its way to you',
    icon: Truck,
  },
  {
    id: 4,
    label: 'Delivered',
    description: 'At your doorstep',
    icon: MapPin,
  },
];

const DELIVERY_TIME = (() => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 60);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
})();

const OrderTracking: React.FC = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();
  const [activeStep, setActiveStep] = useState(1);

  const formatPrice = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });

  // Animate steps progressing automatically for demo
  useEffect(() => {
    if (activeStep >= STEPS.length) return;
    const delays = [2000, 4000, 8000];
    const timers = delays.map((delay, i) =>
      setTimeout(() => setActiveStep(i + 2), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <span className="font-display font-semibold text-base">Order Status</span>
        <div className="w-16" />
      </header>

      <div className="max-w-lg mx-auto px-5 py-8 space-y-8">
        {/* Title */}
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Order Tracking</h1>
          <p className="text-muted-foreground mt-1 text-sm">Your order is on its way</p>
        </div>

        {/* Steps */}
        <div className="space-y-0">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = activeStep > step.id;
            const isActive = activeStep === step.id;
            const isUpcoming = activeStep < step.id;
            const isLast = index === STEPS.length - 1;

            return (
              <div key={step.id} className="flex gap-4">
                {/* Icon + line */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-700 border-2',
                      isCompleted && 'bg-success border-success text-background',
                      isActive && 'bg-success border-success text-background animate-pulse',
                      isUpcoming && 'bg-muted border-border text-muted-foreground'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  {!isLast && (
                    <div
                      className={cn(
                        'w-0.5 flex-1 min-h-[40px] transition-colors duration-700',
                        activeStep > step.id ? 'bg-success' : 'bg-border'
                      )}
                    />
                  )}
                </div>

                {/* Text */}
                <div className="pb-8 pt-2 flex-1">
                  <p
                    className={cn(
                      'font-semibold text-base transition-colors duration-500',
                      isUpcoming ? 'text-muted-foreground' : 'text-foreground'
                    )}
                  >
                    {step.label}
                  </p>
                  <p
                    className={cn(
                      'text-sm mt-0.5 transition-colors duration-500',
                      isUpcoming ? 'text-muted-foreground/60' : 'text-muted-foreground'
                    )}
                  >
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Delivery Card */}
        <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-1 shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">Estimated Delivery</p>
          <p className="font-display text-2xl font-bold text-foreground">Today, {DELIVERY_TIME}</p>
          <p className="text-xs text-muted-foreground pt-1">
            Delivering in 60 minutes from nearest Dark Store
          </p>
        </div>

        {/* Order Summary */}
        {items.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-muted-foreground" />
              <p className="font-semibold text-sm text-foreground">Order Summary</p>
            </div>
            <div className="space-y-2">
              {items.map(item => (
                <div key={`${item.id}-${item.size}`} className="flex items-center gap-3">
                  <div className="w-12 h-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Size: {item.size} · Qty: {item.quantity}</p>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatPrice((item.sellingPrice ?? item.price) * item.quantity)}
                  </p>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-border flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="font-bold text-base text-foreground">{formatPrice(totalPrice)}</span>
            </div>
          </div>
        )}

        {/* Continue Shopping */}
        <Button
          className="w-full py-6 text-base font-semibold rounded-2xl"
          onClick={() => {
            clearCart();
            navigate('/');
          }}
        >
          Continue Shopping
        </Button>
      </div>
    </div>
  );
};

export default OrderTracking;
