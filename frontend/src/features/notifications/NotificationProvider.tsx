import React from 'react';
import { useToast } from '../../components/common/Toast.jsx';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  openNotificationStream,
} from './api/notificationsApi.js';

const NotificationContext = React.createContext(null);

export function NotificationProvider({ children }) {
  const toast = useToast();
  const [notifications, setNotifications] = React.useState([]);

  React.useEffect(() => {
    getNotifications({ limit: 50 })
      .then(rows => setNotifications(Array.isArray(rows) ? rows : []))
      .catch(() => {});

    const stream = openNotificationStream();
    stream.addEventListener('notification', (event) => {
      try {
        const notification = JSON.parse(event.data);
        setNotifications(prev => {
          if (prev.some(item => item.id === notification.id)) return prev;
          return [notification, ...prev].slice(0, 50);
        });
        toast?.(notification.message || notification.title, 'info', 6000);
      } catch {
        // ignore malformed SSE payloads
      }
    });
    stream.onerror = () => {};
    return () => stream.close();
  }, [toast]);

  const markRead = React.useCallback((id) => {
    setNotifications(prev => prev.map(item => item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString().slice(0, 16) } : item));
    markNotificationRead(id).catch(() => {});
  }, []);

  const markAllRead = React.useCallback(() => {
    const now = new Date().toISOString().slice(0, 16);
    setNotifications(prev => prev.map(item => ({ ...item, readAt: item.readAt || now })));
    markAllNotificationsRead().catch(() => {});
  }, []);

  const value = React.useMemo(() => ({ notifications, markRead, markAllRead }), [notifications, markRead, markAllRead]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return React.useContext(NotificationContext) || { notifications: [], markRead: () => {}, markAllRead: () => {} };
}
