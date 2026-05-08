import { apiGet, apiPost, apiPatch, apiDelete } from '../shared/api/apiClient.js';

export async function getDepartments(includeDisabled = false) {
  const query = includeDisabled ? { includeDisabled: '1' } : undefined;
  return await apiGet('/api/org/departments', query);
}

export async function createDepartment(payload) {
  return await apiPost('/api/org/departments', payload);
}

export async function updateDepartment(id, payload) {
  return await apiPatch(`/api/org/departments/${id}`, payload);
}

export async function deleteDepartment(id) {
  return await apiDelete(`/api/org/departments/${id}`);
}

export async function getUsers(params: any = {}) {
  const query: any = {};
  if (params.includeDisabled) query.includeDisabled = '1';
  if (params.deptId != null && params.deptId !== '') query.deptId = String(params.deptId);
  return await apiGet('/api/org/users', query);
}

export async function createUser(payload) {
  return await apiPost('/api/org/users', payload);
}

export async function updateUser(id, payload) {
  return await apiPatch(`/api/org/users/${id}`, payload);
}

export async function deleteUser(id) {
  return await apiDelete(`/api/org/users/${id}`);
}

export async function getCustomers(params: any = false) {
  const options = typeof params === 'boolean' ? { includeDisabled: params } : (params || {});
  const query: Record<string, string> = {};
  if (options.includeDisabled) query.includeDisabled = '1';
  if (options.q) query.q = String(options.q);
  if (options.limit != null) query.limit = String(options.limit);
  if (options.assignedTo != null) query.assignedTo = String(options.assignedTo);
  if (options.assignedUserId != null) query.assignedTo = String(options.assignedUserId);
  return await apiGet('/api/customers', query);
}

export async function createCustomer(payload) {
  return await apiPost('/api/customers', payload);
}

export async function updateCustomer(id, payload) {
  return await apiPatch(`/api/customers/${id}`, payload);
}

export async function deleteCustomer(id) {
  return await apiDelete(`/api/customers/${id}`);
}

