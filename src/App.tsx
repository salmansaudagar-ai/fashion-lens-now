import React, { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/contexts/CartContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import OutputDisplay from "./pages/OutputDisplay";
import NotFound from "./pages/NotFound";

// Lazy-load pages only used on laptop/admin (not kiosk or display TV)
const Admin = React.lazy(() => import("./pages/Admin"));
const ProductDetail = React.lazy(() => import("./pages/ProductDetail"));
const Register = React.lazy(() => import("./pages/Register"));
const OrderTracking = React.lazy(() => import("./pages/OrderTracking"));
const ModelComparison = React.lazy(() => import("./pages/ModelComparison"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0f' }}>
    <div style={{ color: '#888', fontSize: 14 }}>Loading…</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CartProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary autoRecoverMs={10_000}>
            <Suspense fallback={<LazyFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/display" element={<OutputDisplay />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/register" element={<Register />} />
                <Route path="/order-tracking" element={<OrderTracking />} />
                <Route path="/compare" element={<ModelComparison />} />
                <Route path="/dashboard" element={<Dashboard />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </CartProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
