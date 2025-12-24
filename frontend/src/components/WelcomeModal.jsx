import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SparklesIcon, UserCircleIcon } from '@heroicons/react/24/outline';

export default function WelcomeModal({ isOpen, userName, onClose }) {
  const navigate = useNavigate();

  const handleNavigateToSettings = () => {
    onClose?.();
    navigate('/settings?tab=employee-profile');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div 
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header with gradient */}
              <div className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 p-8 text-center relative overflow-hidden">
                {/* Decorative elements */}
                <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/10 rounded-full translate-x-1/2 translate-y-1/2" />
                
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="relative"
                >
                  <div className="w-20 h-20 bg-white/20 rounded-full mx-auto flex items-center justify-center mb-4">
                    <SparklesIcon className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                    ياهلا ومرحبا .... {userName}
                  </h2>
                  <p className="text-white/90 text-lg font-medium">
                    اسفرت وانورت
                  </p>
                </motion.div>
              </div>

              {/* Content */}
              <div className="p-8 text-center">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  <div className="mb-6">
                    <UserCircleIcon className="w-16 h-16 text-primary-200 mx-auto mb-4" />
                    <p className="text-slate-700 text-lg leading-relaxed">
                      أول خطوة نحتاجها منك إنك تحدّث ملفك الخاص
                    </p>
                    <p className="text-slate-600 mt-2">
                      عشان نقدر نقدم لك توصيات مناسبة لاحتياجاتك.
                    </p>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleNavigateToSettings}
                    className="w-full bg-gradient-to-r from-primary-600 to-primary-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-primary-500/30 hover:shadow-xl hover:shadow-primary-500/40 transition-all duration-300"
                  >
                    اضغط هنا
                  </motion.button>

                  <button
                    onClick={onClose}
                    className="mt-4 text-slate-400 hover:text-slate-600 text-sm transition-colors"
                  >
                    سأقوم بذلك لاحقاً
                  </button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

