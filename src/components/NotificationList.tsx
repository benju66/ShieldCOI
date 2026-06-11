import { AlertTriangle, Clock, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import { Notification } from "../types";

interface NotificationListProps {
  notifications: Notification[];
}

export default function NotificationList({ notifications }: NotificationListProps) {
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " - " + date.toLocaleDateString();
    } catch {
      return "Just now";
    }
  };

  return (
    <div id="notifications-box" className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs flex flex-col h-full">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
        <div>
          <h3 id="notifications-title" className="text-xs font-bold text-slate-905 font-display tracking-tight">
            Compliance Alerts & Logs timeline
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Timeline of certificate alerts, breaches & automated dispatch queue
          </p>
        </div>
        <span className="text-[10px] bg-slate-50 text-slate-500 font-semibold px-2 py-0.5 rounded border border-slate-200 shadow-xs">
          Real-time
        </span>
      </div>

      {notifications.length === 0 ? (
        <div id="notifications-empty" className="flex flex-col items-center justify-center py-10 text-slate-400 space-y-2 flex-grow">
          <ShieldCheck className="h-7 w-7 text-slate-300" />
          <p className="text-xs">All key assets perfectly compliant. No alerts generated.</p>
        </div>
      ) : (
        <div id="notifications-timeline" className="flex-grow overflow-y-auto mt-3 pr-0.5 space-y-3 max-h-[460px]">
          {notifications.map((notif, index) => {
            const isDanger = notif.type === "danger";
            const isWarning = notif.type === "warning";

            return (
              <div
                key={notif.id || index}
                id={`notif-item-${notif.id || index}`}
                className={`p-3 rounded-md border flex items-start space-x-2.5 transition-all ${
                  isDanger
                    ? "bg-red-50/70 border-red-200/80 hover:bg-red-50 text-slate-800"
                    : isWarning
                    ? "bg-amber-50/70 border-amber-200/80 hover:bg-amber-50 text-slate-800"
                    : "bg-slate-50 border-slate-200 hover:bg-slate-100/50 text-slate-800"
                }`}
              >
                {/* Icon mapping */}
                <div className="flex-shrink-0 mt-0.5">
                  {isDanger ? (
                    <div className="p-1 rounded bg-red-100 text-red-700 border border-red-200">
                      <ShieldAlert className="h-3.5 w-3.5" />
                    </div>
                  ) : isWarning ? (
                    <div className="p-1 rounded bg-amber-100 text-amber-700 border border-amber-200">
                      <AlertTriangle className="h-3.5 w-3.5" />
                    </div>
                  ) : (
                    <div className="p-1 rounded bg-slate-200/80 text-slate-600">
                      <Clock className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>

                {/* Text Content */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">
                      {notif.project_name}
                    </span>
                    <span className="text-[9px] font-mono text-slate-450 text-slate-400">
                      {formatTime(notif.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 font-semibold leading-relaxed">
                    {notif.message}
                  </p>

                  {/* Attachment automated warning block */}
                  {(isDanger || isWarning) && (
                    <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center space-x-1.5 text-[10px] text-blue-700 font-medium bg-blue-50/40 p-1 rounded border border-blue-100">
                      <Mail className="h-3 w-3 text-blue-600" />
                      <span>
                        Draft ready for{" "}
                        <strong className="text-blue-800 font-bold">
                          contact@{notif.subcontractor_name.toLowerCase().replace(/\s+/g, "")}.com
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
