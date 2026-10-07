import React, { useEffect, useMemo, useState } from "react";
import "./FileFinderAIDesktopWorkspace.css";
type Route = "Home" | "Search" | "AI Assistant" | "Organization" | "Settings";
const routes: {
  name: Route;
  icon: string;
}[] = [{
  name: "Home",
  icon: "⌂"
}, {
  name: "Search",
  icon: "⌕"
}, {
  name: "AI Assistant",
  icon: "✳"
}, {
  name: "Organization",
  icon: "▱"
}, {
  name: "Settings",
  icon: "⚙"
}];
type SampleFile = {
  name: string;
  kind: "PDF" | "IMAGE";
  size: string;
  path: string;
  match: string;
  tint: string;
  modified: string;
  modifiedRank: number;
  tags: string[];
  reason: string;
  available: boolean;
};
const sampleFiles: SampleFile[] = [{
  name: "graduation_certificate.pdf",
  kind: "PDF",
  size: "2.4 MB",
  path: "Documents / College",
  match: "94%",
  tint: "violet",
  modified: "Yesterday",
  modifiedRank: 4,
  tags: ["graduation", "certificate", "degree", "education", "college"],
  reason: "The filename and folder suggest an education credential.",
  available: true
}, {
  name: "resume.pdf",
  kind: "PDF",
  size: "816 KB",
  path: "Documents / Career",
  match: "91%",
  tint: "blue",
  modified: "Today",
  modifiedRank: 1,
  tags: ["resume", "cv", "career", "job", "work"],
  reason: "The filename and Career folder match a resume search.",
  available: true
}, {
  name: "internship_confirmation.pdf",
  kind: "PDF",
  size: "624 KB",
  path: "Documents / Career",
  match: "88%",
  tint: "mint",
  modified: "4 days ago",
  modifiedRank: 6,
  tags: ["internship", "career", "job", "work", "confirmation"],
  reason: "The filename and Career folder match internship documents.",
  available: true
}, {
  name: "course_completion.pdf",
  kind: "PDF",
  size: "1.1 MB",
  path: "Documents / Courses",
  match: "73%",
  tint: "mint",
  modified: "Last week",
  modifiedRank: 3,
  tags: ["course", "completion", "certificate", "education", "training"],
  reason: "The filename suggests a course completion record.",
  available: false
}, {
  name: "degree_scan_final.jpg",
  kind: "IMAGE",
  size: "4.8 MB",
  path: "Pictures / Scans",
  match: "87%",
  tint: "blue",
  modified: "2 days ago",
  modifiedRank: 2,
  tags: ["degree", "scan", "graduation", "certificate", "image"],
  reason: "The filename suggests a scanned degree document.",
  available: true
}, {
  name: "passport_photo.png",
  kind: "IMAGE",
  size: "2.2 MB",
  path: "Pictures / Personal",
  match: "82%",
  tint: "mint",
  modified: "3 days ago",
  modifiedRank: 5,
  tags: ["passport", "photo", "image", "personal"],
  reason: "The filename identifies a personal passport photo.",
  available: true
}];
const stopWords = new Set(["find", "show", "where", "is", "my", "me", "the", "a", "an", "in", "on", "for", "please", "file", "files"]);
const getMatches = (query: string, mode: "AI" | "Keyword" = "AI") => {
  const clean = query.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const recent = /\b(recent|latest|newest|today)\b/.test(clean);
  const terms = clean.split(/\s+/).filter(term => term && !stopWords.has(term) && !["recent", "latest", "newest", "today"].includes(term)).map(term => term.endsWith("s") ? term.slice(0, -1) : term);
  const requestedType = /\bpdfs?\b/.test(clean) ? "PDF" : /\b(images?|photos?|pictures?)\b/.test(clean) ? "IMAGE" : null;
  return sampleFiles.map(file => {
    const haystack = [file.name, file.kind, file.path, ...(mode === "AI" ? file.tags : [])].join(" ").toLowerCase();
    const score = terms.filter(term => haystack.includes(term)).length;
    return {
      file,
      score
    };
  }).filter(item => (terms.length === 0 || item.score > 0) && (!requestedType || item.file.kind === requestedType)).sort((a, b) => recent ? a.file.modifiedRank - b.file.modifiedRank : b.score - a.score || Number.parseInt(b.file.match) - Number.parseInt(a.file.match)).map(item => item.file);
};
const Icon = ({
  children
}: {
  children: React.ReactNode;
}) => <span className="icon" aria-hidden="true">{children}</span>;
const FileMark = ({
  kind
}: {
  kind: string;
}) => <span className={"filemark " + kind.toLowerCase()}>{kind === "PDF" ? "PDF" : "▧"}</span>;
export const FileFinderAIDesktopWorkspace = () => {
  const [route, setRoute] = useState<Route>("Home");
  const [query, setQuery] = useState("Find my graduation certificate");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedResult, setSelectedResult] = useState("");
  const [indexDetailsOpen, setIndexDetailsOpen] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "results">("idle");
  const [searchPhase, setSearchPhase] = useState<"understanding" | "searching">("understanding");
  const [searchMode, setSearchMode] = useState<"AI" | "Keyword">("AI");
  const [typeFilter, setTypeFilter] = useState<"All types" | "PDF" | "IMAGE">("All types");
  const [sortOrder, setSortOrder] = useState<"Best match" | "Recently modified">("Best match");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<"preview" | "index" | "index-complete" | "analysis" | "unavailable" | null>(null);
  const [previewFile, setPreviewFile] = useState<SampleFile>(sampleFiles[0]);
  const [progress, setProgress] = useState(12);
  const [indexPhase, setIndexPhase] = useState<"preparing" | "scanning">("preparing");
  const [selectedFolder, setSelectedFolder] = useState("Documents");
  const [analysisDone, setAnalysisDone] = useState(false);
  const [approved, setApproved] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(false);
  const [assistantThinking, setAssistantThinking] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [folderCount] = useState(4);
  const indexedCounts: Record<string, number> = {
    Documents: 562,
    Pictures: 342,
    Desktop: 198,
    College: 146
  };
  const selectedFileCount = indexedCounts[selectedFolder] || 1248;
  const [lastIndexed, setLastIndexed] = useState("Just now");
  const [toast, setToast] = useState("");
  const matchingFiles = useMemo(() => {
    let files = getMatches(query, searchMode);
    if (typeFilter !== "All types") files = files.filter(file => file.kind === typeFilter);
    if (sortOrder === "Recently modified") files = [...files].sort((a, b) => a.modifiedRank - b.modifiedRank);
    return files.slice(0, 2);
  }, [query, searchMode, typeFilter, sortOrder]);
  const assistantFiles = useMemo(() => getMatches(question).slice(0, 2), [question]);
  useEffect(() => {
    if (modal !== "index") return;
    if (indexPhase === "preparing") {
      const timer = window.setTimeout(() => setIndexPhase("scanning"), 700);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setInterval(() => setProgress(p => Math.min(100, p + 4)), 250);
    return () => window.clearInterval(timer);
  }, [modal, indexPhase]);
  useEffect(() => {
    if (progress !== 100 || modal !== "index") return;
    const timer = window.setTimeout(() => {
      setLastIndexed("Just now");
      setModal("index-complete");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [progress, modal]);
  useEffect(() => {
    if (searchState !== "searching") return;
    setSearchPhase("understanding");
    const phaseTimer = window.setTimeout(() => setSearchPhase("searching"), 650);
    const resultTimer = window.setTimeout(() => setSearchState("results"), 1450);
    return () => {
      window.clearTimeout(phaseTimer);
      window.clearTimeout(resultTimer);
    };
  }, [searchState]);
  useEffect(() => {
    if (!assistantThinking) return;
    const timer = window.setTimeout(() => {
      setAssistantThinking(false);
      setAnswer(true);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [assistantThinking]);
  useEffect(() => {
    if (!modal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal]);
  const note = (value: string) => {
    setToast(value);
    window.setTimeout(() => setToast(""), 2300);
  };
  const runSearch = (nextQuery: string) => {
    if (!nextQuery.trim()) return;
    if (searchMode === "AI" && !aiConfigured) {
      note("Configure AI in Settings, or switch to Keyword search.");
      return;
    }
    setQuery(nextQuery);
    setFiltersOpen(false);
    setRoute("Search");
    setSearchState("idle");
    window.setTimeout(() => setSearchState("searching"), 0);
  };
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query);
  };
  const showPreview = (file: SampleFile) => {
    setPreviewFile(file);
    setModal(file.available ? "preview" : "unavailable");
  };
  const askAssistant = (text: string) => {
    if (!aiConfigured) {
      note("Connect an AI provider in Settings to ask questions about your files.");
      return;
    }
    setQuestion(text);
    setAnswer(false);
    setAssistantThinking(true);
  };
  const startIndex = (folder = "Documents") => {
    setSelectedFolder(folder);
    setProgress(0);
    setIndexPhase("preparing");
    setModal("index");
  };
  const startAnalysis = () => {
    if (!aiConfigured) {
      note("Connect an AI provider in Settings to analyze files.");
      return;
    }
    setAnalysisDone(false);
    setModal("analysis");
    window.setTimeout(() => setAnalysisDone(true), 1500);
  };
  const finishIndex = () => {
    setLastIndexed("Just now");
    setModal(null);
    note("Your files are ready to search.");
  };
  const go = (next: Route) => {
    setRoute(next);
    if (next === "Search") {
      setQuery("");
      setSearchState("idle");
      setTypeFilter("All types");
      setSortOrder("Best match");
      setFiltersOpen(false);
    }
  };
  return <div className="ff-app">
    <aside className="ff-rail">
      <div className="ff-brand"><span className="brand-icon"><i /><i /><i /></span><span><b>FileFinder <em>AI</em></b><small>Your files, understood.</small></span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{routes.map(item => <button key={item.name} className={"nav-link " + (route === item.name ? "selected" : "")} onClick={() => go(item.name)}><Icon>{item.icon}</Icon><span>{item.name}</span>{item.name === "Organization" && <small>3</small>}</button>)}</nav>
      <div className="rail-foot">
        <div className="index-status-wrap"><div role="button" tabIndex={0} className="index-status" aria-expanded={indexDetailsOpen} onClick={() => setIndexDetailsOpen(open => !open)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIndexDetailsOpen(open => !open); } }}><div><span className="pulse-dot" /><strong>Indexed locally</strong><span className="lock">⌑</span></div><p><b>1,248</b> files <i /> <b>4</b> folders</p><div className="tiny-progress"><i /></div><small>Private by design</small></div>{indexDetailsOpen && <div className="index-details-popover"><small>INDEXED FOLDERS</small><p>Documents · Pictures<br />Desktop · College</p><span>Last indexed: {lastIndexed}</span><button onClick={() => { setIndexDetailsOpen(false); startIndex("Documents"); }}>↻ Re-index Documents</button></div>}</div>
        <div className="privacy-link">◇ <span>Your files stay on this device</span></div>
      </div>
    </aside>
    <main className="ff-main">
      <header className="ff-top"><div className="crumb">FILEFINDER AI <span>/</span> <b>{route.toUpperCase()}</b></div><div className="top-actions"><span className="online"><i /> Indexed locally</span><button onClick={() => note("You're all caught up.")} aria-label="Notifications">◌<sup /></button></div></header>
      <div className="ff-content">
        {route === "Home" && <section>
          <div className="greeting"><div><small>YOUR LOCAL WORKSPACE</small><p>Welcome back <em>✦</em></p></div><button className="link-button" onClick={() => go("Search")}>View all files <b>→</b></button></div>
          <div className="hero-card">
            <div className="hero-content"><div className="hero-label"><span>✳</span> YOUR PERSONAL FILE INTELLIGENCE</div><h1>Find <em>anything.</em></h1><h2>Your files, understood.</h2><p>Tell FileFinder AI what you’re looking for.<br />We’ll find the right file, wherever it lives.</p>
              <form className={"hero-search" + (searchFocused ? " is-focused" : "")} onSubmit={search}><span>⌕</span><input value={query} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)} onChange={e => setQuery(e.target.value)} placeholder="Find my graduation certificate..." aria-label="Search files" aria-expanded={searchFocused} /><label className={searchFocused ? "ai-active" : ""}>✳ AI search</label><button aria-label="Search" type="submit">→</button></form>
              <div className={"try-line" + (searchFocused ? " is-visible" : "")}>Try {["my resume", "recent PDFs", "college certificates"].map(t => <button key={t} onMouseDown={e => e.preventDefault()} onClick={() => setQuery(t)}>{t}</button>)}</div>
            </div><div className="hero-orb"><div className="orb-ring ring-a" /><div className="orb-ring ring-b" /><div className="orb-core">✳</div><span>✦</span><small>LOCAL-FIRST INTELLIGENCE</small></div>
            {searchState === "searching" && <div className="hero-thinking"><span className="think-orb">✳</span><div><b>{searchPhase === "understanding" ? "Understanding your request" : "Searching your indexed files"}</b><small>{searchPhase === "understanding" ? "Matching your description to file details" : "Looking across your selected folders"}</small></div></div>}
          </div>
          <div className="home-lower">
            <section className="recent-card"><div className="card-head"><div><small>RECENTLY DISCOVERED</small><h3>Back in focus</h3></div><button onClick={() => go("Search")}>All files →</button></div>
              {sampleFiles.filter(file => ["graduation_certificate.pdf", "resume.pdf", "course_completion.pdf"].includes(file.name)).map(file => <div className="recent-row" key={file.name}><button className="recent-main" onClick={() => showPreview(file)}><FileMark kind={file.kind} /><span><b>{file.name}</b><small>{file.path}</small></span><time>{file.modified}</time></button><span className="recent-actions"><button onClick={() => showPreview(file)}>Preview</button><button onClick={() => note("Opening file in its default application.")}>Open file</button></span></div>)}
            </section>
            <aside className="insight-card"><div className="insight-top"><span>✳</span> AI PATTERN WORTH FINDING <b>NEW</b></div><h3>Certificates, across folders.</h3><p>8 files look like certificates. Review the closest matches in your library.</p><button onClick={() => runSearch("Find my graduation certificate")}>Review files →</button><div className="insight-rings" /></aside>
          </div>
          <div className="section-line"><span>YOUR LIBRARY <i>Updated just now</i></span><button onClick={() => go("Settings")}>Manage folders →</button></div>
          <div className="stats">{[["▦", "TOTAL FILES", "1,248", "Across your library", ""], ["▧", "IMAGES", "342", "Visual memories", "blue"], ["PDF", "PDFS", "86", "Ready to understand", "violet"], ["▱", "FOLDERS", String(folderCount), "On this device", "green"]].map(x => <div className="stat" key={x[1]}><span className={"stat-icon " + x[4]}>{x[0]}</span><small>{x[1]}</small><b>{x[2]}</b><label>{x[3]}</label></div>)}</div>
          <div className="section-line quick-heading"><span>QUICK ACTIONS</span></div>
          <div className="actions">
            <button onClick={() => go("Search")}><span className="action-icon">⌕</span><span><b>Search files</b><small>Keywords or natural language</small></span><i>→</i></button>
            <button className="action-feature" onClick={() => go("AI Assistant")}><span className="action-icon">✳</span><span><b>Ask your files</b><small>Answers grounded in your library</small></span><i>→</i></button>
            <button onClick={() => startIndex()}><span className="action-icon">＋</span><span><b>Add a folder</b><small>Expand your local index</small></span><i>→</i></button>
            <button onClick={startAnalysis}><span className="action-icon">✧</span><span><b>Analyze files</b><small>Understand PDFs and images</small></span><i>→</i></button>
          </div>
        </section>}

        {route === "Search" && <section className="route-view">
          <div className="route-title"><div><small>LOCAL FILE DISCOVERY</small><h1>Search your files</h1><p>Search by name, type, folder, or describe what you remember.</p></div><span className="privacy-chip">◇ Searches stay on this device</span></div>
          {!aiConfigured && searchMode === "AI" && <div className="config-notice">AI understanding isn’t configured yet. <button onClick={() => go("Settings")}>Configure AI →</button></div>}
          <form className="route-search" onSubmit={search}><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder={searchMode === "AI" ? "Describe a file or search by name..." : "Search names, folders, or file types..."} aria-label="Search your files" /><label>{searchMode === "AI" ? "✳ AI search" : "⌕ Keyword"}</label><button type="submit">→</button></form>
          <div className="filters"><div><button className={searchMode === "AI" ? "active-filter" : ""} onClick={() => setSearchMode("AI")}>✳ AI-understood</button><button className={searchMode === "Keyword" ? "active-filter" : ""} onClick={() => setSearchMode("Keyword")}>⌕ Keyword</button></div><div className="filter-menu-wrap"><button onClick={() => setFiltersOpen(open => !open)} aria-expanded={filtersOpen}>☷ Filters <b>{typeFilter === "All types" ? "0" : "1"}</b></button>{filtersOpen && <div className="filter-popover"><small>FILE TYPE</small>{(["All types", "PDF", "IMAGE"] as const).map(type => <button key={type} className={typeFilter === type ? "chosen" : ""} onClick={() => {
                  setTypeFilter(type);
                  setFiltersOpen(false);
                }}>{type}<span>{typeFilter === type ? "✓" : ""}</span></button>)}</div>}</div><select aria-label="Sort results" value={sortOrder} onChange={e => setSortOrder(e.target.value as "Best match" | "Recently modified")}><option>Best match</option><option>Recently modified</option></select></div>
          {searchState === "searching" ? <div className="search-wait"><span className="think-orb">✳</span><h3>{searchPhase === "understanding" ? "Understanding your request..." : "Searching your indexed files..."}</h3><p>{searchPhase === "understanding" ? "Matching your description to file details" : "Looking through your selected folders"}</p><div className="search-progress"><i /></div></div> : searchState === "results" ? matchingFiles.length ? <div className="results"><div className="results-heading"><div><b>{matchingFiles.length === 1 ? "Found 1 likely match." : "Found " + matchingFiles.length + " likely matches."}</b><p>Ranked by {sortOrder === "Best match" ? "how closely each file matches your search." : "most recently modified."}</p></div><span>{searchMode === "AI" ? "✳ AI UNDERSTOOD" : "⌕ KEYWORD MATCH"}</span></div>{matchingFiles.map((file, index) => <article className={"result-card" + (!file.available ? " unavailable-card" : "") + (selectedResult === file.name ? " selected" : "")} key={file.name} style={{ animationDelay: index * 90 + "ms" }} onMouseDown={() => setSelectedResult(file.name)}><div className={"result-preview " + file.tint}><div className="paper-preview"><i className="seal">✦</i><b>{file.kind === "PDF" ? file.name.includes("resume") ? "RESUME" : "DOCUMENT" : "IMAGE FILE"}</b><span /><span /><span /></div></div><div className="result-info"><div className="result-name"><h3>{file.name}</h3><span>✳ {file.match} match</span></div><div className="metadata">{file.kind} <i /> {file.size}<i /> {file.path}<i /> Modified {file.modified}</div><p className="match-reason">✳ <span>{file.reason}</span></p>{!file.available && <p className="unavailable-note">This file may have been moved or deleted.</p>}<div className="result-actions"><button className="secondary" onClick={() => showPreview(file)}>Preview</button><button disabled={!file.available} onClick={() => file.available ? note("Opening file in its default application.") : setModal("unavailable")}>↗ Open file</button><button onClick={() => note("Opening containing folder.")}>▱ Open folder</button></div></div></article>)}</div> : <div className="empty-state"><span>⌕</span><h2>Couldn’t find a strong match.</h2><p>Try describing the file another way, or search a different folder.</p><button className="secondary" onClick={() => {
              setTypeFilter("All types");
              setQuery("");
              setSearchState("idle");
            }}>Find another file</button></div> : <div className="search-start"><div>✳</div><h2>{folderCount ? "What are you looking for?" : "Add a folder to get started"}</h2><p>{folderCount ? "Describe the file you remember. Search matches local file names, types, folders, and dates." : "Choose a folder to create your private local index."}</p>{folderCount ? ["Find my graduation certificate", "Show recent PDFs", "Find my resume"].map(x => <button key={x} onClick={() => { setQuery(x); }}>{x} →</button>) : <button className="primary" onClick={() => startIndex()}>＋ Add a folder</button>}</div>}
        </section>}

        {route === "AI Assistant" && <section className="route-view">
          <div className="route-title"><div><small>GROUNDED IN YOUR LOCAL INDEX</small><h1>Your files, in context.</h1><p>Ask about your indexed files. Answers include the files behind them.</p></div><span className="privacy-chip">{aiConfigured ? <><i /> AI ready</> : "AI not connected"}</span></div>
          <div className="assistant-layout">
            <aside className="suggestions"><small>START WITH A QUESTION</small>{["Find certificates", "Find my resume", "Show recent PDFs", "Find internship documents"].map((x, i) => <button key={x} onClick={() => askAssistant(x)}><i>0{i + 1}</i>{x}<span>→</span></button>)}<p>◇ Answers use details from your local index. Connect an AI provider to enable file-aware answers.</p></aside>
            <div className="chat-card">
              <header><span className="chat-logo">✳</span><span><b>FileFinder File Assistant</b><small>{aiConfigured ? "Knows your local library" : "AI provider not connected"}</small></span><button aria-label="Start a new conversation" onClick={() => {
                  setAnswer(false);
                  setAssistantThinking(false);
                  setQuestion("");
                }}>↻</button></header>
              <div className="chat-body">
                {!answer && !assistantThinking && <div className="chat-welcome"><span>✳</span><h2>A better way to find what you remember.</h2><p>Ask a question about your files and I’ll bring the most relevant ones into view.</p></div>}
                {assistantThinking && <div className="assistant-thinking" role="status"><span className="thinking-dots">•••</span><b>Searching your local index</b><small>Finding files related to your question</small></div>}
                {answer && <><div className="user-message">{question}</div><div className="ai-answer">{assistantFiles.length ? <><b>✳ &nbsp;I found {assistantFiles.length} likely {assistantFiles.length === 1 ? "match" : "matches"}.</b><p>These files matched details in your local index.</p>{assistantFiles.map(file => <button key={file.name} onClick={() => showPreview(file)}><FileMark kind={file.kind} /><span><b>{file.name}</b><small>{file.path}</small></span>→</button>)}</> : <><b>✳ &nbsp;No matching files found.</b><p>Try another description or add the folder that may contain your file.</p></>}</div></>}
              </div>
              <form className="chat-input" onSubmit={e => {
                e.preventDefault();
                if (question.trim()) askAssistant(question);
              }}><input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about a file or folder..." aria-label="Ask about a file or folder" /><button type="submit" aria-label="Send question" disabled={!question.trim() || assistantThinking}>↑</button></form>
            </div>
          </div>
        </section>}

        {route === "Organization" && <section className="route-view"><div className="route-title"><div><small>A TIDIER LIBRARY, ON YOUR TERMS</small><h1>Organize with confidence.</h1><p>Review AI suggestions before anything changes.</p></div><span className="privacy-chip">● 3 suggestions</span></div>
          {approved ? <div className="approved"><span>✓</span><h2>Organization approved</h2><p>Your certificate suggestion is approved. Nothing moves unless you confirm the change.</p><button className="secondary" onClick={() => setApproved(false)}>Back to suggestions</button></div> : rejected ? <div className="approved rejected"><span>×</span><h2>Suggestion dismissed</h2><p>This suggestion is hidden. You can bring it back if you change your mind.</p><button className="secondary" onClick={() => setRejected(false)}>Undo dismissal</button></div> : <article className="org-card"><div className="org-caption"><span>✳</span><div><small>AI SUGGESTION</small><p>Based on file names and content</p></div><button aria-label="Suggestion options" onClick={() => note("Suggestion options")}>···</button></div><h2>These 8 files appear to be certificates.</h2><p className="org-copy">They share credential details and may be easier to find together.</p>{sampleFiles.filter(f => f.tags.includes("certificate")).map(f => <div className="org-row" key={f.name}><FileMark kind={f.kind} /><span><b>{f.name}</b><small>{f.path}</small></span><em>✓ Reviewed</em></div>)}<div className="destination"><div><small>SUGGESTED DESTINATION</small><p>▱ &nbsp;Documents &nbsp;›&nbsp; Certificates</p></div><button onClick={() => note("Choose a destination folder.")}>Change destination</button></div><footer><span>◇ Nothing moves without your approval.</span><div><button onClick={() => setRejected(true)}>Reject</button><button className="primary" onClick={() => setApproved(true)}>✓ Approve suggestion</button></div></footer></article>}
        </section>}

        {route === "Settings" && <section className="route-view"><div className="route-title"><div><small>YOUR WORKSPACE, YOUR RULES</small><h1>Settings</h1><p>Manage AI, indexed locations, and privacy.</p></div></div><div className="settings-layout"><div className="settings-main">
          <section className="settings-card"><header><span>✳</span><div><b>AI configuration</b><small>Control how FileFinder understands your files.</small></div><em className={aiConfigured ? "" : "not-configured"}>{aiConfigured ? "● CONFIGURED" : "○ NOT CONNECTED"}</em></header><div className="setting-row"><span><b>AI provider</b><small>{aiConfigured ? "Connected securely" : "Connect to enable file-aware answers"}</small></span><button className="link-button" onClick={() => setAiConfigured(value => !value)}>{aiConfigured ? "Disconnect" : "Connect"} &nbsp;›</button></div><div className="setting-row"><span><b>API key</b><small>Your key is stored securely and never shown.</small></span><strong className="masked">{aiConfigured ? "••••••••••••••" : "Not connected"} <i>◇</i></strong></div><div className="setting-row"><span><b>Analyze supported files</b><small>Images and PDFs in indexed folders</small></span><button className={"toggle" + (aiConfigured ? " on" : "")} onClick={e => {
                    if (!aiConfigured) return;
                    e.currentTarget.classList.toggle("on");
                  }} aria-label="Toggle supported file analysis"><i /></button></div></section>
          <section className="settings-card"><header><span className="folder-settings">▱</span><div><b>Indexed folders</b><small>Only folders you choose are scanned.</small></div><button className="secondary add-folder" onClick={() => startIndex()}>＋ Add folder</button></header>{[["Documents", "~/Documents", 562], ["Pictures", "~/Pictures", 342], ["Desktop", "~/Desktop", 198], ["College", "~/College", 146]].slice(0, folderCount).map(([name, path, count]) => <div className="folder-setting" key={name}><span>▱</span><div><b>{name}</b><small>{path}</small></div><em>{count} files</em><button aria-label={"Re-index " + name} onClick={() => startIndex(String(name))}>↻</button></div>)}</section>
        </div><aside className="settings-side"><div className="privacy-card"><span>◇</span><small>PRIVATE BY DESIGN</small><h3>Your files stay yours.</h3><p>FileFinder scans only folders you select. Your local index stays on this device.</p><button onClick={() => note("Your selected files remain on this device.")}>Privacy details →</button></div><div className="about-card"><small>APPLICATION</small><p>Version <b>1.0.0</b></p><p>Local index <b>1,248 files</b></p><p>Last indexed <b>{lastIndexed}</b></p></div></aside></div></section>}
      </div>
    </main>

    {modal && <div className="overlay" onMouseDown={e => {
      if (e.target === e.currentTarget) setModal(null);
    }}>
      {modal === "preview" && <section className="preview-modal" role="dialog" aria-modal="true"><header><span><FileMark kind={previewFile.kind} /><b>{previewFile.name}<small>{previewFile.kind === "PDF" ? "PDF document" : "Image file"} · {previewFile.size}</small></b></span><button aria-label="Close preview" onClick={() => setModal(null)}>×</button></header><div className="preview-body"><div className="document-stage">{previewFile.kind === "PDF" ? <div className="document"><div>{previewFile.name.includes("resume") ? "R" : "U"}</div><small>{previewFile.name.includes("resume") ? "PROFESSIONAL PROFILE" : "UNIVERSITY OF EXAMPLE"}</small><h2>{previewFile.name.includes("resume") ? <>Professional<br />Resume</> : <>Certificate<br />of Graduation</>}</h2><i /><p>{previewFile.name.includes("resume") ? "Experience and qualifications" : "This certifies that"}</p><b>{previewFile.name.includes("resume") ? "Career history" : "Sample recipient"}</b><p>{previewFile.name.includes("resume") ? "Selected experience" : "has fulfilled the requirements for"}</p><strong>{previewFile.name.includes("resume") ? "Career Summary" : "Bachelor of Arts"}</strong><footer>✦</footer></div> : <div className={"image-preview " + previewFile.tint}><span>▧</span><small>IMAGE PREVIEW</small><b>{previewFile.name}</b></div>}</div><aside><small>FILE DETAILS</small><h3>{previewFile.name}</h3><span className="ai-badge">✳ Indexed locally</span>{[["Type", previewFile.kind === "PDF" ? "PDF document" : "Image file"], ["Size", previewFile.size], ["Location", previewFile.path], ["Modified", previewFile.modified]].map(x => <p className="detail" key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></p>)}<div className="explanation">✳ <span>{previewFile.reason}</span></div><button className="primary" disabled={!previewFile.available} onClick={() => previewFile.available ? note("Opening file in its default application.") : setModal("unavailable")}>↗ Open file</button><button className="secondary" onClick={() => note("Opening containing folder.")}>▱ Open folder</button></aside></div></section>}
      {modal === "unavailable" && <section className="progress-modal unavailable-modal" role="dialog" aria-modal="true"><button className="modal-close" aria-label="Close message" onClick={() => setModal(null)}>×</button><div className="unavailable-mark">!</div><small>FILE UNAVAILABLE</small><h2>This file may have moved.</h2><p>{previewFile.name} may have been moved or deleted from its indexed location.</p><div className="missing-path">{previewFile.path}</div><button className="primary done-button" onClick={() => { setModal(null); startIndex(previewFile.path.split(" / ")[0]); }}>↻ Re-index folder</button></section>}
      {modal === "index" && <section className="progress-modal" role="dialog" aria-modal="true"><button className="modal-close" aria-label="Cancel indexing" onClick={() => setModal(null)}>×</button><div className="index-illustration"><span>▱</span><i /><i /></div><small>LOCAL INDEXING</small><h2>{indexPhase === "preparing" ? "Preparing your files..." : "Indexing your files..."}</h2><p>{indexPhase === "preparing" ? "Getting your selected folder ready." : "Scanning your selected folder and its subfolders."}</p><div className="progress-text"><b>{Math.round(progress * selectedFileCount / 100).toLocaleString()}</b> of {selectedFileCount.toLocaleString()} files <strong>{progress}%</strong></div><div className="progress-bar" role="progressbar" aria-label="Indexing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><i style={{
            width: progress + "%"
          }} /></div><div className="scanning"><span>▱ &nbsp;{selectedFolder}</span><small>Including subfolders</small></div><div className="safe-note">◇ &nbsp;Your files aren’t moved or changed.</div></section>}
      {modal === "index-complete" && <section className="progress-modal index-complete-modal" role="dialog" aria-modal="true"><button className="modal-close" aria-label="Close indexing summary" onClick={finishIndex}>×</button><div className="complete-mark">✓</div><small>LOCAL INDEXING</small><h2>Your files are ready to search.</h2><p>{selectedFolder} and its subfolders have been indexed.</p><div className="completed-count"><b>{selectedFileCount.toLocaleString()}</b><span>files indexed</span></div><div className="safe-note">◇ &nbsp;Your files were indexed in place.</div><button className="primary done-button" onClick={finishIndex}>Start searching →</button></section>}
      {modal === "analysis" && <section className="progress-modal" role="dialog" aria-modal="true"><button className="modal-close" onClick={() => setModal(null)}>×</button><div className="analysis-mark">{analysisDone ? "✓" : "✳"}</div><small>AI FILE UNDERSTANDING</small><h2>{analysisDone ? "Your files are understood." : "Understanding your files."}</h2><p>{analysisDone ? "Supported PDFs and images have been analyzed." : "Finding useful details in supported PDFs and images."}</p><div className="analysis-file"><FileMark kind="PDF" /><span><b>graduation_certificate.pdf</b><small>{analysisDone ? "Analysis complete" : "Extracting document details..."}</small></span><i>{analysisDone ? "✓" : "•••"}</i></div><div className="progress-bar"><i style={{
            width: analysisDone ? "100%" : "68%"
          }} /></div><button className="primary done-button" onClick={() => setModal(null)}>{analysisDone ? "Done" : "Continue in background"} →</button></section>}
    </div>}
    {toast && <div className="toast">✓ &nbsp;{toast}</div>}
  </div>;
};
