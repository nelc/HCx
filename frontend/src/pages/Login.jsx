import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, UserIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

const LOGIN_METHODS = {
  EMAIL: 'email',
  LDAP: 'ldap',
};

export default function Login() {
  const [loginMethod, setLoginMethod] = useState(LOGIN_METHODS.EMAIL);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login, ldapLogin, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (loginMethod === LOGIN_METHODS.EMAIL) {
      if (!email || !password) {
        toast.error('الرجاء إدخال البريد الإلكتروني وكلمة المرور');
        return;
      }

      const result = await login(email, password);
      
      if (result.success) {
        toast.success('تم تسجيل الدخول بنجاح');
        navigate('/dashboard');
      } else {
        toast.error(result.error || 'فشل تسجيل الدخول');
      }
    } else if (loginMethod === LOGIN_METHODS.LDAP) {
      if (!username || !password) {
        toast.error('الرجاء إدخال اسم المستخدم وكلمة المرور');
        return;
      }

      const result = await ldapLogin(username, password);
      
      if (result.success) {
        toast.success('تم تسجيل الدخول بنجاح');
        navigate('/dashboard');
      } else {
        toast.error(result.error || 'فشل تسجيل الدخول عبر LDAP');
      }
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Welcome Text */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">مرحباً بك</h2>
            <p className="text-slate-500">قم بتسجيل الدخول للوصول إلى حسابك</p>
          </div>

          {/* Login Method Selector */}
          <div className="mb-6">
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setLoginMethod(LOGIN_METHODS.EMAIL)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                  loginMethod === LOGIN_METHODS.EMAIL
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <EnvelopeIcon className="w-5 h-5" />
                <span>البريد الإلكتروني</span>
              </button>
              <button
                type="button"
                onClick={() => setLoginMethod(LOGIN_METHODS.LDAP)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                  loginMethod === LOGIN_METHODS.LDAP
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <BuildingOfficeIcon className="w-5 h-5" />
                <span>LDAP / Active Directory</span>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <AnimatePresence mode="wait">
              {loginMethod === LOGIN_METHODS.EMAIL ? (
                <motion.div
                  key="email-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Email */}
                  <div>
                    <label className="label">البريد الإلكتروني</label>
                    <div className="relative">
                      <EnvelopeIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="input pr-12"
                        placeholder="example@company.com"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="label mb-0">كلمة المرور</label>
                      <Link 
                        to="/forgot-password" 
                        className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        نسيت كلمة المرور؟
                      </Link>
                    </div>
                    <div className="relative">
                      <LockClosedIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input pr-12 pl-12"
                        placeholder="••••••••"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="w-5 h-5" />
                        ) : (
                          <EyeIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="ldap-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* LDAP Info Banner */}
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-sm text-blue-700">
                      قم بتسجيل الدخول باستخدام حساب Active Directory الخاص بالمؤسسة
                    </p>
                  </div>

                  {/* Username */}
                  <div>
                    <label className="label">اسم المستخدم</label>
                    <div className="relative">
                      <UserIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="input pr-12"
                        placeholder="username"
                        dir="ltr"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      أدخل اسم المستخدم الخاص بك في Active Directory
                    </p>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="label">كلمة المرور</label>
                    <div className="relative">
                      <LockClosedIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input pr-12 pl-12"
                        placeholder="••••••••"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="w-5 h-5" />
                        ) : (
                          <EyeIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error message */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm"
              >
                {error}
              </motion.div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>جاري تسجيل الدخول...</span>
                </div>
              ) : (
                'تسجيل الدخول'
              )}
            </button>
          </form>
        </motion.div>
      </div>

      {/* Right side - Decorative */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 items-center justify-center p-12 relative overflow-hidden">
        {/* Background patterns */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-64 h-64 border border-white rounded-full"></div>
          <div className="absolute bottom-40 left-20 w-96 h-96 border border-white rounded-full"></div>
          <div className="absolute top-1/2 right-1/3 w-48 h-48 border border-white rounded-full"></div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative z-10 text-center max-w-lg"
        >
          {/* NELC Logo */}
          <div className="flex items-center justify-center mx-auto mb-8">
            <img 
              src="/nelc-logo.png" 
              alt="المركز الوطني للتعليم الإلكتروني" 
              className="h-72 w-auto object-contain drop-shadow-lg"
            />
          </div>

          <h2 className="text-3xl font-bold text-white mb-4">
            نظام التطوير المهني
          </h2>

        </motion.div>
      </div>
    </div>
  );
}
