#!/usr/bin/env python3
"""
Exam proctor desktop monitor — Windows, macOS, and Linux (X11).

Runs next to the browser. Reports which application is in the foreground
while the student's exam session is active. When the browser extension is
running it handles browser tabs (exact site names); this monitor then only
reports non-browser apps. If the extension is NOT running, it falls back to
matching browser window titles (e.g. "ChatGPT - Google Chrome").

Linux needs:  sudo apt install xdotool      (Wayland sessions are not supported)
macOS needs:  Screen Recording permission for window titles (app names work without it)
"""
import os
import shutil
import sys
import time
import subprocess
from datetime import datetime, timezone

import psutil
import requests

API = os.environ.get("PROCTOR_API", "http://localhost:3000/api")

AI_KEYWORDS = {
    "chatgpt": "ChatGPT", "claude": "Claude", "gemini": "Gemini",
    "copilot": "Copilot", "perplexity": "Perplexity", "deepseek": "DeepSeek",
}
BROWSER_HINTS = ("chrome", "firefox", "edge", "brave", "opera", "safari", "chromium", "vivaldi")
EXAM_TITLE = "exam portal"          # <title> of exam.html
UNKNOWN = object()                  # "couldn't reach the server" (different from "no session")


# ---------- active window, per platform ----------

def _proc_name(pid):
    try:
        return psutil.Process(pid).name().lower()
    except (psutil.NoSuchProcess, psutil.AccessDenied, ValueError):
        return "unknown"


def _active_windows():
    import win32gui
    import win32process
    hwnd = win32gui.GetForegroundWindow()
    title = win32gui.GetWindowText(hwnd)
    _, pid = win32process.GetWindowThreadProcessId(hwnd)
    return title, _proc_name(pid)


def _active_mac():
    from AppKit import NSWorkspace
    import Quartz
    app = NSWorkspace.sharedWorkspace().frontmostApplication()
    if app is None:
        return "", "unknown"
    pid = app.processIdentifier()
    name = (app.localizedName() or "unknown").lower()
    title = ""
    wins = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID) or []
    for w in wins:                                   # listed front-to-back
        if w.get("kCGWindowOwnerPID") == pid and w.get("kCGWindowLayer") == 0:
            title = w.get("kCGWindowName") or ""     # empty without Screen Recording permission
            if title:
                break
    return title, name


def _xdo(*args):
    try:
        out = subprocess.run(["xdotool", *args], capture_output=True, text=True, timeout=2)
        return out.stdout.strip() if out.returncode == 0 else ""
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return ""


def _active_linux():
    title = _xdo("getactivewindow", "getwindowname")
    pid = _xdo("getactivewindow", "getwindowpid")
    return title, (_proc_name(int(pid)) if pid.isdigit() else "unknown")


if sys.platform == "win32":
    get_active_window = _active_windows
elif sys.platform == "darwin":
    get_active_window = _active_mac
else:
    get_active_window = _active_linux


def platform_limits():
    """Returns (limited, message) so we can warn the student/proctor up front."""
    if sys.platform.startswith("linux"):
        if os.environ.get("XDG_SESSION_TYPE") == "wayland":
            return True, ("Wayland session detected: active-window detection is not available. "
                          "Log out and choose an 'Xorg' session, or rely on the browser extension.")
        if shutil.which("xdotool") is None:
            return True, "xdotool is not installed (sudo apt install xdotool)."
    return False, ""


# ---------- backend calls ----------

def get_session(student_id):
    try:
        r = requests.get(f"{API}/sessions/active/{student_id}", timeout=5)
    except requests.RequestException:
        return UNKNOWN
    return r.json()["sessionId"] if r.ok else None


def heartbeat(session_id, limited):
    """Tell the backend we're alive; returns whether the extension is alive too."""
    try:
        r = requests.post(f"{API}/sessions/{session_id}/heartbeat", timeout=5, json={
            "source": "monitor",
            "info": {"platform": sys.platform, "limited": limited},
        })
        return bool(r.ok and r.json().get("extensionAlive"))
    except requests.RequestException:
        return False


