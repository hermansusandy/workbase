"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type View =
  | "dashboard"
  | "dictionary"
  | "articles"
  | "records"
  | "agenda"
  | "notes"
  | "reminders"
  | "users"
  | "history";
type VersionEntry = {
  id: number;
  entity: string;
  title: string;
  action: "Created" | "Edited" | "Deleted";
  detail: string;
  timestamp: string;
};
type Term = {
  id: number;
  category: string;
  english: string;
  indo: string;
  mandarin: string;
  pinyin: string;
  explanation: string;
  updated: string;
  status: "Published" | "Draft";
};
type Meeting = {
  id: number;
  title: string;
  project: string;
  date: string;
  time: string;
  location: string;
  participants: string;
  summary: string;
  followUp: string;
  topics: string[];
  resources: MeetingResource[];
  status: "Draft" | "Completed";
};
type MeetingResource = {
  id: string;
  name: string;
  url: string;
  kind: "link" | "file";
  size?: number;
  mimeType?: string;
};
type WorkMemo = {
  id: number;
  title: string;
  project: string;
  date: string;
  location: string;
  summary: string;
  details: string;
  followUp: string;
  status: "Draft" | "Completed";
  resources: MeetingResource[];
};

function canPreviewImage(resource: MeetingResource) {
  return (
    resource.mimeType?.startsWith("image/") ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)(\?.*)?$/i.test(resource.url) ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(resource.name)
  );
}

async function downloadMeetingResource(resource: MeetingResource) {
  const fallbackName =
    resource.name.split("/").pop()?.split("?")[0] || "meeting-resource";
  try {
    const response = await fetch(resource.url);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch {
    const link = document.createElement("a");
    link.href = resource.url;
    link.download = fallbackName;
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}
function fileToMeetingResource(
  file: File,
  index: number,
  prefix: string,
): Promise<MeetingResource> {
  const base: Omit<MeetingResource, "url"> = {
    id: `${prefix}-${Date.now()}-${index}`,
    name: file.name,
    kind: "file",
    size: file.size,
    mimeType: file.type,
  };
  if (!file.type.startsWith("image/")) {
    return Promise.resolve({ ...base, url: URL.createObjectURL(file) });
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ ...base, url: String(reader.result) });
    reader.onerror = () => resolve({ ...base, url: URL.createObjectURL(file) });
    reader.readAsDataURL(file);
  });
}
type AgendaItem = {
  id: number;
  title: string;
  date: string;
  endDate: string;
  time: string;
  endTime: string;
  location: string;
  category: string;
  notes: string;
  reminder: boolean;
  reminderMinutes: number;
  reminderMode: "once" | "recurring";
  reminderFrequency: "daily" | "weekly";
  reminderStartDate: string;
  reminderEndDate: string;
  completed: boolean;
};

function agendaDateRange(item: AgendaItem) {
  const endDate = item.endDate || item.date;
  return endDate === item.date ? item.date : `${item.date} → ${endDate}`;
}

function reminderLabel(item: AgendaItem) {
  if (!item.reminder) return "Off";
  if (item.reminderMode === "recurring") {
    const frequency = item.reminderFrequency === "weekly" ? "mingguan" : "harian";
    return `${frequency} · ${item.reminderStartDate || item.date}–${item.reminderEndDate || item.endDate || item.date}`;
  }
  return `${item.reminderMinutes} menit sebelum`;
}
type QuickNote = {
  id: number;
  title: string;
  content: string;
  tag: string;
  pinned: boolean;
  updated: string;
};
type WorkspaceSettings = {
  emailNotifications: boolean;
  reminderNotifications: boolean;
  compactRecords: boolean;
};

type ExportBlock = { heading?: string; body: string };
type ExportPage = {
  title: string;
  subtitle?: string;
  blocks: ExportBlock[];
  images?: { src: string; name: string }[];
};

function safeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeRichHtml(value: string) {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  template.content
    .querySelectorAll("script, iframe, object, embed, style, link, meta")
    .forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    Array.from(node.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const unsafeUrl = /^(javascript|vbscript):/i.test(attribute.value.trim());
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "src") && unsafeUrl)
      ) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML;
}

function exportFileName(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workbase-document"
  );
}

