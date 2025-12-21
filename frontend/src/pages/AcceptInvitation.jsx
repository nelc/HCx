import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LockClosedIcon, 
  EyeIcon, 
  EyeSlashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [invitation, setInvitation] = useState(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const response = await api.get(`/invitations/verify/${token}`);
      setInvitation(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.error || 'رابط الدعوة غير صالح');
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error('كلمات المرور غير متطابقة');
      return;
    }

    setSubmitting(true);
    
    try {
      await api.post('/invitations/accept', {
        token,
        password,
        confirmPassword,
      });
      
      setSuccess(true);
      toast.success('تم تفعيل حسابك بنجاح!');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
      
    } catch (err) {
      const errorMessage = err.response?.data?.error || 
        err.response?.data?.errors?.[0]?.msg || 
        'فشل في قبول الدعوة';
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/80 font-medium">جاري التحقق من الدعوة...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl"
        >
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ExclamationTriangleIcon className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">رابط غير صالح</h2>
          <p className="text-slate-500 mb-6">{error}</p>
          <Link to="/login" className="btn btn-primary inline-block">
            الذهاب لتسجيل الدخول
          </Link>
        </motion.div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-700 to-primary-900 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-xl"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">تم تفعيل حسابك!</h2>
          <p className="text-slate-500 mb-6">
            يمكنك الآن تسجيل الدخول باستخدام بريدك الإلكتروني وكلمة المرور الجديدة.
          </p>
          <p className="text-sm text-slate-400 mb-4">سيتم توجيهك إلى صفحة تسجيل الدخول...</p>
          <Link to="/login" className="btn btn-primary inline-block">
            تسجيل الدخول الآن
          </Link>
        </motion.div>
      </div>
    );
  }

  // Form state
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
            <h2 className="text-3xl font-bold text-slate-800 mb-2">مرحباً {invitation?.name_ar}</h2>
            <p className="text-slate-500">أنشئ كلمة المرور الخاصة بك لتفعيل حسابك</p>
          </div>

          {/* User Info Card */}
          <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
            <p className="text-sm text-slate-500 mb-1">البريد الإلكتروني</p>
            <p className="font-medium text-slate-800" dir="ltr">{invitation?.email}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  placeholder="أدخل كلمة المرور (6 أحرف على الأقل)"
                  dir="ltr"
                  required
                  minLength={6}
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
                  placeholder="أعد إدخال كلمة المرور"
                  dir="ltr"
                  required
                  minLength={6}
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
              {password && confirmPassword && password !== confirmPassword && (
                <p className="mt-2 text-sm text-red-600">كلمات المرور غير متطابقة</p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting || password.length < 6 || password !== confirmPassword}
              className="w-full btn btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>جاري التفعيل...</span>
                </div>
              ) : (
                'تفعيل الحساب'
              )}
            </button>
          </form>

          {/* Login link */}
          <div className="mt-6 text-center">
            <p className="text-slate-500">
              لديك حساب بالفعل؟{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
                تسجيل الدخول
              </Link>
            </p>
          </div>
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
            نظام تقييم الاحتياجات التدريبية
          </h2>
          
          <p className="text-white/70 text-lg">
            مرحباً بك في فريقنا!
          </p>
        </motion.div>
      </div>
    </div>
  );
}
