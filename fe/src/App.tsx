import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/Dashboard';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
