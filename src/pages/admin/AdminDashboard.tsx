import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, Check, X, Eye, UserPlus, Trash2, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type TabType = "rides" | "applications" | "admins";

interface Ride {
  id: string;
  rider_id: string;
  driver_id: string | null;
  status: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  fare_estimate: number | null;
  final_fare: number | null;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string;
  rider_name?: string;
  driver_name?: string;
}

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
  rejection_reason?: string | null;
}

interface AdminUser {
  role_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface DriverOption {
  id: string;
  full_name: string;
  email: string;
}

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  driver_arriving: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? "bg-secondary text-secondary-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const [tab, setTab] = useState<TabType>("rides");

  // ── Rides state ──────────────────────────────────────────────
  const [rides, setRides] = useState<Ride[]>([]);
  const [ridesLoading, setRidesLoading] = useState(true);
  const [rideFilter, setRideFilter] = useState<string>("active");
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [assignDriverId, setAssignDriverId] = useState("");
  const [showCreateRide, setShowCreateRide] = useState(false);
  const [newRide, setNewRide] = useState({ riderEmail: "", pickup: "", dropoff: "", fare: "" });
  const [creatingRide, setCreatingRide] = useState(false);

  // ── Applications state ───────────────────────────────────────
  const [apps, setApps] = useState<Application[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appFilter, setAppFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ── Admins state ─────────────────────────────────────────────
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [adminEmail, setAdminEmail] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  useEffect(() => {
    if (!hasRole("admin")) { navigate("/"); return; }
    fetchRides();
    fetchDrivers();
    fetchApps();
    fetchAdmins();
  }, [hasRole, navigate]);

  // ── Rides ────────────────────────────────────────────────────
  const fetchRides = async () => {
    setRidesLoading(true);
    const { data } = await supabase
      .from("rides")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) {
      const riderIds = [...new Set(data.map((r: any) => r.rider_id).filter(Boolean))];
      const driverIds = [...new Set(data.map((r: any) => r.driver_id).filter(Boolean))];
      const [riderProfiles, driverProfiles] = await Promise.all([
        riderIds.length ? supabase.from("profiles").select("id,full_name").in("id", riderIds) : { data: [] },
        driverIds.length ? supabase.from("profiles").select("id,full_name").in("id", driverIds) : { data: [] },
      ]);
      const rMap: Record<string, string> = {};
      const dMap: Record<string, string> = {};
      (riderProfiles.data ?? []).forEach((p: any) => { rMap[p.id] = p.full_name; });
      (driverProfiles.data ?? []).forEach((p: any) => { dMap[p.id] = p.full_name; });
      setRides(data.map((r: any) => ({ ...r, rider_name: rMap[r.rider_id] ?? "Unknown", driver_name: r.driver_id ? (dMap[r.driver_id] ?? "Unknown") : null })));
    }
    setRidesLoading(false);
  };

  const fetchDrivers = async () => {
    const { data } = await supabase.from("user_roles").select("user_id, profiles(id, full_name, email)").eq("role", "driver" as any);
    if (data) setDrivers(data.map((r: any) => ({ id: r.user_id, full_name: r.profiles?.full_name ?? "Driver", email: r.profiles?.email ?? "" })));
  };

  const cancelRide = async (rideId: string) => {
    const { error } = await supabase.from("rides").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", rideId);
    if (error) { toast.error(error.message); return; }
    toast.success("Ride cancelled");
    setSelectedRide(null);
    fetchRides();
  };

