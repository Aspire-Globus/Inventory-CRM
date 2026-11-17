import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ToastProvider } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import Categories from './pages/Categories.jsx';
import Employees from './pages/Employees.jsx';
import EmployeeDetail from './pages/EmployeeDetail.jsx';
import Assignments from './pages/Assignments.jsx';
import AssignPage from './pages/AssignPage.jsx';
import Repairs from './pages/Repairs.jsx';
import Departments from './pages/Departments.jsx';
import Reports from './pages/Reports.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import Users from './pages/Users.jsx';
import Notifications from './pages/Notifications.jsx';
import RecycleBin from './pages/RecycleBin.jsx';
import { AuthProvider, RequireAuth } from './auth.jsx';
import './index.css';
import { tw } from './components/tw.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="inventory/categories" element={<RequireAuth perm="inventory"><Categories /></RequireAuth>} />
            <Route path="employees" element={<Employees />} />
            <Route path="employees/:id" element={<EmployeeDetail />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="assignments/new" element={<RequireAuth perm="assignments"><AssignPage /></RequireAuth>} />
            <Route path="repairs" element={<Repairs />} />
            <Route path="departments" element={<Departments />} />
            <Route path="reports" element={<Reports />} />
            <Route path="profile" element={<Profile />} />
            <Route path="users" element={<RequireAuth perm="users"><Users /></RequireAuth>} />
            <Route path="notifications" element={<RequireAuth perm="notifications"><Notifications /></RequireAuth>} />
            <Route path="recycle-bin" element={<RequireAuth perm="recycleBin"><RecycleBin /></RequireAuth>} />
            <Route path="*" element={<div className={tw.cardPad}>Page not found.</div>} />
          </Route>
        </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  </React.StrictMode>
);
