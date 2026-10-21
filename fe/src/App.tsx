import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth';
import { Layout } from './components/Layout';
import { AuctionDetailPage } from './pages/AuctionDetail';
import { ChangePasswordPage } from './pages/ChangePassword';
import { CreateAuctionPage } from './pages/CreateAuction';
import { CreditPage } from './pages/Credit';
import { AddGoodsPage, EditGoodsPage, MyGoodsPage } from './pages/MyGoods';
import { DashboardPage } from './pages/Dashboard';
import { ForgotPasswordPage } from './pages/ForgotPassword';
import { HomePage } from './pages/Home';
import { LoginPage } from './pages/Login';
import { AdminPermissionsPage } from './pages/AdminPermissions';
import { AdminUserDetailPage } from './pages/AdminUserDetail';
import { AdminUserNewPage } from './pages/AdminUserNew';
import { AdminUsersPage } from './pages/AdminUsers';
import { MyAuctionsPage } from './pages/MyAuctions';
import { MyBiddingsPage } from './pages/MyBiddings';
import { ProfilePage } from './pages/Profile';
import { RegisterPage } from './pages/Register';
import { ResetPasswordPage } from './pages/ResetPassword';
import { StaffAuctionDetailPage, StaffAuctionNewPage, StaffAuctionsPage } from './pages/StaffAuctions';
import { StaffCreditPage } from './pages/StaffCredit';
import { StaffGoodsDetailPage, StaffGoodsNewPage, StaffGoodsPage } from './pages/StaffGoods';
import { StaffStatisticsPage } from './pages/StaffStatistics';
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
        <Route path="/goods" element={authed(<MyGoodsPage />)} />
        <Route path="/goods/new" element={authed(<AddGoodsPage />)} />
        <Route path="/goods/:id/edit" element={authed(<EditGoodsPage />)} />
        <Route path="/my-auctions" element={authed(<MyAuctionsPage />)} />
        <Route path="/my-bids" element={authed(<MyBiddingsPage />)} />
        <Route path="/dashboard" element={authed(<DashboardPage />)} />
        <Route path="/profile" element={authed(<ProfilePage />)} />
        <Route path="/change-password" element={authed(<ChangePasswordPage />)} />
        <Route path="/credit" element={authed(<CreditPage />)} />
        <Route path="/staff/statistics" element={<RequireAuth permission="report.view"><StaffStatisticsPage /></RequireAuth>} />
        <Route path="/staff/auctions" element={<RequireAuth permission="auction.manage"><StaffAuctionsPage /></RequireAuth>} />
        <Route path="/staff/auctions/new" element={<RequireAuth permission="auction.manage"><StaffAuctionNewPage /></RequireAuth>} />
        <Route path="/staff/auctions/:id" element={<RequireAuth permission="auction.manage"><StaffAuctionDetailPage /></RequireAuth>} />
        <Route path="/staff/credit" element={<RequireAuth permission="credit.manage"><StaffCreditPage /></RequireAuth>} />
        <Route path="/staff/goods" element={<RequireAuth permission="goods.manage"><StaffGoodsPage /></RequireAuth>} />
        <Route path="/staff/goods/new" element={<RequireAuth permission="goods.manage"><StaffGoodsNewPage /></RequireAuth>} />
        <Route path="/staff/goods/:id" element={<RequireAuth permission="goods.manage"><StaffGoodsDetailPage /></RequireAuth>} />
        <Route path="/admin/users" element={<RequireAuth permission="user.manage"><AdminUsersPage /></RequireAuth>} />
        <Route path="/admin/users/new" element={<RequireAuth permission="user.manage"><AdminUserNewPage /></RequireAuth>} />
        <Route path="/admin/users/:id" element={<RequireAuth permission="user.manage"><AdminUserDetailPage /></RequireAuth>} />
        <Route path="/admin/permissions" element={<RequireAuth permission="permission.manage"><AdminPermissionsPage /></RequireAuth>} />
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
