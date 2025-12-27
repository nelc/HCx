import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  AcademicCapIcon,
  ChartBarIcon,
  UsersIcon,
  BuildingOfficeIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  BellIcon,
  Bars3Icon,
  XMarkIcon,
  DocumentTextIcon,
  LightBulbIcon,
  FolderIcon,
  Square3Stack3DIcon,
  BookOpenIcon,
  DocumentChartBarIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../../store/authStore';
import { getInitials, getRoleLabel } from '../../utils/helpers';
import api from '../../utils/api';
import WelcomeModal from '../WelcomeModal';

const adminNavItems = [
  { name: 'لوحة التحكم', path: '/dashboard', icon: HomeIcon },
  { name: 'الأقسام', path: '/departments', icon: BuildingOfficeIcon },
  { name: 'مجالات التدريب', path: '/domains', icon: FolderIcon },
  { name: 'الدورات التدريبية', path: '/courses', icon: AcademicCapIcon },
  { name: 'التقييمات', path: '/tests', icon: ClipboardDocumentListIcon },
  { name: 'النتائج والتحليلات', path: '/results-overview', icon: ChartBarIcon },
  { name: 'التقارير', path: '/reports', icon: DocumentChartBarIcon },
  { name: 'المستخدمون', path: '/users', icon: UsersIcon },
  { name: 'الإعدادات', path: '/settings', icon: Cog6ToothIcon },
];

const officerNavItems = [
  { name: 'لوحة التحكم', path: '/dashboard', icon: HomeIcon },
  { name: 'الأقسام', path: '/departments', icon: BuildingOfficeIcon },
  { name: 'مجالات التدريب', path: '/domains', icon: FolderIcon },
  { name: 'الدورات التدريبية', path: '/courses', icon: AcademicCapIcon },
  { name: 'التقييمات', path: '/tests', icon: ClipboardDocumentListIcon },
  { name: 'النتائج والتحليلات', path: '/results-overview', icon: ChartBarIcon },
  { name: 'التقارير', path: '/reports', icon: DocumentChartBarIcon },
  { name: 'الإعدادات', path: '/settings', icon: Cog6ToothIcon },
];