  const assignDriver = async () => {
    if (!selectedRide || !assignDriverId) return;
    const { error } = await supabase.from("rides").update({ driver_id: assignDriverId, status: "accepted" }).eq("id", selectedRide.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Driver assigned");
    setAssignDriverId("");
    setSelectedRide(null);
    fetchRides();
  };

  const createRide = async () => {
    if (!newRide.riderEmail.trim() || !newRide.pickup.trim() || !newRide.dropoff.trim()) {
      toast.error("Fill in rider email, pickup, and dropoff");
      return;
    }
    setCreatingRide(true);
    const { data: profile } = await supabase.from("profiles").select("id").eq("email", newRide.riderEmail.trim().toLowerCase()).maybeSingle();
    if (!profile) { toast.error("No rider found with that email"); setCreatingRide(false); return; }
    const { error } = await supabase.from("rides").insert({
      rider_id: profile.id,
      status: "requested",
      pickup_address: newRide.pickup.trim(),
      dropoff_address: newRide.dropoff.trim(),
      fare_estimate: newRide.fare ? parseFloat(newRide.fare) : null,
      payment_method: "cash",
    });
    if (error) { toast.error(error.message); } else {
      toast.success("Ride created");
      setShowCreateRide(false);
      setNewRide({ riderEmail: "", pickup: "", dropoff: "", fare: "" });
      fetchRides();
    }
    setCreatingRide(false);
  };

  const activeStatuses = ["requested", "accepted", "driver_arriving", "in_progress"];
  const filteredRides = rideFilter === "active"
    ? rides.filter(r => activeStatuses.includes(r.status))
    : rideFilter === "all" ? rides
    : rides.filter(r => r.status === rideFilter);

  // ── Applications ─────────────────────────────────────────────
  const fetchApps = async () => {
    setAppsLoading(true);
    const { data } = await supabase.from("driver_applications").select("*").order("created_at", { ascending: false });
    if (data) setApps(data ?? []);
    setAppsLoading(false);
  };

  const updateAppStatus = async (id: string, status: "approved" | "rejected", reason?: string) => {
    const { error } = await supabase.from("driver_applications").update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString(), ...(reason && { rejection_reason: reason }) }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (status === "approved") {
      const app = apps.find(a => a.id === id);
      if (app) await supabase.from("user_roles").insert({ user_id: app.user_id, role: "driver" as any });
    }
    toast.success(status === "approved" ? "Driver approved!" : "Application rejected");
    setSelectedApp(null);
    setRejectTarget(null);
    fetchApps();
  };

