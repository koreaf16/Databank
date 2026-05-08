/**
 * 파일: frontend/src/contexts/UserContext.tsx
 * 역할: 로그인 사용자 정보를 앱 전역에 공급한다.
 *       legacy user mock을 대체.
 *       me.initial / me.color / me.dept 는 API 응답 필드에서 파생.
 *
 * 연관 파일:
 *   - api/userApi.ts         : getMe()
 *   - app.tsx                : <UserProvider me={currentUser}>
 *   - components/TopBar.tsx  : useUser()
 *   - components/Workspace   : useUser()
 */

import React from 'react';

const USER_COLORS = ['#5b8eff', '#7c5cff', '#e4477a', '#28b67e', '#f59e0b', '#ef4444', '#0ea5e9'];

function deriveColor(id: number): string {
  return USER_COLORS[Math.abs(id || 0) % USER_COLORS.length];
}

export interface AppUser {
  id: number;
  username: string;
  name: string;
  email: string;
  position: string;
  deptId: number;
  department: string;
  rbacRoleId: string | null;
  rbacRoleLabel: string | null;
  rbacRoleColor: string | null;
  // 파생 필드
  initial: string;
  color: string;
  dept: string;
  role: string;
}

interface UserContextValue {
  me: AppUser | null;
}

const UserContext = React.createContext<UserContextValue>({ me: null });

export function UserProvider({ me: rawUser, children }: { me: any | null; children: React.ReactNode }) {
  const me: AppUser | null = rawUser
    ? {
        ...rawUser,
        initial: (rawUser.name || '?')[0].toUpperCase(),
        color:   deriveColor(rawUser.id),
        dept:    rawUser.department || '',
        role:    rawUser.rbacRoleLabel
          ? (rawUser.rbacRoleLabel.includes('팀장') || rawUser.rbacRoleLabel.includes('부서장') ? 'manager'
             : rawUser.rbacRoleLabel.includes('관리') ? 'admin'
             : 'engineer')
          : 'engineer',
      }
    : null;

  return (
    <UserContext.Provider value={{ me }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): AppUser | null {
  return React.useContext(UserContext).me;
}
