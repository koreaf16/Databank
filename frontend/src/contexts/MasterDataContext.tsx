/**
 * 파일: frontend/src/contexts/MasterDataContext.tsx
 * 역할: 부서·고객사·서비스마스터 마스터 데이터를 앱 전역에 공급한다.
 *       legacy team/customer/service-master mock 대체.
 *       인증 후 app.tsx에서 <MasterDataProvider>로 감싸면 자동 로드.
 *
 * 연관 파일:
 *   - api/orgCustomerApi.ts       : getDepartments, getCustomers
 *   - api/serviceMasterApi.ts     : listServiceMasters
 *   - contexts/UserContext.tsx    : useUser (deptId로 myDept 도출)
 */

import React from 'react';
import { getDepartments, getCustomers } from '../api/orgCustomerApi.js';
import { listServiceMasters } from '../api/serviceMasterApi.js';

interface MasterDataContextValue {
  departments:    any[];
  customers:      any[];
  serviceMasters: any[];
  groupTags:      string[];
}

const DEFAULT: MasterDataContextValue = {
  departments:    [],
  customers:      [],
  serviceMasters: [],
  groupTags:      [],
};

const MasterDataContext = React.createContext<MasterDataContextValue>(DEFAULT);

export function MasterDataProvider({ children }: { children: React.ReactNode }) {
  const [departments,    setDepartments]    = React.useState<any[]>([]);
  const [customers,      setCustomers]      = React.useState<any[]>([]);
  const [serviceMasters, setServiceMasters] = React.useState<any[]>([]);

  React.useEffect(() => {
    getDepartments().then(r  => setDepartments(Array.isArray(r) ? r : [])).catch(() => {});
    getCustomers().then(r    => setCustomers(Array.isArray(r) ? r.map(normalizeCustomer) : [])).catch(() => {});
    listServiceMasters().then(r => setServiceMasters(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  const groupTags = React.useMemo(
    () => [...new Set<string>(customers.map(c => c.group).filter(Boolean))].sort(),
    [customers],
  );

  return (
    <MasterDataContext.Provider value={{ departments, customers, serviceMasters, groupTags }}>
      {children}
    </MasterDataContext.Provider>
  );
}

function normalizeCustomer(customer: any) {
  const name = customer.customerMain || customer.customerName || customer.name || '';
  return {
    ...customer,
    name,
    customerName: customer.customerName || name,
    initial: customer.initial || name[0] || '?',
    color: customer.color || '#667085',
    group: customer.group || '고객사',
    serviceCount: customer.serviceCount || 0,
  };
}

export function useMasterData(): MasterDataContextValue {
  return React.useContext(MasterDataContext);
}
