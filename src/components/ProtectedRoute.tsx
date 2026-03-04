import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  redirectTo?: string;
  requiredRole?: string;
}

export default function ProtectedRoute({ children, redirectTo = "/", requiredRole }: Props) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to={redirectTo} replace />;

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background gap-3">
        <p className="text-lg font-semibold text-foreground">Access Denied</p>
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
