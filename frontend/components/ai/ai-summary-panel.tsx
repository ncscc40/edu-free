"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  GraduationCap,
  HelpCircle,
  Layers,
  Languages,
  Lightbulb,
  Loader2,
  RotateCcw,
  Sparkles,
  Square,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Video,
  Volume2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { ApiResponse, ResourceItem } from "@/types";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface VideoAnalysis {
  id?: number;
  summary: string;
  key_points: string[];
  follow_up_questions: string[];
  source?: string;
}

interface DocumentAnalysis {
  id?: number;
  summary: string;
  important_points: string[];
  key_definitions: Array<{ term: string; definition: string }>;
  study_tips: string[];
  source?: string;
}

interface Flashcard {
  id?: number;
  front: string;
  back: string;
  category?: string;
  difficulty?: "easy" | "medium" | "hard" | null;
  times_reviewed?: number;
  last_reviewed_at?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"];

function isVideoResource(url: string) {
  const lower = url.toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => lower.includes(ext))) return true;
  return /youtube\.com|youtu\.be|vimeo\.com/.test(lower);
}

const CATEGORY_COLORS: Record<string, string> = {
  Definition: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  Concept: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  Formula: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  Example: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  Application: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20",
  General: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
};

const DIFFICULTY_STYLES = {
  easy: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  hard: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

/** BCP-47 codes used by the Web Speech API for synthesis */
const LANG_BCP47: Record<string, string> = {
  en: "en-US",
  hi: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  pa: "pa-IN",
  ur: "ur-PK",
};

const TRANSLATION_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "bn", label: "Bengali" },
  { value: "gu", label: "Gujarati" },
  { value: "pa", label: "Punjabi" },
  { value: "ur", label: "Urdu" },
];

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/"/g, "")             // remove all double-quotes
    .replace(/'/g, "")             // remove single-quotes
    .replace(/[()\[\]{}]/g, "")   // remove all brackets and braces
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,+\s*$/, "")
    .replace(/^\s*[•\-–:]\s*/, "") // strip leading bullet / colon
    .trim();
}

// Split raw text at the first structured-data key so the prose section
// is isolated and the trailing [ ... ] blocks are never shown.
function splitProseFromTail(text: string): string {
  const markerRe =
    /(?:\n|\s{2,}|\.|\?)\s*"?(?:important_points|key_points|follow_up_questions|key_definitions|study_tips)"?\s*:/i;
  const idx = text.search(markerRe);
  return idx > 0 ? text.slice(0, idx).trim() : text.trim();
}

function sanitizeSummaryText(value: unknown): string {
  if (typeof value !== "string") return "";

  let text = value
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Cut off any embedded structured-data tail
  text = splitProseFromTail(text);

  return cleanText(text);
}

function parseJsonObjectString(value: string): Record<string, unknown> | null {
  const raw = value.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = raw.slice(firstBrace, lastBrace + 1);
      try {
        const parsed = JSON.parse(candidate);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractEmbeddedAnalysisFromSummary(summary: unknown): Record<string, unknown> | null {
  if (typeof summary !== "string") return null;
  const parsed = parseJsonObjectString(summary);
  if (!parsed) return null;

  const hasAnalysisKeys = [
    "summary",
    "important_points",
    "key_points",
    "follow_up_questions",
    "key_definitions",
    "study_tips",
  ].some((key) => key in parsed);

  return hasAnalysisKeys ? parsed : null;
}

function parseJsonArrayString(value: string): unknown[] {
  const raw = value.trim();
  if (!raw.startsWith("[") || !raw.endsWith("]")) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Parse Python-style unquoted arrays: [ foo, bar, baz ]
function parsePlainBracketList(value: string): string[] {
  const raw = value.trim();
  const inner = raw.replace(/^\[\s*/, "").replace(/\s*\]$/, "");
  if (!inner) return [];
  return inner
    .split(/,(?![^{]*})/)  // split on commas not inside braces
    .map((s) => cleanText(s))
    .filter(Boolean);
}

// Parse Python-style unquoted object list: [ { term: X, definition: Y }, ... ]
function parsePlainBracketDictList(
  value: string
): Array<{ term: string; definition: string }> {
  const raw = value.trim();
  const inner = raw.replace(/^\[\s*/, "").replace(/\s*\]$/, "");
  const objectBlocks = inner.match(/\{[^}]+\}/g) ?? [];
  return objectBlocks
    .map((block) => {
      const body = block.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
      const termMatch = body.match(/term\s*:\s*([^,]+)/i);
      const defMatch = body.match(/definition\s*:\s*([^,}]+(?:,[^,}]+)*)/i);
      return {
        term: cleanText(termMatch?.[1] ?? ""),
        definition: cleanText(defMatch?.[1] ?? ""),
      };
    })
    .filter((d) => d.term && d.definition);
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    // 1. Try proper JSON array
    const jsonParsed = parseJsonArrayString(raw);
    if (jsonParsed.length > 0) {
      return jsonParsed.map((item) => cleanText(item)).filter(Boolean);
    }

    // 2. Python-style bracket list (items without quotes)
    if (raw.startsWith("[")) {
      const plain = parsePlainBracketList(raw);
      if (plain.length > 0) return plain;
    }

    // 3. Newline / bullet separated
    return raw
      .split(/\n|•|-\s+/)
      .map((item) => cleanText(item))
      .filter(Boolean);
  }

  return [];
}

