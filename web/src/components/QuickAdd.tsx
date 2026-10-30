import { useEffect, useMemo, useRef, useState } from "react";
import { dateValue, dayLabel, onDay } from "../lib/money";
import { CATEGORY_EMOJI, type Remembered } from "../lib/types";
import { DayPicker } from "./DayPicker";

// Minimal typing for the browser Speech API (Chrome on Android exposes the webkit one).
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecCtor = new () => SpeechRec;

const SpeechRecognition: SpeechRecCtor | undefined =
  (window as unknown as { SpeechRecognition?: SpeechRecCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: SpeechRecCtor }).webkitSpeechRecognition;

type Props = {
  onSubmit: (text: string) => Promise<void>;
  /** Log a remembered item straight away, no AI. */
  onRemembered: (item: string, amount: number, category: string) => Promise<void>;
  onPhoto: (file: File) => Promise<void>;
  onStatement: (file: File) => Promise<void>;
  memory: Remembered[];
  busy: boolean;
  /** The day new entries go on, "YYYY-MM-DD"; null means today. */
  day: string | null;
  onDayChange: (day: string | null) => void;
};

/**
 * The one remembered item this text means, if it's a single item with no price:
 * "kopi" → Kopi, "chick" → Chicken Rice. Anything with a number, a comma or
 * "and" goes to the AI instead.
 */
function matchMemory(text: string, memory: Remembered[]) {
  const q = text.trim().toLowerCase();
  if (q.length < 2 || /[\d,]|\band\b/.test(q)) return null;
  // memory is sorted by use_count, so a prefix match picks the one you buy most
  return memory.find((m) => m.item_key === q) ?? memory.find((m) => m.item_key.startsWith(q)) ?? null;
}

export function QuickAdd({ onSubmit, onRemembered, onPhoto, onStatement, memory, busy, day, onDayChange }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  // An amount you've edited, tied to the item it was edited for.
  const [edited, setEdited] = useState<{ key: string; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const statementRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRec | null>(null);

  const match = useMemo(() => matchMemory(text, memory), [text, memory]);
  const amount = match
    ? edited?.key === match.item_key
      ? edited.value
      : match.last_amount.toFixed(2)
    : "";

  // Open straight into typing — no taps needed.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(value = text) {
    const v = value.trim();
    if (!v || busy) return;
    if (match && value === text) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) return;
      setText("");
      setEdited(null);
      await onRemembered(match.display_name, n, match.category);
    } else {
      setText("");
      await onSubmit(v);
    }
    inputRef.current?.focus();
  }

  function toggleMic() {
    if (!SpeechRecognition) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = "en-SG";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      setText(said);
      void submit(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={`rounded-3xl bg-card p-2 shadow-lg ${day ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
    >
      {/* Backfilling a missed day: everything you log goes on the picked day until you clear it. */}
      <div className="flex items-center gap-1 px-1 pb-1">
        <DayPicker
          value={day ?? dateValue()}
          onChange={(v) => onDayChange(v === dateValue() ? null : v)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            day ? "bg-accent text-white" : "text-ink-soft active:bg-bg"
          }`}
        >
          📅 {day ? `Logging for ${dayLabel(onDay(day).toISOString())}` : "Today"} ▾
        </DayPicker>
        {day && (
          <button
            type="button"
            onClick={() => onDayChange(null)}
            aria-label="Back to today"
            className="rounded-full px-2 py-1 text-xs text-ink-soft active:bg-bg"
          >
            ✕ Today
          </button>
        )}
      </div>

      {match && (
        <div className="mb-1 flex items-center gap-2 rounded-2xl bg-bg py-1.5 pr-1.5 pl-3 text-sm">
          <span>{CATEGORY_EMOJI[match.category] ?? "📦"}</span>
          <span className="min-w-0 flex-1 truncate font-medium">{match.display_name}</span>
          <span className="text-ink-soft">$</span>
          <input
            value={amount}
            onChange={(e) => setEdited({ key: match.item_key, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            inputMode="decimal"
            enterKeyHint="send"
            aria-label={`Price of ${match.display_name}`}
            className="w-20 rounded-xl bg-card px-2 py-1.5 text-right tabular-nums outline-none ring-1 ring-line focus:ring-accent"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={busy ? "Got it, sorting…" : "kopi, chicken rice 5.5, grab 12"}
          enterKeyHint="send"
          autoComplete="off"
          autoFocus
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-lg outline-none placeholder:text-ink-faint"
        />
        <input
          ref={statementRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void onStatement(file);
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // so the same photo can be picked again
            if (file) void onPhoto(file);
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Scan a receipt"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg text-xl transition active:scale-95 disabled:opacity-40"
        >
          📷
        </button>
        <button
          type="button"
          onClick={() => statementRef.current?.click()}
          disabled={busy}
          aria-label="Import a bank statement PDF"
          className="grid size-11 shrink-0 place-items-center rounded-2xl bg-bg text-lg transition active:scale-95 disabled:opacity-40"
        >
          📄
        </button>
        {SpeechRecognition && (
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? "Stop listening" : "Say it instead"}
            className={`grid size-11 shrink-0 place-items-center rounded-2xl text-xl transition ${
              listening ? "animate-pulse bg-danger text-white" : "bg-bg"
            }`}
          >
            🎙️
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Add"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
        >
          {busy ? <span className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : "↑"}
        </button>
      </div>
    </form>
  );
}
