import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ListsProvider } from './contexts/ListsContext'
import { ToastProvider } from './components/Toast'
import { Layout } from './components/Layout'
import { PageLoader } from './components/Spinner'

// Views
import { LoginView }          from './views/LoginView'
import { ChangePasswordView } from './views/ChangePasswordView'
import { ActivateView }       from './views/ActivateView'
import { DashboardView }      from './views/DashboardView'
import { JobsView }           from './views/JobsView'
import { JobDetailView }      from './views/JobDetailView'
import { InventoryView }      from './views/InventoryView'
import { MissingToolsView }   from './views/MissingToolsView'
import { ToolHistoryView }    from './views/ToolHistoryView'
import { JobHistoryView }     from './views/JobHistoryView'
import { DeliveryTicketsView }  from './views/DeliveryTicketsView'
import { ReceivingTicketsView } from './views/ReceivingTicketsView'
import { UtilizationView }    from './views/UtilizationView'
import { GatePassView }       from './views/GatePassView'
import { InspectionView }     from './views/InspectionView'
import { MaintenanceView }    from './views/MaintenanceView'
import { InvoicesView }       from './views/InvoicesView'
import { ClientsView }        from './views/ClientsView'
import { ContractsView }      from './views/ContractsView'
import { SuppliersView }      from './views/SuppliersView'
import { CategoriesSizesView } from './views/CategoriesSizesView'
import { UsersView }          from './views/UsersView'
import { SettingsView }       from './views/SettingsView'
import { DataImportView }     from './views/DataImportView'

// Dashboards
import { InventoryDashboardView }   from './views/InventoryDashboardView'
import { ToolRevenueView }         from './views/ToolRevenueView'
import { PurchaseOrdersView }      from './views/PurchaseOrdersView'
import { ConsumablesView }         from './views/ConsumablesView'
import { RentalInwardView }        from './views/RentalInwardView'
import { MonthlyExpensesView }     from './views/MonthlyExpensesView'
import { MaintenanceDashboardView } from './views/MaintenanceDashboardView'
import { BillingDashboardView }     from './views/BillingDashboardView'
import { ContractsDashboardView }   from './views/ContractsDashboardView'
import { DbInspectorView }          from './views/DbInspectorView'

// ─── Route guard ─────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <PageLoader />
  if (!user)   return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireRole({
  roles,
  children,
}: {
  roles: string[]
  children: React.ReactNode
}) {
  const { hasRole } = useAuth()
  if (!hasRole(...(roles as any))) return <Navigate to="/" replace />
  return <>{children}</>
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          {/* Inside AuthProvider: /api/lists needs the session token. */}
          <ListsProvider>
          <Routes>
            {/* Public */}
            <Route path="/login"           element={<LoginView />} />
            <Route path="/activate"        element={<ActivateView />} />
            <Route path="/change-password" element={<ChangePasswordView />} />

            {/* Protected */}
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              {/* Dashboard */}
              <Route index element={<DashboardView />} />

              {/* Jobs */}
              <Route path="jobs">
                <Route index  element={<JobsView />} />
                <Route path=":id" element={<JobDetailView />} />
              </Route>

              {/* Inventory */}
              <Route path="inventory-dashboard" element={<InventoryDashboardView />} />
              <Route path="tool-revenue"        element={<ToolRevenueView />} />
              <Route path="po-grn"              element={<PurchaseOrdersView />} />
              <Route path="consumables"         element={<ConsumablesView />} />
              <Route path="sub-rental-inward"   element={<RentalInwardView />} />
              <Route path="sub-rentals"         element={<RentalInwardView />} />
              <Route path="monthly-expenses"    element={<MonthlyExpensesView />} />
              <Route path="inventory" element={<InventoryView />} />
              <Route path="missing-tools" element={<MissingToolsView />} />
              <Route path="tool-history" element={<ToolHistoryView />} />
              <Route path="job-tools-list" element={<JobHistoryView />} />

              {/* Operations */}
              <Route path="delivery-tickets"  element={<DeliveryTicketsView />} />
              <Route path="receiving-tickets" element={<ReceivingTicketsView />} />
              <Route path="utilization"       element={<UtilizationView />} />
              <Route path="gate-pass"         element={<GatePassView />} />

              {/* Technical */}
              <Route path="maintenance-dashboard" element={<MaintenanceDashboardView />} />
              <Route path="inspection"  element={<InspectionView />} />
              <Route path="maintenance" element={<MaintenanceView />} />

              {/* Finance */}
              <Route path="billing-dashboard" element={<BillingDashboardView />} />
              <Route path="invoices" element={<InvoicesView />} />

              {/* Master Data */}
              <Route path="contracts-dashboard" element={<ContractsDashboardView />} />
              <Route path="clients"   element={<ClientsView />} />
              <Route path="contracts" element={<ContractsView />} />
              <Route path="suppliers" element={<SuppliersView />} />
              <Route path="categories" element={<CategoriesSizesView />} />

              {/* Admin */}
              <Route
                path="users"
                element={
                  <RequireRole roles={['Admin']}>
                    <UsersView />
                  </RequireRole>
                }
              />
              <Route
                path="data-import"
                element={
                  <RequireRole roles={['Admin']}>
                    <DataImportView />
                  </RequireRole>
                }
              />
              <Route
                path="db-inspector"
                element={
                  <RequireRole roles={['Admin']}>
                    <DbInspectorView />
                  </RequireRole>
                }
              />
              <Route path="settings" element={<SettingsView />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ListsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
