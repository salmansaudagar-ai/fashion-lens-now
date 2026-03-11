import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { cn } from '@/lib/utils';

const formatPrice = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0 });

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ open, onClose }) => {
  const { items, removeItem, updateQty, totalCount, totalPrice } = useCart();
  const navigate = useNavigate();

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-xl font-display">
            <ShoppingBag className="w-5 h-5" />
            Cart
            {totalCount > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary text-primary-foreground">
                {totalCount}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Your cart is empty</p>
              <p className="text-sm text-muted-foreground mt-1">Add items to get started</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {items.map(item => {
                const price = item.sellingPrice ?? item.price;
                return (
                  <div key={`${item.id}-${item.size}`} className="flex gap-4">
                    <div className="w-20 h-24 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <p className="font-medium text-sm leading-tight truncate">{item.name}</p>
                      {item.brand && <p className="text-xs text-muted-foreground">{item.brand}</p>}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-muted border border-border font-medium">
                          Size: {item.size}
                        </span>
                        {item.color && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-muted border border-border font-medium">
                            {item.color}
                          </span>
                        )}
                      </div>
                      <p className="font-semibold text-sm">{formatPrice(price * item.quantity)}</p>
                      <div className="flex items-center gap-2 mt-auto">
                        <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => updateQty(item.id, item.size, -1)}
                            className="px-2 py-1 hover:bg-muted transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 py-1 text-sm font-medium min-w-[28px] text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQty(item.id, item.size, 1)}
                            className="px-2 py-1 hover:bg-muted transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.id, item.size)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 space-y-3">
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({totalCount} item{totalCount > 1 ? 's' : ''})</span>
                <span className="font-bold text-lg">{formatPrice(totalPrice)}</span>
              </div>
              <Button
                className="w-full py-6 text-base font-semibold rounded-2xl bg-foreground text-background hover:bg-foreground/90"
                onClick={() => { onClose(); navigate('/order-tracking'); }}
              >
                Proceed to Checkout
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
