import axios from 'axios';
import type { OrganizationDashboard, SubOrgDashboard, ApplicationDetail } from '@/types/dashboardTypes';

const API_BASE = 'http://localhost:8001/api';

export const getAllDashboards = async (): Promise<OrganizationDashboard[]> => {
  const res = await axios.get(`${API_BASE}/dashboard`);
  return res.data;
};

export const getSubOrgDashboard = async (subOrgId: string): Promise<SubOrgDashboard> => {
  const res = await axios.get(`${API_BASE}/suborg/${subOrgId}/dashboard`);
  return res.data;
};

export const getAppDashboard = async (appId: string): Promise<ApplicationDetail> => {
  const res = await axios.get(`${API_BASE}/app/${appId}/dashboard`);
  return res.data;
};
