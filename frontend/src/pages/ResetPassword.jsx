import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LockClosedIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, XCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await api.get(`/auth/verify-reset-token/${token}`);
      if (response.data.valid) {
        setIsTokenValid(true);
        setUserEmail(response.data.email);
      }
    } catch (error) {
      setIsTokenValid(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!password) {
      toast.error('الرجاء إدخال كلمة المرور الجديدة');
      return;
    }

    if (password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/reset-password', { token, password });
      setIsSuccess(true);
      toast.success('تم إعادة تعيين كلمة المرور بنجاح');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error) {
      toast.error(error.response?.data?.error || 'حدث خطأ. يرجى المحاولة مرة أخرى');
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/80 font-medium">جاري التحقق من الرابط...</p>
        </div>
      </div>
    );
  }

  // Invalid token state
  if (!isTokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md text-center bg-white rounded-2xl shadow-xl p-8"
        >
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <XCircleIcon className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-4">الرابط غير صالح</h2>
          <p className="text-slate-500 mb-6">
            هذا الرابط غير صالح أو منتهي الصلاحية.
            <br />
            يرجى طلب رابط جديد لإعادة تعيين كلمة المرور.
          </p>
          <Link
            to="/forgot-password"
            className="btn btn-primary w-full py-3 mb-3"
          >
            طلب رابط جديد
          </Link>
          <Link
            to="/login"
            className="btn btn-outline w-full py-3"
          >
            العودة لتسجيل الدخول
          </Link>
        </motion.div>
      </div>
    );
  }

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
          {!isSuccess ? (
            <>
              {/* Back to login */}
              <Link 
                to="/login" 
                className="inline-flex items-center gap-2 text-slate-500 hover:text-primary-600 transition-colors mb-8"
              >
                <ArrowRightIcon className="w-4 h-4" />
                <span>العودة لتسجيل الدخول</span>
              </Link>

              {/* Header Text */}
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800 mb-2">إعادة تعيين كلمة المرور</h2>
                <p className="text-slate-500">أدخل كلمة المرور الجديدة لحسابك</p>
                {userEmail && (
                  <p className="text-sm text-primary-600 mt-2 font-medium" dir="ltr">{userEmail}</p>
                )}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* New Password */}
                <div>
                  <label className="label">كلمة المرور الجديدة</label>
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
                  <p className="text-xs text-slate-400 mt-1">يجب أن تكون 6 أحرف على الأقل</p>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="label">تأكيد كلمة المرور</label>
                  <div className="relative">
                    <LockClosedIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="input pr-12 pl-12"
                      placeholder="••••••••"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? (
                        <EyeSlashIcon className="w-5 h-5" />
                      ) : (
                        <EyeIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Password match indicator */}
                {confirmPassword && (
                  <div className={`flex items-center gap-2 text-sm ${password === confirmPassword ? 'text-green-600' : 'text-red-600'}`}>
                    {password === confirmPassword ? (
                      <>
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>كلمتا المرور متطابقتان</span>
                      </>
                    ) : (
                      <>
                        <XCircleIcon className="w-4 h-4" />
                        <span>كلمتا المرور غير متطابقتين</span>
                      </>
                    )}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading || password !== confirmPassword || password.length < 6}
                  className="w-full btn btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>جاري إعادة التعيين...</span>
                    </div>
                  ) : (
                    'إعادة تعيين كلمة المرور'
                  )}
                </button>
              </form>
            </>
          ) : (
            /* Success State */
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircleIcon className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-4">تم إعادة التعيين بنجاح!</h2>
              <p className="text-slate-500 mb-6">
                تم تغيير كلمة المرور الخاصة بك بنجاح.
                <br />
                سيتم توجيهك إلى صفحة تسجيل الدخول...
              </p>
              <div className="w-8 h-8 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto"></div>
            </motion.div>
          )}
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
          {/* Key Icon */}
          <div className="flex items-center justify-center mx-auto mb-8">
            <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center">
              <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white mb-4">
            تعيين كلمة مرور جديدة
          </h2>
          <p className="text-white/70 text-lg">
            اختر كلمة مرور قوية للحفاظ على أمان حسابك
          </p>
        </motion.div>
      </div>
    </div>
  );
}

