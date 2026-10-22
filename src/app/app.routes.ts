import { Routes } from '@angular/router';
import { signedInGuard, signedOutGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    canActivate: [signedOutGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'raise-ticket',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/raise-ticket/raise-ticket.component').then(m => m.RaiseTicketComponent)
  },
  {
    path: 'work-order/:id',
    canActivate: [signedInGuard],
    loadComponent: () => import('./pages/work-order-details/work-order-details.component').then(m => m.WorkOrderDetailsComponent)
  },
  {
    path: '',
    canActivate: [signedInGuard],
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'work-orders', loadComponent: () => import('./pages/work-orders/work-orders.component').then(m => m.WorkOrdersComponent) },
      { path: 'reports', loadComponent: () => import('./pages/reports/reports.component').then(m => m.ReportsComponent) },
      { path: 'reports/work-orders', loadComponent: () => import('./pages/reports/work-order-report.component').then(m => m.WorkOrderReportComponent) }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
