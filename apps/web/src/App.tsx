import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import PersonaCreatePage from "./pages/PersonaCreatePage";
import VTuberPlayPage from "./pages/VTuberPlayPage";
import DocumentsPage from "./pages/DocumentsPage";
import AgentsPage from "./pages/AgentsPage";
import PricingPage from "./pages/PricingPage";
import ChatPage from "./pages/ChatPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import InstallPrompt from "./components/InstallPrompt";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  return (
    <>
    <InstallPrompt />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/oauth/callback/:provider" element={<OAuthCallbackPage />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="personas/new" element={<PersonaCreatePage />} />
        <Route path="personas/:id/edit" element={<PersonaCreatePage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="play/:personaId" element={<VTuberPlayPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="chat/:characterId" element={<ChatPage />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
