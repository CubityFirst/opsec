import { createBrowserRouter, Navigate, useParams } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RouteErrorPage } from "@/pages/RouteErrorPage";

function RedirectToOverview() {
  const { id } = useParams();
  return <Navigate to={`/contacts/${id}/overview`} replace />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppShell,
    // Lazy chunks that vanished after a deploy, loader failures, render errors.
    ErrorBoundary: RouteErrorPage,
    children: [
      { index: true, lazy: async () => ({ Component: (await import("./pages/DashboardPage")).DashboardPage }) },
      {
        path: "contacts",
        lazy: async () => ({ Component: (await import("./pages/ContactsPage")).ContactsPage }),
        children: [{ path: "new" }],
      },
      {
        path: "contacts/:id",
        lazy: async () => ({ Component: (await import("./pages/ContactDetailPage")).ContactDetailPage }),
        children: [
          { index: true, Component: RedirectToOverview },
          { path: "overview", lazy: async () => ({ Component: (await import("./pages/tabs/OverviewTab")).OverviewTab }) },
          {
            path: "relationships",
            lazy: async () => ({ Component: (await import("./pages/tabs/RelationshipsTab")).RelationshipsTab }),
          },
          { path: "activity", lazy: async () => ({ Component: (await import("./pages/tabs/ActivityTab")).ActivityTab }) },
          { path: "files", lazy: async () => ({ Component: (await import("./pages/tabs/FilesTab")).FilesTab }) },
        ],
      },
      { path: "tags", lazy: async () => ({ Component: (await import("./pages/TagsPage")).TagsPage }) },
      { path: "ask", lazy: async () => ({ Component: (await import("./pages/AskPage")).AskPage }) },
      { path: "account", lazy: async () => ({ Component: (await import("./pages/AccountPage")).AccountPage }) },
      { path: "interactions/:id", lazy: async () => ({ Component: (await import("./pages/InteractionPage")).InteractionPage }) },
      { path: "*", lazy: async () => ({ Component: (await import("./pages/NotFoundPage")).NotFoundPage }) },
    ],
  },
]);
