import { VTOProvider } from '@/contexts/VTOContext';
import { VTOApp } from '@/components/vto/VTOApp';

const Index = () => {
  return (
    <VTOProvider>
      <VTOApp />
    </VTOProvider>
  );
};

export default Index;
