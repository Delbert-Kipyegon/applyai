"use client";

import {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Profile = {
  name: string;
  role: string;
  email: string;
  location: string;
  cv: string;
};

type JobDetails = {
  title: string;
  company: string;
  description: string;
};

type Analysis = {
  score: number;
  strengths: string[];
  gaps: string[];
};

type GeneratedDocuments = {
  cv: string;
  coverLetter: string;
  analysis: Analysis;
};

type Application = {
  id: number;
  title: string;
  company: string;
  status: "Ready" | "Applied";
  date: string;
};

type StepId = 0 | 1 | 2 | 3;
type TabId = "cv" | "cover" | "tracker";
type ExportFormat = "pdf" | "docx";
type ExportDocumentType = "cv" | "cover";
type AccentColor = {
  name: string;
  value: string;
};

const STEPS = [
  { id: 0, label: "Profile" },
  { id: 1, label: "Job details" },
  { id: 2, label: "Generate" },
  { id: 3, label: "Download" },
] as const;

const GENERATION_MESSAGES = [
  "Reading the job requirements",
  "Mapping your experience to the role",
  "Selecting the strongest proof points",
  "Writing a one-page CV",
  "Drafting the cover letter",
  "Preparing your downloads",
];

const CV_ACCENT_COLORS: AccentColor[] = [
  { name: "Emerald", value: "#05775B" },
  { name: "Navy", value: "#1D4ED8" },
  { name: "Plum", value: "#7C3AED" },
  { name: "Slate", value: "#334155" },
  { name: "Copper", value: "#B45309" },
];

const TEXT_FILE_TYPES = [
  "text/plain",
  "text/markdown",
  "text/rtf",
  "application/rtf",
];

const SERVER_PARSED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const emptyProfile: Profile = {
  name: "",
  role: "",
  email: "",
  location: "",
  cv: "",
};

const emptyJob: JobDetails = {
  title: "",
  company: "",
  description: "",
};

export default function Home() {
  const pipelineRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState<StepId>(0);
  const [activeTab, setActiveTab] = useState<TabId>("cv");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [job, setJob] = useState<JobDetails>(emptyJob);
  const [documents, setDocuments] = useState<GeneratedDocuments | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState(GENERATION_MESSAGES[0]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isDraggingCv, setIsDraggingCv] = useState(false);
  const [isImportingCv, setIsImportingCv] = useState(false);
  const [cvSourceLabel, setCvSourceLabel] = useState("");
  const [cvAccentColor, setCvAccentColor] = useState(CV_ACCENT_COLORS[0].value);

  useEffect(() => {
    const storedProfile = window.localStorage.getItem("boltiply_profile");
    const storedApplications = window.localStorage.getItem("boltiply_applications");

    if (storedProfile) {
      const parsedProfile = JSON.parse(storedProfile) as Profile;
      setProfile(parsedProfile);
      setSavedProfile(parsedProfile);
    }

    if (storedApplications) {
      setApplications(JSON.parse(storedApplications) as Application[]);
    }
  }, []);

  useEffect(() => {
    if (!isGenerating) return;

    let index = 0;
    const interval = window.setInterval(() => {
      index = (index + 1) % GENERATION_MESSAGES.length;
      setGenerationMessage(GENERATION_MESSAGES[index]);
    }, 1700);

    return () => window.clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    window.localStorage.setItem("boltiply_applications", JSON.stringify(applications));
  }, [applications]);

  const initials = useMemo(() => {
    const source = savedProfile?.name || profile.name || "AI";
    return source
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [profile.name, savedProfile?.name]);

  const matchLabel = useMemo(() => {
    const score = documents?.analysis.score ?? 0;
    if (score >= 80) return "Strong match";
    if (score >= 60) return "Good match";
    return "Needs positioning";
  }, [documents]);

  function updateProfile(field: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function updateJob(field: keyof JobDetails, value: string) {
    setJob((current) => ({ ...current, [field]: value }));
  }

  async function importCvFile(file?: File) {
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const isTextFile =
      TEXT_FILE_TYPES.includes(file.type) || ["txt", "md", "markdown", "rtf"].includes(extension || "");
    const isServerParsedFile =
      SERVER_PARSED_FILE_TYPES.includes(file.type) || ["pdf", "docx"].includes(extension || "");

    if (extension === "doc") {
      setError("Legacy .doc files are not supported yet. Save the document as .docx or PDF.");
      setIsDraggingCv(false);
      return;
    }

    if (!isTextFile && !isServerParsedFile) {
      setError("Upload a PDF, DOCX, TXT, Markdown, or RTF CV file.");
      setIsDraggingCv(false);
      return;
    }

    if (file.size > 6_000_000) {
      setError("That CV file is quite large. Try a file under 6MB or paste the key content below.");
      setIsDraggingCv(false);
      return;
    }

    try {
      setIsImportingCv(true);
      setError("");

      const text = await parseCvOnServer(file);

      if (!text.trim()) {
        throw new Error("We could not find readable text in that CV.");
      }

      updateProfile("cv", text.trim());
      setCvSourceLabel(file.name);
      setNotice(`${file.name} imported. You can still edit the text below.`);
      window.setTimeout(() => setNotice(""), 2600);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "We could not import that CV file. Try another format or paste the text.",
      );
    } finally {
      setIsDraggingCv(false);
      setIsImportingCv(false);
    }
  }

  async function parseCvOnServer(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/import-cv", {
      method: "POST",
      body: formData,
    });
    const payload = await readJsonResponse<{ text?: string; error?: string }>(response);

    if (!response.ok || !payload.text) {
      throw new Error(payload.error || "We could not import that CV file.");
    }

    return payload.text;
  }

  async function readJsonResponse<T extends { error?: string }>(response: Response): Promise<T> {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    const isHtml = text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html");

    return {
      error: isHtml
        ? "The upload service returned a server error page instead of JSON. Please try again, or check production function logs for /api/import-cv."
        : text || "The upload service returned an unexpected response.",
    } as T;
  }

  function handleCvDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    importCvFile(event.dataTransfer.files[0]);
  }

  function handleCvSelect(event: ChangeEvent<HTMLInputElement>) {
    importCvFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function goToStep(step: StepId) {
    setActiveStep(step);
    window.requestAnimationFrame(() => {
      pipelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function saveProfile() {
    if (!profile.name.trim()) {
      setError("Add your full name before continuing.");
      return;
    }

    if (!profile.cv.trim()) {
      setError("Paste your master CV or experience notes before continuing.");
      return;
    }

    const cleanProfile = {
      name: profile.name.trim(),
      role: profile.role.trim(),
      email: profile.email.trim(),
      location: profile.location.trim(),
      cv: profile.cv.trim(),
    };

    window.localStorage.setItem("boltiply_profile", JSON.stringify(cleanProfile));
    setSavedProfile(cleanProfile);
    setError("");
    goToStep(1);
  }

  async function generateDocuments() {
    if (!savedProfile) {
      setError("Save your master profile first.");
      goToStep(0);
      return;
    }

    if (!job.description.trim()) {
      setError("Paste the full job description before generating.");
      return;
    }

    setError("");
    setDocuments(null);
    setIsGenerating(true);
    setGenerationMessage(GENERATION_MESSAGES[0]);
    goToStep(2);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: savedProfile,
          job: {
            title: job.title.trim(),
            company: job.company.trim(),
            description: job.description.trim(),
          },
        }),
      });

      const payload = (await response.json()) as GeneratedDocuments | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Generation failed.");
      }

      setDocuments(payload);
      setApplications((current) => [
        {
          id: Date.now(),
          title: job.title.trim() || "Untitled role",
          company: job.company.trim() || "Company not provided",
          status: "Ready",
          date: new Date().toLocaleDateString(),
        },
        ...current,
      ]);
      setActiveTab("cv");
      goToStep(3);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Something went wrong while generating your documents.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToClipboard(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied to clipboard.`);
    window.setTimeout(() => setNotice(""), 2200);
  }

  async function downloadDocument(documentType: ExportDocumentType, format: ExportFormat, content: string) {
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          documentType,
          format,
          jobTitle: job.title,
          company: job.company,
          applicantName: savedProfile?.name || profile.name,
          accentColor: cvAccentColor,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Export failed.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="(.+)"/)?.[1] || `boltiply-${documentType}.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    }
  }

  function markApplied(id: number) {
    setApplications((current) =>
      current.map((application) =>
        application.id === id ? { ...application, status: "Applied" } : application,
      ),
    );
    setNotice("Application marked as applied. Plan a follow-up in 5-7 days.");
    window.setTimeout(() => setNotice(""), 2800);
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          <span className="logo-mark" />
          <span>Boltiply</span>
        </div>
      </div>

      <section className="hero">
        <div className="eyebrow">
          <span className="logo-dot" />
          Application documents in minutes
        </div>
        <div className="hero-grid">
          <div>
            <h1>
              Turn one master CV into a premium application pack.
            </h1>
            <p>
              Upload or paste your CV, add the job description, and generate a
              focused one-page CV, tailored cover letter, and match insights ready
              to copy or download.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => goToStep(0)} type="button">
                Start tailoring
              </button>
              <span>No browser API keys. No formatting guesswork.</span>
            </div>
          </div>
          <div className="hero-card">
            <div className="mini-window">
              <span />
              <span />
              <span />
            </div>
            <span>Live workspace</span>
            <strong>CV, cover letter, and fit analysis in one guided flow.</strong>
            <div className="hero-metrics">
              <div>
                <b>1 page</b>
                <small>CV output</small>
              </div>
              <div>
                <b>3-4</b>
                <small>letter paragraphs</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="pipeline" ref={pipelineRef}>
        <nav className="steps" aria-label="Application flow">
          {STEPS.map((step) => (
            <button
              className={`step ${activeStep === step.id ? "active" : ""} ${
                activeStep > step.id ? "done" : ""
              }`}
              key={step.id}
              onClick={() => goToStep(step.id)}
              type="button"
            >
              <span className="step-bar" />
              <span>0{step.id + 1} {step.label}</span>
            </button>
          ))}
        </nav>

        {error ? <div className="alert error">{error}</div> : null}
        {notice ? <div className="alert success">{notice}</div> : null}

        {activeStep === 0 ? (
        <section className="panel">
          <div className="panel-heading">
            <p>Step 1</p>
            <h2>Build your master profile</h2>
            <span>
              Add the full version of your experience. Boltiply will pull only what
              matters for each job.
            </span>
          </div>

          <div className="card profile-card">
            <div className="input-grid">
              <label>
                Full name
                <input
                  onChange={(event) => updateProfile("name", event.target.value)}
                  placeholder="e.g. Amara Osei"
                  type="text"
                  value={profile.name}
                />
              </label>
              <label>
                Current or target role
                <input
                  onChange={(event) => updateProfile("role", event.target.value)}
                  placeholder="e.g. Product Manager"
                  type="text"
                  value={profile.role}
                />
              </label>
              <label>
                Email
                <input
                  onChange={(event) => updateProfile("email", event.target.value)}
                  placeholder="amara@email.com"
                  type="email"
                  value={profile.email}
                />
              </label>
              <label>
                Location
                <input
                  onChange={(event) => updateProfile("location", event.target.value)}
                  placeholder="Nairobi, Kenya"
                  type="text"
                  value={profile.location}
                />
              </label>
            </div>

            <div className="cv-workspace">
              <div className="cv-upload-panel">
                <label
                  className={`dropzone ${isDraggingCv ? "dragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingCv(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setIsDraggingCv(false);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleCvDrop}
                >
                  <input
                    accept=".pdf,.docx,.doc,.txt,.md,.markdown,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown,text/rtf,application/rtf"
                    onChange={handleCvSelect}
                    type="file"
                  />
                  <span className="drop-icon">CV</span>
                  <strong>
                    {isImportingCv ? "Importing your CV..." : "Drop your master CV here"}
                  </strong>
                  <small>or click to import PDF, DOCX, TXT, Markdown, or RTF</small>
                </label>

                <div className="import-card">
                  <span>Import status</span>
                  <strong>{cvSourceLabel || "Manual entry ready"}</strong>
                  <p>
                    Upload a CV file to extract its text, then refine the imported
                    content in the editor before generating.
                  </p>
                </div>
              </div>

              <label className="cv-editor">
                Type or paste your Master CV
                <textarea
                  onChange={(event) => {
                    updateProfile("cv", event.target.value);
                    if (cvSourceLabel) setCvSourceLabel("");
                  }}
                  placeholder="Paste your full CV here: work experience, achievements, skills, education, projects, certifications, and anything else the AI can draw from."
                  value={profile.cv}
                />
              </label>
            </div>

            <div className="actions">
              <button className="primary" onClick={saveProfile} type="button">
                Save profile and continue
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {activeStep === 1 ? (
        <section className="panel">
          {savedProfile ? (
            <div className="profile-badge">
              <div>{initials}</div>
              <span>
                <strong>{savedProfile.name}</strong>
                {savedProfile.role || "Profile saved"} - ready to tailor
              </span>
            </div>
          ) : null}

          <div className="panel-heading">
            <p>Step 2</p>
            <h2>Paste the job description</h2>
            <span>
              Include responsibilities, requirements, company notes, and keywords.
              More context gives the AI more to work with.
            </span>
          </div>

          <div className="card">
            <div className="input-grid">
              <label>
                Job title
                <input
                  onChange={(event) => updateJob("title", event.target.value)}
                  placeholder="e.g. Graduate Product Manager"
                  type="text"
                  value={job.title}
                />
              </label>
              <label>
                Company
                <input
                  onChange={(event) => updateJob("company", event.target.value)}
                  placeholder="e.g. Bolt"
                  type="text"
                  value={job.company}
                />
              </label>
            </div>

            <label>
              Full job description
              <textarea
                onChange={(event) => updateJob("description", event.target.value)}
                placeholder="Paste the complete job description here."
                value={job.description}
              />
            </label>

            <div className="actions split">
              <button onClick={() => goToStep(0)} type="button">
                Back
              </button>
              <button className="primary" onClick={generateDocuments} type="button">
                Generate tailored documents
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {activeStep === 2 ? (
        <section className="panel">
          <div className="card generating-card">
            {isGenerating ? (
              <>
                <div className="spinner" />
                <h2>Building your application pack</h2>
                <p>{generationMessage}</p>
              </>
            ) : (
              <>
                <h2>Generation paused</h2>
                <p>{error || "Go back and try again when you are ready."}</p>
                <button onClick={() => goToStep(1)} type="button">
                  Back to job details
                </button>
              </>
            )}
          </div>
        </section>
        ) : null}

        {activeStep === 3 && documents ? (
        <section className="panel results">
          <div className="match-card">
            <div>
              <p>{job.title || "Tailored role"} at {job.company || "target company"}</p>
              <h2>{documents.analysis.score}% match</h2>
              <span>{matchLabel}</span>
            </div>
            <div className="score-track">
              <span style={{ width: `${documents.analysis.score}%` }} />
            </div>
            <div className="insight-grid">
              <div>
                <strong>Strengths</strong>
                <ul>
                  {documents.analysis.strengths.map((strength) => (
                    <li key={strength}>{strength}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Gaps to address</strong>
                <ul>
                  {documents.analysis.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="tabs" role="tablist">
            <button
              className={activeTab === "cv" ? "active" : ""}
              onClick={() => setActiveTab("cv")}
              type="button"
            >
              Tailored CV
            </button>
            <button
              className={activeTab === "cover" ? "active" : ""}
              onClick={() => setActiveTab("cover")}
              type="button"
            >
              Cover letter
            </button>
            <button
              className={activeTab === "tracker" ? "active" : ""}
              onClick={() => setActiveTab("tracker")}
              type="button"
            >
              Applications
            </button>
          </div>

          <div className="template-toolbar card">
            <div>
              <span>CV template accent</span>
              <strong>Choose the heading color for preview, PDF, and DOCX.</strong>
            </div>
            <div className="color-options" aria-label="CV accent color options">
              {CV_ACCENT_COLORS.map((color) => (
                <button
                  aria-label={`Use ${color.name} accent`}
                  className={cvAccentColor === color.value ? "selected" : ""}
                  key={color.value}
                  onClick={() => setCvAccentColor(color.value)}
                  style={{ "--swatch": color.value } as CSSProperties}
                  type="button"
                >
                  <span />
                  {color.name}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "cv" ? (
            <DocumentPanel
              accentColor={cvAccentColor}
              label={savedProfile?.name || "Your one-page CV"}
              onCopy={copyToClipboard}
              onExport={downloadDocument}
              type="cv"
              value={documents.cv}
            />
          ) : null}

          {activeTab === "cover" ? (
            <DocumentPanel
              accentColor={cvAccentColor}
              label="Cover letter"
              onCopy={copyToClipboard}
              onExport={downloadDocument}
              type="cover"
              value={documents.coverLetter}
            />
          ) : null}

          {activeTab === "tracker" ? (
            <div className="card">
              <div className="tracker">
                <div className="tracker-row head">
                  <span>Role</span>
                  <span>Company</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                {applications.map((application) => (
                  <div className="tracker-row" key={application.id}>
                    <span>{application.title}</span>
                    <span>{application.company}</span>
                    <span className={application.status === "Applied" ? "applied" : ""}>
                      {application.status}
                    </span>
                    <span>
                      {application.status === "Ready" ? (
                        <button onClick={() => markApplied(application.id)} type="button">
                          Mark applied
                        </button>
                      ) : (
                        application.date
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="actions split">
            <button onClick={() => goToStep(1)} type="button">
              Tailor another job
            </button>
          </div>
        </section>
        ) : null}
      </section>
    </main>
  );
}

function DocumentPanel({
  accentColor,
  label,
  onCopy,
  onExport,
  type,
  value,
}: {
  accentColor: string;
  label: string;
  onCopy: (value: string, label: string) => void;
  onExport: (type: ExportDocumentType, format: ExportFormat, value: string) => Promise<void>;
  type: ExportDocumentType;
  value: string;
}) {
  return (
    <div className="card document-card">
      <div className="document-top">
        <span>{label}</span>
        <div>
          <button onClick={() => onCopy(value, label)} type="button">
            Copy
          </button>
          <button onClick={() => onExport(type, "docx", value)} type="button">
            DOCX
          </button>
          <button className="primary" onClick={() => onExport(type, "pdf", value)} type="button">
            PDF
          </button>
        </div>
      </div>
      <div className="document-preview" style={{ "--doc-accent": accentColor } as CSSProperties}>
        {value.split("\n").map((line, index) => (
          <DocumentLine key={`${line}-${index}`} line={line} />
        ))}
      </div>
    </div>
  );
}

function DocumentLine({ line }: { line: string }) {
  const trimmed = line.trim();

  if (!trimmed) {
    return <div className="doc-line doc-spacer" />;
  }

  const isBullet = /^[-•]\s+/.test(trimmed);
  const isHeading =
    !isBullet &&
    trimmed.length <= 48 &&
    (trimmed === trimmed.toUpperCase() || /^[A-Z][A-Za-z\s/&]+:$/.test(trimmed));

  if (isHeading) {
    return <h3 className="doc-heading">{trimmed.replace(/:$/, "")}</h3>;
  }

  if (isBullet) {
    return <p className="doc-line doc-bullet">{trimmed.replace(/^[-•]\s+/, "")}</p>;
  }

  return <p className="doc-line">{trimmed}</p>;
}