  const confirmReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) { toast.error("Enter a rejection reason"); return; }
    await updateAppStatus(rejectTarget.id, "rejected", rejectReason.trim());
  };

  const filteredApps = appFilter === "all" ? apps : apps.filter(a => a.status === appFilter);

  // ── Admins ───────────────────────────────────────────────────
  const fetchAdmins = async () => {
    const { data } = await supabase.from("user_roles").select("id, user_id, profiles(full_name, email)").eq("role", "admin" as any);
    if (data) setAdmins(data.map((r: any) => ({ role_id: r.id, user_id: r.user_id, full_name: r.profiles?.full_name ?? null, email: r.profiles?.email ?? null })));
  };

  const addAdmin = async () => {
    if (!adminEmail.trim()) return;
    setAddingAdmin(true);
    const { data: profile } = await supabase.from("profiles").select("id, full_name").eq("email", adminEmail.trim().toLowerCase()).maybeSingle();
    if (!profile) { toast.error("No user found with that email"); setAddingAdmin(false); return; }
    const { error } = await supabase.from("user_roles").insert({ user_id: profile.id, role: "admin" as any });
    if (error) { toast.error(error.code === "23505" ? "Already an admin" : error.message); }
    else { toast.success(`${profile.full_name ?? adminEmail} is now an admin`); setAdminEmail(""); fetchAdmins(); }
    setAddingAdmin(false);
  };

  const removeAdmin = async (roleId: string, targetId: string) => {
    if (targetId === user?.id) { toast.error("Cannot remove yourself"); return; }
    await supabase.from("user_roles").delete().eq("id", roleId);
    fetchAdmins();
    toast.success("Admin access removed");
  };

  const TABS: { key: TabType; label: string }[] = [
    { key: "rides", label: "Rides" },
    { key: "applications", label: "Applications" },
    { key: "admins", label: "Admin Users" },
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Header */}
      <div className="safe-top px-4 pt-3 pb-3 border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate("/")} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Admin Dashboard</h1>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── RIDES TAB ── */}
      {tab === "rides" && (
        <div className="px-4 py-4 space-y-3">
          {/* Controls */}
          <div className="flex gap-2 items-center">
            <div className="flex gap-1.5 overflow-x-auto flex-1">
              {["active", "completed", "cancelled", "all"].map(f => (
                <button key={f} onClick={() => setRideFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${rideFilter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={fetchRides} className="p-2 rounded-xl bg-secondary"><RefreshCw className="w-4 h-4 text-foreground" /></button>
            <button onClick={() => setShowCreateRide(true)} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
          </div>

          {ridesLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filteredRides.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">No rides</p>
          ) : filteredRides.map(ride => (
            <motion.div key={ride.id} layout className="bg-card rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{ride.rider_name}</p>
                  <p className="text-xs text-muted-foreground">{ride.pickup_address ?? "—"} → {ride.dropoff_address ?? "—"}</p>
                  {ride.driver_name && <p className="text-xs text-muted-foreground mt-0.5">Driver: {ride.driver_name}</p>}
                </div>
                <Badge status={ride.status} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(ride.created_at).toLocaleString()}</span>
                <span>{ride.final_fare != null ? `$${ride.final_fare.toFixed(2)}` : ride.fare_estimate != null ? `~$${ride.fare_estimate.toFixed(2)}` : ""}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setSelectedRide(ride); setAssignDriverId(""); }}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium">
                  <Eye className="w-3.5 h-3.5" /> Manage
                </button>
                {!["completed", "cancelled"].includes(ride.status) && (
                  <button onClick={() => cancelRide(ride.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── APPLICATIONS TAB ── */}
      {tab === "applications" && (
        <>
          <div className="flex gap-2 px-4 py-3 overflow-x-auto">
            {(["pending", "approved", "rejected", "all"] as const).map(f => (
              <button key={f} onClick={() => setAppFilter(f)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${appFilter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== "all" && ` (${apps.filter(a => a.status === f).length})`}
              </button>
            ))}
          </div>
          <div className="px-4 pb-6 space-y-3">
            {appsLoading ? (
              <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : filteredApps.length === 0 ? (
              <p className="text-center text-muted-foreground py-12 text-sm">No applications</p>
            ) : filteredApps.map(app => (
              <motion.div key={app.id} layout className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{app.full_name}</p>
                    <p className="text-xs text-muted-foreground">{app.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">{app.vehicle_year} {app.vehicle_make} {app.vehicle_model} • {app.vehicle_plate}</p>
                  </div>
                  <Badge status={app.status} />
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSelectedApp(app)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium">
                    <Eye className="w-3.5 h-3.5" /> View
                  </button>
                  {app.status === "pending" && (
                    <>
                      <button onClick={() => updateAppStatus(app.id, "approved")} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium">
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button onClick={() => { setRejectTarget(app); setRejectReason(""); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium">
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ── ADMINS TAB ── */}
      {tab === "admins" && (
        <div className="px-4 py-4 space-y-4">
          <div className="flex gap-2">
            <input type="email" placeholder="User email address" value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && addAdmin()}
              className="flex-1 px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <button onClick={addAdmin} disabled={addingAdmin || !adminEmail.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              <UserPlus className="w-4 h-4" /> Add
            </button>
          </div>
          <p className="text-xs text-muted-foreground">User must have an existing account. Enter their email to grant admin-only access.</p>
          <div className="space-y-2">
            {admins.map(a => (
              <div key={a.role_id} className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{a.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{a.email ?? a.user_id}</p>
                </div>
                {a.user_id === user?.id
                  ? <span className="text-xs text-muted-foreground">You</span>
                  : <button onClick={() => removeAdmin(a.role_id, a.user_id)} className="p-1.5 text-destructive"><Trash2 className="w-4 h-4" /></button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODALS ── */}

      {/* Ride detail / assign modal */}
      <AnimatePresence>
        {selectedRide && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setSelectedRide(null)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              onClick={e => e.stopPropagation()}
              className="w-full max-h-[85vh] overflow-y-auto bg-background rounded-t-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-semibold text-foreground">Ride Details</h2>
                <Badge status={selectedRide.status} />
              </div>
              {[
                { label: "Rider", value: selectedRide.rider_name },
                { label: "Driver", value: selectedRide.driver_name ?? "Unassigned" },
                { label: "Pickup", value: selectedRide.pickup_address },
                { label: "Dropoff", value: selectedRide.dropoff_address },
                { label: "Fare", value: selectedRide.final_fare != null ? `$${selectedRide.final_fare.toFixed(2)}` : selectedRide.fare_estimate != null ? `~$${selectedRide.fare_estimate.toFixed(2)}` : null },
                { label: "Payment", value: `${selectedRide.payment_method ?? "—"} · ${selectedRide.payment_status ?? "—"}` },
                { label: "Created", value: new Date(selectedRide.created_at).toLocaleString() },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value || "—"}</span>
                </div>
              ))}

              {!["completed", "cancelled"].includes(selectedRide.status) && (
                <>
                  <div className="border-t border-border pt-3">
                    <p className="text-sm font-medium text-foreground mb-2">Assign Driver</p>
                    <div className="flex gap-2">
                      <select value={assignDriverId} onChange={e => setAssignDriverId(e.target.value)}
                        className="flex-1 px-3 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground focus:outline-none">
                        <option value="">Select driver…</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.email})</option>)}
                      </select>
                      <button onClick={assignDriver} disabled={!assignDriverId}
                        className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                        Assign
                      </button>
                    </div>
                  </div>
                  <button onClick={() => cancelRide(selectedRide.id)}
                    className="w-full py-3 rounded-xl border border-destructive/40 text-destructive text-sm font-semibold">
                    Cancel This Ride
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create ride modal */}
      <AnimatePresence>
        {showCreateRide && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setShowCreateRide(false)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-background rounded-t-2xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-foreground">Create Ride</h2>
              {[
                { key: "riderEmail", placeholder: "Rider email", type: "email" },
                { key: "pickup", placeholder: "Pickup address", type: "text" },
                { key: "dropoff", placeholder: "Dropoff address", type: "text" },
                { key: "fare", placeholder: "Fare estimate (optional)", type: "number" },
              ].map(f => (
                <input key={f.key} type={f.type} placeholder={f.placeholder}
                  value={(newRide as any)[f.key]}
                  onChange={e => setNewRide(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" />
              ))}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCreateRide(false)}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-foreground">Cancel</button>
                <button onClick={createRide} disabled={creatingRide}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  {creatingRide ? "Creating…" : "Create Ride"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* App detail modal */}
      <AnimatePresence>
        {selectedApp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-end" onClick={() => setSelectedApp(null)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              onClick={e => e.stopPropagation()}
              className="w-full max-h-[80vh] overflow-y-auto bg-background rounded-t-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-foreground">{selectedApp.full_name}</h2>
                <Badge status={selectedApp.status} />
              </div>
              {[
                { label: "Email", value: selectedApp.email },
                { label: "Phone", value: selectedApp.phone },
                { label: "Vehicle", value: `${selectedApp.vehicle_year} ${selectedApp.vehicle_make} ${selectedApp.vehicle_model}` },
                { label: "Plate", value: selectedApp.vehicle_plate },
                { label: "Color", value: selectedApp.vehicle_color },
                { label: "Category", value: selectedApp.vehicle_type },
                { label: "Insurance", value: selectedApp.insurance_provider },
                { label: "Applied", value: new Date(selectedApp.created_at).toLocaleDateString() },
              ].map(item => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground font-medium">{item.value || "—"}</span>
                </div>
              ))}
              {selectedApp.status === "pending" && (
                <div className="flex gap-3 pt-2">
                  <button onClick={() => updateAppStatus(selectedApp.id, "approved")}
                    className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold text-sm">Approve</button>
                  <button onClick={() => { setRejectTarget(selectedApp); setRejectReason(""); setSelectedApp(null); }}
                    className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm">Reject</button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject reason modal */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setRejectTarget(null)}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              onClick={e => e.stopPropagation()}
              className="w-full bg-background rounded-t-2xl p-5 space-y-4">
              <h2 className="text-base font-semibold text-foreground">Reject Application</h2>
              <p className="text-sm text-muted-foreground">{rejectTarget.full_name}</p>
              <textarea className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                rows={3} placeholder="Reason for rejection…" value={rejectReason}
                onChange={e => setRejectReason(e.target.value)} autoFocus />
              <div className="flex gap-3">
                <button onClick={() => setRejectTarget(null)} className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold text-foreground">Cancel</button>
                <button onClick={confirmReject} disabled={!rejectReason.trim()}
                  className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40">Confirm Reject</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
