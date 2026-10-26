import { useEffect, useRef, useState } from "react";

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
  busy: boolean;
};

export function QuickAdd({ onSubmit, busy }: Props) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRec | null>(null);

  // Open straight into typing — no taps needed.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(value = text) {
    const v = value.trim();
    if (!v || busy) return;
    setText("");
    await onSubmit(v);
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
      className="flex items-center gap-2 rounded-3xl bg-card p-2 shadow-lg ring-1 ring-line"
    >
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={busy ? "Got it, sorting…" : "kopi, chicken rice 5.5, grab 12"}
        enterKeyHint="send"
        autoComplete="off"
        className="min-w-0 flex-1 bg-transparent px-3 py-3 text-lg outline-none placeholder:text-ink-faint"
      />
      {SpeechRecognition && (
        <button
          type="button"
          onClick={toggleMic}
          aria-label={listening ? "Stop listening" : "Say it instead"}
          className={`grid size-12 shrink-0 place-items-center rounded-2xl text-xl transition ${
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
    </form>
  );
}