function exportMarkup(title: string, pages: ExportPage[]) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeHtml(title)}</title><style>
    @page{size:A4;margin:16mm}
    *{box-sizing:border-box}
    body{font-family:Arial,sans-serif;color:#17231e;line-height:1.42;margin:0}
    .export-page{min-height:250mm;position:relative;padding-bottom:16mm}
    .document-label{font-size:6.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7d75;margin:0 0 5px}
    .page-title{font-family:Georgia,serif;font-size:10pt;line-height:1.25;color:#174f3c;border-bottom:1.5px solid #174f3c;padding-bottom:7px;margin:0}
    .page-subtitle{color:#60746b;margin:5px 0 10px;font-size:7pt}
    .content-block{margin:0;padding:7px 0;page-break-inside:avoid;break-inside:avoid;border-top:1px solid #cfdad5}
    .content-block:first-of-type{border-top:0}
    .content-block h2{font-size:6.5pt;text-transform:uppercase;letter-spacing:.07em;color:#496158;margin:0 0 3px}
    .content-block p{font-size:8pt;line-height:1.38;white-space:pre-wrap;margin:0}
    .export-images{border-top:1px solid #cfdad5;padding-top:7px;page-break-inside:avoid;break-inside:avoid}
    .export-image{display:block;max-width:100%;width:auto;height:auto;max-height:150mm;margin:0 auto 8px;border:1px solid #cfdad5;border-radius:3px;object-fit:contain}
    @media screen{body{background:#eef2f0;padding:24px}.export-page{background:white;max-width:210mm;margin:0 auto 24px;padding:16mm;box-shadow:0 4px 18px #18352a18}}
  </style></head><body>${pages.map((page, index) => `${index > 0 ? '<br clear="all" style="mso-special-character:line-break;page-break-before:always;break-before:page">' : ""}<article class="export-page"><p class="document-label" style="font-size:6.5pt;margin:0 0 5pt">${safeHtml(title)}</p><h1 class="page-title" style="font-family:Georgia,serif;font-size:10pt;mso-bidi-font-size:10pt;line-height:12.5pt;margin:0;padding-bottom:7pt;border-bottom:1.5pt solid #174f3c">${safeHtml(page.title)}</h1>${page.subtitle ? `<p class="page-subtitle" style="font-size:7pt;line-height:9pt;margin:5pt 0 10pt">${safeHtml(page.subtitle)}</p>` : ""}${page.blocks.map((block) => `<section class="content-block" style="margin:0;padding:7pt 0;border-top:1pt solid #cfdad5;page-break-inside:avoid;mso-break-inside:avoid">${block.heading ? `<h2 style="font-family:Arial,sans-serif;font-size:6.5pt;mso-bidi-font-size:6.5pt;line-height:8pt;margin:0 0 3pt">${safeHtml(block.heading)}</h2>` : ""}<p style="font-family:Arial,sans-serif;font-size:8pt;mso-bidi-font-size:8pt;line-height:11pt;margin:0;white-space:pre-wrap">${safeHtml(block.body)}</p></section>`).join("")}${page.images?.length ? `<section class="export-images" style="border-top:1pt solid #cfdad5;padding-top:7pt;page-break-inside:avoid">${page.images.map((image) => `<img class="export-image" src="${safeHtml(image.src)}" alt="${safeHtml(image.name)}" style="display:block;max-width:100%;width:auto;height:auto;max-height:150mm;margin:0 auto 8pt;border:1pt solid #cfdad5;object-fit:contain">`).join("")}</section>` : ""}</article>`).join("")}</body></html>`;
}

function exportWord(title: string, pages: ExportPage[]) {
  const blob = new Blob([exportMarkup(title, pages)], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${exportFileName(title)}.doc`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPdf(title: string, pages: ExportPage[]) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(exportMarkup(title, pages));
  doc.close();
  const printDocument = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  const images = Array.from(doc.images);
  if (!images.length || images.every((image) => image.complete)) {
    setTimeout(printDocument, 250);
  } else {
    Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          }),
      ),
    ).then(() => setTimeout(printDocument, 100));
  }
}

function termPage(term: Term): ExportPage {
  return {
    title: term.english,
    subtitle: `${term.category} · ${term.status}`,
    blocks: [
      { heading: "English", body: term.english },
      { heading: "Indonesia", body: term.indo },
      { heading: "Mandarin", body: `${term.mandarin} (${term.pinyin})` },
      { heading: "Penjelasan", body: term.explanation },
    ],
  };
}

function meetingPages(meeting: Meeting): ExportPage[] {
  const topics = meeting.topics.filter(Boolean);
  return (topics.length ? topics : ["General meeting notes"]).map(
    (topic, index) =>
      meetingTopicPage(meeting, topic, index, Math.max(topics.length, 1)),
  );
}

function meetingTopicPage(
  meeting: Meeting,
  topic: string,
  index: number,
  total = meeting.topics.filter(Boolean).length || 1,
): ExportPage {
  return {
    title: topic,
    subtitle: `${meeting.title} · Topic ${index + 1} of ${total}`,
    blocks: [
      { heading: "Project", body: meeting.project },
      {
        heading: "Date & time",
        body: `${meeting.date} · ${meeting.time} WIB`,
      },
      { heading: "Location", body: meeting.location },
      { heading: "Participants", body: meeting.participants },
      { heading: "Summary", body: meeting.summary },
      { heading: "Follow up", body: meeting.followUp },
      ...(meeting.resources.some((resource) => !canPreviewImage(resource))
        ? [
            {
              heading: "Resources",
              body: meeting.resources
                .filter((resource) => !canPreviewImage(resource))
                .map((resource) =>
                  resource.kind === "link" ? resource.url : resource.name,
                )
                .join("\n"),
            },
          ]
        : []),
    ],
    images: meeting.resources
      .filter(canPreviewImage)
      .map((resource) => ({ src: resource.url, name: resource.name })),
  };
}

function workMemoPage(memo: WorkMemo, label: string): ExportPage {
  return {
    title: memo.title,
    subtitle: `${label} · ${memo.project} · ${memo.date}`,
    blocks: [
      { heading: "Location", body: memo.location },
      { heading: "Summary", body: memo.summary },
      { heading: "Details", body: memo.details },
      { heading: "Follow up", body: memo.followUp },
      ...(memo.resources.some((resource) => !canPreviewImage(resource))
        ? [
            {
              heading: "Resources",
              body: memo.resources
                .filter((resource) => !canPreviewImage(resource))
                .map((resource) => resource.name)
                .join("\n"),
            },
          ]
        : []),
    ],
    images: memo.resources
      .filter(canPreviewImage)
      .map((resource) => ({ src: resource.url, name: resource.name })),
  };
}

const initialTerms: Term[] = [
  {
    id: 1,
    category: "Mining · Coal",
    english: "Coring",
    indo: "Coring",
    mandarin: "取芯",
    pinyin: "Qǔ xīn",
    explanation:
      "Coring dalam pertambangan adalah metode pengambilan sampel batuan (core) dari dalam tanah menggunakan mesin bor khusus.",
    updated: "18 Jul 2026",
    status: "Published",
  },
  {
    id: 2,
    category: "Mining · Exploration",
    english: "Core sample",
    indo: "Sampel inti",
    mandarin: "岩芯样本",
    pinyin: "Yánxīn yàngběn",
    explanation:
      "Sampel batuan berbentuk silinder yang diambil melalui pengeboran untuk analisis geologi.",
    updated: "17 Jul 2026",
    status: "Published",
  },
  {
    id: 3,
    category: "Mining · Drilling",
    english: "Drill rig",
    indo: "Mesin bor",
    mandarin: "钻机",
    pinyin: "Zuànjī",
    explanation:
      "Peralatan utama yang digunakan untuk membuat lubang bor dan mengambil sampel bawah permukaan.",
    updated: "16 Jul 2026",
    status: "Draft",
  },
  {
    id: 4,
    category: "Geology",
    english: "Lithology",
    indo: "Litologi",
    mandarin: "岩性",
    pinyin: "Yánxìng",
    explanation:
      "Deskripsi karakteristik fisik batuan, termasuk warna, tekstur, dan komposisinya.",
    updated: "15 Jul 2026",
    status: "Published",
  },
];

const menu: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "dictionary", label: "Work Dictionary", icon: "文" },
  { id: "articles", label: "Articles", icon: "▤" },
  { id: "records", label: "Work Records", icon: "▣" },
  { id: "agenda", label: "Agenda", icon: "□" },
  { id: "notes", label: "Notes", icon: "≡" },
  { id: "reminders", label: "Reminders", icon: "◷" },
  { id: "history", label: "Version History", icon: "◴" },
  { id: "users", label: "User Management", icon: "◎" },
];

function usePersistentState<T>(key: string, initialValue: T, enabled = true) {
  const [value, setValue] = useState<T>(initialValue);
  const loaded = useRef(false);

  useEffect(() => {
    if (!enabled) {
      loaded.current = false;
      return;
    }
    let active = true;
    fetch(`/api/state?key=${encodeURIComponent(key)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load saved data");
        return response.json() as Promise<{ found: boolean; value: T | null }>;
      })
      .then((result) => {
        if (!active) return;
        if (result.found && result.value !== null) setValue(result.value);
        loaded.current = true;
      })
      .catch(() => {
        if (active) loaded.current = true;
      });
    return () => {
      active = false;
    };
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || !loaded.current) return;
    const timer = window.setTimeout(() => {
      fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value }),
      }).catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [enabled, key, value]);

  return [value, setValue] as const;
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountProfileOpen, setAccountProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terms, setTerms] = usePersistentState(
    "dictionary-terms",
    initialTerms,
    loggedIn,
  );
  const [categories, setCategories] = usePersistentState(
    "categories",
    [
      "Mining · Coal",
      "Mining · Exploration",
      "Mining · Drilling",
      "Geology",
      "Equipment",
    ],
    loggedIn,
  );
  const [termModal, setTermModal] = useState(false);
  const [agendaItems, setAgendaItems] = usePersistentState<AgendaItem[]>(
    "agenda-items",
    [
      {
        id: 1,
        title: "Weekly Coal Project Coordination",
        date: "2026-07-18",
        endDate: "2026-07-18",
        time: "09:00",
        endTime: "10:30",
        location: "Main Meeting Room",
        category: "Meeting",
        notes: "Review progres coring dan drilling schedule.",
        reminder: true,
        reminderMinutes: 30,
        reminderMode: "once",
        reminderFrequency: "daily",
        reminderStartDate: "2026-07-18",
        reminderEndDate: "2026-07-18",
        completed: false,
      },
      {
        id: 2,
        title: "Review hasil core sample",
        date: "2026-07-18",
        endDate: "2026-07-18",
        time: "13:30",
        endTime: "14:30",
        location: "Geology Lab",
        category: "Task",
        notes: "Siapkan hasil lithology dan foto sampel.",
        reminder: true,
        reminderMinutes: 60,
        reminderMode: "once",
        reminderFrequency: "daily",
        reminderStartDate: "2026-07-18",
        reminderEndDate: "2026-07-18",
        completed: false,
      },
      {
        id: 3,
        title: "Submit supplier evaluation",
        date: "2026-07-20",
        endDate: "2026-07-20",
        time: "16:00",
        endTime: "16:30",
        location: "Office",
        category: "Deadline",
        notes: "Kirim evaluasi final ke procurement.",
        reminder: false,
        reminderMinutes: 30,
        reminderMode: "once",
        reminderFrequency: "daily",
        reminderStartDate: "2026-07-20",
        reminderEndDate: "2026-07-20",
        completed: false,
      },
    ],
    loggedIn,
  );
  const [agendaCategories, setAgendaCategories] = usePersistentState(
    "agenda-categories",
    ["Meeting", "Dinas", "Kunjungan", "Task", "Deadline"],
    loggedIn,
  );
  const [quickNotes, setQuickNotes] = usePersistentState<QuickNote[]>(
    "quick-notes",
    [
      {
        id: 1,
        title: "Coring terminology follow-up",
        content: "Tambahkan istilah core recovery dan RQD ke Work Dictionary.",
        tag: "Mining",
        pinned: true,
        updated: "18 Jul 2026, 08:45",
      },
      {
        id: 2,
        title: "Supplier questions",
        content: "Konfirmasi spesifikasi drill rod, lead time, dan warranty.",
        tag: "Procurement",
        pinned: false,
        updated: "17 Jul 2026, 16:20",
      },
    ],
    loggedIn,
  );
  const [workspaceSettings, setWorkspaceSettings] =
    usePersistentState<WorkspaceSettings>(
      "workspace-settings",
      {
        emailNotifications: true,
        reminderNotifications: true,
        compactRecords: false,
      },
      loggedIn,
    );
  const [toast, setToast] = useState("");
  const [versionHistory, setVersionHistory] = usePersistentState<VersionEntry[]>(
    "version-history",
    [],
    loggedIn,
  );

  function addHistory(
    entity: string,
    title: string,
    action: VersionEntry["action"],
    detail: string,
  ) {
    setVersionHistory((current) => [
      {
        id: Date.now(),
        entity,
        title,
        action,
        detail,
        timestamp: new Date().toLocaleString("id-ID", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      },
      ...current,
    ].slice(0, 500));
  }

  const results = useMemo(() => {
    const q = search.toLocaleLowerCase();
    if (!q) return [];
    return terms.filter((term) =>
      Object.values(term).join(" ").toLocaleLowerCase().includes(q),
    );
  }, [search, terms]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  useEffect(() => {
    fetch("/api/auth")
      .then((response) => response.json())
      .then((result) => setLoggedIn(Boolean(result.authenticated)))
      .catch(() => setLoggedIn(false))
      .finally(() => setAuthChecking(false));
  }, []);

  async function signIn(email: string, password: string) {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) return result.error || "Login gagal.";
    setLoggedIn(true);
    return null;
  }

  async function signOut() {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      setProfileOpen(false);
      setAccountProfileOpen(false);
      setSettingsOpen(false);
      setLoggedIn(false);
    }
  }

  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [profileOpen]);

  if (authChecking)
    return <main className="auth-loading">Connecting to WorkBase…</main>;
  if (!loggedIn) return <Login onLogin={signIn} />;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">W</span>
          <div>
            <strong>WorkBase</strong>
            <small>Knowledge workspace</small>
          </div>
        </div>
        <nav aria-label="Navigasi utama">
          <p className="nav-label">WORKSPACE</p>
          {menu.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => {
                setView(item.id);
                setMobileNav(false);
              }}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.id === "users" && <em>Master</em>}
            </button>
          ))}
          <p className="nav-label second">TOOLS</p>
          <button
            onClick={() => {
              exportPdf("WorkBase Dictionary Export", terms.map(termPage));
              notify("Dialog cetak dibuka. Pilih Save as PDF untuk menyimpan.");
            }}
          >
            <span>⇩</span>Export Center
          </button>
          <button onClick={() => setSettingsOpen(true)}>
            <span>⚙</span>Settings
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">AL</div>
          <div>
            <strong>Aska Leo</strong>
            <small>Master account</small>
          </div>
          <button title="Logout" onClick={signOut}>
            ↪
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Buka menu"
            onClick={() => setMobileNav(!mobileNav)}
          >
            ☰
          </button>
          <div className="global-search">
            <span>⌕</span>
            <input
              value={search}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value);
                setSearchOpen(true);
              }}
              placeholder="Search terms, articles, projects, files..."
              aria-label="Universal search"
            />
            <kbd>⌘ K</kbd>
            {searchOpen && search && (
              <SearchPanel
                results={results}
                query={search}
                onClose={() => setSearchOpen(false)}
                onSelect={() => {
                  setView("dictionary");
                  setSearchOpen(false);
                }}
              />
            )}
          </div>
          <button className="icon-button" aria-label="Notifikasi">
            ♢<i />
          </button>
          <div className="account-menu">
            <button
              className="profile-chip"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <span>AL</span>
              <div>
                Aska Leo<small>Master</small>
              </div>
              <b className={profileOpen ? "open" : ""}>⌄</b>
            </button>
            {profileOpen && (
              <div className="profile-menu" role="menu">
                <header>
                  <span>AL</span>
                  <div>
                    <strong>Aska Leo</strong>
                    <small>master@workbase.id</small>
                  </div>
                </header>
                <div className="database-status">
                  <i /> PostgreSQL connected
                </div>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountProfileOpen(true);
                    setProfileOpen(false);
                  }}
                >
                  <span>◎</span> Account profile
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setSettingsOpen(true);
                    setProfileOpen(false);
                  }}
                >
                  <span>⚙</span> Settings
                </button>
                <button
                  className="profile-logout"
                  role="menuitem"
                  onClick={signOut}
                >
                  <span>↪</span> Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <div
          className={`content ${workspaceSettings.compactRecords ? "compact-records" : ""}`}
        >
          {view === "dashboard" && (
            <Dashboard
              terms={terms}
              setView={setView}
              openTerm={() => setTermModal(true)}
              notify={notify}
            />
          )}
          {view === "dictionary" && (
            <Dictionary
              terms={terms}
              setTerms={setTerms}
              categories={categories}
              setCategories={setCategories}
              openTerm={() => setTermModal(true)}
              addHistory={addHistory}
              notify={notify}
            />
          )}
          {view === "articles" && <Articles notify={notify} addHistory={addHistory} />}
          {view === "records" && <Records notify={notify} addHistory={addHistory} />}
          {view === "agenda" && (
            <Agenda
              mode="agenda"
              items={agendaItems}
              setItems={setAgendaItems}
              categories={agendaCategories}
              setCategories={setAgendaCategories}
              addHistory={addHistory}
              notify={notify}
            />
          )}
          {view === "notes" && (
            <Notes
              notes={quickNotes}
              setNotes={setQuickNotes}
              addHistory={addHistory}
              notify={notify}
            />
          )}
          {view === "reminders" && (
            <Agenda
              mode="reminders"
              items={agendaItems}
              setItems={setAgendaItems}
              categories={agendaCategories}
              setCategories={setAgendaCategories}
              addHistory={addHistory}
              notify={notify}
            />
          )}
          {view === "users" && <Users notify={notify} />}
          {view === "history" && <VersionHistory entries={versionHistory} />}
        </div>
      </section>

      {termModal && (
        <TermModal
          categories={categories}
          onClose={() => setTermModal(false)}
          onSave={(term) => {
            setTerms([
              {
                ...term,
                id: Date.now(),
                updated: "18 Jul 2026",
                status: "Draft",
              },
              ...terms,
            ]);
            setTermModal(false);
            addHistory("Work Dictionary", term.english, "Created", "Istilah baru dibuat sebagai draft.");
            notify("Istilah berhasil disimpan sebagai draft.");
          }}
        />
      )}
      {accountProfileOpen && (
        <AccountProfileModal
          onClose={() => setAccountProfileOpen(false)}
          onManageUsers={() => {
            setView("users");
            setAccountProfileOpen(false);
          }}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          initial={workspaceSettings}
          onClose={() => setSettingsOpen(false)}
          onSave={(settings) => {
            setWorkspaceSettings(settings);
            setSettingsOpen(false);
            notify("Pengaturan berhasil disimpan.");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          ✓ {toast}
        </div>
      )}
      {mobileNav && (
        <button
          className="scrim"
          aria-label="Tutup menu"
          onClick={() => setMobileNav(false)}
        />
      )}
    </main>
  );
}

function Login({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<string | null>;
}) {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("master@workbase.id");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const message = await onLogin(email, password);
    if (message) setError(message);
    setLoading(false);
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="story-brand">
          <span>W</span>WorkBase
        </div>
        <div className="story-copy">
          <p>YOUR WORK KNOWLEDGE, ORGANIZED</p>
          <h1>Satu tempat untuk semua pengetahuan pekerjaan Anda.</h1>
          <p className="lead">
            Catat istilah teknis, susun artikel, dan temukan kembali setiap
            informasi dalam hitungan detik.
          </p>
          <div className="language-card">
            <span>MINING · COAL</span>
            <strong>Coring</strong>
            <b>取芯</b>
            <p>
              Pengambilan sampel batuan dari dalam tanah menggunakan mesin bor
              khusus.
            </p>
          </div>
        </div>
        <small>Secure · Centralized · Multilingual</small>
      </section>
      <section className="login-form-wrap">
        <form onSubmit={submit} className="login-form">
          <div className="mobile-brand">
            <span>W</span>WorkBase
          </div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Masuk ke workspace</h2>
          <p className="muted">Gunakan akun yang telah dibuat oleh Master.</p>
          <label>
            Email atau username
            <input
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <div className="password">
              <input
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type={show ? "text" : "password"}
                autoComplete="current-password"
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <div className="login-options">
            <label>
              <input type="checkbox" /> Ingat saya
            </label>
            <button type="button">Lupa password?</button>
          </div>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary login-submit" type="submit">
            {loading ? "Memverifikasi..." : "Masuk ke WorkBase →"}
          </button>
          <p className="secure-note">▣ Dilindungi dengan koneksi terenkripsi</p>
        </form>
      </section>
    </main>
  );
}

function VersionHistory({ entries }: { entries: VersionEntry[] }) {
  const [filter, setFilter] = useState("All");
  const visible = filter === "All" ? entries : entries.filter((entry) => entry.entity === filter);
  const entities = ["All", ...Array.from(new Set(entries.map((entry) => entry.entity)))];
  return (
    <>
      <div className="page-head"><div><p className="eyebrow">AUDIT TRAIL</p><h1>Version History</h1><p>Lihat kapan data dibuat, diubah, atau dihapus.</p></div></div>
      <div className="filters">{entities.map((entity) => <button key={entity} className={filter === entity ? "active" : ""} onClick={() => setFilter(entity)}>{entity}</button>)}</div>
      <section className="card history-list">
        {visible.length ? visible.map((entry) => (
          <article key={entry.id} className="history-entry">
            <span className={`status ${entry.action.toLowerCase()}`}>{entry.action}</span>
            <div><strong>{entry.title}</strong><p>{entry.entity} · {entry.detail}</p></div>
            <time>{entry.timestamp}</time>
          </article>
        )) : <div className="planner-empty"><span>◴</span><h2>Belum ada riwayat</h2><p>Perubahan baru akan tercatat otomatis di sini.</p></div>}
      </section>
    </>
  );
}

function AccountProfileModal({
  onClose,
  onManageUsers,
}: {
  onClose: () => void;
  onManageUsers: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal detail-popup"
        role="dialog"
        aria-modal="true"
        aria-label="Account profile"
      >
        <header>
          <div>
            <p className="eyebrow">ACCOUNT PROFILE</p>
            <h2>Aska Leo</h2>
            <small>Master account</small>
          </div>
          <button type="button" aria-label="Close profile" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="detail-popup-body">
          <div className="detail-badge">AL</div>
          <div className="detail-fields">
            <div>
              <span>Email</span>
              <strong>master@workbase.id</strong>
            </div>
            <div>
              <span>Access level</span>
              <strong>Master</strong>
            </div>
            <div>
              <span>Workspace</span>
              <strong>WorkBase Aska</strong>
            </div>
          </div>
          <article>
            <h3>Account access</h3>
            <p>
              Akun Master dapat mengelola pengguna, level akses, dan seluruh
              data workspace.
            </p>
          </article>
        </div>
        <footer>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button className="primary" onClick={onManageUsers}>
            Manage users
          </button>
        </footer>
      </section>
    </div>
  );
}

function SettingsModal({
  initial,
  onClose,
  onSave,
}: {
  initial: WorkspaceSettings;
  onClose: () => void;
  onSave: (settings: WorkspaceSettings) => void;
}) {
  const [settings, setSettings] = useState(initial);
  return (
    <div className="modal-backdrop">
      <form
        className="modal settings-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(settings);
        }}
      >
        <header>
          <div>
            <p className="eyebrow">WORKSPACE SETTINGS</p>
            <h2>Settings</h2>
          </div>
          <button type="button" aria-label="Close settings" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="settings-options">
          <label>
            <input
              type="checkbox"
              checked={settings.emailNotifications}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  emailNotifications: event.target.checked,
                })
              }
            />
            <span>
              <strong>Email notifications</strong>
              <small>Terima pembaruan penting melalui email.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.reminderNotifications}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  reminderNotifications: event.target.checked,
                })
              }
            />
            <span>
              <strong>Agenda reminders</strong>
              <small>Tampilkan pengingat untuk agenda dan deadline.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.compactRecords}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  compactRecords: event.target.checked,
                })
              }
            />
            <span>
              <strong>Compact records view</strong>
              <small>Gunakan tampilan catatan yang lebih ringkas.</small>
            </span>
          </label>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save settings
          </button>
        </footer>
      </form>
    </div>
  );
}

function Dashboard({
  terms,
  setView,
  openTerm,
  notify,
}: {
  terms: Term[];
  setView: (v: View) => void;
  openTerm: () => void;
  notify: (s: string) => void;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">SATURDAY, 18 JULY 2026</p>
          <h1>Selamat pagi, Aska.</h1>
          <p>Semua pengetahuan pekerjaan Anda tersimpan dan siap digunakan.</p>
        </div>
        <button className="primary" onClick={openTerm}>
          ＋ New entry
        </button>
      </div>
      <div className="stats">
        <Stat
          value="248"
          label="Dictionary terms"
          meta="+12 bulan ini"
          icon="文"
        />
        <Stat value="36" label="Articles" meta="5 masih draft" icon="▤" />
        <Stat value="84" label="Work records" meta="+8 minggu ini" icon="▣" />
        <Stat
          value="1,429"
          label="Files & media"
          meta="6.8 GB digunakan"
          icon="◇"
        />
      </div>
      <div className="dashboard-grid">
        <section className="card recent">
          <div className="card-title">
            <div>
              <h2>Recently updated</h2>
              <p>Istilah yang terakhir dikerjakan</p>
            </div>
            <button onClick={() => setView("dictionary")}>View all →</button>
          </div>
          <div className="term-list">
            {terms.slice(0, 4).map((term) => (
              <button
                className="term-row"
                key={term.id}
                onClick={() => setView("dictionary")}
              >
                <span className="term-symbol">{term.mandarin.slice(0, 1)}</span>
                <div>
                  <strong>{term.english}</strong>
                  <small>
                    {term.indo} · {term.mandarin} · {term.pinyin}
                  </small>
                </div>
                <span className="category-pill">{term.category}</span>
                <time>{term.updated}</time>
                <b>›</b>
              </button>
            ))}
          </div>
        </section>
        <aside className="card quick">
          <div className="card-title">
            <div>
              <h2>Quick actions</h2>
              <p>Mulai pekerjaan baru</p>
            </div>
          </div>
          <button onClick={openTerm}>
            <span>＋</span>
            <div>
              <strong>Add dictionary term</strong>
              <small>English · Indonesia · Mandarin</small>
            </div>
            <b>›</b>
          </button>
          <button onClick={() => setView("articles")}>
            <span>▤</span>
            <div>
              <strong>Write an article</strong>
              <small>Text, image, URL & tables</small>
            </div>
            <b>›</b>
          </button>
          <button onClick={() => setView("records")}>
            <span>▣</span>
            <div>
              <strong>Create work record</strong>
              <small>Daily report or meeting note</small>
            </div>
            <b>›</b>
          </button>
          <button
            onClick={() => {
              exportWord("WorkBase Dictionary Export", terms.map(termPage));
              notify("Dokumen Word berhasil diunduh.");
            }}
          >
            <span>⇩</span>
            <div>
              <strong>Export document</strong>
              <small>PDF or Microsoft Word</small>
            </div>
            <b>›</b>
          </button>
        </aside>
      </div>
      <section className="card activity">
        <div className="card-title">
          <div>
            <h2>Workspace activity</h2>
            <p>Ringkasan 7 hari terakhir</p>
          </div>
          <select aria-label="Periode">
            <option>Last 7 days</option>
          </select>
        </div>
        <div className="activity-body">
          <div className="bars">
            {[34, 55, 42, 70, 58, 82, 64].map((h, i) => (
              <div key={i}>
                <span style={{ height: `${h}%` }} />
                <small>
                  {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"][i]}
                </small>
              </div>
            ))}
          </div>
          <div className="activity-summary">
            <strong>47</strong>
            <span>updates this week</span>
            <p>
              <i /> 18 Dictionary
            </p>
            <p>
              <i /> 14 Articles
            </p>
            <p>
              <i /> 15 Records
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({
  value,
  label,
  meta,
  icon,
}: {
  value: string;
  label: string;
  meta: string;
  icon: string;
}) {
  return (
    <div className="stat card">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
        <small>{meta}</small>
      </div>
    </div>
  );
}

function Dictionary({
  terms,
  setTerms,
  categories,
  setCategories,
  openTerm,
  addHistory,
  notify,
}: {
  terms: Term[];
  setTerms: (terms: Term[]) => void;
  categories: string[];
  setCategories: (categories: string[]) => void;
  openTerm: () => void;
  addHistory: (entity: string, title: string, action: VersionEntry["action"], detail: string) => void;
  notify: (s: string) => void;
}) {
  const [categoryModal, setCategoryModal] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<Term | null>(null);
  const [editingTerm, setEditingTerm] = useState<Term | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [filter, setFilter] = useState("All");
  const visibleTerms =
    filter === "All" ? terms : terms.filter((t) => t.category === filter);
  const allVisible =
    visibleTerms.length > 0 &&
    visibleTerms.every((t) => checked.includes(t.id));
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">KNOWLEDGE LIBRARY</p>
          <h1>Work Dictionary</h1>
          <p>Kelola istilah teknis multibahasa dalam satu tempat.</p>
        </div>
        <div className="head-actions">
          <button className="secondary" onClick={() => setCategoryModal(true)}>
            Manage categories
          </button>
          <button
            className="secondary"
            onClick={() => {
              exportPdf("Work Dictionary", visibleTerms.map(termPage));
              notify("Dialog cetak dibuka. Pilih Save as PDF untuk menyimpan.");
            }}
          >
            ⇩ Export PDF
          </button>
          <button className="primary" onClick={openTerm}>
            ＋ Add term
          </button>
        </div>
      </div>
      <div className="filters">
        <button
          className={filter === "All" ? "active" : ""}
          onClick={() => setFilter("All")}
        >
          All terms <b>{terms.length}</b>
        </button>
        {categories.slice(0, 4).map((category) => (
          <button
            key={category}
            className={filter === category ? "active" : ""}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
        <select aria-label="Urutkan istilah">
          <option>Last updated</option>
        </select>
      </div>
      {checked.length > 0 && (
        <BulkBar
          count={checked.length}
          onClear={() => setChecked([])}
          onAction={() => {
            const selected = terms.filter((term) => checked.includes(term.id));
            exportWord("Selected Dictionary Terms", selected.map(termPage));
            notify(`${selected.length} dictionary terms berhasil diunduh.`);
          }}
          action="Export selected"
        />
      )}
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th className="check-cell">
                <input
                  type="checkbox"
                  aria-label="Select all dictionary terms"
                  checked={allVisible}
                  onChange={() =>
                    setChecked(
                      allVisible
                        ? checked.filter(
                            (id) => !visibleTerms.some((t) => t.id === id),
                          )
                        : [
                            ...new Set([
                              ...checked,
                              ...visibleTerms.map((t) => t.id),
                            ]),
                          ],
                    )
                  }
                />
              </th>
              <th>TERM</th>
              <th>INDONESIA</th>
              <th>MANDARIN</th>
              <th>CATEGORY</th>
              <th>STATUS</th>
              <th>UPDATED</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleTerms.map((term) => (
              <tr
                className="clickable-row"
                key={term.id}
                tabIndex={0}
                role="button"
                onClick={() => setSelectedTerm(term)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedTerm(term);
                }}
              >
                <td className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${term.english}`}
                    checked={checked.includes(term.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() =>
                      setChecked(
                        checked.includes(term.id)
                          ? checked.filter((id) => id !== term.id)
                          : [...checked, term.id],
                      )
                    }
                  />
                </td>
                <td>
                  <strong>{term.english}</strong>
                  <small>{term.explanation}</small>
                </td>
                <td>{term.indo}</td>
                <td>
                  <b className="hanzi">{term.mandarin}</b>
                  <small>{term.pinyin}</small>
                </td>
                <td>
                  <span className="category-pill">{term.category}</span>
                </td>
                <td>
                  <span className={`status ${term.status.toLowerCase()}`}>
                    {term.status}
                  </span>
                </td>
                <td>{term.updated}</td>
                <td>
                  <button
                    aria-label={`Buka ${term.english}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTerm(term);
                    }}
                  >
                    ›
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleTerms.length === 0 && (
          <div className="table-empty">
            Belum ada istilah dalam kategori ini.
          </div>
        )}
      </section>
      {selectedTerm && (
        <DetailPopup
          type="DICTIONARY TERM"
          title={selectedTerm.english}
          subtitle={`${selectedTerm.indo} · ${selectedTerm.mandarin} · ${selectedTerm.pinyin}`}
          fields={[
            ["Category", selectedTerm.category],
            ["Status", selectedTerm.status],
            ["Updated", selectedTerm.updated],
          ]}
          description={selectedTerm.explanation}
          onClose={() => setSelectedTerm(null)}
          onAction={() => {
            exportPdf(selectedTerm.english, [termPage(selectedTerm)]);
            notify("Dialog cetak dibuka. Pilih Save as PDF untuk menyimpan.");
          }}
          action="Export PDF"
          onEdit={() => {
            setEditingTerm(selectedTerm);
            setSelectedTerm(null);
          }}
          onDelete={() => {
            setTerms(terms.filter((term) => term.id !== selectedTerm.id));
            addHistory("Work Dictionary", selectedTerm.english, "Deleted", "Istilah dihapus dari kamus.");
            setSelectedTerm(null);
            notify("Dictionary term berhasil dihapus.");
          }}
        />
      )}
      {editingTerm && (
        <TermModal
          categories={categories}
          initial={editingTerm}
          onClose={() => setEditingTerm(null)}
          onSave={(data) => {
            setTerms(
              terms.map((term) =>
                term.id === editingTerm.id
                  ? { ...term, ...data, updated: "18 Jul 2026" }
                  : term,
              ),
            );
            setEditingTerm(null);
            addHistory("Work Dictionary", editingTerm.english, "Edited", "Istilah dan penjelasan diperbarui.");
            notify("Dictionary term berhasil diperbarui.");
          }}
        />
      )}
      {categoryModal && (
        <CategoryManager
          categories={categories}
          terms={terms}
          onClose={() => setCategoryModal(false)}
          onAdd={(name) => {
            setCategories([...categories, name]);
            notify("Kategori berhasil ditambahkan.");
          }}
          onRename={(oldName, newName) => {
            setCategories(categories.map((c) => (c === oldName ? newName : c)));
            setTerms(
              terms.map((t) =>
                t.category === oldName ? { ...t, category: newName } : t,
              ),
            );
            if (filter === oldName) setFilter(newName);
            notify("Kategori berhasil diperbarui.");
          }}
          onDelete={(name) => {
            setCategories(categories.filter((c) => c !== name));
            if (filter === name) setFilter("All");
            notify("Kategori berhasil dihapus.");
          }}
          notify={notify}
        />
      )}
    </>
  );
}

function CategoryManager({
  categories,
  terms,
  onClose,
  onAdd,
  onRename,
  onDelete,
  notify,
}: {
  categories: string[];
  terms: Term[];
  onClose: () => void;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  notify: (message: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  function addCategory(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setError("Nama kategori sudah digunakan.");
      return;
    }
    onAdd(name);
    setNewName("");
    setError("");
  }
  function renameCategory(oldName: string) {
    const name = editName.trim();
    if (!name) return;
    if (
      categories.some(
        (c) => c !== oldName && c.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError("Nama kategori sudah digunakan.");
      return;
    }
    onRename(oldName, name);
    setEditing(null);
    setError("");
  }
  function requestDelete(name: string) {
    const count = terms.filter((t) => t.category === name).length;
    if (count > 0) {
      notify(
        `Kategori masih digunakan oleh ${count} istilah. Pindahkan istilah terlebih dahulu.`,
      );
      return;
    }
    setConfirmDelete(name);
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal category-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Kelola kategori dictionary"
      >
        <header>
          <div>
            <p className="eyebrow">DICTIONARY SETTINGS</p>
            <h2>Kelola kategori</h2>
            <small>Tambah, ubah, atau hapus kategori istilah.</small>
          </div>
          <button type="button" aria-label="Tutup kategori" onClick={onClose}>
            ×
          </button>
        </header>
        <form className="category-add" onSubmit={addCategory}>
          <label>
            Nama kategori baru
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError("");
              }}
              placeholder="Contoh: Mining · Safety"
            />
          </label>
          <button className="primary" disabled={!newName.trim()} type="submit">
            ＋ Add category
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="category-list">
          {categories.map((category) => {
            const count = terms.filter((t) => t.category === category).length;
            return (
              <div className="category-row" key={category}>
                {editing === category ? (
                  <>
                    <label className="sr-only" htmlFor={`edit-${category}`}>
                      Nama kategori
                    </label>
                    <input
                      id={`edit-${category}`}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                    />
                    <div className="category-actions">
                      <button
                        className="save-action"
                        onClick={() => renameCategory(category)}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditing(null);
                          setError("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="category-initial">
                      {category.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{category}</strong>
                      <small>
                        {count} {count === 1 ? "term" : "terms"}
                      </small>
                    </div>
                    <div className="category-actions">
                      <button
                        onClick={() => {
                          setEditing(category);
                          setEditName(category);
                          setError("");
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="delete-action"
                        onClick={() => requestDelete(category)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <footer>
          <span>{categories.length} categories</span>
          <button className="secondary" onClick={onClose}>
            Done
          </button>
        </footer>
        {confirmDelete && (
          <div className="confirm-panel" role="alertdialog" aria-modal="true">
            <div>
              <h3>Hapus kategori?</h3>
              <p>Kategori “{confirmDelete}” akan dihapus permanen.</p>
              <div>
                <button
                  className="secondary"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    onDelete(confirmDelete);
                    setConfirmDelete(null);
                  }}
                >
                  Delete category
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Articles({ notify, addHistory }: { notify: (s: string) => void; addHistory: (entity: string, title: string, action: VersionEntry["action"], detail: string) => void }) {
  const [articles, setArticles] = usePersistentState<string[][]>("articles", [
    [
      "Coal Exploration Using Core Drilling",
      "Technical Article",
      "Published",
      "18 Jul 2026",
      "<h2>Overview</h2><p>Core drilling provides continuous samples that help the team understand coal seam quality and geological structure.</p><h2>Key findings</h2><ul><li>Sample recovery remained above target.</li><li>Results are ready for the next geological review.</li></ul>",
    ],
    [
      "Panduan Keselamatan Area Tambang",
      "Work Instruction",
      "Draft",
      "17 Jul 2026",
    ],
    [
      "Weekly Mining Operations Review",
      "Project Update",
      "Published",
      "15 Jul 2026",
    ],
  ]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<string[] | null>(null);
  const [articleModal, setArticleModal] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const all = checked.length === articles.length;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">DOCUMENT STUDIO</p>
          <h1>Articles</h1>
          <p>Susun pengetahuan menjadi dokumen yang siap dibagikan.</p>
        </div>
        <button className="primary" onClick={() => setArticleModal(true)}>
          ＋ New article
        </button>
      </div>
      <SelectAllRow
        checked={all}
        count={checked.length}
        label="articles"
        onChange={() => setChecked(all ? [] : articles.map((a) => a[0]))}
      />
      {checked.length > 0 && (
        <BulkBar
          count={checked.length}
          onClear={() => setChecked([])}
          onAction={() => {
            const selectedArticles = articles.filter((article) =>
              checked.includes(article[0]),
            );
            exportWord(
              "Selected Articles",
              selectedArticles.map((article) => ({
                title: article[0],
                subtitle: `${article[1]} · ${article[2]}`,
                blocks: [
                  { heading: "Updated", body: article[3] },
                  {
                    heading: "Content",
                    body: "Artikel ini berisi teks, tabel, gambar, URL, dan referensi yang tersusun sebagai dokumentasi pekerjaan.",
                  },
                ],
              })),
            );
            notify(`${selectedArticles.length} articles berhasil diunduh.`);
          }}
          action="Export selected"
        />
      )}
      <div className="article-grid">
        {articles.map((a, i) => (
          <article
            className={`card article clickable-card selectable-card ${checked.includes(a[0]) ? "is-selected" : ""}`}
            tabIndex={0}
            role="button"
            onClick={() => setSelected(a)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSelected(a);
            }}
            key={a[0]}
          >
            <label
              className="floating-check"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                aria-label={`Select ${a[0]}`}
                checked={checked.includes(a[0])}
                onChange={() =>
                  setChecked(
                    checked.includes(a[0])
                      ? checked.filter((id) => id !== a[0])
                      : [...checked, a[0]],
                  )
                }
              />
            </label>
            <div className={`article-cover cover-${i}`}>▤</div>
            <div>
              <span>{a[1]}</span>
              <h3>{a[0]}</h3>
              <p>
                Teks, tabel, gambar, URL, dan referensi tersusun dalam satu
                artikel.
              </p>
              <footer>
                <small>{a[3]}</small>
                <b className={`status ${a[2].toLowerCase()}`}>{a[2]}</b>
              </footer>
            </div>
          </article>
        ))}
      </div>
      {selected && (
        <DetailPopup
          type="ARTICLE"
          title={selected[0]}
          subtitle={selected[1]}
          fields={[
            ["Status", selected[2]],
            ["Updated", selected[3]],
            ["Author", "Aska Leo"],
          ]}
          description="Artikel ini berisi teks, tabel, gambar, URL, dan referensi yang tersusun sebagai dokumentasi pekerjaan."
          richContent={selected[4]}
          onClose={() => setSelected(null)}
          onAction={() => {
            exportPdf(selected[0], [
              {
                title: selected[0],
                subtitle: `${selected[1]} · ${selected[2]}`,
                blocks: [
                  { heading: "Updated", body: selected[3] },
                  {
                    heading: "Content",
                    body: "Artikel ini berisi teks, tabel, gambar, URL, dan referensi yang tersusun sebagai dokumentasi pekerjaan.",
                  },
                ],
              },
            ]);
            notify("Dialog cetak dibuka. Pilih Save as PDF untuk menyimpan.");
          }}
          action="Export PDF"
          onWord={() => {
            exportWord(selected[0], [
              {
                title: selected[0],
                subtitle: `${selected[1]} · ${selected[2]}`,
                blocks: [
                  { heading: "Updated", body: selected[3] },
                  {
                    heading: "Content",
                    body: "Artikel ini berisi teks, tabel, gambar, URL, dan referensi yang tersusun sebagai dokumentasi pekerjaan.",
                  },
                ],
              },
            ]);
            notify("Artikel Word berhasil diunduh.");
          }}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
            setArticleModal(true);
          }}
          onDelete={() => {
            setArticles(
              articles.filter((article) => article[0] !== selected[0]),
            );
            addHistory("Article", selected[0], "Deleted", "Artikel dihapus.");
            setSelected(null);
            notify("Artikel berhasil dihapus.");
          }}
        />
      )}
      {articleModal && (
        <ArticleModal
          initial={editing}
          onClose={() => {
            setArticleModal(false);
            setEditing(null);
          }}
          onSave={(article) => {
            setArticles(
              editing
                ? articles.map((item) =>
                    item[0] === editing[0] ? article : item,
                  )
                : [article, ...articles],
            );
            setArticleModal(false);
            setEditing(null);
            addHistory("Article", article[0], editing ? "Edited" : "Created", editing ? "Konten artikel diperbarui." : "Artikel baru dibuat.");
            notify(
              editing
                ? "Artikel berhasil diperbarui."
                : "Artikel berhasil ditambahkan.",
            );
          }}
        />
      )}
    </>
  );
}

function ArticleModal({
  initial,
  onClose,
  onSave,
}: {
  initial: string[] | null;
  onClose: () => void;
  onSave: (article: string[]) => void;
}) {
  const [form, setForm] = useState({
    title: initial?.[0] || "",
    category: initial?.[1] || "Technical Article",
    status: initial?.[2] || "Draft",
    content: initial
      ? initial[4] ||
        "Artikel ini berisi dokumentasi pekerjaan, tabel, gambar, URL, dan referensi."
      : "",
  });
  const applyTemplate = (template: "article" | "meeting") => {
    if (template === "article") {
      setForm({
        ...form,
        category: "Technical Article",
        content:
          "<h2>Overview</h2><p>Write a short introduction and the purpose of this article.</p><h2>Key findings</h2><ul><li>Add the main finding</li><li>Add supporting evidence</li></ul><h2>Recommendation</h2><p>Describe the recommended next step.</p>",
      });
    } else {
      setForm({
        ...form,
        category: "Project Update",
        content:
          "<h2>Meeting details</h2><table><tbody><tr><td><strong>Date</strong></td><td>Add date</td></tr><tr><td><strong>Participants</strong></td><td>Add names</td></tr></tbody></table><h2>Discussion</h2><ul><li>Add discussion point</li></ul><h2>Decisions &amp; action items</h2><ol><li>Add owner and due date</li></ol>",
      });
    }
  };
  return (
    <div className="modal-backdrop">
      <form
        className="modal editor-modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave([
            form.title,
            form.category,
            form.status,
            "18 Jul 2026",
            form.content,
          ]);
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              {initial ? "EDIT ARTICLE" : "NEW ARTICLE"}
            </p>
            <h2>{initial ? "Edit artikel" : "Buat artikel"}</h2>
          </div>
          <button
            type="button"
            aria-label="Tutup form artikel"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {!initial && (
          <div className="template-strip" aria-label="Document templates">
            <span>Start with</span>
            <button type="button" onClick={() => applyTemplate("article")}>
              Article template
            </button>
            <button type="button" onClick={() => applyTemplate("meeting")}>
              Meeting memo
            </button>
          </div>
        )}
        <div className="form-grid">
          <label className="wide">
            Judul
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label>
            Kategori
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option>Technical Article</option>
              <option>Work Instruction</option>
              <option>Project Update</option>
            </select>
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>Draft</option>
              <option>Published</option>
            </select>
          </label>
          <div className="wide rich-field">
            <span className="field-label">Isi artikel</span>
            <RichDocumentEditor
              value={form.content}
              onChange={(content) => setForm({ ...form, content })}
              placeholder="Tulis artikel atau ketik / untuk mulai..."
            />
          </div>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save article
          </button>
        </footer>
      </form>
    </div>
  );
}

function RichDocumentEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== value) {
      editor.current.innerHTML = value;
    }
  }, [value]);

  const run = (command: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand(command, false, argument);
    if (editor.current) onChange(editor.current.innerHTML);
  };
  const insertLink = () => {
    const url = window.prompt("Paste a link URL");
    if (url) run("createLink", url);
  };
  const insertTable = () => {
    run(
      "insertHTML",
      "<table><thead><tr><th>Column 1</th><th>Column 2</th></tr></thead><tbody><tr><td>Value</td><td>Value</td></tr><tr><td>Value</td><td>Value</td></tr></tbody></table><p><br></p>",
    );
  };
  const addImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      run(
        "insertHTML",
        `<figure><img src="${String(reader.result)}" alt="${file.name.replaceAll('"', "&quot;")}"><figcaption>${file.name}</figcaption></figure><p><br></p>`,
      );
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  return (
    <div className="rich-editor-shell">
      <div
        className="rich-toolbar"
        role="toolbar"
        aria-label="Formatting tools"
      >
        <select
          aria-label="Text style"
          defaultValue="p"
          onChange={(event) => run("formatBlock", event.target.value)}
        >
          <option value="p">Text</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
        </select>
        <span className="toolbar-divider" />
        <button type="button" aria-label="Bold" onClick={() => run("bold")}>
          <strong>B</strong>
        </button>
        <button type="button" aria-label="Italic" onClick={() => run("italic")}>
          <em>I</em>
        </button>
        <button
          type="button"
          aria-label="Underline"
          onClick={() => run("underline")}
        >
          <u>U</u>
        </button>
        <span className="toolbar-divider" />
        <button type="button" onClick={() => run("insertUnorderedList")}>
          • List
        </button>
        <button type="button" onClick={() => run("insertOrderedList")}>
          1. List
        </button>
        <button type="button" onClick={insertLink}>
          Link
        </button>
        <button type="button" onClick={() => upload.current?.click()}>
          Image
        </button>
        <button type="button" onClick={insertTable}>
          Table
        </button>
        <input
          ref={upload}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={addImage}
        />
      </div>
      <div
        ref={editor}
        className="rich-editor"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Document content"
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onInput={(event) =>
          onChange(sanitizeRichHtml(event.currentTarget.innerHTML))
        }
      />
      <div className="editor-hint">
        <span>Tip</span> Paste content directly, or use the toolbar to insert a
        new block.
      </div>
    </div>
  );
}

function Records({ notify, addHistory }: { notify: (s: string) => void; addHistory: (entity: string, title: string, action: VersionEntry["action"], detail: string) => void }) {
  const [meetingModal, setMeetingModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<{
    topic: string;
    index: number;
  } | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [checkedTopics, setCheckedTopics] = useState<string[]>([]);
  const [meetingView, setMeetingView] = useState<"date" | "topic">("date");
  const [meetings, setMeetings] = usePersistentState<Meeting[]>("meetings", [
    {
      id: 1,
      title: "Weekly Coal Project Coordination",
      project: "Coal Project · Site A",
      date: "2026-07-18",
      time: "09:00",
      location: "Main Meeting Room",
      participants: "Aska Leo, Budi Santoso, Chen Wei",
      topics: ["Coring progress", "Core sample result", "Drilling schedule"],
      resources: [
        {
          id: "resource-1",
          name: "Project reference",
          url: "https://example.com/coal-project-reference",
          kind: "link",
        },
      ],
      summary:
        "Pembahasan progres coring, hasil sampel inti, dan jadwal pengeboran untuk minggu berikutnya.",
      followUp: "Budi memperbarui drilling schedule sebelum 20 Juli 2026.",
      status: "Completed",
    },
    {
      id: 2,
      title: "Supplier Technical Review",
      project: "Drilling Equipment Procurement",
      date: "2026-07-18",
      time: "14:30",
      location: "Online · Teams",
      participants: "Aska Leo, Siti Rahma, PT Drillindo",
      topics: [
        "Drill rig specification",
        "Quotation revision",
        "Warranty terms",
      ],
      resources: [],
      summary:
        "Evaluasi spesifikasi drill rig dan kelengkapan dokumen teknis supplier.",
      followUp: "Supplier mengirim revisi quotation dan datasheet.",
      status: "Draft",
    },
    {
      id: 3,
      title: "Safety Morning Briefing",
      project: "Coal Project · Site A",
      date: "2026-07-16",
      time: "07:30",
      location: "Site Office",
      participants: "Site team",
      topics: ["PPE compliance", "Drilling area access"],
      resources: [],
      summary: "Evaluasi keselamatan kerja sebelum kegiatan lapangan.",
      followUp: "Safety officer melakukan inspeksi area.",
      status: "Completed",
    },
  ]);
  const [dailyMemos, setDailyMemos] = usePersistentState<WorkMemo[]>(
    "daily-memos",
    [
      {
        id: 101,
        title: "Daily drilling progress",
        project: "Coal Project · Site A",
        date: "2026-07-18",
        location: "Drilling Area A-03",
        summary: "Pengeboran mencapai kedalaman 86 meter.",
        details:
          "Shift pagi menyelesaikan coring interval 72–86 meter dengan recovery yang baik.",
        followUp:
          "Lanjutkan pengeboran sampai target 100 meter pada shift berikutnya.",
        status: "Completed",
        resources: [],
      },
      {
        id: 102,
        title: "Core sample handling",
        project: "Coal Project · Site A",
        date: "2026-07-17",
        location: "Core Shed",
        summary: "Sebanyak 12 core box diberi label dan difoto.",
        details:
          "Sampel dipindahkan ke rak penyimpanan sesuai interval kedalaman.",
        followUp: "Geologist melakukan logging lithology.",
        status: "Draft",
        resources: [],
      },
    ],
  );
  const [technicalMemos, setTechnicalMemos] = usePersistentState<WorkMemo[]>(
    "technical-memos",
    [
      {
        id: 201,
        title: "Drill rod wear assessment",
        project: "Drilling Equipment",
        date: "2026-07-18",
        location: "Workshop",
        summary: "Ditemukan keausan pada sambungan drill rod nomor DR-17.",
        details:
          "Ulir sambungan menunjukkan deformasi dan tidak direkomendasikan untuk shift berikutnya.",
        followUp:
          "Pisahkan DR-17 dan ajukan penggantian ke maintenance supervisor.",
        status: "Completed",
        resources: [],
      },
      {
        id: 202,
        title: "Core recovery calculation",
        project: "Geology Review",
        date: "2026-07-16",
        location: "Geology Office",
        summary: "Metode perhitungan recovery perlu distandardisasi.",
        details:
          "Gunakan panjang core recovered dibagi panjang run, dikalikan 100 persen.",
        followUp: "Tambahkan formula ke work instruction.",
        status: "Draft",
        resources: [],
      },
    ],
  );
  function saveMeeting(meeting: Omit<Meeting, "id">) {
    setMeetings([{ ...meeting, id: Date.now() }, ...meetings]);
    setMeetingModal(false);
    addHistory("Work Record", meeting.title, "Created", "Meeting note dibuat.");
    notify("Meeting note berhasil disimpan.");
  }
  const topicOptions = meetings.flatMap((meeting) =>
    meeting.topics.map((topic, index) => ({
      key: `${meeting.id}:${index}`,
      meeting,
      topic,
      index,
    })),
  );
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">FIELD & OFFICE</p>
          <h1>Work Records</h1>
          <p>Catatan pekerjaan yang rapi dari lapangan sampai ruang rapat.</p>
        </div>
        <button className="primary" onClick={() => setMeetingModal(true)}>
          ＋ New meeting note
        </button>
      </div>
      <div className="record-types">
        <div className="record-stat card selected">
          <span>MN</span>
          <div>
            <strong>{meetings.length}</strong>
            <p>Meeting notes</p>
            <small>
              {meetings.length === 1
                ? "1 meeting tersimpan"
                : `${meetings.length} meeting tersimpan`}
            </small>
          </div>
        </div>
      </div>
      <>
          <div className="meeting-viewbar">
            <SelectAllRow
              checked={
                topicOptions.length > 0 &&
                checkedTopics.length === topicOptions.length
              }
              count={checkedTopics.length}
              label="topics"
              onChange={() =>
                setCheckedTopics(
                  checkedTopics.length === topicOptions.length
                    ? []
                    : topicOptions.map((item) => item.key),
                )
              }
            />
            <div className="view-switch" role="group" aria-label="Meeting view">
              <button
                className={meetingView === "date" ? "active" : ""}
                onClick={() => setMeetingView("date")}
              >
                By date
              </button>
              <button
                className={meetingView === "topic" ? "active" : ""}
                onClick={() => setMeetingView("topic")}
              >
                By topic
              </button>
            </div>
          </div>
          {checkedTopics.length > 0 && (
            <BulkBar
              count={checkedTopics.length}
              onClear={() => setCheckedTopics([])}
              onAction={() => {
                const selected = topicOptions.filter((item) =>
                  checkedTopics.includes(item.key),
                );
                exportWord(
                  "Selected Meeting Topics",
                  selected.map((item) =>
                    meetingTopicPage(item.meeting, item.topic, item.index),
                  ),
                );
                notify(`${selected.length} selected topics berhasil diunduh.`);
              }}
              action="Export selected"
            />
          )}
          <section className="card meetings-section">
            <div className="card-title meeting-title">
              <div>
                <h2>
                  {meetingView === "date"
                    ? "Meeting notes by date"
                    : "Meeting topics"}
                </h2>
                <p>
                  {meetingView === "date"
                    ? "Beberapa meeting dapat tersimpan pada tanggal yang sama"
                    : "Semua topik dari setiap memo meeting"}
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => setMeetingModal(true)}
              >
                ＋ Add meeting
              </button>
            </div>
            {meetingView === "date" ? (
              <div className="meeting-groups">
                {Object.entries(
                  topicOptions.reduce<Record<string, typeof topicOptions>>(
                    (a, item) => {
                      (a[item.meeting.date] ||= []).push(item);
                      return a;
                    },
                    {},
                  ),
                )
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, list]) => (
                    <div className="meeting-date-group" key={date}>
                      <header>
                        <strong>
                          {new Date(`${date}T00:00:00`).toLocaleDateString(
                            "id-ID",
                            {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            },
                          )}
                        </strong>
                        <span>
                          {new Set(list.map((item) => item.meeting.id)).size}{" "}
                          meetings · {list.length} topics
                        </span>
                      </header>
                      <div className="meeting-list">
                        {list.map((item) => (
                          <div
                            className={`date-topic-row ${checkedTopics.includes(item.key) ? "is-selected" : ""}`}
                            key={item.key}
                          >
                            <input
                              className="item-select"
                              type="checkbox"
                              aria-label={`Select topic ${item.topic}`}
                              checked={checkedTopics.includes(item.key)}
                              onChange={() =>
                                setCheckedTopics(
                                  checkedTopics.includes(item.key)
                                    ? checkedTopics.filter(
                                        (key) => key !== item.key,
                                      )
                                    : [...checkedTopics, item.key],
                                )
                              }
                            />
                            <button
                              className="date-topic-open"
                              onClick={() => {
                                setSelectedTopic({
                                  topic: item.topic,
                                  index: item.index,
                                });
                                setSelectedMeeting(item.meeting);
                              }}
                            >
                              <span className="meeting-date">
                                <b>{item.meeting.time}</b>
                                <small>{item.meeting.status}</small>
                              </span>
                              <div className="meeting-main">
                                <strong>{item.topic}</strong>
                                <small>
                                  {item.meeting.title} · {item.meeting.project}
                                </small>
                                <p>
                                  <span>{item.meeting.location}</span>
                                  <span>
                                    {
                                      item.meeting.participants.split(",")
                                        .length
                                    }{" "}
                                    peserta
                                  </span>
                                </p>
                              </div>
                              <span
                                className={`status ${item.meeting.status.toLowerCase()}`}
                              >
                                {item.meeting.status}
                              </span>
                              <b className="row-arrow">›</b>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="topic-grid">
                {topicOptions.map(({ key, meeting, topic, index }) => (
                  <article
                    key={key}
                    className={`topic-card ${checkedTopics.includes(key) ? "is-selected" : ""}`}
                  >
                    <label
                      className="topic-check"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Select topic ${topic}`}
                        checked={checkedTopics.includes(key)}
                        onChange={() =>
                          setCheckedTopics(
                            checkedTopics.includes(key)
                              ? checkedTopics.filter((item) => item !== key)
                              : [...checkedTopics, key],
                          )
                        }
                      />
                    </label>
                    <button
                      className="topic-open"
                      onClick={() => {
                        setSelectedTopic({ topic, index });
                        setSelectedMeeting(meeting);
                      }}
                    >
                      <span>{meeting.date}</span>
                      <strong>{topic}</strong>
                      <small>
                        {meeting.title} · {meeting.project}
                      </small>
                      <b>›</b>
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
      </>
      {meetingModal && (
        <MeetingModal
          initial={editingMeeting}
          onClose={() => setMeetingModal(false)}
          onSave={(meeting) => {
            if (editingMeeting) {
              setMeetings(
                meetings.map((item) =>
                  item.id === editingMeeting.id
                    ? { ...meeting, id: item.id }
                    : item,
                ),
              );
              setEditingMeeting(null);
              setMeetingModal(false);
              addHistory("Work Record", meeting.title, "Edited", "Meeting note diperbarui.");
              notify("Meeting memo berhasil diperbarui.");
            } else saveMeeting(meeting);
          }}
        />
      )}
      {selectedMeeting && (
        <MeetingDetail
          meeting={selectedMeeting}
          selectedTopic={selectedTopic?.topic}
          onClose={() => {
            setSelectedMeeting(null);
            setSelectedTopic(null);
          }}
          onExport={() => {
            const pages = selectedTopic
              ? [
                  meetingTopicPage(
                    selectedMeeting,
                    selectedTopic.topic,
                    selectedTopic.index,
                  ),
                ]
              : meetingPages(selectedMeeting);
            exportPdf(selectedTopic?.topic || selectedMeeting.title, pages);
            notify("Dialog cetak dibuka. Pilih Save as PDF untuk menyimpan.");
          }}
          onExportWord={() => {
            const pages = selectedTopic
              ? [
                  meetingTopicPage(
                    selectedMeeting,
                    selectedTopic.topic,
                    selectedTopic.index,
                  ),
                ]
              : meetingPages(selectedMeeting);
            exportWord(selectedTopic?.topic || selectedMeeting.title, pages);
            notify("Meeting note Word berhasil diunduh.");
          }}
          onEdit={() => {
            setEditingMeeting(selectedMeeting);
            setSelectedMeeting(null);
            setSelectedTopic(null);
            setMeetingModal(true);
          }}
          onDelete={() => {
            const topicToDelete = selectedTopic;
            setMeetings((current) => {
              if (!topicToDelete) {
                return current.filter(
                  (meeting) => meeting.id !== selectedMeeting.id,
                );
              }
              return current
                .map((meeting) =>
                  meeting.id === selectedMeeting.id
                    ? {
                        ...meeting,
                        topics: meeting.topics.filter(
                          (_, index) => index !== topicToDelete.index,
                        ),
                      }
                    : meeting,
                )
                .filter((meeting) => meeting.topics.length > 0);
            });
            if (topicToDelete) {
              setCheckedTopics((current) =>
                current.filter(
                  (key) =>
                    key !== `${selectedMeeting.id}:${topicToDelete.index}`,
                ),
              );
            }
            setSelectedMeeting(null);
            setSelectedTopic(null);
            notify(
              topicToDelete
                ? "Topik meeting berhasil dihapus."
                : "Meeting memo berhasil dihapus.",
            );
            addHistory("Work Record", selectedMeeting.title, "Deleted", topicToDelete ? `Topik “${topicToDelete.topic}” dihapus.` : "Meeting note dihapus.");
          }}
        />
      )}
    </>
  );
}

function MemoWorkspace({
  kind,
  items,
  setItems,
  notify,
}: {
  kind: "daily" | "technical";
  items: WorkMemo[];
  setItems: (items: WorkMemo[]) => void;
  notify: (message: string) => void;
}) {
  const label = kind === "daily" ? "Daily Report" : "Technical Note";
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<WorkMemo | null>(null);
  const [editing, setEditing] = useState<WorkMemo | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const all = items.length > 0 && checked.length === items.length;
  return (
    <>
      <div className="memo-toolbar">
        <div>
          <p className="eyebrow">
            {kind === "daily" ? "DAILY OPERATIONS" : "TECHNICAL KNOWLEDGE"}
          </p>
          <h2>{kind === "daily" ? "Daily Reports" : "Technical Notes"}</h2>
          <p>
            {kind === "daily"
              ? "Catat aktivitas, progres, kendala, dan tindak lanjut harian."
              : "Dokumentasikan temuan, analisis, dan rekomendasi teknis."}
          </p>
        </div>
        <button className="primary" onClick={() => setModal(true)}>
          ＋ New {label.toLowerCase()}
        </button>
      </div>
      <SelectAllRow
        checked={all}
        count={checked.length}
        label={kind === "daily" ? "daily reports" : "technical notes"}
        onChange={() => setChecked(all ? [] : items.map((item) => item.id))}
      />
      {checked.length > 0 && (
        <BulkBar
          count={checked.length}
          onClear={() => setChecked([])}
          onAction={() => {
            const selectedItems = items.filter((item) =>
              checked.includes(item.id),
            );
            exportWord(
              `Selected ${label}s`,
              selectedItems.map((item) => workMemoPage(item, label)),
            );
            notify(
              `${selectedItems.length} ${label.toLowerCase()} berhasil diunduh.`,
            );
          }}
          action="Export selected"
        />
      )}
      <section className="card memo-list">
        {items.map((item) => (
          <div
            className={`memo-row ${checked.includes(item.id) ? "is-selected" : ""}`}
            key={item.id}
          >
            <input
              type="checkbox"
              className="item-select"
              aria-label={`Select ${item.title}`}
              checked={checked.includes(item.id)}
              onChange={() =>
                setChecked(
                  checked.includes(item.id)
                    ? checked.filter((id) => id !== item.id)
                    : [...checked, item.id],
                )
              }
            />
            <button onClick={() => setSelected(item)}>
              <span className="memo-date">
                <b>{new Date(`${item.date}T00:00:00`).getDate()}</b>
                <small>
                  {new Date(`${item.date}T00:00:00`).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                    },
                  )}
                </small>
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.project} · {item.location}
                </small>
                <p>{item.summary}</p>
              </div>
              <span className={`status ${item.status.toLowerCase()}`}>
                {item.status}
              </span>
              <b className="row-arrow">›</b>
            </button>
          </div>
        ))}
      </section>
      {modal && (
        <WorkMemoModal
          label={label}
          initial={editing}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          onSave={(memo) => {
            setItems(
              editing
                ? items.map((item) =>
                    item.id === editing.id ? { ...memo, id: item.id } : item,
                  )
                : [{ ...memo, id: Date.now() }, ...items],
            );
            setModal(false);
            setEditing(null);
            notify(
              `${label} berhasil ${editing ? "diperbarui" : "ditambahkan"}.`,
            );
          }}
        />
      )}
      {selected && (
        <WorkMemoDetail
          memo={selected}
          label={label}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
            setModal(true);
          }}
          onDelete={() => {
            setItems(items.filter((item) => item.id !== selected.id));
            setSelected(null);
            notify(`${label} berhasil dihapus.`);
          }}
          onPdf={() =>
            exportPdf(selected.title, [workMemoPage(selected, label)])
          }
          onWord={() =>
            exportWord(selected.title, [workMemoPage(selected, label)])
          }
        />
      )}
    </>
  );
}

function WorkMemoModal({
  label,
  initial,
  onClose,
  onSave,
}: {
  label: string;
  initial: WorkMemo | null;
  onClose: () => void;
  onSave: (memo: Omit<WorkMemo, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<WorkMemo, "id">>({
    title: initial?.title || "",
    project: initial?.project || "",
    date: initial?.date || "2026-07-18",
    location: initial?.location || "",
    summary: initial?.summary || "",
    details: initial?.details || "",
    followUp: initial?.followUp || "",
    status: initial?.status || "Draft",
    resources: initial?.resources || [],
  });
  const field =
    (key: keyof typeof form) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({ ...form, [key]: event.target.value });
  function updateLinks(value: string) {
    const files = form.resources.filter((resource) => resource.kind === "file");
    const links: MeetingResource[] = value
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, index) => ({
        id: `memo-link-${index}-${url}`,
        name: url,
        url,
        kind: "link",
      }));
    setForm({ ...form, resources: [...links, ...files] });
  }
  async function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    const files = await Promise.all(
      selected.map((file, index) =>
        fileToMeetingResource(file, index, "memo-file"),
      ),
    );
    setForm((current) => ({
      ...current,
      resources: [...current.resources, ...files],
    }));
    event.target.value = "";
  }
  return (
    <div className="modal-backdrop">
      <form
        className="modal meeting-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              {initial
                ? `EDIT ${label.toUpperCase()}`
                : `NEW ${label.toUpperCase()}`}
            </p>
            <h2>{initial ? `Edit ${label}` : `Create ${label}`}</h2>
          </div>
          <button type="button" aria-label="Close form" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="form-grid">
          <label className="wide">
            Title
            <input required value={form.title} onChange={field("title")} />
          </label>
          <label>
            Project
            <input required value={form.project} onChange={field("project")} />
          </label>
          <label>
            Date
            <input
              required
              type="date"
              value={form.date}
              onChange={field("date")}
            />
          </label>
          <label className="wide">
            Location
            <input
              required
              value={form.location}
              onChange={field("location")}
            />
          </label>
          <div className="wide rich-field">
            <span className="field-label">Memo content</span>
            <RichDocumentEditor
              value={form.details}
              onChange={(details) =>
                setForm({
                  ...form,
                  details,
                  summary: form.summary || "Rich memo content",
                })
              }
              placeholder="Add the report, findings, images, tables, and links..."
            />
          </div>
          <label className="wide">
            Summary
            <textarea
              required
              rows={3}
              value={form.summary}
              onChange={field("summary")}
            />
          </label>
          <label className="wide">
            Follow up
            <textarea
              rows={3}
              value={form.followUp}
              onChange={field("followUp")}
            />
          </label>
          <section className="wide meeting-resource-field">
            <div>
              <strong>Insert resources</strong>
              <small>Tambahkan URL atau upload file pendukung.</small>
            </div>
            <label>
              URL
              <textarea
                rows={3}
                value={form.resources
                  .filter((resource) => resource.kind === "link")
                  .map((resource) => resource.url)
                  .join("\n")}
                onChange={(event) => updateLinks(event.target.value)}
                placeholder="Satu URL per baris"
              />
            </label>
            <label className="meeting-upload">
              <span>Upload files</span>
              <input type="file" multiple onChange={addFiles} />
            </label>
            {form.resources.length > 0 && (
              <div className="meeting-resource-list">
                {form.resources.map((resource) => (
                  <div key={resource.id}>
                    <div className="meeting-resource-thumb">
                      <span>{resource.kind === "link" ? "URL" : "FILE"}</span>
                      {canPreviewImage(resource) && (
                        <img
                          src={resource.url}
                          alt={`Preview ${resource.name}`}
                        />
                      )}
                    </div>
                    <span>{resource.kind === "link" ? "URL" : "FILE"}</span>
                    <strong>{resource.name}</strong>
                    {resource.size && (
                      <small>
                        {Math.max(1, Math.round(resource.size / 1024))} KB
                      </small>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          resources: form.resources.filter(
                            (item) => item.id !== resource.id,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <label>
            Status
            <select value={form.status} onChange={field("status")}>
              <option>Draft</option>
              <option>Completed</option>
            </select>
          </label>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save {label.toLowerCase()}
          </button>
        </footer>
      </form>
    </div>
  );
}

function WorkMemoDetail({
  memo,
  label,
  onClose,
  onEdit,
  onDelete,
  onPdf,
  onWord,
}: {
  memo: WorkMemo;
  label: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPdf: () => void;
  onWord: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<MeetingResource | null>(null);
  return (
    <div className="modal-backdrop">
      <section
        className="modal meeting-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`${label} ${memo.title}`}
      >
        <header>
          <div>
            <p className="eyebrow">{label.toUpperCase()}</p>
            <h2>{memo.title}</h2>
            <small>{memo.project}</small>
          </div>
          <button type="button" aria-label="Close detail" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="meeting-detail-body">
          <div className="meeting-meta">
            <div>
              <span>Date</span>
              <strong>{memo.date}</strong>
            </div>
            <div>
              <span>Location</span>
              <strong>{memo.location}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={`status ${memo.status.toLowerCase()}`}>
                {memo.status}
              </strong>
            </div>
          </div>
          <article>
            <h3>Summary</h3>
            <div
              className="rendered-document"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichHtml(memo.summary),
              }}
            />
            <h3>Details</h3>
            <div
              className="rendered-document"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichHtml(memo.details),
              }}
            />
            <h3>Follow up</h3>
            <p>{memo.followUp || "—"}</p>
            {memo.resources.length > 0 && (
              <>
                <h3>Resources</h3>
                <div className="meeting-image-previews">
                  {memo.resources.filter(canPreviewImage).map((resource) => (
                    <div className="meeting-image-card" key={resource.id}>
                      <button
                        type="button"
                        className="meeting-image-open"
                        onClick={() => setPreview(resource)}
                      >
                        <img
                          src={resource.url}
                          alt={`Preview ${resource.name}`}
                        />
                        <span>{resource.name}</span>
                      </button>
                      <button
                        type="button"
                        className="meeting-image-download"
                        onClick={() => downloadMeetingResource(resource)}
                      >
                        ↓ Download
                      </button>
                    </div>
                  ))}
                </div>
                <div className="meeting-detail-resources">
                  {memo.resources
                    .filter((resource) => !canPreviewImage(resource))
                    .map((resource) => (
                      <a
                        key={resource.id}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span>{resource.kind === "link" ? "URL" : "FILE"}</span>
                        <strong>{resource.name}</strong>
                        <b>↗</b>
                      </a>
                    ))}
                </div>
              </>
            )}
          </article>
        </div>
        <footer>
          <button
            className="delete-text"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
          <button className="secondary" onClick={onEdit}>
            Edit
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button className="secondary" onClick={onWord}>
            Export Word
          </button>
          <button className="primary" onClick={onPdf}>
            Export PDF
          </button>
        </footer>
        {confirmDelete && (
          <div className="confirm-panel">
            <div>
              <h3>Delete {label}?</h3>
              <p>“{memo.title}” will be permanently deleted.</p>
              <div>
                <button
                  className="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button className="danger" onClick={onDelete}>
                  Delete item
                </button>
              </div>
            </div>
          </div>
        )}
        {preview && (
          <div
            className="meeting-image-lightbox"
            role="dialog"
            aria-modal="true"
            onClick={() => setPreview(null)}
          >
            <div onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="meeting-lightbox-close"
                onClick={() => setPreview(null)}
              >
                ×
              </button>
              <img src={preview.url} alt={`Full preview ${preview.name}`} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MeetingModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Meeting | null;
  onClose: () => void;
  onSave: (meeting: Omit<Meeting, "id">) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Omit<Meeting, "id">>({
    title: initial?.title || "",
    project: initial?.project || "",
    date: initial?.date || "2026-07-18",
    time: initial?.time || "09:00",
    location: initial?.location || "",
    participants: initial?.participants || "",
    topics: initial?.topics || [""],
    resources: initial?.resources || [],
    summary: initial?.summary || "",
    followUp: initial?.followUp || "",
    status: initial?.status || "Draft",
  });
  const field =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({ ...form, [key]: e.target.value });
  function updateLinks(value: string) {
    const files = form.resources.filter((resource) => resource.kind === "file");
    const links: MeetingResource[] = value
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, index) => ({
        id: `link-${index}-${url}`,
        name: url,
        url,
        kind: "link",
      }));
    setForm({ ...form, resources: [...links, ...files] });
  }
  async function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    const files = await Promise.all(
      selected.map((file, index) => fileToMeetingResource(file, index, "file")),
    );
    setForm((current) => ({
      ...current,
      resources: [...current.resources, ...files],
    }));
    e.target.value = "";
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    window.setTimeout(
      () =>
        onSave({
          ...form,
          topics: form.topics.map((t) => t.trim()).filter(Boolean),
        }),
      350,
    );
  }
  return (
    <div className="modal-backdrop">
      <form
        className="modal meeting-modal"
        onSubmit={submit}
        aria-label="Form meeting note"
      >
        <header>
          <div>
            <p className="eyebrow">NEW WORK RECORD</p>
            <h2>Buat meeting note</h2>
            <small>Simpan beberapa topik dalam satu memo meeting.</small>
          </div>
          <button type="button" aria-label="Tutup form" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="form-grid">
          <label className="wide">
            Judul rapat
            <input
              required
              value={form.title}
              onChange={field("title")}
              placeholder="Contoh: Weekly Coal Project Coordination"
            />
          </label>
          <label>
            Project
            <input
              required
              value={form.project}
              onChange={field("project")}
              placeholder="Nama project"
            />
          </label>
          <label>
            Lokasi / platform
            <input
              required
              value={form.location}
              onChange={field("location")}
              placeholder="Meeting Room atau Online"
            />
          </label>
          <label>
            Tanggal
            <input
              required
              type="date"
              value={form.date}
              onChange={field("date")}
            />
          </label>
          <label>
            Waktu
            <input
              required
              type="time"
              value={form.time}
              onChange={field("time")}
            />
          </label>
          <label className="wide">
            Peserta
            <input
              required
              value={form.participants}
              onChange={field("participants")}
              placeholder="Pisahkan nama dengan koma"
            />
          </label>
          <label className="wide">
            Topik pembahasan
            <textarea
              required
              rows={4}
              value={form.topics.join("\n")}
              onChange={(e) =>
                setForm({ ...form, topics: e.target.value.split("\n") })
              }
              placeholder={
                "Satu topik per baris\nContoh: Coring progress\nCore sample result\nDrilling schedule"
              }
            />
            <small className="helper">
              Masukkan satu topik pada setiap baris.
            </small>
          </label>
          <section className="wide meeting-resource-field">
            <div>
              <strong>Insert resources</strong>
              <small>Tambahkan URL atau upload file pendukung meeting.</small>
            </div>
            <label>
              URL
              <textarea
                rows={3}
                value={form.resources
                  .filter((resource) => resource.kind === "link")
                  .map((resource) => resource.url)
                  .join("\n")}
                onChange={(e) => updateLinks(e.target.value)}
                placeholder={"Satu URL per baris\nhttps://example.com/document"}
              />
            </label>
            <label className="meeting-upload">
              <span>Upload files</span>
              <input type="file" multiple onChange={addFiles} />
              <small>
                Dokumen, gambar, spreadsheet, PDF, dan file pendukung lain.
              </small>
            </label>
            {form.resources.length > 0 && (
              <div className="meeting-resource-list">
                {form.resources.map((resource) => (
                  <div key={resource.id}>
                    <div className="meeting-resource-thumb">
                      <span>{resource.kind === "link" ? "URL" : "FILE"}</span>
                      {canPreviewImage(resource) && (
                        <img
                          src={resource.url}
                          alt={`Preview ${resource.name}`}
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </div>
                    <span>{resource.kind === "link" ? "URL" : "FILE"}</span>
                    <strong>{resource.name}</strong>
                    {resource.size && (
                      <small>
                        {Math.max(1, Math.round(resource.size / 1024))} KB
                      </small>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${resource.name}`}
                      onClick={() =>
                        setForm({
                          ...form,
                          resources: form.resources.filter(
                            (item) => item.id !== resource.id,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="wide rich-field">
            <span className="field-label">Meeting memo</span>
            <RichDocumentEditor
              value={form.summary}
              onChange={(summary) => setForm({ ...form, summary })}
              placeholder="Write discussion notes, decisions, tables, images, and links..."
            />
          </div>
          <label className="wide">
            Tindak lanjut
            <textarea
              required
              rows={3}
              value={form.followUp}
              onChange={field("followUp")}
              placeholder="Tugas, penanggung jawab, dan target tanggal..."
            />
          </label>
          <label>
            Status
            <select value={form.status} onChange={field("status")}>
              <option value="Draft">Draft</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={saving} type="submit">
            {saving ? "Saving..." : "Save meeting note"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function MeetingRow({
  meeting,
  checked,
  onCheck,
  onOpen,
}: {
  meeting: Meeting;
  checked: boolean;
  onCheck: () => void;
  onOpen: () => void;
}) {
  return (
    <div className={`meeting-row ${checked ? "is-selected" : ""}`}>
      <input
        className="item-select"
        type="checkbox"
        aria-label={`Select ${meeting.title}`}
        checked={checked}
        onChange={onCheck}
      />
      <button className="meeting-open" onClick={onOpen}>
        <span className="meeting-date">
          <b>{meeting.time}</b>
          <small>{meeting.status}</small>
        </span>
        <div className="meeting-main">
          <strong>{meeting.title}</strong>
          <small>{meeting.project}</small>
          <p>
            <span>{meeting.location}</span>
            <span>{meeting.participants.split(",").length} peserta</span>
            <span>{meeting.topics.length} topik</span>
          </p>
        </div>
        <span className={`status ${meeting.status.toLowerCase()}`}>
          {meeting.status}
        </span>
        <b className="row-arrow">›</b>
      </button>
    </div>
  );
}

function MeetingDetail({
  meeting,
  selectedTopic,
  onClose,
  onExport,
  onExportWord,
  onEdit,
  onDelete,
}: {
  meeting: Meeting;
  selectedTopic?: string;
  onClose: () => void;
  onExport: () => void;
  onExportWord: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewResource, setPreviewResource] =
    useState<MeetingResource | null>(null);
  useEffect(() => {
    if (!previewResource) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewResource(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewResource]);
  return (
    <div className="modal-backdrop">
      <section
        className="modal meeting-detail"
        role="dialog"
        aria-modal="true"
        aria-label={
          selectedTopic
            ? `Meeting topic ${selectedTopic}`
            : `Meeting ${meeting.title}`
        }
      >
        <header>
          <div>
            <p className="eyebrow">
              {selectedTopic ? "MEETING TOPIC" : "MEETING NOTE"}
            </p>
            <h2>{selectedTopic || meeting.title}</h2>
            <small>
              {selectedTopic
                ? `${meeting.title} · ${meeting.project}`
                : meeting.project}
            </small>
          </div>
          <button type="button" aria-label="Tutup detail" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="meeting-detail-body">
          <div className="meeting-meta">
            <div>
              <span>Tanggal</span>
              <strong>
                {new Date(`${meeting.date}T00:00:00`).toLocaleDateString(
                  "id-ID",
                  { day: "numeric", month: "long", year: "numeric" },
                )}
              </strong>
            </div>
            <div>
              <span>Waktu</span>
              <strong>{meeting.time} WIB</strong>
            </div>
            <div>
              <span>Lokasi</span>
              <strong>{meeting.location}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong className={`status ${meeting.status.toLowerCase()}`}>
                {meeting.status}
              </strong>
            </div>
          </div>
          <article>
            <h3>Peserta</h3>
            <p>{meeting.participants}</p>
            {!selectedTopic && (
              <>
                <h3>Topik pembahasan</h3>
                <ol className="meeting-topics">
                  {meeting.topics.filter(Boolean).map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ol>
              </>
            )}
            <h3>Ringkasan pembahasan</h3>
            <div
              className="rendered-document"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichHtml(meeting.summary),
              }}
            />
            <h3>Tindak lanjut</h3>
            <p>{meeting.followUp}</p>
            {meeting.resources.length > 0 && (
              <>
                <h3>Resources</h3>
                <div className="meeting-image-previews">
                  {meeting.resources.filter(canPreviewImage).map((resource) => (
                    <div
                      className="meeting-image-card"
                      key={`preview-${resource.id}`}
                    >
                      <button
                        type="button"
                        className="meeting-image-open"
                        onClick={() => setPreviewResource(resource)}
                        aria-label={`Open full image ${resource.name}`}
                      >
                        <img
                          src={resource.url}
                          alt={`Preview ${resource.name}`}
                          onError={(e) => {
                            const preview = e.currentTarget.closest(
                              ".meeting-image-card",
                            ) as HTMLElement | null;
                            if (preview) preview.style.display = "none";
                          }}
                        />
                        <span>{resource.name}</span>
                      </button>
                      <button
                        type="button"
                        className="meeting-image-download"
                        onClick={() => downloadMeetingResource(resource)}
                        aria-label={`Download ${resource.name}`}
                      >
                        ↓ Download
                      </button>
                    </div>
                  ))}
                </div>
                <div className="meeting-detail-resources">
                  {meeting.resources
                    .filter((resource) => !canPreviewImage(resource))
                    .map((resource) => (
                      <a
                        key={resource.id}
                        href={resource.url}
                        target={resource.kind === "link" ? "_blank" : undefined}
                        rel={
                          resource.kind === "link" ? "noreferrer" : undefined
                        }
                        download={
                          resource.kind === "file" ? resource.name : undefined
                        }
                      >
                        <span>{resource.kind === "link" ? "URL" : "FILE"}</span>
                        <strong>{resource.name}</strong>
                        <b>↗</b>
                      </a>
                    ))}
                </div>
              </>
            )}
          </article>
        </div>
        <footer>
          <button
            className="delete-text"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
          <button className="secondary" onClick={onEdit}>
            Edit
          </button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          <button className="secondary" onClick={onExportWord}>
            Export Word
          </button>
          <button className="primary" onClick={onExport}>
            Export PDF
          </button>
        </footer>
        {confirmDelete && (
          <div className="confirm-panel">
            <div>
              <h3>
                {selectedTopic ? "Hapus topik meeting?" : "Hapus meeting memo?"}
              </h3>
              <p>
                {selectedTopic
                  ? `Topik “${selectedTopic}” akan dihapus dari memo ini.`
                  : `Memo “${meeting.title}” beserta seluruh topiknya akan dihapus.`}
              </p>
              <div>
                <button
                  className="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button className="danger" onClick={onDelete}>
                  {selectedTopic ? "Delete topic" : "Delete memo"}
                </button>
              </div>
            </div>
          </div>
        )}
        {previewResource && (
          <div
            className="meeting-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={`Full image ${previewResource.name}`}
            onClick={() => setPreviewResource(null)}
          >
            <div onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="meeting-lightbox-close"
                onClick={() => setPreviewResource(null)}
                aria-label="Close full image"
              >
                ×
              </button>
              <img
                src={previewResource.url}
                alt={`Full preview ${previewResource.name}`}
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Agenda({
  mode,
  items,
  setItems,
  categories,
  setCategories,
  addHistory,
  notify,
}: {
  mode: "agenda" | "reminders";
  items: AgendaItem[];
  setItems: (items: AgendaItem[]) => void;
  categories: string[];
  setCategories: (categories: string[]) => void;
  addHistory: (entity: string, title: string, action: VersionEntry["action"], detail: string) => void;
  notify: (s: string) => void;
}) {
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<AgendaItem | null>(null);
  const [editing, setEditing] = useState<AgendaItem | null>(null);
  const [categoryModal, setCategoryModal] = useState(false);
  const [checked, setChecked] = useState<number[]>([]);
  const [filter, setFilter] = useState("All");
  const visible = items.filter(
    (item) =>
      (mode === "reminders" ? item.reminder : true) &&
      (filter === "All" || item.category === filter),
  );
  const grouped = visible.reduce<Record<string, AgendaItem[]>>((acc, item) => {
    (acc[item.date] ||= []).push(item);
    return acc;
  }, {});
  function toggleComplete(id: number) {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    );
    notify("Status agenda diperbarui.");
  }
  function toggleReminder(id: number) {
    setItems(
      items.map((item) =>
        item.id === id ? { ...item, reminder: !item.reminder } : item,
      ),
    );
    notify(
      mode === "reminders"
        ? "Reminder dinonaktifkan."
        : "Reminder agenda diperbarui.",
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {mode === "agenda" ? "PERSONAL PLANNER" : "STAY ON TRACK"}
          </p>
          <h1>{mode === "agenda" ? "Agenda" : "Reminders"}</h1>
          <p>
            {mode === "agenda"
              ? "Atur meeting, tugas, dan deadline dalam satu jadwal."
              : "Pengingat yang terhubung langsung dengan agenda Anda."}
          </p>
        </div>
        <div className="head-actions">
          <button className="secondary" onClick={() => setCategoryModal(true)}>
            Manage categories
          </button>
          <button className="primary" onClick={() => setModal(true)}>
            ＋ {mode === "agenda" ? "New agenda" : "New reminder"}
          </button>
        </div>
      </div>
      <div className="planner-summary">
        <div className="card">
          <span>Today</span>
          <strong>{items.filter((i) => i.date === "2026-07-18").length}</strong>
          <small>agenda items</small>
        </div>
        <div className="card">
          <span>Upcoming</span>
          <strong>{items.filter((i) => i.date > "2026-07-18").length}</strong>
          <small>after today</small>
        </div>
        <div className="card">
          <span>Reminders</span>
          <strong>{items.filter((i) => i.reminder).length}</strong>
          <small>active alerts</small>
        </div>
      </div>
      <SelectAllRow
        checked={
          visible.length > 0 && visible.every((i) => checked.includes(i.id))
        }
        count={checked.length}
        label={mode}
        onChange={() =>
          setChecked(
            visible.length > 0 && visible.every((i) => checked.includes(i.id))
              ? checked.filter((id) => !visible.some((i) => i.id === id))
              : [...new Set([...checked, ...visible.map((i) => i.id)])],
          )
        }
      />
      {checked.length > 0 && (
        <BulkBar
          count={checked.length}
          onClear={() => setChecked([])}
          onAction={() => notify(`${checked.length} agenda items dipilih.`)}
          action={
            mode === "reminders" ? "Turn off reminders" : "Mark completed"
          }
        />
      )}
      <div className="planner-layout">
        <section className="card agenda-panel">
          <div className="agenda-toolbar">
            <div>
              {["All", ...categories].map((item) => (
                <button
                  key={item}
                  className={filter === item ? "active" : ""}
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <span>{visible.length} items</span>
          </div>
          {Object.keys(grouped).length ? (
            Object.entries(grouped)
              .sort()
              .map(([date, agenda]) => (
                <div className="agenda-day" key={date}>
                  <div className="agenda-day-label">
                    <strong>
                      {new Date(`${date}T00:00:00`).toLocaleDateString(
                        "id-ID",
                        { weekday: "long" },
                      )}
                    </strong>
                    <span>
                      {new Date(`${date}T00:00:00`).toLocaleDateString(
                        "id-ID",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </span>
                  </div>
                  <div>
                    {agenda
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((item) => (
                        <article
                          className={`agenda-item ${item.completed ? "is-complete" : ""} ${checked.includes(item.id) ? "is-selected" : ""}`}
                          key={item.id}
                        >
                          <input
                            className="item-select"
                            type="checkbox"
                            aria-label={`Select ${item.title}`}
                            checked={checked.includes(item.id)}
                            onChange={() =>
                              setChecked(
                                checked.includes(item.id)
                                  ? checked.filter((id) => id !== item.id)
                                  : [...checked, item.id],
                              )
                            }
                          />
                          <button
                            className="agenda-check"
                            aria-label={`Tandai ${item.title} selesai`}
                            onClick={() => toggleComplete(item.id)}
                          >
                            {item.completed ? "✓" : ""}
                          </button>
                          <time>
                            {item.time}
                            <small>{item.endTime}</small>
                          </time>
                          <button
                            className="agenda-copy"
                            onClick={() => setSelected(item)}
                          >
                            <span>{item.category}</span>
                            <h3>{item.title}</h3>
                            <p>
                              {item.location} · {item.notes}
                            </p>
                          </button>
                          <button
                            className={`reminder-toggle ${item.reminder ? "on" : ""}`}
                            aria-label={`${item.reminder ? "Matikan" : "Aktifkan"} reminder ${item.title}`}
                            onClick={() => toggleReminder(item.id)}
                          >
                            <b>◷</b>
                            <small>
                              {item.reminder ? reminderLabel(item) : "Off"}
                            </small>
                          </button>
                        </article>
                      ))}
                  </div>
                </div>
              ))
          ) : (
            <div className="planner-empty">
              <span>◷</span>
              <h2>Belum ada reminder</h2>
              <p>Aktifkan reminder dari agenda atau buat reminder baru.</p>
              <button className="secondary" onClick={() => setModal(true)}>
                Create reminder
              </button>
            </div>
          )}
        </section>
        <aside className="card mini-calendar">
          <header>
            <strong>July 2026</strong>
            <button aria-label="Bulan berikutnya">›</button>
          </header>
          <div className="calendar-grid">
            {["M", "S", "S", "R", "K", "J", "S"].map((d, i) => (
              <b key={`${d}-${i}`}>{d}</b>
            ))}
            {[...Array(3)].map((_, i) => (
              <i key={`blank-${i}`} />
            ))}
            {[...Array(31)].map((_, i) => (
              <button
                key={i + 1}
                className={
                  i + 1 === 18
                    ? "today"
                    : items.some((a) => Number(a.date.slice(-2)) === i + 1)
                      ? "has-item"
                      : ""
                }
              >
                {i + 1}
              </button>
            ))}
          </div>
          <div className="calendar-legend">
            <span>
              <i /> Agenda
            </span>
            <span>
              <i /> Today
            </span>
          </div>
        </aside>
      </div>
      {selected && (
        <DetailPopup
          type={mode === "agenda" ? "AGENDA" : "REMINDER"}
          title={selected.title}
          subtitle={`${selected.category} · ${selected.location}`}
          fields={[
            ["Date", agendaDateRange(selected)],
            ["Time", `${selected.time}–${selected.endTime}`],
            ["Reminder", reminderLabel(selected)],
            ["Status", selected.completed ? "Completed" : "Upcoming"],
          ]}
          description={selected.notes}
          onClose={() => setSelected(null)}
          onAction={() => {
            toggleReminder(selected.id);
            setSelected(null);
          }}
          action={selected.reminder ? "Turn off reminder" : "Turn on reminder"}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
            setModal(true);
          }}
          onDelete={() => {
            setItems(items.filter((item) => item.id !== selected.id));
            addHistory("Agenda", selected.title, "Deleted", "Agenda dihapus.");
            setSelected(null);
            notify("Agenda berhasil dihapus.");
          }}
        />
      )}
      {modal && (
        <AgendaModal
          reminderFirst={mode === "reminders"}
          initial={editing}
          categories={categories}
          onClose={() => {
            setModal(false);
            setEditing(null);
            addHistory("Agenda", item.title, editing ? "Edited" : "Created", editing ? "Agenda diperbarui." : "Agenda baru dibuat.");
          }}
          onSave={(item) => {
            setItems(
              editing
                ? items.map((existing) =>
                    existing.id === editing.id
                      ? {
                          ...item,
                          id: existing.id,
                          completed: existing.completed,
                        }
                      : existing,
                  )
                : [{ ...item, id: Date.now(), completed: false }, ...items],
            );
            setModal(false);
            setEditing(null);
            notify(
              item.reminder
                ? "Agenda dan reminder berhasil dibuat."
                : "Agenda berhasil dibuat.",
            );
          }}
        />
      )}
      {categoryModal && (
        <AgendaCategoryManager
          categories={categories}
          onClose={() => setCategoryModal(false)}
          onAdd={(name) => {
            setCategories([...categories, name]);
            addHistory("Agenda category", name, "Created", "Kategori agenda ditambahkan.");
            notify("Kategori agenda berhasil ditambahkan.");
          }}
          onRename={(oldName, newName) => {
            setCategories(categories.map((name) => (name === oldName ? newName : name)));
            setItems(items.map((item) => item.category === oldName ? { ...item, category: newName } : item));
            if (filter === oldName) setFilter(newName);
            addHistory("Agenda category", oldName, "Edited", `Kategori diubah menjadi ${newName}.`);
            notify("Kategori agenda berhasil diperbarui.");
          }}
          onDelete={(name) => {
            const replacement = categories.find((category) => category !== name) || "Uncategorized";
            setCategories(categories.filter((category) => category !== name));
            setItems(items.map((item) => item.category === name ? { ...item, category: replacement } : item));
            if (filter === name) setFilter("All");
            addHistory("Agenda category", name, "Deleted", "Kategori agenda dihapus.");
            notify("Kategori agenda berhasil dihapus.");
          }}
        />
      )}
    </>
  );
}

function AgendaModal({
  reminderFirst,
  initial,
  categories,
  onClose,
  onSave,
}: {
  reminderFirst: boolean;
  initial?: AgendaItem | null;
  categories: string[];
  onClose: () => void;
  onSave: (item: Omit<AgendaItem, "id" | "completed">) => void;
}) {
  const [form, setForm] = useState<Omit<AgendaItem, "id" | "completed">>({
    title: initial?.title || "",
    date: initial?.date || "2026-07-18",
    endDate: initial?.endDate || initial?.date || "2026-07-18",
    time: initial?.time || "09:00",
    endTime: initial?.endTime || "10:00",
    location: initial?.location || "",
    category: initial?.category || categories[0] || "Meeting",
    notes: initial?.notes || "",
    reminder: initial?.reminder ?? reminderFirst,
    reminderMinutes: initial?.reminderMinutes || 30,
    reminderMode: initial?.reminderMode || "once",
    reminderFrequency: initial?.reminderFrequency || "daily",
    reminderStartDate: initial?.reminderStartDate || initial?.date || "2026-07-18",
    reminderEndDate:
      initial?.reminderEndDate || initial?.endDate || initial?.date || "2026-07-18",
  });
  const field =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({
        ...form,
        [key]:
          e.target.type === "checkbox"
            ? (e.target as HTMLInputElement).checked
            : key === "reminderMinutes"
              ? Number(e.target.value)
              : e.target.value,
      });
  return (
    <div className="modal-backdrop">
      <form
        className="modal agenda-modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <header>
          <div>
            <p className="eyebrow">AGENDA & REMINDER</p>
            <h2>Buat agenda baru</h2>
            <small>Reminder dapat diaktifkan pada agenda yang sama.</small>
          </div>
          <button
            type="button"
            aria-label="Tutup form agenda"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="form-grid">
          <label className="wide">
            Judul agenda
            <input
              required
              value={form.title}
              onChange={field("title")}
              placeholder="Contoh: Project coordination meeting"
            />
          </label>
          <label>
            Tanggal mulai
            <input
              required
              type="date"
              value={form.date}
              onChange={field("date")}
            />
          </label>
          <label>
            Tanggal selesai
            <input
              required
              type="date"
              min={form.date}
              value={form.endDate}
              onChange={field("endDate")}
            />
          </label>
          <label>
            Kategori
            <select value={form.category} onChange={field("category")}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            Mulai
            <input
              required
              type="time"
              value={form.time}
              onChange={field("time")}
            />
          </label>
          <label>
            Selesai
            <input
              required
              type="time"
              value={form.endTime}
              onChange={field("endTime")}
            />
          </label>
          <label className="wide">
            Lokasi
            <input
              value={form.location}
              onChange={field("location")}
              placeholder="Lokasi atau meeting link"
            />
          </label>
          <label className="wide">
            Catatan
            <textarea
              rows={3}
              value={form.notes}
              onChange={field("notes")}
              placeholder="Detail yang perlu disiapkan..."
            />
          </label>
          <div className="wide reminder-field">
            <label>
              <input
                type="checkbox"
                checked={form.reminder}
                onChange={field("reminder")}
              />
              <span>
                <strong>Aktifkan reminder</strong>
                <small>Pengingat ini akan terhubung dengan agenda.</small>
              </span>
            </label>
            {form.reminder && (
              <div className="reminder-options">
                <label>
                  Jenis reminder
                  <select value={form.reminderMode} onChange={field("reminderMode")}>
                    <option value="once">Satu kali</option>
                    <option value="recurring">Berulang</option>
                  </select>
                </label>
                {form.reminderMode === "once" ? (
                  <label>
                    Ingatkan
                    <select value={form.reminderMinutes} onChange={field("reminderMinutes")}>
                      <option value={10}>10 menit sebelumnya</option>
                      <option value={30}>30 menit sebelumnya</option>
                      <option value={60}>1 jam sebelumnya</option>
                      <option value={1440}>1 hari sebelumnya</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label>
                      Ulangi
                      <select value={form.reminderFrequency} onChange={field("reminderFrequency")}>
                        <option value="daily">Setiap hari</option>
                        <option value="weekly">Setiap minggu</option>
                      </select>
                    </label>
                    <label>
                      Mulai reminder
                      <input type="date" value={form.reminderStartDate} onChange={field("reminderStartDate")} />
                    </label>
                    <label>
                      Berakhir reminder
                      <input type="date" min={form.reminderStartDate} value={form.reminderEndDate} onChange={field("reminderEndDate")} />
                    </label>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save agenda
          </button>
        </footer>
      </form>
    </div>
  );
}

function AgendaCategoryManager({
  categories,
  onClose,
  onAdd,
  onRename,
  onDelete,
}: {
  categories: string[];
  onClose: () => void;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  return (
    <div className="modal-backdrop">
      <section className="modal category-modal" role="dialog" aria-modal="true" aria-label="Kelola kategori agenda">
        <header>
          <div>
            <p className="eyebrow">AGENDA CATEGORIES</p>
            <h2>Manage categories</h2>
          </div>
          <button type="button" aria-label="Tutup kategori" onClick={onClose}>×</button>
        </header>
        <div className="category-list">
          {categories.map((category) => (
            <div key={category}>
              {editing === category ? (
                <input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
              ) : (
                <strong>{category}</strong>
              )}
              <div className="category-actions">
                {editing === category ? (
                  <button className="save-action" onClick={() => {
                    const next = name.trim();
                    if (next && next !== category) onRename(category, next);
                    setEditing(null);
                  }}>Save</button>
                ) : (
                  <button onClick={() => { setEditing(category); setName(category); }}>Edit</button>
                )}
                <button className="delete-action" onClick={() => onDelete(category)} disabled={categories.length === 1}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <form className="category-add" onSubmit={(event) => {
          event.preventDefault();
          const value = newCategory.trim();
          if (value && !categories.includes(value)) { onAdd(value); setNewCategory(""); }
        }}>
          <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category, e.g. Dinas luar" />
          <button className="primary" type="submit">Add</button>
        </form>
        <footer><span>Category yang dihapus akan dipindahkan ke kategori lain.</span><button className="secondary" onClick={onClose}>Close</button></footer>
      </section>
    </div>
  );
}

function Notes({
  notes,
  setNotes,
  addHistory,
  notify,
}: {
  notes: QuickNote[];
  setNotes: (notes: QuickNote[]) => void;
  addHistory: (entity: string, title: string, action: VersionEntry["action"], detail: string) => void;
  notify: (s: string) => void;
}) {
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<QuickNote | null>(null);
  const [editing, setEditing] = useState<QuickNote | null>(null);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<number[]>([]);
  const visible = notes
    .filter((note) =>
      `${note.title} ${note.content} ${note.tag}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const all =
    visible.length > 0 && visible.every((n) => checked.includes(n.id));
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">QUICK CAPTURE</p>
          <h1>Notes</h1>
          <p>Simpan ide, pertanyaan, dan informasi penting secara cepat.</p>
        </div>
        <button className="primary" onClick={() => setModal(true)}>
          ＋ New note
        </button>
      </div>
      <div className="notes-toolbar">
        <div>
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes..."
            aria-label="Cari notes"
          />
        </div>
        <span>{visible.length} notes</span>
      </div>
      <SelectAllRow
        checked={all}
        count={checked.length}
        label="notes"
        onChange={() =>
          setChecked(
            all
              ? checked.filter((id) => !visible.some((n) => n.id === id))
              : [...new Set([...checked, ...visible.map((n) => n.id)])],
          )
        }
      />
      {checked.length > 0 && (
        <BulkBar
          count={checked.length}
          onClear={() => setChecked([])}
          onAction={() => {
            const selectedNotes = notes.filter((note) =>
              checked.includes(note.id),
            );
            exportWord(
              "Selected Notes",
              selectedNotes.map((note) => ({
                title: note.title,
                subtitle: `${note.tag} · ${note.updated}`,
                blocks: [{ heading: "Note", body: note.content }],
              })),
            );
            notify(`${selectedNotes.length} notes berhasil diunduh.`);
          }}
          action="Export selected"
        />
      )}
      <div className="notes-grid">
        {visible.map((note) => (
          <article
            className={`card note-card selectable-card ${note.pinned ? "pinned" : ""} ${checked.includes(note.id) ? "is-selected" : ""}`}
            key={note.id}
          >
            <label className="floating-check">
              <input
                type="checkbox"
                aria-label={`Select ${note.title}`}
                checked={checked.includes(note.id)}
                onChange={() =>
                  setChecked(
                    checked.includes(note.id)
                      ? checked.filter((id) => id !== note.id)
                      : [...checked, note.id],
                  )
                }
              />
            </label>
            <header>
              <span>{note.tag}</span>
              <button
                aria-label={`${note.pinned ? "Lepas" : "Sematkan"} ${note.title}`}
                onClick={() => {
                  setNotes(
                    notes.map((n) =>
                      n.id === note.id ? { ...n, pinned: !n.pinned } : n,
                    ),
                  );
                  notify(
                    note.pinned ? "Note dilepas dari pin." : "Note disematkan.",
                  );
                }}
              >
                {note.pinned ? "Pinned" : "Pin"}
              </button>
            </header>
            <button className="note-open" onClick={() => setSelected(note)}>
              <h2>{note.title}</h2>
              <p>{note.content}</p>
            </button>
            <footer>
              <small>{note.updated}</small>
              <button
                onClick={() => {
                  setNotes(notes.filter((n) => n.id !== note.id));
                  addHistory("Note", note.title, "Deleted", "Note dihapus.");
                  notify("Note dihapus.");
                }}
              >
                Delete
              </button>
            </footer>
          </article>
        ))}
        {!visible.length && (
          <div className="card planner-empty">
            <span>≡</span>
            <h2>Note tidak ditemukan</h2>
            <p>Coba kata pencarian lain atau buat note baru.</p>
          </div>
        )}
      </div>
      {selected && (
        <DetailPopup
          type="NOTE"
          title={selected.title}
          subtitle={selected.tag}
          fields={[
            ["Updated", selected.updated],
            ["Pinned", selected.pinned ? "Yes" : "No"],
          ]}
          description={selected.content}
          onClose={() => setSelected(null)}
          onAction={() => {
            setNotes(
              notes.map((n) =>
                n.id === selected.id ? { ...n, pinned: !n.pinned } : n,
              ),
            );
            setSelected(null);
            notify("Status pin note diperbarui.");
          }}
          action={selected.pinned ? "Unpin note" : "Pin note"}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
            setModal(true);
          }}
          onDelete={() => {
            setNotes(notes.filter((note) => note.id !== selected.id));
            addHistory("Note", selected.title, "Deleted", "Note dihapus.");
            setSelected(null);
            notify("Note berhasil dihapus.");
          }}
        />
      )}
      {modal && (
        <NoteModal
          initial={editing}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          onSave={(note) => {
            setNotes(
              editing
                ? notes.map((item) =>
                    item.id === editing.id
                      ? { ...item, ...note, updated: "18 Jul 2026, sekarang" }
                      : item,
                  )
                : [
                    {
                      ...note,
                      id: Date.now(),
                      pinned: false,
                      updated: "18 Jul 2026, sekarang",
                    },
                    ...notes,
                  ],
            );
            setModal(false);
            setEditing(null);
            addHistory("Note", note.title, editing ? "Edited" : "Created", editing ? "Isi note diperbarui." : "Note baru dibuat.");
            notify("Note berhasil disimpan.");
          }}
        />
      )}
    </>
  );
}

function NoteModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: QuickNote | null;
  onClose: () => void;
  onSave: (note: Omit<QuickNote, "id" | "pinned" | "updated">) => void;
}) {
  const [form, setForm] = useState({
    title: initial?.title || "",
    content: initial?.content || "",
    tag: initial?.tag || "General",
  });
  return (
    <div className="modal-backdrop">
      <form
        className="modal note-modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <header>
          <div>
            <p className="eyebrow">{initial ? "EDIT NOTE" : "NEW NOTE"}</p>
            <h2>{initial ? "Edit catatan" : "Buat catatan"}</h2>
          </div>
          <button type="button" aria-label="Tutup form note" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="form-grid">
          <label className="wide">
            Judul
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </label>
          <label className="wide">
            Note
            <textarea
              required
              rows={8}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Tulis catatan Anda..."
            />
          </label>
          <label>
            Tag
            <select
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
            >
              <option>General</option>
              <option>Mining</option>
              <option>Meeting</option>
              <option>Procurement</option>
              <option>Follow-up</option>
            </select>
          </label>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save note
          </button>
        </footer>
      </form>
    </div>
  );
}

function Users({ notify }: { notify: (s: string) => void }) {
  const users = [
    ["Aska Leo", "master@workbase.id", "Master", "Active", "Hari ini, 08:42"],
    ["Budi Santoso", "budi@workbase.id", "User", "Active", "Kemarin, 17:10"],
    ["Chen Wei", "chen@workbase.id", "User", "Active", "16 Jul 2026"],
    ["Siti Rahma", "siti@workbase.id", "User", "Inactive", "10 Jul 2026"],
  ];
  const [selected, setSelected] = useState<string[] | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const all = checked.length === users.length;
  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">MASTER ACCESS</p>
          <h1>User Management</h1>
          <p>Kelola akun, level akses, dan status pengguna.</p>
        </div>
        <button
          className="primary"
          onClick={() => notify("Form user baru siap diisi.")}
        >
          ＋ Add user
        </button>
      </div>
      {checked.length > 0 && (
        <BulkBar
          count={checked.length}
          onClear={() => setChecked([])}
          onAction={() => notify(`${checked.length} users dipilih.`)}
          action="Change status"
        />
      )}
      <section className="card table-card">
        <table>
          <thead>
            <tr>
              <th className="check-cell">
                <input
                  type="checkbox"
                  aria-label="Select all users"
                  checked={all}
                  onChange={() => setChecked(all ? [] : users.map((u) => u[1]))}
                />
              </th>
              <th>USER</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>LAST LOGIN</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                className="clickable-row"
                tabIndex={0}
                role="button"
                onClick={() => setSelected(u)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(u);
                }}
                key={u[1]}
              >
                <td className="check-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${u[0]}`}
                    checked={checked.includes(u[1])}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() =>
                      setChecked(
                        checked.includes(u[1])
                          ? checked.filter((id) => id !== u[1])
                          : [...checked, u[1]],
                      )
                    }
                  />
                </td>
                <td>
                  <div className="user-cell">
                    <span>
                      {u[0]
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <div>
                      <strong>{u[0]}</strong>
                      <small>{u[1]}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="role">{u[2]}</span>
                </td>
                <td>
                  <span className={`status ${u[3].toLowerCase()}`}>{u[3]}</span>
                </td>
                <td>{u[4]}</td>
                <td>
                  <button
                    aria-label={`Buka ${u[0]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(u);
                    }}
                  >
                    ›
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {selected && (
        <DetailPopup
          type="USER PROFILE"
          title={selected[0]}
          subtitle={selected[1]}
          fields={[
            ["Role", selected[2]],
            ["Status", selected[3]],
            ["Last login", selected[4]],
          ]}
          description="Akun pengguna WorkBase. Master dapat mengatur level akses, status akun, dan session perangkat pengguna ini."
          onClose={() => setSelected(null)}
          onAction={() => notify(`Pengaturan ${selected[0]} dibuka.`)}
          action="Manage user"
        />
      )}
    </>
  );
}

function SelectAllRow({
  checked,
  count,
  label,
  onChange,
}: {
  checked: boolean;
  count: number;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="select-all-row">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>Select all {label}</span>
      {count > 0 && <b>{count} selected</b>}
    </label>
  );
}
function BulkBar({
  count,
  onClear,
  onAction,
  action,
  onEdit,
  onDelete,
}: {
  count: number;
  onClear: () => void;
  onAction: () => void;
  action: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="bulk-bar" role="status">
      <strong>{count} selected</strong>
      <span>Bulk actions apply to all selected items.</span>
      <button className="secondary" onClick={onClear}>
        Clear
      </button>
      <button className="primary" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

function DetailPopup({
  type,
  title,
  subtitle,
  fields,
  description,
  richContent,
  onClose,
  onAction,
  onWord,
  action,
  onEdit,
  onDelete,
}: {
  type: string;
  title: string;
  subtitle: string;
  fields: string[][];
  description: string;
  richContent?: string;
  onClose: () => void;
  onAction: () => void;
  onWord?: () => void;
  action: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="modal-backdrop">
      <section
        className="modal detail-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`Detail ${title}`}
      >
        <header>
          <div>
            <p className="eyebrow">{type}</p>
            <h2>{title}</h2>
            <small>{subtitle}</small>
          </div>
          <button type="button" aria-label="Tutup detail" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="detail-popup-body">
          <div className="detail-badge">{type.slice(0, 2)}</div>
          <div className="detail-fields">
            {fields.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <article>
            <h3>Detail information</h3>
            {richContent ? (
              <div
                className="rendered-document"
                dangerouslySetInnerHTML={{
                  __html: sanitizeRichHtml(richContent),
                }}
              />
            ) : (
              <p>{description || "Tidak ada keterangan tambahan."}</p>
            )}
          </article>
        </div>
        <footer>
          {onDelete && (
            <button
              className="delete-text"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
          {onEdit && (
            <button className="secondary" onClick={onEdit}>
              Edit
            </button>
          )}
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          {onWord && (
            <button className="secondary" onClick={onWord}>
              Export Word
            </button>
          )}
          <button className="primary" onClick={onAction}>
            {action}
          </button>
        </footer>
        {confirmDelete && (
          <div className="confirm-panel">
            <div>
              <h3>Hapus item?</h3>
              <p>
                “{title}” akan dihapus dan tindakan ini tidak dapat dibatalkan.
              </p>
              <div>
                <button
                  className="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button className="danger" onClick={onDelete}>
                  Delete item
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SearchPanel({
  results,
  query,
  onClose,
  onSelect,
}: {
  results: Term[];
  query: string;
  onClose: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="search-panel">
      <div className="search-panel-head">
        <span>Results for “{query}”</span>
        <button onClick={onClose}>ESC</button>
      </div>
      <p className="result-group">
        DICTIONARY TERMS <b>{results.length}</b>
      </p>
      {results.length ? (
        results.slice(0, 4).map((r) => (
          <button className="search-result" key={r.id} onClick={onSelect}>
            <span>{r.mandarin.slice(0, 1)}</span>
            <div>
              <strong>
                {r.english} · {r.mandarin}
              </strong>
              <small>
                {r.category} — {r.explanation.slice(0, 74)}...
              </small>
            </div>
            <b>›</b>
          </button>
        ))
      ) : (
        <div className="no-results">
          Tidak ada hasil. Coba kata lain atau related term.
        </div>
      )}
      <button className="view-search" onClick={onSelect}>
        View all search results →
      </button>
    </div>
  );
}

function TermModal({
  categories,
  initial,
  onClose,
  onSave,
}: {
  categories: string[];
  initial?: Term;
  onClose: () => void;
  onSave: (t: Omit<Term, "id" | "updated" | "status">) => void;
}) {
  const [form, setForm] = useState({
    category: initial?.category || categories[0] || "",
    english: initial?.english || "",
    indo: initial?.indo || "",
    mandarin: initial?.mandarin || "",
    pinyin: initial?.pinyin || "",
    explanation: initial?.explanation || "",
  });
  const field =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({ ...form, [key]: e.target.value });
  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(form);
        }}
      >
        <header>
          <div>
            <p className="eyebrow">
              {initial ? "EDIT DICTIONARY ENTRY" : "NEW DICTIONARY ENTRY"}
            </p>
            <h2>{initial ? "Edit istilah" : "Tambah istilah"}</h2>
          </div>
          <button type="button" aria-label="Tutup form" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="form-grid">
          <label>
            Category
            <select required value={form.category} onChange={field("category")}>
              <option value="" disabled>
                Pilih kategori
              </option>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <span />
          <label>
            English
            <input
              required
              value={form.english}
              onChange={field("english")}
              placeholder="e.g. Coring"
            />
          </label>
          <label>
            Indonesia
            <input
              required
              value={form.indo}
              onChange={field("indo")}
              placeholder="e.g. Coring"
            />
          </label>
          <label>
            Mandarin
            <input
              required
              value={form.mandarin}
              onChange={field("mandarin")}
              placeholder="e.g. 取芯"
            />
          </label>
          <label>
            Pinyin
            <input
              value={form.pinyin}
              onChange={field("pinyin")}
              placeholder="e.g. Qǔ xīn"
            />
          </label>
          <label className="wide">
            Penjelasan dalam Bahasa Indonesia
            <textarea
              required
              rows={5}
              value={form.explanation}
              onChange={field("explanation")}
              placeholder="Jelaskan istilah dengan lengkap dan jelas..."
            />
          </label>
        </div>
        <footer>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save as draft
          </button>
        </footer>
      </form>
    </div>
  );
}
