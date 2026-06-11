import React, { useState } from "react";
import { AlertTriangle, Clock, Mail, ShieldAlert, ShieldCheck, FolderOpen, Copy, X } from "lucide-react";
import { Notification, Project } from "../types";

interface NotificationListProps {
  notifications: Notification[];
  projects: Project[];
  onViewProject: (projectId: string) => void;
}

const DEFAULT_EXPIRED_TEMPLATE = `Dear [Subcontractor Name],

This is to notify you that your Certificate of Insurance (COI) for [Project Name] has expired or is about to expire. Please submit a renewed COI as soon as possible to ensure project compliance and avoid payment delays.

Thank you,
Project Management Team`;

const DEFAULT_INSUFFICIENT_TEMPLATE = `Dear [Subcontractor Name],

We have reviewed your Certificate of Insurance (COI) uploaded for [Project Name]. Our verification indicates that some of your coverage limits do not meet the minimum contract requirements. Please contact your insurance agent to obtain an endorsement or an updated COI satisfying the required limits.

Thank you,
Project Management Team`;

export default function NotificationList({ notifications, projects, onViewProject }: NotificationListProps) {
  const [selectedNotifForDraft, setSelectedNotifForDraft] = useState<Notification | null>(null);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " - " + date.toLocaleDateString();
    } catch {
      return "Just now";
    }
  };

  const getDraftText = (notif: Notification) => {
    const project = projects.find((p) => p.id === notif.project_id);
    const expiredTpl = project?.email_templates?.expired_template ?? DEFAULT_EXPIRED_TEMPLATE;
    const insufficientTpl = project?.email_templates?.insufficient_template ?? DEFAULT_INSUFFICIENT_TEMPLATE;

    const template = notif.type === "danger" ? expiredTpl : insufficientTpl;

    return template
      .replace(/\[Project Name\]/g, notif.project_name)
      .replace(/\[Subcontractor Name\]/g, notif.subcontractor_name);
  };

  // Only display unresolved notifications!
  const unresolvedNotifs = notifications.filter((notif) => notif.resolved !== true);

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

      {unresolvedNotifs.length === 0 ? (
        <div id="notifications-empty" className="flex flex-col items-center justify-center py-10 text-slate-400 space-y-2 flex-grow">
          <ShieldCheck className="h-7 w-7 text-slate-300" />
          <p className="text-xs">All key assets perfectly compliant. No alerts generated.</p>
        </div>
      ) : (
        <div id="notifications-timeline" className="flex-grow overflow-y-auto mt-3 pr-0.5 space-y-3 max-h-[460px]">
          {unresolvedNotifs.map((notif, index) => {
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

                  {/* Responsive text action links */}
                  <div className="mt-2 text-[10px] text-blue-700 font-medium p-1 rounded border border-blue-100/50 bg-blue-50/20 flex flex-wrap gap-x-4 gap-y-1 items-center">
                    <button
                      onClick={() => onViewProject(notif.project_id)}
                      className="inline-flex items-center space-x-1 font-bold text-blue-600 hover:text-blue-800 cursor-pointer transition-colors"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>📁 View Project</span>
                    </button>
                    {(isDanger || isWarning) && (
                      <button
                        onClick={() => setSelectedNotifForDraft(notif)}
                        className="inline-flex items-center space-x-1 font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer transition-colors"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        <span>📋 View Email Draft</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Email Draft Modal Popup Dialog Box */}
      {selectedNotifForDraft && (
        <div id="email-draft-modal-backdrop" className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-55 flex items-center justify-center p-4">
          <div id="email-draft-modal-card" className="w-full max-w-lg bg-white border border-slate-200 rounded-lg shadow-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 font-display tracking-tight uppercase">
                📋 Compliance Email Draft
              </span>
              <button
                onClick={() => setSelectedNotifForDraft(null)}
                className="p-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-950 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Recipient Address
                </span>
                <p className="text-xs font-mono bg-slate-50 p-2 rounded border border-slate-100 text-slate-700">
                  contact@{selectedNotifForDraft.subcontractor_name.toLowerCase().replace(/\s+/g, "")}.com
                </p>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Draft Subject
                </span>
                <p className="text-xs font-semibold bg-slate-50 p-2 rounded border border-slate-100 text-slate-800">
                  {selectedNotifForDraft.type === "danger"
                    ? `URGENT compliance warning: policy expired - ${selectedNotifForDraft.project_name}`
                    : `Insurance limit shortfall notification - ${selectedNotifForDraft.project_name}`
                  }
                </p>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Draft Message Body
                </span>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-md text-xs text-slate-800 font-sans whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {getDraftText(selectedNotifForDraft)}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
              <button
                onClick={() => setSelectedNotifForDraft(null)}
                className="px-3.5 py-1.5 bg-white text-slate-700 rounded-md font-bold text-[11px] hover:bg-slate-100 transition-colors border border-slate-200 shadow-xs cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(getDraftText(selectedNotifForDraft));
                    alert("Draft copied to clipboard!");
                  } catch (e) {
                    alert("Unable to copy to clipboard.");
                  }
                }}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[11px] hover:shadow-xs transition-colors uppercase tracking-wide cursor-pointer flex items-center space-x-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy to Clipboard</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
