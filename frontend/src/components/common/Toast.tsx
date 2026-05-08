// 에러/성공 토스트 공통 컴포넌트

import React from 'react';
import { Icon } from '../Icon.jsx';

const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);

  const show = React.useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  const dismiss = React.useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon name={t.type === 'error' ? 'alert-circle' : t.type === 'success' ? 'check-circle' : 'info'} size={15}/>
            <span>{t.message}</span>
            <button className="btn icon ghost xs" onClick={() => dismiss(t.id)}>
              <Icon name="x" size={12}/>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return React.useContext(ToastContext);
}