function normalizeDefinitions(
  value: unknown
): Array<{ term: string; definition: string }> {
  // Proper JSON array
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseJsonArrayString(value)
      : [];

  if (Array.isArray(source) && source.length > 0) {
    return source
      .map((item) => ({
        term: cleanText((item as any)?.term),
        definition: cleanText((item as any)?.definition),
      }))
      .filter((d) => d.term && d.definition);
  }

  // Python-style bracket dict list fallback
  if (typeof value === "string" && value.trim().startsWith("[")) {
    return parsePlainBracketDictList(value);
  }

  return [];
}

// Extract structured sections from plain-text AI responses like:
//   "prose summary... important_points: [ ... ] key_definitions: [ ... ]"
const SECTION_KEYS = [
  "important_points",
  "key_points",
  "follow_up_questions",
  "key_definitions",
  "study_tips",
];

function extractPlainTextSections(raw: string): Record<string, unknown> | null {
  const keyPat = SECTION_KEYS.join("|");
  const headerRe = new RegExp(
    `(?:^|\\n|\\s{2,})["\u2018\u2019]?(${keyPat})["\u2018\u2019]?\\s*:\\s*`,
    "i",
  );
  const idx = raw.search(headerRe);
  if (idx < 0) return null;

  const result: Record<string, unknown> = {
    summary: sanitizeSummaryText(raw.slice(0, idx)),
  };

  const globalRe = new RegExp(
    `["\u2018\u2019]?(${keyPat})["\u2018\u2019]?\\s*:\\s*`,
    "gi",
  );
  const matches: Array<{ key: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = globalRe.exec(raw)) !== null) {
    matches.push({ key: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const { key, end } = matches[i];
    const blockEnd = i + 1 < matches.length ? matches[i + 1].start : raw.length;
    const block = raw.slice(end, blockEnd).trim().replace(/,\s*$/, "");
    result[key] = key === "key_definitions"
      ? parsePlainBracketDictList(block)
      : parsePlainBracketList(block);
  }

  return result;
}

function splitSummaryIntoBlocks(summary: string): string[] {
  const cleaned = sanitizeSummaryText(summary);
  if (!cleaned) return [];

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 2) return [cleaned];

  const blocks: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    blocks.push(`${sentences[i]} ${sentences[i + 1] ?? ""}`.trim());
  }
  return blocks;
}

function normalizeVideoAnalysis(value: unknown): VideoAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  // Try embedded JSON first, then plain-text section extraction
  const embedded = extractEmbeddedAnalysisFromSummary(raw.summary)
    ?? (typeof raw.summary === "string" ? extractPlainTextSections(raw.summary) : null)
    ?? {};

  const summary = sanitizeSummaryText(
    (embedded.summary as string) || raw.summary || ""
  );

  const id = typeof raw.id === "number" ? raw.id : undefined;
  const source = typeof raw.source === "string" ? raw.source : undefined;

  return {
    id,
    summary,
    key_points: normalizeList(raw.key_points ?? embedded.key_points),
    follow_up_questions: normalizeList(
      raw.follow_up_questions ?? embedded.follow_up_questions
    ),
    source,
  };
}

function normalizeDocumentAnalysis(value: unknown): DocumentAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  // Try embedded JSON first, then plain-text section extraction
  const embedded = extractEmbeddedAnalysisFromSummary(raw.summary)
    ?? (typeof raw.summary === "string" ? extractPlainTextSections(raw.summary) : null)
    ?? {};

  const summary = sanitizeSummaryText(
    (embedded.summary as string) || raw.summary || ""
  );

  const id = typeof raw.id === "number" ? raw.id : undefined;
  const source = typeof raw.source === "string" ? raw.source : undefined;

  return {
    id,
    summary,
    important_points: normalizeList(
      raw.important_points ?? embedded.important_points
    ),
    key_definitions: normalizeDefinitions(
      raw.key_definitions ?? embedded.key_definitions
    ),
    study_tips: normalizeList(raw.study_tips ?? embedded.study_tips),
    source,
  };
}

/* ------------------------------------------------------------------ */
/* Text-to-Speech — English via Web Speech API, Indian langs via gTTS backend */
/* ------------------------------------------------------------------ */