const employeeNavItems = [
  { name: 'لوحة التحكم', path: '/dashboard', icon: HomeIcon },
  { name: 'تقييماتي', path: '/assessments', icon: DocumentTextIcon },
  { name: 'مصفوفة الكفاءات', path: '/competency-matrix', icon: Square3Stack3DIcon },
  { name: 'التوصيات التدريبية', path: '/recommendations', icon: AcademicCapIcon },
  { name: 'خطة التدريب', path: '/training-plan', icon: BookOpenIcon },
  { name: 'الإعدادات', path: '/settings', icon: Cog6ToothIcon },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === 'true';
  });
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isCollapsed.toString());
  }, [isCollapsed]);

  // Show welcome modal for employees who haven't completed their profile
  useEffect(() => {
    if (user?.role === 'employee' && user?.profile_completed === false) {
      setShowWelcomeModal(true);
    }
  }, [user]);

  // Get navigation items based on role
  const getNavItems = () => {
    switch (user?.role) {
      case 'admin':
        return adminNavItems;
      case 'training_officer':
        return officerNavItems;
      default:
        return employeeNavItems;
    }
  };

  const navItems = getNavItems();

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await api.get('/notifications?unread_only=true&limit=5');
        setNotifications(response.data.notifications || []);
      } catch (error) {
        console.error('Failed to fetch notifications');
      }
    };
    fetchNotifications();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications([]);
    } catch (error) {
      console.error('Failed to mark notifications as read');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed top-0 right-0 h-full bg-white shadow-xl z-50
        transform transition-all duration-300 ease-out
        lg:translate-x-0
        ${isCollapsed ? 'w-20' : 'w-72'}
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className={`h-20 flex items-center border-b border-slate-100 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-6'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
            <img 
              src="/nelc-logoc.png" 
              alt="NELC Logo" 
              className={`object-contain transition-all duration-300 ${isCollapsed ? 'w-12 h-12' : 'w-20 h-20'}`}
            />
            {!isCollapsed && (
              <div>
                <h1 className="font-bold text-primary-700 text-lg">HCx</h1>
                <p className="text-xs text-slate-500">نظام تقييم التدريب</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Collapse toggle button - Desktop only */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden lg:flex absolute -left-3 top-24 w-6 h-6 bg-primary-700 text-white rounded-full items-center justify-center shadow-lg hover:bg-primary-800 transition-colors z-50"
          title={isCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
        >
          {isCollapsed ? (
            <ChevronDoubleLeftIcon className="w-4 h-4" />
          ) : (
            <ChevronDoubleRightIcon className="w-4 h-4" />
          )}
        </button>

        {/* User info */}
        <div className={`mt-4 bg-slate-50 rounded-xl ${isCollapsed ? 'p-2 mx-2' : 'p-4 mx-4'}`}>
          <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`} title={isCollapsed ? `${user?.name_ar} - ${getRoleLabel(user?.role)}` : ''}>
            <div className={`bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white font-semibold transition-all duration-300 ${isCollapsed ? 'w-10 h-10 text-sm' : 'w-12 h-12'}`}>
              {getInitials(user?.name_ar)}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{user?.name_ar}</p>
                <p className="text-xs text-slate-500">{getRoleLabel(user?.role)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={`space-y-1 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
            
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                title={isCollapsed ? item.name : ''}
                className={`
                  flex items-center rounded-xl transition-all duration-200 group relative
                  ${isCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'}
                  ${isActive 
                    ? 'bg-primary-700 text-white shadow-lg shadow-primary-700/20' 
                    : 'text-slate-600 hover:bg-slate-100'
                  }
                `}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-primary-700'}`} />
                {!isCollapsed && <span className="font-medium">{item.name}</span>}
                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout button */}
        <div className={`absolute bottom-0 left-0 right-0 border-t border-slate-100 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          <button
            onClick={handleLogout}
            title={isCollapsed ? 'تسجيل الخروج' : ''}
            className={`w-full flex items-center rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group relative ${isCollapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'}`}
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="font-medium">تسجيل الخروج</span>}
            {/* Tooltip for collapsed state */}
            {isCollapsed && (
              <div className="absolute right-full mr-2 px-2 py-1 bg-slate-800 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50">
                تسجيل الخروج
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className={`transition-all duration-300 ${isCollapsed ? 'lg:mr-20' : 'lg:mr-72'}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-slate-100">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-800"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            {/* Page title */}
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold text-primary-700">
                {navItems.find(item => 
                  location.pathname === item.path || 
                  (item.path !== '/dashboard' && location.pathname.startsWith(item.path))
                )?.name || 'لوحة التحكم'}
              </h2>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <BellIcon className="w-6 h-6" />
                  {notifications.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                  )}
                </button>

                {/* Notifications dropdown */}
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50"
                    >
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-800">الإشعارات</h3>
                        {notifications.length > 0 && (
                          <button
                            onClick={markAllRead}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            تحديد الكل كمقروء
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-slate-500">
                            <BellIcon className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                            <p>لا توجد إشعارات جديدة</p>
                          </div>
                        ) : (
                          notifications.map((notification) => (
                            <div
                              key={notification.id}
                              className="p-4 border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <p className="font-medium text-slate-800 text-sm">{notification.title_ar}</p>
                              <p className="text-xs text-slate-500 mt-1">{notification.message_ar}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* User menu (mobile) */}
              <div className="lg:hidden">
                <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {getInitials(user?.name_ar)}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>

      {/* Welcome Modal for first-time employees */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        userName={user?.name_ar}
        onClose={() => setShowWelcomeModal(false)}
      />
    </div>
  );
}

