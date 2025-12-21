import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  DocumentIcon,
  PhotoIcon,
  ArrowUpTrayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function CertificateUploadModal({ 
  isOpen, 
  onClose, 
  courseId, 
  adminCourseId, 
  courseName,
  onSuccess 
}) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

    if (!allowedTypes.includes(selectedFile.type) && !allowedExts.includes(ext)) {
      toast.error('نوع الملف غير مدعوم. يرجى رفع ملف PDF أو صورة (JPG, PNG)');
      return;
    }

    // Validate file size (10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت');
      return;
    }

    setFile(selectedFile);

    // Create preview for images
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleInputChange = (e) => {
    handleFileSelect(e.target.files[0]);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('يرجى اختيار ملف الشهادة');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('certificate', file);
      if (courseId) {
        formData.append('course_id', courseId);
      }
      if (adminCourseId) {
        formData.append('admin_course_id', adminCourseId);
      }

      await api.post('/recommendations/complete-with-certificate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('تم رفع الشهادة بنجاح وتمييز الدورة كمكتملة');
      onSuccess?.();
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'فشل في رفع الشهادة';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setDragOver(false);
    onClose();
  };

  const removeFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = () => {
    if (!file) return DocumentArrowUpIcon;
    if (file.type === 'application/pdf') return DocumentIcon;
    if (file.type.startsWith('image/')) return PhotoIcon;
    return DocumentIcon;
  };

  const FileIcon = getFileIcon();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-primary-700 flex items-center gap-2">
                <CheckCircleIcon className="w-6 h-6 text-success-600" />
                إتمام الدورة
              </h2>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              {courseName ? (
                <>رفع شهادة إتمام لدورة: <strong className="text-slate-700">{courseName}</strong></>
              ) : (
                'رفع شهادة إتمام الدورة'
              )}
            </p>
          </div>

          {/* Upload Area */}
          <div className="p-6 space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleInputChange}
              accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
              className="hidden"
            />

            {!file ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50'
                }`}
              >
                <ArrowUpTrayIcon className={`w-12 h-12 mx-auto mb-3 ${
                  dragOver ? 'text-primary-500' : 'text-slate-400'
                }`} />
                <p className="font-medium text-slate-700 mb-1">
                  اسحب الملف هنا أو اضغط للاختيار
                </p>
                <p className="text-sm text-slate-500">
                  PDF أو صورة (JPG, PNG) - حتى 10 ميجابايت
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div className="flex items-start gap-3">
                  {/* Preview or Icon */}
                  <div className="shrink-0">
                    {preview ? (
                      <img
                        src={preview}
                        alt="Preview"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-primary-100 flex items-center justify-center">
                        <FileIcon className="w-8 h-8 text-primary-600" />
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatFileSize(file.size)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-success-600 bg-success-50 px-2 py-1 rounded-full">
                        <CheckCircleIcon className="w-3 h-3" />
                        جاهز للرفع
                      </span>
                    </div>
                  </div>

                  {/* Remove Button */}
                  <button
                    onClick={removeFile}
                    className="p-2 text-slate-500 hover:text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                    title="إزالة الملف"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Info Note */}
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <p>سيتم تمييز الدورة كمكتملة بعد رفع الشهادة وستظهر للمسؤول في التقارير.</p>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
            <button
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={uploading}
            >
              إلغاء
            </button>
            <button
              onClick={handleUpload}
              className="btn btn-primary"
              disabled={uploading || !file}
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  جاري الرفع...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-5 h-5" />
                  رفع وإتمام الدورة
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