function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [currentWord, setCurrentWord] = useState<string>("");
  const [charIndex, setCharIndex] = useState<number>(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Load browser voices for English
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const stop = useCallback(() => {
    // Stop browser TTS
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    // Stop server audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setSpeakingId(null);
    setCurrentWord("");
    setCharIndex(0);
    setTtsLoading(false);
  }, []);

  const pickVoice = useCallback(
    (bcp47: string): SpeechSynthesisVoice | null => {
      if (!voices.length) return null;
      const ll = bcp47.toLowerCase();
      const prefix = ll.split("-")[0];
      return (
        voices.find((v) => v.lang.toLowerCase() === ll) ??
        voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ??
        null
      );
    },
    [voices]
  );

  const speak = useCallback(
    (text: string, lang: string, sectionId: string) => {
      if (typeof window === "undefined") return;
      if (speakingId === sectionId) { stop(); return; }
      stop();

      setSpeakingId(sectionId);
      setCurrentWord("");
      setCharIndex(0);

      if (lang === "en") {
        // --- English: Web Speech API with exact word-boundary tracking ---
        if (!window.speechSynthesis) {
          toast.error("Text-to-speech is not supported in this browser.");
          setSpeakingId(null);
          return;
        }
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-US";
        utter.rate = 0.92;
        utter.pitch = 1;
        const voice = pickVoice("en-US");
        if (voice) utter.voice = voice;
        utter.onboundary = (e) => {
          if (e.name === "word") {
            setCharIndex(e.charIndex);
            setCurrentWord(text.slice(e.charIndex, e.charIndex + (e.charLength ?? 0)));
          }
        };
        utter.onend  = () => { setSpeakingId(null); setCurrentWord(""); setCharIndex(0); };
        utter.onerror = () => { setSpeakingId(null); setCurrentWord(""); setCharIndex(0); };
        utterRef.current = utter;
        window.speechSynthesis.speak(utter);
      } else {
        // --- Indian languages: server gTTS → MP3 blob → HTMLAudioElement ---
        setTtsLoading(true);
        api
          .post("/ai/tts", { text, language: lang }, { responseType: "arraybuffer", timeout: 40_000 })
          .then((resp) => {
            const blob = new Blob([resp.data as ArrayBuffer], { type: "audio/mpeg" });
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;

            const audio = new Audio(url);
            audioRef.current = audio;

            // Estimate charIndex from playback progress for visual tracking
            audio.ontimeupdate = () => {
              const dur = audio.duration;
              if (!dur || isNaN(dur)) return;
              const progress = audio.currentTime / dur;
              const ci = Math.floor(progress * text.length);
              setCharIndex(ci);
              const words = text.split(/\s+/);
              const wi = Math.min(Math.floor(progress * words.length), words.length - 1);
              setCurrentWord(words[wi] ?? "");
            };
            audio.onended = () => {
              setSpeakingId(null); setCurrentWord(""); setCharIndex(0);
              URL.revokeObjectURL(url); blobUrlRef.current = null;
            };
            audio.onerror = () => {
              setSpeakingId(null); setCurrentWord(""); setCharIndex(0);
              URL.revokeObjectURL(url); blobUrlRef.current = null;
              toast.error("Failed to play speech audio");
            };
            setTtsLoading(false);
            audio.play().catch(() => toast.error("Audio playback blocked — interact with the page first"));
          })
          .catch(() => {
            setSpeakingId(null);
            setTtsLoading(false);
            toast.error("Failed to generate speech for this language");
          });
      }
    },
    [speakingId, stop, pickVoice]
  );

  useEffect(() => () => { stop(); }, [stop]);

  return { speakingId, ttsLoading, currentWord, charIndex, speak, stop };
}

