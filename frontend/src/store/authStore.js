import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../utils/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/1abd0113-6066-4d0a-a448-83f881edb18c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authStore.js:login-start',message:'Frontend login initiated',data:{email,browserUrl:window.location.href,apiBaseUrl:api.defaults.baseURL,existingToken:!!localStorage.getItem('token')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F,G,H'})}).catch(()=>{});
        // #endregion
        try {
          const response = await api.post('/auth/login', { email, password });
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/1abd0113-6066-4d0a-a448-83f881edb18c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authStore.js:login-success',message:'Login API call succeeded',data:{hasToken:!!response.data.token,hasUser:!!response.data.user},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B'})}).catch(()=>{});
          // #endregion
          const { token, user } = response.data;
          
          localStorage.setItem('token', token);
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          
          set({ 
            user, 
            token, 
            isAuthenticated: true, 
            isLoading: false 
          });
          
          return { success: true };
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7244/ingest/1abd0113-6066-4d0a-a448-83f881edb18c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'authStore.js:login-error',message:'Login API call failed',data:{status:error.response?.status,errorMsg:error.response?.data?.error,networkError:error.message,errorCode:error.code,requestUrl:error.config?.url,requestBaseUrl:error.config?.baseURL,hasResponse:!!error.response,isAxiosError:error.isAxiosError},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F,G,H,I'})}).catch(()=>{});
          // #endregion
          const message = error.response?.data?.error || 'فشل تسجيل الدخول';
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
        set({ 
          user: null, 
          token: null, 
          isAuthenticated: false, 
          error: null 
        });
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          set({ isAuthenticated: false, user: null });
          return false;
        }

        try {
          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
          const response = await api.get('/auth/me');
          set({ 
            user: response.data, 
            token, 
            isAuthenticated: true 
          });
          return true;
        } catch (error) {
          localStorage.removeItem('token');
          delete api.defaults.headers.common['Authorization'];
          set({ 
            user: null, 
            token: null, 
            isAuthenticated: false 
          });
          return false;
        }
      },

      updateUser: (userData) => {
        set({ user: { ...get().user, ...userData } });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'hrx-auth',
      partialize: (state) => ({ 
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);

export default useAuthStore;

