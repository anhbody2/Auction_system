import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth';
import { Layout } from './components/Layout';
import { AuctionDetailPage } from './pages/AuctionDetail';
import { ChangePasswordPage } from './pages/ChangePassword';
import { CreateAuctionPage } from './pages/CreateAuction';
import { CreditPage } from './pages/Credit';
import { DashboardPage } from './pages/Dashboard';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { MyAuctionsPage } from './pages/MyAuctions';
import { ProfilePage } from './pages/Profile';
import { RegisterPage } from './pages/Register';
import { ResetPasswordPage } from './pages/ResetPassword';
import { VerifyEmailPage } from './pages/VerifyEmail';

const authed = (el: ReactElement) => <RequireAuth>{el}</RequireAuth>;

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/auctions/:id" element={<AuctionDetailPage />} />
        <Route path="/auctions/new" element={authed(<CreateAuctionPage />)} />
        <Route path="/my-auctions" element={authed(<MyAuctionsPage />)} />
        <Route path="/dashboard" element={authed(<DashboardPage />)} />
        <Route path="/profile" element={authed(<ProfilePage />)} />
        <Route path="/change-password" element={authed(<ChangePasswordPage />)} />
        <Route path="/credit" element={authed(<CreditPage />)} />
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
