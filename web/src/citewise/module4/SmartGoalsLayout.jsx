import React, { useState, useEffect } from "react";
import { apiFetch } from "../../api/http";
import theme, { ui } from "../theme";
import jsPDF from "jspdf";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function SmartGoalsLayout({ groupId, sessionId: propSessionId, onStepChange }) {
  const STORAGE_SESSION_KEY = groupId ? `citewise.${groupId}.sessionId` : "citewise.session_id";
  const [resolvedSessionId] = useState(() => propSessionId || localStorage.getItem(STORAGE_SESSION_KEY) || "");

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Baseline & Context
  const [baseline, setBaseline] = useState({ title: "", rationale: "", gaps: [] });
  const [approvedDocs, setApprovedDocs] = useState([]);
  const [draftText, setDraftText] = useState("");
  const [additionalRrl, setAdditionalRrl] = useState("");
  const [pdfUploading, setPdfUploading] = useState(false);

  // Feasibility Constraints
  const [constraints, setConstraints] = useState({
    timeframe: "1 Semester (3-4 Months)",
    targetParticipants: "50-100 accessible survey respondents",
    budgetResources: "Standard student software & internet access",
    researcherSkills: "Undergraduate / Graduate research methodology",
    location: "Local university / online survey",
  });

  // History Timeline
  const [history, setHistory] = useState([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Generated SMART Goal Result
  const [smartResult, setSmartResult] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Load baseline & approved docs
  useEffect(() => {
    async function loadContext() {
      if (!resolvedSessionId) return;
      setLoading(true);
      try {
        // Fetch documents
        const { res: docRes, data: docData } = await apiFetch(`/api/v1/documents/session/${resolvedSessionId}`, {
          headers: { 'X-Session-Id': resolvedSessionId }
        });
        if (docRes.ok && Array.isArray(docData)) {
          const approved = docData.filter(d => d.approved);
          setApprovedDocs(approved);
        }

        // Fetch draft
        const { res: draftRes, data: draftData } = await apiFetch(`/api/v1/synthesis/draft/${resolvedSessionId}`, {
          headers: { 'X-Session-Id': resolvedSessionId }
        });
        if (draftRes.ok && draftData?.contentText) {
          setDraftText(draftData.contentText);
        }

        // Fetch baseline
        const storedCatalyst = localStorage.getItem(`citewise.${groupId}.catalystData`);
        if (storedCatalyst) {
          try { setBaseline(JSON.parse(storedCatalyst)); } catch (e) {}
        }

        // Fetch SMART goals history
        const { res: histRes, data: histData } = await apiFetch(`/api/v1/smart-goals/history/${resolvedSessionId}`);
        if (histRes.ok && histData?.success) {
          setHistory(histData.data);
          if (histData.data.length > 0) {
            setSmartResult(histData.data[0]);
            setSelectedHistoryId(histData.data[0].id);
          }
        }
      } catch (err) {
        console.warn("Failed to load SMART goals context:", err);
      } finally {
        setLoading(false);
      }
    }

    loadContext();
  }, [resolvedSessionId, groupId]);

  // Handle Generate SMART Goal
  const handleGenerateSmartGoal = async () => {
    setGenerating(true);
    try {
      const { res, data } = await apiFetch("/api/v1/smart-goals/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": resolvedSessionId,
        },
        body: JSON.stringify({
          sessionId: resolvedSessionId,
          groupId,
          title: baseline.title,
          rationale: baseline.rationale,
          gaps: baseline.gaps,
          approvedDocs,
          additionalRrl,
          draftText,
          constraints,
        }),
      });

      if (!res.ok || !data?.success) {
        alert(data?.message || "Failed to generate SMART Research Goal");
        return;
      }

      setSmartResult(data.data);
      if (data.data.id) {
        setHistory(prev => [data.data, ...prev]);
        setSelectedHistoryId(data.data.id);
      }
    } catch (err) {
      alert("Error generating SMART goal: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setPdfUploading(true);
    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const { res, data } = await apiFetch("/api/v1/smart-goals/parse-pdf", {
        method: "POST",
        body: formData,
      });

      if (res.ok && data?.success) {
        setAdditionalRrl(prev => prev ? prev + "\n\n" + data.text : data.text);
      } else {
        alert("Failed to extract text from PDF: " + data?.message);
      }
    } catch (err) {
      alert("Error parsing PDF: " + err.message);
    } finally {
      setPdfUploading(false);
      e.target.value = "";
    }
  };

  // Export handlers
  const handleCopyText = () => {
    if (!smartResult) return;
    const textToCopy = `S.M.A.R.T. RESEARCH GOAL:\n${smartResult.fullSmartGoal}\n\nSPECIFIC:\n${smartResult.smartComponents.specific}\n\nMEASURABLE:\n${smartResult.smartComponents.measurable}\n\nACHIEVABLE:\n${smartResult.smartComponents.achievable}\n\nRELEVANT:\n${smartResult.smartComponents.relevant}\n\nTIME-BOUND:\n${smartResult.smartComponents.timeBound}`;
    navigator.clipboard.writeText(textToCopy);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleExportTxt = () => {
    if (!smartResult) return;
    const textToExport = `S.M.A.R.T. RESEARCH GOAL REPORT\n\nTitle: ${baseline.title || 'Research Project'}\nGenerated: ${new Date().toLocaleDateString()}\n\n=======================================================\nS.M.A.R.T. GOAL STATEMENT:\n${smartResult.fullSmartGoal}\n\n=======================================================\nBREAKDOWN:\n- Specific: ${smartResult.smartComponents.specific}\n- Measurable: ${smartResult.smartComponents.measurable}\n- Achievable: ${smartResult.smartComponents.achievable}\n- Relevant: ${smartResult.smartComponents.relevant}\n- Time-bound: ${smartResult.smartComponents.timeBound}\n\n=======================================================\nCONSERVATIVE ASSUMPTIONS:\n${smartResult.conservativeAssumptions.map(a => '- ' + a).join('\n')}`;
    
    const blob = new Blob([textToExport], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SMART_Goal_${(baseline.title || 'Research').slice(0, 20)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    if (!smartResult) return;
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("S.M.A.R.T. Research Goal Report", 20, 20);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Project: ${baseline.title || 'Research Project'}`, 20, 28);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 34);

    doc.setFont("helvetica", "bold");
    doc.text("Goal Statement:", 20, 46);
    doc.setFont("helvetica", "italic");
    const splitGoal = doc.splitTextToSize(smartResult.fullSmartGoal, 170);
    doc.text(splitGoal, 20, 52);

    let y = 52 + (splitGoal.length * 6) + 10;
    doc.setFont("helvetica", "bold");
    doc.text("S.M.A.R.T. Criteria Breakdown:", 20, y);
    y += 8;

    const criteria = [
      ["Specific", smartResult.smartComponents.specific],
      ["Measurable", smartResult.smartComponents.measurable],
      ["Achievable", smartResult.smartComponents.achievable],
      ["Relevant", smartResult.smartComponents.relevant],
      ["Time-bound", smartResult.smartComponents.timeBound],
    ];

    criteria.forEach(([label, val]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 20, y);
      doc.setFont("helvetica", "normal");
      const lines = doc.splitTextToSize(val, 140);
      doc.text(lines, 50, y);
      y += (lines.length * 5) + 4;
    });

    doc.save(`SMART_Goal_${(baseline.title || 'Research').slice(0, 20)}.pdf`);
  };

  return (
    <div style={{ padding: "2rem 2.5rem", maxWidth: 1300, margin: "0 auto", color: theme.text, fontFamily: "'Poppins', sans-serif" }}>
      
      {/* Header */}
      <div style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h2 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span>Feasible S.M.A.R.T. Research Goal</span>
            <span style={{ fontSize: "0.75rem", background: "rgba(91,91,214,0.2)", border: "1px solid #5b5bd6", color: "#a5b4fc", padding: "3px 10px", borderRadius: 12 }}>
              Feasibility First
            </span>
          </h2>
          <p style={{ color: theme.textMuted, fontSize: "0.9rem", margin: "6px 0 0" }}>
            Generate a realistic, measurable, and achievable research goal evaluated against scope, participants, budget, and time constraints.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(350px, 1fr) minmax(450px, 1.2fr)", gap: "24px", alignItems: "start" }}>
        
        {/* Left Column: Context & Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* History Collapsible Card */}
          <div style={ui.card}>
            <div 
              style={{ ...ui.cardHeader, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }}
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <div>
                <span style={ui.cardTitle}>Generation History</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "0.72rem", color: theme.textMuted, fontFamily: theme.font }}>{history.length} saved</span>
                {historyOpen ? <ChevronDown size={18} color={theme.accent} /> : <ChevronRight size={18} color={theme.textMuted} />}
              </div>
            </div>

            {historyOpen && (
              <div style={{ padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "8px", maxHeight: 260, overflowY: "auto" }}>
                {history.length === 0 ? (
                  <p style={{ color: theme.textMuted, fontSize: "0.8rem", fontFamily: theme.font, margin: 0 }}>
                    No previous generations. Click Generate below to create one.
                  </p>
                ) : (
                  <>
                    {history.map(item => {
                      const isCurrent = selectedHistoryId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={{
                            background: isCurrent ? theme.accentSoft : theme.surfaceAlt,
                            border: `1px solid ${isCurrent ? theme.accent : theme.border}`,
                            borderRadius: "8px",
                            padding: "8px 10px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "0.8rem", color: theme.text, fontFamily: theme.font, fontWeight: 600 }}>
                                SMART Goal Variant {isCurrent && <span style={{ color: theme.accent, fontSize: "0.66rem" }}>(current)</span>}
                              </div>
                              <div style={{ fontSize: "0.68rem", color: theme.textMuted, fontFamily: theme.font }}>
                                {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <button
                              onClick={() => { setSmartResult(item); setSelectedHistoryId(item.id); }}
                              disabled={isCurrent}
                              style={{ ...ui.ghostBtn, padding: "3px 10px", fontSize: "0.7rem", opacity: isCurrent ? 0.5 : 1 }}
                            >
                              Load Version
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Project Baseline Card */}
          <div style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: "16px", padding: "20px" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: 700, color: theme.accent, margin: "0 0 12px" }}>
              📌 Research Project Context
            </h4>
            <div style={{ fontSize: "0.85rem", color: "#e4e4f0", fontWeight: 600, marginBottom: "6px" }}>
              {baseline.title || "Loading Title..."}
            </div>
            <p style={{ fontSize: "0.78rem", color: theme.textMuted, margin: 0, lineHeight: 1.5 }}>
              {baseline.rationale ? baseline.rationale.slice(0, 200) + "..." : "No rationale available."}
            </p>
          </div>

          {/* Synthesis Sources & Introduction Draft */}
          <div style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: "16px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                📚 Accepted Synthesis Sources ({approvedDocs.length})
              </h4>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 120, overflowY: "auto", marginBottom: 16 }}>
              {approvedDocs.length === 0 ? (
                <div style={{ fontSize: "0.78rem", color: theme.textMuted, fontStyle: "italic" }}>
                  No approved papers selected yet in Module 2.
                </div>
              ) : (
                approvedDocs.map((doc, idx) => (
                  <div key={idx} style={{ background: "rgba(0,0,0,0.2)", padding: "6px 10px", borderRadius: 8, fontSize: "0.78rem", color: "#e4e4f0" }}>
                    ✓ {doc.name || doc.fileName}
                  </div>
                ))
              )}
            </div>

            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "#a1a1b5", display: "block", marginBottom: 6 }}>
              Synthesized Introduction Draft Text / Exported RRL
            </label>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              placeholder="Paste or edit the synthesized introduction draft here..."
              style={{ ...ui.input, minHeight: 90, fontSize: "0.78rem", resize: "vertical", width: "100%" }}
            />
          </div>

          {/* Additional RRL Section */}
          <div style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: "16px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h4 style={{ fontSize: "1rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                ➕ Additional RRL to Enhance SMART Goal
              </h4>
              <div>
                <input type="file" id="pdf-upload" accept="application/pdf" style={{ display: 'none' }} onChange={handlePdfUpload} />
                <label htmlFor="pdf-upload" style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.border}`, color: "#e4e4f0", borderRadius: 6, padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer", display: "inline-block" }}>
                  {pdfUploading ? "Uploading..." : "📄 Upload PDF"}
                </label>
              </div>
            </div>
            <p style={{ fontSize: "0.76rem", color: theme.textMuted, margin: "0 0 10px" }}>
              Paste any extra lit review excerpts, participant constraints, or specific data context to further tailor the goal.
            </p>
            <textarea
              value={additionalRrl}
              onChange={(e) => setAdditionalRrl(e.target.value)}
              placeholder="Paste additional RRL or context text here..."
              style={{ ...ui.input, minHeight: 80, fontSize: "0.78rem", resize: "vertical", width: "100%" }}
            />
          </div>

          {/* Feasibility Evaluator Controls */}
          <div style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: "16px", padding: "20px" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: 700, color: theme.accent, margin: "0 0 12px" }}>
              ⚙️ Feasibility Constraints Evaluator
            </h4>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "#a1a1b5", fontWeight: 600 }}>Target Timeframe</label>
                <input
                  type="text"
                  value={constraints.timeframe}
                  onChange={(e) => setConstraints({ ...constraints, timeframe: e.target.value })}
                  style={{ ...ui.input, fontSize: "0.78rem", padding: "6px 10px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "#a1a1b5", fontWeight: 600 }}>Accessible Participants</label>
                <input
                  type="text"
                  value={constraints.targetParticipants}
                  onChange={(e) => setConstraints({ ...constraints, targetParticipants: e.target.value })}
                  style={{ ...ui.input, fontSize: "0.78rem", padding: "6px 10px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "#a1a1b5", fontWeight: 600 }}>Budget & Equipment</label>
                <input
                  type="text"
                  value={constraints.budgetResources}
                  onChange={(e) => setConstraints({ ...constraints, budgetResources: e.target.value })}
                  style={{ ...ui.input, fontSize: "0.78rem", padding: "6px 10px" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.75rem", color: "#a1a1b5", fontWeight: 600 }}>Researcher Skills</label>
                <input
                  type="text"
                  value={constraints.researcherSkills}
                  onChange={(e) => setConstraints({ ...constraints, researcherSkills: e.target.value })}
                  style={{ ...ui.input, fontSize: "0.78rem", padding: "6px 10px" }}
                />
              </div>
            </div>

            <button
              onClick={handleGenerateSmartGoal}
              disabled={generating}
              style={{
                ...ui.primaryBtn,
                width: "100%",
                marginTop: "16px",
                padding: "12px",
                fontSize: "0.9rem",
                fontWeight: 700,
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? "Evaluating Feasibility & Generating SMART Goal..." : "Generate Feasible S.M.A.R.T. Research Goal ✨"}
            </button>
          </div>

        </div>

        {/* Right Column: AI Output & Breakdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {!smartResult ? (
            <div style={{ background: theme.surfaceAlt, border: `1px dashed ${theme.border}`, borderRadius: "16px", padding: "4rem 2rem", textAlign: "center", color: theme.textMuted }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🎯</div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#e4e4f0", margin: "0 0 8px" }}>
                Ready to Generate Your S.M.A.R.T. Research Goal
              </h3>
              <p style={{ fontSize: "0.82rem", maxWidth: 420, margin: "0 auto", lineHeight: 1.5 }}>
                Click "Generate Feasible S.M.A.R.T. Research Goal ✨" to evaluate your project scope, participants, and resources.
              </p>
            </div>
          ) : (
            <>
              {/* Full Statement Card */}
              <div style={{ background: "linear-gradient(135deg, #1e1e2f 0%, #25253a 100%)", border: "1px solid #5b5bd6", borderRadius: "16px", padding: "24px", boxShadow: "0 10px 30px rgba(91,91,214,0.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 800, color: "#5b5bd6", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Feasible S.M.A.R.T. Goal Statement
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleCopyText} style={{ background: "rgba(91,91,214,0.15)", border: "1px solid #5b5bd6", color: "#e4e4f0", borderRadius: 6, padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer" }}>
                      {copySuccess ? "✓ Copied!" : "📋 Copy"}
                    </button>
                    <button onClick={handleExportTxt} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.border}`, color: "#e4e4f0", borderRadius: 6, padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer" }}>
                      .TXT
                    </button>
                    <button onClick={handleExportPdf} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${theme.border}`, color: "#e4e4f0", borderRadius: 6, padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer" }}>
                      .PDF
                    </button>
                  </div>
                </div>

                <p style={{ fontSize: "1.05rem", fontWeight: 600, color: "#fff", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                  {smartResult.fullSmartGoal}
                </p>
              </div>

              {/* S.M.A.R.T Criteria Cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { key: "specific", label: "Specific", icon: "🎯", color: "#5b5bd6" },
                  { key: "measurable", label: "Measurable", icon: "📏", color: "#4caf82" },
                  { key: "achievable", label: "Achievable", icon: "🚀", color: "#e0a835" },
                  { key: "relevant", label: "Relevant", icon: "💡", color: "#38bdf8" },
                  { key: "timeBound", label: "Time-Bound", icon: "⏰", color: "#f43f5e" },
                ].map(({ key, label, icon, color }) => (
                  <div key={key} style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderLeft: `4px solid ${color}`, borderRadius: "10px", padding: "12px 16px" }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: color, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{icon}</span> {label}
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "#e4e4f0", lineHeight: 1.5 }}>
                      {smartResult.smartComponents[key]}
                    </div>
                  </div>
                ))}
              </div>

              {/* Feasibility Evaluations Grid */}
              <div style={{ background: theme.surfaceAlt, border: `1px solid ${theme.border}`, borderRadius: "16px", padding: "20px" }}>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#fff", margin: "0 0 14px" }}>
                  📊 Feasibility Assessment Breakdown
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {smartResult.evaluations.map((ev, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#e4e4f0" }}>{ev.factor}</div>
                        <div style={{ fontSize: "0.75rem", color: theme.textMuted }}>{ev.detail}</div>
                      </div>
                      <span style={{ fontSize: "0.7rem", fontWeight: 700, background: "rgba(76,175,130,0.15)", color: "#4caf82", border: "1px solid #4caf82", padding: "2px 8px", borderRadius: 10, whiteSpace: "nowrap" }}>
                        {ev.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conservative Assumptions */}
              <div style={{ background: "rgba(224,168,53,0.08)", border: "1px solid #e0a835", borderRadius: "14px", padding: "16px" }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#e0a835", marginBottom: 6 }}>
                  ⚠️ Conservative Assumptions Applied
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.78rem", color: "#e4e4f0", lineHeight: 1.6 }}>
                  {smartResult.conservativeAssumptions.map((ass, idx) => (
                    <li key={idx}>{ass}</li>
                  ))}
                </ul>
              </div>

            </>
          )}

        </div>

      </div>

    </div>
  );
}
