import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { EnvelopeIcon, ArrowRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('الرجاء إدخال البريد الإلكتروني');
      return;
    }

    setIsLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setIsSubmitted(true);
      toast.success('تم إرسال رابط إعادة تعيين كلمة المرور');
    } catch (error) {
      toast.error(error.response?.data?.error || 'حدث خطأ. يرجى المحاولة مرة أخرى');
    } finally {
      setIsLoading(false);
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
          {/* Back to login */}
          <Link 
            to="/login" 
            className="inline-flex items-center gap-2 text-slate-500 hover:text-primary-600 transition-colors mb-8"
          >
            <ArrowRightIcon className="w-4 h-4" />
            <span>العودة لتسجيل الدخول</span>
          </Link>

          {!isSubmitted ? (
            <>
              {/* Header Text */}
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-slate-800 mb-2">نسيت كلمة المرور؟</h2>
                <p className="text-slate-500">أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور</p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-6">
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

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full btn btn-primary py-4 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>جاري الإرسال...</span>
                    </div>
                  ) : (
                    'إرسال رابط إعادة التعيين'
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
              <h2 className="text-2xl font-bold text-slate-800 mb-4">تم الإرسال بنجاح!</h2>
              <p className="text-slate-500 mb-6">
                إذا كان البريد الإلكتروني مسجلاً لدينا، سيتم إرسال رابط إعادة تعيين كلمة المرور إليه.
                <br />
                يرجى التحقق من بريدك الإلكتروني.
              </p>
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-sm mb-6">
                <strong>ملاحظة:</strong> الرابط صالح لمدة ساعة واحدة فقط
              </div>
              <Link
                to="/login"
                className="btn btn-outline w-full py-3"
              >
                العودة لتسجيل الدخول
              </Link>
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
          {/* Lock Icon */}
          <div className="flex items-center justify-center mx-auto mb-8">
            <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center">
              <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>

          <h2 className="text-3xl font-bold text-white mb-4">
            استعادة الحساب
          </h2>
          <p className="text-white/70 text-lg">
            لا تقلق! سنساعدك في استعادة الوصول إلى حسابك بخطوات بسيطة
          </p>
        </motion.div>
      </div>
    </div>
  );
}

