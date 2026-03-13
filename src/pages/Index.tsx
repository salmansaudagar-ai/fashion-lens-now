import { VTOProvider } from '@/contexts/VTOContext';
import { VTOApp } from '@/components/vto/VTOApp';
import { ConnectionGuard } from '@/components/ConnectionGuard';

const Index = () => {
  return (
    <ConnectionGuard>
      <VTOProvider>
        <VTOApp />
      </VTOProvider>
    </ConnectionGuard>
  );
};

export default Index;
