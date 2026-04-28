import { InventoryProvider, useInventory } from './InventoryContext';
import Login from './components/Login';
import Layout from './components/Layout';

function AppContent() {
  const { user } = useInventory();
  return user ? <Layout /> : <Login />;
}

export default function App() {
  return (
    <InventoryProvider>
      <AppContent />
    </InventoryProvider>
  );
}