/** Small speaker/stop button placed in section card headers */
function SpeakButton({
  onClick,
  active,
  loading = false,
}: {
  onClick: () => void;
  active: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={loading ? "Generating audio…" : active ? "Stop speaking" : "Listen"}
      className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all ${
        loading
          ? "bg-blue-500/20 text-blue-500 cursor-wait"
          : active
            ? "bg-blue-500 text-white shadow-md shadow-blue-500/40"
            : "bg-muted text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500"
      }`}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : active ? (
        <Square className="h-2.5 w-2.5 fill-current" />
      ) : (
        <Volume2 className="h-3 w-3" />
      )}
    </button>
  );
}

/** Animated progress tracker shown inside a card while TTS is active */
function TTSTracker({ currentWord, loading = false }: { currentWord: string; loading?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-1.5">
      {/* Animated waveform bars */}
      <div className="flex h-3.5 items-end gap-[3px]">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`tts-bar tts-bar-${i}`} />
        ))}
      </div>
      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
        {loading ? "Generating audio\u2026" : "Speaking"}
      </span>
      {!loading && currentWord && (
        <>
          <span className="text-[11px] text-muted-foreground">\u00b7</span>
          <span className="rounded-md bg-blue-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 transition-all">
            {currentWord}
          </span>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline-highlight helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Renders a paragraph with the word at `charIndex` highlighted.
 * `offset` = start position of this text block within the full spoken string.
 */
function HighlightedPara({
  text,
  active,
  charIndex,
  offset = 0,
  className,
}: {
  text: string;
  active: boolean;
  charIndex: number;
  offset?: number;
  className?: string;
}) {
  if (!active) return <p className={className}>{text}</p>;

  const local = charIndex - offset;
  const tokens: { chunk: string; start: number; isWord: boolean }[] = [];
  const re = /(\S+|\s+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ chunk: m[0], start: m.index, isWord: /\S/.test(m[0]) });
  }

  return (
    <p className={className}>
      {tokens.map((t, i) => {
        const lit =
          t.isWord && local >= t.start && local < t.start + t.chunk.length;
        return lit ? (
          <mark
            key={i}
            className="rounded-[3px] bg-blue-400/35 px-[1px] text-inherit not-italic dark:bg-blue-500/35"
          >
            {t.chunk}
          </mark>
        ) : (
          <span key={i}>{t.chunk}</span>
        );
      })}
    </p>
  );
}

/**
 * Returns the index of the item currently being spoken, given `charIndex`
 * and how the items were built into the spoken string (joined with ". ").
 */
function findActiveListItem(
  items: string[],
  charIndex: number,
  buildPiece: (item: string, idx: number) => string,
): number {
  const SEP = ". ";
  let cursor = 0;
  for (let i = 0; i < items.length; i++) {
    const piece = buildPiece(items[i], i);
    if (charIndex >= cursor && charIndex < cursor + piece.length) return i;
    cursor += piece.length + SEP.length;
  }
  return -1;
}

/* ------------------------------------------------------------------ */
/* AI Summary Panel                                                    */
/* ------------------------------------------------------------------ */

interface AISummaryPanelProps {
  resource: ResourceItem;
}

export function AISummaryPanel({ resource }: AISummaryPanelProps) {
  const isVideo = isVideoResource(resource.url_or_path);

  /* state */
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysis | null>(null);
  const [docAnalysis, setDocAnalysis] = useState<DocumentAnalysis | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardsLoading, setFlashcardsLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [activeCard, setActiveCard] = useState(0);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"summary" | "flashcards">("summary");
  const [reviewedCount, setReviewedCount] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [translating, setTranslating] = useState(false);
  const [translatedVideoAnalysis, setTranslatedVideoAnalysis] = useState<VideoAnalysis | null>(null);
  const [translatedDocAnalysis, setTranslatedDocAnalysis] = useState<DocumentAnalysis | null>(null);
  const { speakingId, ttsLoading, currentWord, charIndex, speak } = useTTS();

  /* ── load saved data on mount ─────────────────────────────────── */
  const loadSavedData = useCallback(async () => {
    try {
      const [analysisResp, flashcardsResp] = await Promise.all([
        api
          .get<ApiResponse<any>>(`/ai/resource/${resource.id}/analysis`)
          .catch(() => null),
        api
          .get<ApiResponse<{ flashcards: Flashcard[] }>>(
            `/ai/resource/${resource.id}/flashcards`
          )
          .catch(() => null),
      ]);

      if (analysisResp?.data?.data) {
        const data = (analysisResp.data.data as any)?.analysis ?? analysisResp.data.data;
        setSelectedLanguage("en");
        setTranslatedVideoAnalysis(null);
        setTranslatedDocAnalysis(null);
        if (isVideo) {
          setVideoAnalysis(normalizeVideoAnalysis(data));
        } else {
          setDocAnalysis(normalizeDocumentAnalysis(data));
        }
      }

      if (flashcardsResp?.data?.data?.flashcards?.length) {
        setFlashcards(flashcardsResp.data.data.flashcards);
      }
    } catch {
      /* silently fail */
    } finally {
      setInitialLoading(false);
    }
  }, [resource.id, isVideo]);

  useEffect(() => {
    loadSavedData();
  }, [loadSavedData]);

  /* ── actions ──────────────────────────────────────────────────── */
  const analyzeResource = async () => {
    setLoading(true);
    try {
      if (isVideo) {
        const resp = await api.post<ApiResponse<VideoAnalysis>>(
          "/ai/analyze-video",
          { resource_id: resource.id, title: resource.title }
        );
        setVideoAnalysis(normalizeVideoAnalysis(resp.data.data));
        setTranslatedVideoAnalysis(null);
      } else {
        const resp = await api.post<ApiResponse<DocumentAnalysis>>(
          "/ai/analyze-document",
          { resource_id: resource.id, title: resource.title }
        );
        setDocAnalysis(normalizeDocumentAnalysis(resp.data.data));
        setTranslatedDocAnalysis(null);
      }
      setSelectedLanguage("en");
      setActiveTab("summary");
      toast.success("AI analysis complete!");
    } catch (error: any) {
      toast.error(error?.response?.data?.message ?? "AI analysis failed");
    } finally {
      setLoading(false);
    }
  };

  const generateFlashcards = async () => {
    setFlashcardsLoading(true);
    try {
      const resp = await api.post<ApiResponse<{ flashcards: Flashcard[] }>>(
        "/ai/flashcards",
        { resource_id: resource.id, title: resource.title }
      );
      const cards = resp.data.data.flashcards ?? [];
      setFlashcards(cards);
      setActiveCard(0);
      setFlippedCards(new Set());
      setReviewedCount(0);
      setActiveTab("flashcards");
      toast.success(`${cards.length} flashcards generated!`);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Flashcard generation failed"
      );
    } finally {
      setFlashcardsLoading(false);
    }
  };

  const reviewFlashcard = async (
    fcId: number | undefined,
    difficulty: "easy" | "medium" | "hard"
  ) => {
    if (!fcId) return;
    try {
      await api.put(`/ai/flashcards/${fcId}/review`, { difficulty });
      setFlashcards((prev) =>
        prev.map((fc) =>
          fc.id === fcId
            ? {
                ...fc,
                difficulty,
                times_reviewed: (fc.times_reviewed ?? 0) + 1,
              }
            : fc
        )
      );
      setReviewedCount((c) => c + 1);
    } catch {
      /* silently fail */
    }
  };

  const deleteFlashcard = async (fcId: number | undefined) => {
    if (!fcId) return;
    try {
      await api.delete(`/ai/flashcards/${fcId}`);
      setFlashcards((prev) => prev.filter((fc) => fc.id !== fcId));
      setActiveCard((c) =>
        Math.min(c, Math.max(0, flashcards.length - 2))
      );
      toast.success("Flashcard removed");
    } catch {
      toast.error("Failed to remove flashcard");
    }
  };

  const toggleFlip = (idx: number) => {
    setFlippedCards((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const hasAnalysis = isVideo ? !!videoAnalysis : !!docAnalysis;

  const translateSummaryAnalysis = async (targetLanguage: string) => {
    setSelectedLanguage(targetLanguage);

    if (targetLanguage === "en") {
      setTranslatedVideoAnalysis(null);
      setTranslatedDocAnalysis(null);
      return;
    }

    if (!hasAnalysis) return;
    const currentAnalysis = isVideo ? videoAnalysis : docAnalysis;
    if (!currentAnalysis) return;

    setTranslating(true);
    try {
      const resp = await api.post<ApiResponse<any>>("/ai/translate-analysis", {
        analysis: currentAnalysis,
        analysis_type: isVideo ? "video" : "document",
        target_language: targetLanguage,
      }, { timeout: 120_000 }); // translation can take time — override default 15s
      if (isVideo) setTranslatedVideoAnalysis(normalizeVideoAnalysis(resp.data.data));
      else setTranslatedDocAnalysis(normalizeDocumentAnalysis(resp.data.data));
      toast.success("Translated successfully");
    } catch (error: any) {
      setSelectedLanguage("en");
      toast.error(error?.response?.data?.message ?? "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const displayFlashcards = flashcards;

  const displayVideoAnalysis = selectedLanguage === "en"
    ? videoAnalysis
    : (translatedVideoAnalysis ?? videoAnalysis);

  const displayDocAnalysis = selectedLanguage === "en"
    ? docAnalysis
    : (translatedDocAnalysis ?? docAnalysis);

  const videoSummaryBlocks = splitSummaryIntoBlocks(displayVideoAnalysis?.summary ?? "");
  const videoKeyPoints = normalizeList(displayVideoAnalysis?.key_points);
  const videoQuestions = normalizeList(displayVideoAnalysis?.follow_up_questions);

  const docSummaryBlocks = splitSummaryIntoBlocks(displayDocAnalysis?.summary ?? "");
  const docImportantPoints = normalizeList(displayDocAnalysis?.important_points);
  const docDefinitions = normalizeDefinitions(displayDocAnalysis?.key_definitions);
  const docStudyTips = normalizeList(displayDocAnalysis?.study_tips);

  /* loading skeleton */
  if (initialLoading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent animate-pulse">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded bg-primary/20" />
            <div className="h-4 w-32 rounded bg-primary/20" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-8 w-48 rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/3">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            </div>
            AI Study Assistant
            {hasAnalysis && (
              <span className="ml-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                Analyzed
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {hasAnalysis && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Initial action buttons ─────────────────────────────── */}
        {!hasAnalysis && flashcards.length === 0 && (
          <div className="flex flex-col gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              Use AI to analyze this {isVideo ? "video" : "document"} and
              generate study materials.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={analyzeResource}
                disabled={loading}
                className="h-9 gap-2 text-xs font-medium"
                variant="default"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isVideo ? (
                  <Video className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                {loading
                  ? "Analyzing..."
                  : isVideo
                    ? "Summarize Video"
                    : "Extract Key Points"}
              </Button>
              <Button
                onClick={generateFlashcards}
                disabled={flashcardsLoading}
                variant="outline"
                className="h-9 gap-2 text-xs font-medium"
              >
                {flashcardsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Layers className="h-3.5 w-3.5" />
                )}
                {flashcardsLoading ? "Generating..." : "Generate Flashcards"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Tab bar ────────────────────────────────────────────── */}
        {(hasAnalysis || flashcards.length > 0) && expanded && (
          <>
            <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
              <button
                onClick={() => setActiveTab("summary")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeTab === "summary"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Brain className="h-3.5 w-3.5" />
                Summary
              </button>
              <button
                onClick={() => setActiveTab("flashcards")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  activeTab === "flashcards"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Flashcards
                {flashcards.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {flashcards.length}
                  </span>
                )}
              </button>
            </div>

            {/* ── Summary Tab Content ──────────────────────────────── */}
            {activeTab === "summary" && (
              <div className="space-y-4">
                {/* Action bar */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={analyzeResource}
                    disabled={loading}
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                  >
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    {loading ? "Analyzing..." : "Re-analyze"}
                  </Button>
                  {flashcards.length === 0 && (
                    <Button
                      onClick={generateFlashcards}
                      disabled={flashcardsLoading}
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                    >
                      {flashcardsLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Layers className="h-3.5 w-3.5" />
                      )}
                      Generate Flashcards
                    </Button>
                  )}
                  {hasAnalysis && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={selectedLanguage}
                        onValueChange={translateSummaryAnalysis}
                        disabled={translating}
                      >
                        <SelectTrigger className="h-8 w-[170px] text-xs">
                          <div className="flex items-center gap-1.5">
                            <Languages className="h-3.5 w-3.5" />
                            <SelectValue placeholder="Language" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {TRANSLATION_LANGUAGES.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                {translating && (
                  <p className="text-[11px] text-muted-foreground">Translating analysis...</p>
                )}

                {/* Video Analysis */}
                {displayVideoAnalysis && (
                  <div className="space-y-3">
                    {/* Summary Card */}
                    <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                          <Brain className="h-4 w-4 text-blue-500" />
                        </div>
                        <h4 className="text-sm font-semibold">Summary</h4>
                        <SpeakButton
                          active={speakingId === "video-summary"}
                          loading={ttsLoading && speakingId === "video-summary"}
                          onClick={() => speak(videoSummaryBlocks.join(" "), selectedLanguage, "video-summary")}
                        />
                      </div>
                      {speakingId === "video-summary" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                      <div className="space-y-2.5">
                        {videoSummaryBlocks.map((block, idx) => {
                          const offset = videoSummaryBlocks
                            .slice(0, idx)
                            .reduce((acc, b) => acc + b.length + 1, 0);
                          return (
                            <HighlightedPara
                              key={idx}
                              text={block}
                              active={speakingId === "video-summary"}
                              charIndex={charIndex}
                              offset={offset}
                              className="text-sm leading-relaxed text-muted-foreground"
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Key Points */}
                    {videoKeyPoints.length > 0 && (
                      <div className="rounded-xl border bg-gradient-to-br from-yellow-500/5 to-transparent p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500/10">
                            <Lightbulb className="h-4 w-4 text-yellow-500" />
                          </div>
                          <h4 className="text-sm font-semibold">Key Points</h4>
                          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
                            {videoKeyPoints.length}
                          </span>
                          <SpeakButton
                            active={speakingId === "video-keypoints"}
                            loading={ttsLoading && speakingId === "video-keypoints"}
                            onClick={() => speak(videoKeyPoints.map((p, i) => `${i + 1}. ${p}`).join(". "), selectedLanguage, "video-keypoints")}
                          />
                        </div>
                        {speakingId === "video-keypoints" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                        <div className="space-y-2.5">
                          {videoKeyPoints.map((point, idx) => {
                            const active =
                              speakingId === "video-keypoints" &&
                              findActiveListItem(videoKeyPoints, charIndex, (p, i) => `${i + 1}. ${p}`) === idx;
                            return (
                              <div
                                key={idx}
                                className={`flex gap-3 rounded-lg p-3 transition ${
                                  active
                                    ? "bg-blue-500/10 ring-1 ring-blue-500/25"
                                    : "bg-background/60 hover:bg-background/80"
                                }`}
                              >
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500/10 text-[11px] font-bold text-yellow-600 dark:text-yellow-400">
                                  {idx + 1}
                                </span>
                                <HighlightedPara
                                  text={point}
                                  active={active}
                                  charIndex={charIndex}
                                  offset={(() => {
                                    const SEP = ". ";
                                    let c = 0;
                                    for (let j = 0; j < idx; j++) c += `${j + 1}. ${videoKeyPoints[j]}`.length + SEP.length;
                                    return c + `${idx + 1}. `.length;
                                  })()}
                                  className="text-sm leading-relaxed text-muted-foreground"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Follow-up Questions */}
                    {videoQuestions.length > 0 && (
                      <div className="rounded-xl border bg-gradient-to-br from-purple-500/5 to-transparent p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                            <HelpCircle className="h-4 w-4 text-purple-500" />
                          </div>
                          <h4 className="text-sm font-semibold">
                            Follow-up Questions
                          </h4>
                          <SpeakButton
                            active={speakingId === "video-questions"}
                            loading={ttsLoading && speakingId === "video-questions"}
                            onClick={() => speak(videoQuestions.map((q, i) => `Question ${i + 1}. ${q}`).join(". "), selectedLanguage, "video-questions")}
                          />
                        </div>
                        {speakingId === "video-questions" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                        <div className="space-y-2">
                          {videoQuestions.map((q, idx) => {
                            const active =
                              speakingId === "video-questions" &&
                              findActiveListItem(videoQuestions, charIndex, (item, i) => `Question ${i + 1}. ${item}`) === idx;
                            return (
                              <div
                                key={idx}
                                className={`flex gap-3 rounded-lg p-3 transition ${
                                  active ? "bg-blue-500/10 ring-1 ring-blue-500/25" : "bg-background/60"
                                }`}
                              >
                                <span className="shrink-0 text-sm font-semibold text-purple-500">
                                  Q{idx + 1}.
                                </span>
                                <HighlightedPara
                                  text={q}
                                  active={active}
                                  charIndex={charIndex}
                                  offset={(() => {
                                    const SEP = ". ";
                                    let c = 0;
                                    for (let j = 0; j < idx; j++) c += `Question ${j + 1}. ${videoQuestions[j]}`.length + SEP.length;
                                    return c + `Question ${idx + 1}. `.length;
                                  })()}
                                  className="text-sm text-muted-foreground"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {displayVideoAnalysis.source === "title_context" && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Analysis based on video title. Upload local video for
                          transcription-based analysis.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Document Analysis */}
                {displayDocAnalysis && (
                  <div className="space-y-3">
                    {/* Summary Card */}
                    <div className="rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                          <Brain className="h-4 w-4 text-blue-500" />
                        </div>
                        <h4 className="text-sm font-semibold">Summary</h4>
                        <SpeakButton
                          active={speakingId === "doc-summary"}
                          loading={ttsLoading && speakingId === "doc-summary"}
                          onClick={() => speak(docSummaryBlocks.join(" "), selectedLanguage, "doc-summary")}
                        />
                      </div>
                      {speakingId === "doc-summary" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                      <div className="space-y-2.5">
                        {docSummaryBlocks.map((block, idx) => {
                          const offset = docSummaryBlocks
                            .slice(0, idx)
                            .reduce((acc, b) => acc + b.length + 1, 0);
                          return (
                            <HighlightedPara
                              key={idx}
                              text={block}
                              active={speakingId === "doc-summary"}
                              charIndex={charIndex}
                              offset={offset}
                              className="text-sm leading-relaxed text-muted-foreground"
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Important Points */}
                    {docImportantPoints.length > 0 && (
                      <div className="rounded-xl border bg-gradient-to-br from-yellow-500/5 to-transparent p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-yellow-500/10">
                            <Lightbulb className="h-4 w-4 text-yellow-500" />
                          </div>
                          <h4 className="text-sm font-semibold">
                            Important Points
                          </h4>
                          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-600 dark:text-yellow-400">
                            {docImportantPoints.length}
                          </span>
                          <SpeakButton
                            active={speakingId === "doc-important"}
                            loading={ttsLoading && speakingId === "doc-important"}
                            onClick={() => speak(docImportantPoints.map((p, i) => `${i + 1}. ${p}`).join(". "), selectedLanguage, "doc-important")}
                          />
                        </div>
                        {speakingId === "doc-important" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                        <div className="space-y-2.5">
                          {docImportantPoints.map((point, idx) => {
                            const active =
                              speakingId === "doc-important" &&
                              findActiveListItem(docImportantPoints, charIndex, (p, i) => `${i + 1}. ${p}`) === idx;
                            return (
                              <div
                                key={idx}
                                className={`flex gap-3 rounded-lg p-3 transition ${
                                  active
                                    ? "bg-blue-500/10 ring-1 ring-blue-500/25"
                                    : "bg-background/60 hover:bg-background/80"
                                }`}
                              >
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500/10 text-[11px] font-bold text-yellow-600 dark:text-yellow-400">
                                  {idx + 1}
                                </span>
                                <HighlightedPara
                                  text={point}
                                  active={active}
                                  charIndex={charIndex}
                                  offset={(() => {
                                    const SEP = ". ";
                                    let c = 0;
                                    for (let j = 0; j < idx; j++) c += `${j + 1}. ${docImportantPoints[j]}`.length + SEP.length;
                                    return c + `${idx + 1}. `.length;
                                  })()}
                                  className="text-sm leading-relaxed text-muted-foreground"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Key Definitions */}
                    {docDefinitions.length > 0 && (
                      <div className="rounded-xl border bg-gradient-to-br from-green-500/5 to-transparent p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-500/10">
                            <BookOpen className="h-4 w-4 text-green-500" />
                          </div>
                          <h4 className="text-sm font-semibold">
                            Key Definitions
                          </h4>
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                            {docDefinitions.length}
                          </span>
                          <SpeakButton
                            active={speakingId === "doc-definitions"}
                            loading={ttsLoading && speakingId === "doc-definitions"}
                            onClick={() => speak(docDefinitions.map((d) => `${d.term}. ${d.definition}`).join(". "), selectedLanguage, "doc-definitions")}
                          />
                        </div>
                        {speakingId === "doc-definitions" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                        <div className="grid gap-2.5">
                          {docDefinitions.map((def, idx) => {
                            const active =
                              speakingId === "doc-definitions" &&
                              findActiveListItem(
                                docDefinitions.map((d) => `${d.term}. ${d.definition}`),
                                charIndex,
                                (item) => item,
                              ) === idx;
                            return (
                              <div
                                key={idx}
                                className={`rounded-xl border p-3.5 transition ${
                                  active
                                    ? "border-blue-500/30 bg-blue-500/8 ring-1 ring-blue-500/20"
                                    : "border-green-500/15 bg-background/70 hover:bg-background/90"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-green-600 dark:text-green-400">
                                    <GraduationCap className="h-3 w-3" />
                                    {def.term}
                                  </span>
                                </div>
                                <HighlightedPara
                                  text={def.definition}
                                  active={active}
                                  charIndex={charIndex}
                                  offset={(() => {
                                    const SEP = ". ";
                                    let c = 0;
                                    for (let j = 0; j < idx; j++) c += `${docDefinitions[j].term}. ${docDefinitions[j].definition}`.length + SEP.length;
                                    return c + `${def.term}. `.length;
                                  })()}
                                  className="text-sm leading-relaxed text-muted-foreground pl-1"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Study Tips */}
                    {docStudyTips.length > 0 && (
                      <div className="rounded-xl border bg-gradient-to-br from-pink-500/5 to-transparent p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-pink-500/10">
                            <Star className="h-4 w-4 text-pink-500" />
                          </div>
                          <h4 className="text-sm font-semibold">Study Tips</h4>
                          <SpeakButton
                            active={speakingId === "doc-tips"}
                            loading={ttsLoading && speakingId === "doc-tips"}
                            onClick={() => speak(docStudyTips.map((t, i) => `Tip ${i + 1}. ${t}`).join(". "), selectedLanguage, "doc-tips")}
                          />
                        </div>
                        {speakingId === "doc-tips" && <TTSTracker currentWord={currentWord} loading={ttsLoading} />}
                        <div className="space-y-2">
                          {docStudyTips.map((tip, idx) => {
                            const active =
                              speakingId === "doc-tips" &&
                              findActiveListItem(docStudyTips, charIndex, (t, i) => `Tip ${i + 1}. ${t}`) === idx;
                            return (
                              <div
                                key={idx}
                                className={`flex gap-3 rounded-lg p-3 transition ${
                                  active ? "bg-blue-500/10 ring-1 ring-blue-500/25" : "bg-background/60"
                                }`}
                              >
                                <span className="shrink-0 text-base">💡</span>
                                <HighlightedPara
                                  text={tip}
                                  active={active}
                                  charIndex={charIndex}
                                  offset={(() => {
                                    const SEP = ". ";
                                    let c = 0;
                                    for (let j = 0; j < idx; j++) c += `Tip ${j + 1}. ${docStudyTips[j]}`.length + SEP.length;
                                    return c + `Tip ${idx + 1}. `.length;
                                  })()}
                                  className="text-sm text-muted-foreground"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {displayDocAnalysis.source === "title_context" && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">
                          Analysis based on title context. Text-based documents
                          provide more accurate analysis.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* No analysis yet message */}
                {!hasAnalysis && (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Brain className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No analysis yet. Click &quot;Re-analyze&quot; to generate.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Flashcards Tab Content ──────────────────────────── */}
            {activeTab === "flashcards" && (
              <div className="space-y-4">
                {/* Action bar */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      onClick={generateFlashcards}
                      disabled={flashcardsLoading}
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                    >
                      {flashcardsLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {flashcardsLoading
                        ? "Generating..."
                        : flashcards.length > 0
                          ? "Regenerate"
                          : "Generate Flashcards"}
                    </Button>
                  </div>
                  {displayFlashcards.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {reviewedCount > 0 && (
                        <span className="text-green-500 font-medium mr-2">
                          <CheckCircle2 className="inline h-3 w-3 mr-0.5" />
                          {reviewedCount} reviewed
                        </span>
                      )}
                      {activeCard + 1} / {displayFlashcards.length}
                    </p>
                  )}
                </div>

                {displayFlashcards.length > 0 ? (
                  <>
                    {/* ── Featured card (large) ──────────────────── */}
                    {(() => {
                      const card = displayFlashcards[activeCard];
                      if (!card) return null;
                      const isFlipped = flippedCards.has(activeCard);
                      const catClass =
                        CATEGORY_COLORS[card.category ?? "General"] ??
                        CATEGORY_COLORS.General;

                      return (
                        <div className="space-y-3">
                          {/* Card */}
                          <button
                            onClick={() => toggleFlip(activeCard)}
                            className={`group relative w-full min-h-[180px] rounded-2xl border-2 bg-background p-6 text-left transition-all duration-300 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                              isFlipped ? "border-primary/30" : "border-border"
                            }`}
                          >
                            {/* Top badges */}
                            <div className="flex items-center justify-between mb-4">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${catClass}`}
                              >
                                {card.category ?? "General"}
                              </span>
                              <div className="flex items-center gap-2">
                                {card.difficulty && (
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                      DIFFICULTY_STYLES[card.difficulty]
                                    }`}
                                  >
                                    {card.difficulty}
                                  </span>
                                )}
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                    isFlipped
                                      ? "bg-primary/10 text-primary"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {isFlipped ? "✓ Answer" : "? Question"}
                                </span>
                              </div>
                            </div>

                            {/* Content */}
                            <div className="min-h-[80px] flex items-center">
                              <p className="text-base leading-relaxed">
                                {isFlipped ? card.back : card.front}
                              </p>
                            </div>

                            {/* Flip hint */}
                            <p className="mt-4 text-[10px] text-muted-foreground/60 text-center">
                              Click to{" "}
                              {isFlipped ? "see question" : "reveal answer"}
                            </p>
                          </button>

                          {/* Difficulty rating */}
                          {isFlipped && card.id && (
                            <div className="flex items-center justify-center gap-2">
                              <span className="text-[11px] text-muted-foreground mr-1">
                                How was it?
                              </span>
                              <button
                                onClick={() =>
                                  reviewFlashcard(card.id, "easy")
                                }
                                className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium text-green-600 dark:text-green-400 border-green-500/30 bg-green-500/5 hover:bg-green-500/15 transition"
                              >
                                <ThumbsUp className="h-3 w-3" />
                                Easy
                              </button>
                              <button
                                onClick={() =>
                                  reviewFlashcard(card.id, "medium")
                                }
                                className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium text-yellow-600 dark:text-yellow-400 border-yellow-500/30 bg-yellow-500/5 hover:bg-yellow-500/15 transition"
                              >
                                <Star className="h-3 w-3" />
                                Medium
                              </button>
                              <button
                                onClick={() =>
                                  reviewFlashcard(card.id, "hard")
                                }
                                className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5 hover:bg-red-500/15 transition"
                              >
                                <ThumbsDown className="h-3 w-3" />
                                Hard
                              </button>
                            </div>
                          )}

                          {/* Navigation */}
                          <div className="flex items-center justify-between">
                            <Button
                              onClick={() => {
                                setActiveCard((c) => Math.max(0, c - 1));
                              }}
                              disabled={activeCard === 0}
                              variant="outline"
                              className="h-8 text-xs"
                            >
                              ← Previous
                            </Button>
                            <div className="flex gap-1">
                              {displayFlashcards.map((_, idx) => (
                                <button
                                  key={idx}
                                  title={`Card ${idx + 1}`}
                                  onClick={() => setActiveCard(idx)}
                                  className={`h-2 rounded-full transition-all ${
                                    idx === activeCard
                                      ? "w-6 bg-primary"
                                      : flippedCards.has(idx)
                                        ? "w-2 bg-primary/40"
                                        : "w-2 bg-muted-foreground/20"
                                  }`}
                                />
                              ))}
                            </div>
                            <Button
                              onClick={() => {
                                setActiveCard((c) =>
                                  Math.min(displayFlashcards.length - 1, c + 1)
                                );
                              }}
                              disabled={activeCard === displayFlashcards.length - 1}
                              variant="outline"
                              className="h-8 text-xs"
                            >
                              Next →
                            </Button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Card grid (small cards overview) ─────── */}
                    <div className="pt-2 border-t">
                      <h5 className="text-xs font-medium text-muted-foreground mb-2">
                        All Cards Overview
                      </h5>
                      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                        {displayFlashcards.map((card, idx) => {
                          const catClass =
                            CATEGORY_COLORS[card.category ?? "General"] ??
                            CATEGORY_COLORS.General;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setActiveCard(idx);
                                setFlippedCards((prev) => {
                                  const next = new Set(prev);
                                  next.delete(idx);
                                  return next;
                                });
                              }}
                              className={`relative cursor-pointer rounded-lg border p-3 text-left transition-all hover:shadow-sm ${
                                idx === activeCard
                                  ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                                  : "bg-background/60 hover:bg-background/80"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span
                                  className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${catClass}`}
                                >
                                  {card.category ?? "General"}
                                </span>
                                {card.id && (
                                  <button
                                    title="Delete flashcard"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteFlashcard(card.id);
                                    }}
                                    className="rounded p-0.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                              <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
                                {card.front}
                              </p>
                              {card.difficulty && (
                                <div className="mt-1.5">
                                  <span
                                    className={`rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${
                                      DIFFICULTY_STYLES[card.difficulty]
                                    }`}
                                  >
                                    {card.difficulty}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Layers className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No flashcards yet. Click &quot;Generate Flashcards&quot;
                      to create study cards.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
