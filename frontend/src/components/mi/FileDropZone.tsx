import { FileUp, X } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { ApiError, errorMessage } from '../../lib/api';
import { UPLOAD_LIMITS, formatBytes, validateUploadFile } from '../../lib/mi-format';
import type { UploadPurpose, UploadRef } from '../../lib/mi-types';
import { uploadFile, type UploadProgress } from '../../lib/upload';
import { cn } from '../../lib/utils';
import { ProgressBar } from '../intel/IntelUi';

type Props = {
  workspaceId: string;
  purpose: UploadPurpose;
  disabled?: boolean;
  disabledReason?: string;
  onUploaded: (upload: UploadRef) => void;
};

/**
 * Zona unggah (§D.3 Import, §D.7 Aset): seret/pilih file → cek awal di browser → stream ke backend dengan progres byte.
 * Penolakan server (413/415/429/403) tampil inline di zona, bukan toast saja.
 */
export function FileDropZone({ workspaceId, purpose, disabled, disabledReason, onUploaded }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rule = UPLOAD_LIMITS[purpose];
  const uploading = progress !== null;

  const start = async (f: File) => {
    const invalid = validateUploadFile(f, purpose);
    setFile(f);
    setError(invalid);
    if (invalid) return;
    abort.current = new AbortController();
    setProgress({ loaded: 0, total: f.size });
    try {
      const ref = await uploadFile(workspaceId, purpose, f, setProgress, abort.current.signal);
      onUploaded(ref);
      setFile(null);
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'ABORTED' ? null : errorMessage(e));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f && !disabled && !uploading) void start(f);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          drag ? 'border-[#0E9384] bg-[#F1F8F7]' : 'border-[#D5DBE3] bg-white',
          error && 'border-[#E8A08A] bg-[#FDF6F3]',
          disabled && 'opacity-60',
        )}
      >
        <FileUp size={26} className="text-[#0E9384]" aria-hidden />
        <p className="text-[14px] font-medium text-[#0F2340]">Seret file ke sini atau</p>
        <button
          type="button"
          disabled={disabled || uploading}
          title={disabled ? disabledReason : undefined}
          onClick={() => input.current?.click()}
          className="inline-flex h-9 items-center rounded-lg bg-[#0F2340] px-4 text-sm font-medium text-white hover:bg-[#1a3560] disabled:opacity-50"
        >
          Pilih file
        </button>
        <p className="text-[12px] text-ink-soft">{rule.label}</p>
        {disabled && disabledReason && <p className="text-[12px] text-[#B45309]">{disabledReason}</p>}
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept={rule.exts.map((x) => `.${x}`).join(',')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void start(f);
          }}
        />
      </div>
      <div aria-live="polite" className="mt-2 text-[13px]">
        {uploading && file && (
          <div className="rounded-xl border border-[#E3E7ED] bg-white p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate font-medium">Mengunggah {file.name}</span>
              <span className="shrink-0 tabular-nums text-ink-soft">
                {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
              </span>
              <button type="button" aria-label="Batalkan unggahan" onClick={() => abort.current?.abort()} className="rounded p-1 text-ink-faint hover:bg-hover">
                <X size={14} />
              </button>
            </div>
            <ProgressBar done={progress.loaded} total={progress.total} live />
          </div>
        )}
        {error && (
          <p role="alert" className="text-[#C2410C]">
            {file ? `${file.name}: ` : ''}
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