def report(session_id, student_id, vtype, label, title, proc):
    try:
        requests.post(f"{API}/violations", timeout=5, json={
            "sessionId": session_id,
            "studentId": student_id,
            "type": vtype,
            "occurredAt": datetime.now(timezone.utc).isoformat(),
            "details": {"source": "monitor", "activity": label, "windowTitle": title, "process": proc},
        })
    except requests.RequestException as e:
        print("Could not report:", e)


def get_app_label(process_name):
    """Friendly app name for the Live Activity page (no window titles, no site names)."""
    p = process_name.lower().removesuffix(".exe")

    if p == "notepad":
        return "Notepad"
    elif p in ("winword", "microsoft word"):
        return "Microsoft Word"
    elif any(b in p for b in BROWSER_HINTS):      # chrome, firefox, msedge, opera, brave, safari...
        return "Web Browser"
    else:
        return "Other Application"


def log_activity(session_id, student_id, app_label):
    """Adds one row to the activity log (shown on activity.html)."""
    try:
        requests.post(f"{API}/activity", timeout=5, json={
            "sessionId": session_id,
            "studentId": student_id,
            "source": "monitor",
            "category": "BROWSER" if app_label == "Web Browser" else "APP",
            "label": app_label,
            "occurredAt": datetime.now(timezone.utc).isoformat(),
        })
    except requests.RequestException as e:
        print("Could not log activity:", e)


# ---------- classification ----------

def classify(title, proc, extension_alive):
    """Returns (violation_type or None, label, activity_category)."""
    t, p = title.lower(), proc.lower()
    is_browser = any(b in p for b in BROWSER_HINTS)

    if EXAM_TITLE in t or "google forms" in t:
        return None, "Exam", "EXAM"
    if is_browser and extension_alive:
        return None, "Browser (handled by extension)", "BROWSER"

    for key, label in AI_KEYWORDS.items():          # also catches desktop ChatGPT/Claude apps
        if key in t or key in p:
            return "AI_SITE_VISITED", label, "AI_SITE"
    if is_browser:
        return "OTHER_SITE_VISITED", "Web Browser", "BROWSER"
    return "OTHER_APP_OPENED", proc, "APP"


# ---------- main loop ----------

def monitor_session(session_id, student_id, limited):
    print(f"Exam session {session_id} active. Monitoring.")
    previous, previous_app, extension_alive, last_check = None, None, False, 0

    while True:
        now = time.time()
        if now - last_check >= 10:
            last_check = now
            current = get_session(student_id)
            if current is not UNKNOWN and current != session_id:
                print("Session ended.")
                return
            extension_alive = heartbeat(session_id, limited)

        title, proc = get_active_window()
        key = (title, proc)
        if (title or proc != "unknown") and key != previous:
            previous = key
            vtype, label, _category = classify(title, proc, extension_alive)
            print(f"[{label}] {title or '(no title)'}  ({proc})")

            # Activity log: only when the APPLICATION changes (switching between
            # two Chrome tabs stays one "Web Browser" entry, not many).
            app_label = get_app_label(proc)
            if app_label != previous_app:
                previous_app = app_label
                log_activity(session_id, student_id, app_label)

            if vtype:
                report(session_id, student_id, vtype, label, title, proc)
        time.sleep(1)


def main():
    student_id = input("Student ID: ").strip()
    limited, msg = platform_limits()
    if msg:
        print("WARNING:", msg)
    print("Waiting for your exam session to start... (Ctrl+C to quit)")
    try:
        while True:
            sid = get_session(student_id)
            if sid and sid is not UNKNOWN:
                monitor_session(sid, student_id, limited)
            time.sleep(3)
    except KeyboardInterrupt:
        print("\nMonitor stopped.")


if __name__ == "__main__":
    main()
