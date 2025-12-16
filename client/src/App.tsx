import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Landing from "@/pages/Landing";
import AuthPage from "@/pages/AuthPage";
import Home from "@/pages/Home";
import ProjectPage from "@/pages/ProjectPage";
import DocumentPage from "@/pages/DocumentPage";
import CrmPage from "@/pages/CrmPage";
import CrmProjectPage from "@/pages/CrmProjectPage";
import ProjectCreatePage from "@/pages/ProjectCreatePage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import ContactCreatePage from "@/pages/ContactCreatePage";
import DocumentationPage from "@/pages/DocumentationPage";
import CompanyDocumentsPage from "@/pages/CompanyDocumentsPage";
import CompanyDocumentEditorPage from "@/pages/CompanyDocumentEditorPage";
import FileViewerPage from "@/pages/FileViewerPage";
import AdminPage from "@/pages/AdminPage";
import NotFound from "@/pages/not-found";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "13rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 bg-background">
          <main className="flex-1 overflow-auto bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/20"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/auth" component={AuthPage} />
        <Route component={Landing} />
      </Switch>
    );
  }

  return (
    <AuthenticatedLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/crm" component={CrmPage} />
        <Route path="/crm/project/new" component={ProjectCreatePage} />
        <Route path="/crm/project/:id" component={CrmProjectPage} />
        <Route path="/crm/client/new" component={ContactCreatePage} />
        <Route path="/crm/client/:id" component={ClientDetailPage} />
        <Route path="/documentation" component={DocumentationPage} />
        <Route path="/company-documents" component={CompanyDocumentsPage} />
        <Route path="/company-documents/:id/edit" component={CompanyDocumentEditorPage} />
        <Route path="/company-documents/:id/view" component={FileViewerPage} />
        <Route path="/project/:projectId" component={ProjectPage} />
        <Route path="/document/:documentId" component={DocumentPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/admin/create" component={AdminPage} />
        <Route path="/admin/user/:id" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </AuthenticatedLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="docuflow-theme">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
