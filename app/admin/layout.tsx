import type { ReactNode } from 'react';
import AdminRahmen from './AdminRahmen';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminRahmen>{children}</AdminRahmen>;
}
