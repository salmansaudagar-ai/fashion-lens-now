import React, { createContext, useContext, useState, ReactNode } from 'react';
import { SelectedOutfit, CapturedImages, VTOStep, OutfitItem, OutfitCategory } from '@/types/vto';

interface VTOContextType {
  currentStep: VTOStep;
  setCurrentStep: (step: VTOStep) => void;
  capturedImages: CapturedImages;
  setCapturedImages: (images: CapturedImages) => void;
  selectedOutfit: SelectedOutfit;
  selectOutfitItem: (item: OutfitItem) => void;
  clearOutfitCategory: (category: 'topwear' | 'bottomwear' | 'footwear') => void;
  generatedLook: string | null;
  setGeneratedLook: (url: string | null) => void;
  resetFlow: () => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  sessionToken: string | null;
  setSessionToken: (token: string | null) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  customerPhone: string;
  setCustomerPhone: (phone: string) => void;
  pendingTryItem: OutfitItem | null;
  setPendingTryItem: (item: OutfitItem | null) => void;
  excludedCategory: OutfitCategory | null;
  setExcludedCategory: (category: OutfitCategory | null) => void;
}

const initialSelectedOutfit: SelectedOutfit = {
  topwear: null,
  bottomwear: null,
  footwear: null,
};

const initialCapturedImages: CapturedImages = {
  selfie: null,
  fullBody: null,
};

const VTOContext = createContext<VTOContextType | undefined>(undefined);

export const VTOProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentStep, setCurrentStep] = useState<VTOStep>(1);
  const [capturedImages, setCapturedImages] = useState<CapturedImages>(initialCapturedImages);
  const [selectedOutfit, setSelectedOutfit] = useState<SelectedOutfit>(initialSelectedOutfit);
  const [generatedLook, setGeneratedLook] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [pendingTryItem, setPendingTryItem] = useState<OutfitItem | null>(null);
  const [excludedCategory, setExcludedCategory] = useState<OutfitCategory | null>(null);

  const selectOutfitItem = (item: OutfitItem) => {
    setSelectedOutfit(prev => ({
      ...prev,
      [item.category]: item,
    }));
  };

  const clearOutfitCategory = (category: 'topwear' | 'bottomwear' | 'footwear') => {
    setSelectedOutfit(prev => ({
      ...prev,
      [category]: null,
    }));
  };

  const resetFlow = () => {
    setCurrentStep(1);
    setCapturedImages(initialCapturedImages);
    setSelectedOutfit(initialSelectedOutfit);
    setGeneratedLook(null);
    setSessionId(null);
    setSessionToken(null);
    setCustomerName('');
    setCustomerPhone('');
    setPendingTryItem(null);
    setExcludedCategory(null);
  };

  return (
    <VTOContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        capturedImages,
        setCapturedImages,
        selectedOutfit,
        selectOutfitItem,
        clearOutfitCategory,
        generatedLook,
        setGeneratedLook,
        resetFlow,
        sessionId,
        setSessionId,
        sessionToken,
        setSessionToken,
        customerName,
        setCustomerName,
        customerPhone,
        setCustomerPhone,
        pendingTryItem,
        setPendingTryItem,
        excludedCategory,
        setExcludedCategory,
      }}
    >
      {children}
    </VTOContext.Provider>
  );
};

export const useVTO = () => {
  const context = useContext(VTOContext);
  if (!context) {
    throw new Error('useVTO must be used within a VTOProvider');
  }
  return context;
};
