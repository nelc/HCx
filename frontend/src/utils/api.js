import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// CV Import API helpers
export const uploadCV = async (file) => {
  const formData = new FormData();
  formData.append('cv', file);
  return await api.post('/cv-import/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const confirmCVImport = async (data) => {
  return await api.post('/cv-import/confirm', data);
};

export const getCVImportHistory = async () => {
  return await api.get('/cv-import/history');
};

export const deleteCVImport = async () => {
  return await api.delete('/cv-import/delete');
};

// Users bulk upload API helper
export const uploadUsersCSV = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return await api.post('/users/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Courses CSV upload API helper with progress tracking
export const uploadCoursesCSV = async (file, onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  return await api.post('/courses/upload-csv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      if (onProgress) {
        onProgress({ phase: 'upload', percent: percentCompleted });
      }
    },
  });
};

// Sync all courses to Neo4j
export const syncCoursesToNeo4j = async () => {
  return await api.post('/courses/sync-all');
};

export default api;

