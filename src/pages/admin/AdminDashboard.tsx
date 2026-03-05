import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Check, X, Eye, UserPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

interface Application {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
  status: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  vehicle_color: string | null;
  insurance_provider: string | null;
  created_at: string;
}

interface AdminUser {
  role_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const [tab, setTab] = useState<"applications" | "admins">("applications");
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  useEffect(() => {
    if (!hasRole("admin")) {
      navigate("/");
      return;
    }
    fetchApps();
    fetchAdmins();
  }, [hasRole, navigate]);

  const fetchAdmins = async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("id, user_id, profiles(full_name, email)")
      .eq("role", "admin" as any);
    if (data) {
      setAdmins(data.map((r: any) => ({
        role_id: r.id,
        user_id: r.user_id,
        full_name: r.profiles?.full_name ?? null,
        email: r.profiles?.email ?? null,
      })));
    }
  };

  const addAdmin = async () => {
    if (!adminEmail.trim()) return;
    setAddingAdmin(true);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("email", adminEmail.trim().toLowerCase())
      .maybeSingle();
    if (!profile) {
      toast.error("No user found with that email");
      setAddingAdmin(false);
      return;
    }
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: profile.id, role: "admin" as any });
    if (error) {
      toast.error(error.code === "23505" ? "User is already an admin" : error.message);
    } else {
      toast.success(`${profile.full_name ?? adminEmail} is now an admin`);
      setAdminEmail("");
      fetchAdmins();
    }
    setAddingAdmin(false);
  };

  const removeAdmin = async (roleId: string, targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast.error("You cannot remove yourself");
      return;
    }
    await supabase.from("user_roles").delete().eq("id", roleId);
    fetchAdmins();
    toast.success("Admin access removed");
  };

  const fetchApps = async () => {
    const { data, error } = await supabase
      .from("driver_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error) setApps(data ?? []);
    setLoading(false);
  };

  const openReject = (app: Application) => {
    setRejectTarget(app);
    setRejectReason("");
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }
    await updateStatus(rejectTarget.id, "rejected", rejectReason.trim());
    setRejectTarget(null);
    setSelected(null);
  };

  const updateStatus = async (id: string, status: "approved" | "rejected", reason?: string) => {
    const { error } = await supabase
      .from("driver_applications")
      .update({
        status,
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
        ...(reason && { rejection_reason: reason }),
      })
      .eq("id", id);

    if (error) {
      toast.error("Failed to update: " + error.message);
      return;
    }

    // If approved, add driver role
    if (status === "approved") {
      const app = apps.find((a) => a.id === id);
      if (app) {
        await supabase.from("user_roles").insert({ user_id: app.user_id, role: "driver" as any });
      }
    }

    toast.success(status === "approved" ? "Driver approved!" : "Application rejected");
    setSelected(null);
    fetchApps();
  };

  const filtered = filter === "all" ? apps : apps.filter((a) => a.status === filter);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-green-100 text-green-800",
      rejected: "bg-red-100 text-red-800",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? ""}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="safe-top px-4 pt-3 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Admin Dashboard</h1>
        </div>
        {/* Main tabs */}
        <div className="flex gap-2 mt-3">
          {(["applications", "admins"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              {t === "applications" ? "Driver Applications" : "Admin Users"}
            </button>
          ))}
        </div>
      </div>

      {/* Admin Users tab */}
      {tab === "admins" && (
        <div className="px-4 py-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="User email address"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addAdmin()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={addAdmin}
              disabled={addingAdmin || !adminEmail.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              Add
            </button>
          </div>
          <p className="text-xs text-muted-foreground">The user must already have an account. Enter their email to grant admin access.</p>
          <div className="space-y-2">
            {admins.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No admin users yet</p>
            ) : admins.map((a) => (
              <div key={a.role_id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{a.email ?? a.user_id}</p>
                </div>
                {a.user_id !== user?.id && (
                  <button onClick={() => removeAdmin(a.role_id, a.user_id)} className="p-1.5 text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {a.user_id === user?.id && (
                  <span className="text-xs text-muted-foreground">You</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "applications" && <>
      {/* Filter tabs */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== "all" && ` (${apps.filter((a) => a.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Applications list */}
      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">No applications</p>
        ) : (
          filtered.map((app) => (
            <motion.div
              key={app.id}
              layout
              className="bg-card rounded-xl border border-border p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground text-sm">{app.full_name}</p>
                  <p className="text-xs text-muted-foreground">{app.email}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {app.vehicle_year} {app.vehicle_make} {app.vehicle_model} • {app.vehicle_plate}
                  </p>
                </div>
                {statusBadge(app.status)}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setSelected(app)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium"
                >
                  <Eye className="w-3.5 h-3.5" /> View
                </button>
                {app.status === "pending" && (
                  <>
                    <button
                      onClick={() => updateStatus(app.id, "approved")}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => openReject(app)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      </>}

      {/* Rejection reason modal */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 flex items-end"
            onClick={() => setRejectTarget(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-background rounded-t-2xl p-5 space-y-4"
            >
              <h2 className="text-base font-semibold text-foreground">Reject Application</h2>
              <p className="text-sm text-muted-foreground">{rejectTarget.full_name} — {rejectTarget.vehicle_year} {rejectTarget.vehicle_make} {rejectTarget.vehicle_model}</p>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Reason for rejection</label>
                <textarea
                  className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                  placeholder="e.g. Expired license, incomplete documents..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectTarget(null)}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={!rejectReason.trim()}
                  className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40"
                >
                  Confirm Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-h-[80vh] overflow-y-auto bg-background rounded-t-2xl p-5 space-y-4"
            >
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-foreground">{selected.full_name}</h2>
                {statusBadge(selected.status)}
              </div>

              {[
                { label: "Email", value: selected.email },
                { label: "Phone", value: selected.phone },
                { label: "Vehicle", value: `${selected.vehicle_year} ${selected.vehicle_make} ${selected.vehicle_model}` },
                { label: "Plate", value: selected.vehicle_plate },
                { label: "Color", value: selected.vehicle_color },
                { label: "Category", value: selected.vehicle_type },
                { label: "Insurance", value: selected.insurance_provider },
                { label: "Applied", value: new Date(selected.created_at).toLocaleDateString() },
              ].map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value || "—"}</span>
                </div>
              ))}

              {selected.status === "pending" && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => updateStatus(selected.id, "approved")}
                    className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => openReject(selected)}
                    className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm"
                  >
                    Reject
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
