import { ArrowLeft, ArrowRight, Check, Rocket } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCreateJob, useEstimate } from '../../hooks/intel-queries';
import { useDebounce } from '../../hooks/use-debounce';
import { ApiError, errorMessage } from '../../lib/api';
import type { IntelJob } from '../../lib/intel-types';
import {
  AGENT_ERROR_CODES,
  WIZARD_STEPS,
  draftFromJob,
  draftToInput,
  draftToSchedule,
  emptyDraft,
  firstInvalidStep,
  validateStep,
  type DraftErrors,
  type WizardDraft,
  type WizardStep,
} from '../../lib/intel-wizard';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { primaryBtn } from './IntelUi';
import { WizardAgentStep } from './WizardAgentStep';
import { WizardEstimateStep } from './WizardEstimateStep';
import { WizardLimitsStep } from './WizardLimitsStep';
import { WizardSourceStep } from './WizardSourceStep';

const ESTIMATE_DEBOUNCE_MS = 500;

type Props = {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mode Ulangi: wizard terisi dari job lama dan mengirim `retry_of_job_id`. */
  retryOf?: IntelJob;
  onCreated: (jobId: string) => void;
};

export function JobWizard({ workspaceId, open, onOpenChange, retryOf, onCreated }: Props) {
  const [draft, setDraft] = useState<WizardDraft>(() => (retryOf ? draftFromJob(retryOf) : emptyDraft()));
  const [step, setStep] = useState<WizardStep>(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const create = useCreateJob(workspaceId);

  const update = useCallback((fn: (d: WizardDraft) => WizardDraft) => {
    setDraft(fn);
    setConfirmed(false);
  }, []);

  // Estimasi hanya untuk draft yang valid, di-debounce agar tidak memanggil MCP tiap ketikan
  const input = useMemo(() => (firstInvalidStep(draft) === null ? draftToInput(draft) : null), [draft]);
  const debouncedInput = useDebounce(input, ESTIMATE_DEBOUNCE_MS);
  const estimate = useEstimate(workspaceId, step === 3 ? debouncedInput : null);
  const estimateReady = !!estimate.data && debouncedInput === input && !estimate.isFetching;
  const needsConfirm = estimate.data?.requires_confirmation ?? false;

  const goTo = (target: WizardStep) => {
    setBanner(null);
    if (target <= step) return setStep(target);
    for (let s = step; s < target; s++) {
      const e = validateStep(draft, s as WizardStep);
      if (Object.keys(e).length) {
        setErrors(e);
        return setStep(s as WizardStep);
      }
    }
    setErrors({});
    setStep(target);
  };

  const submit = () => {
    if (!input) return;
    create.mutate(
      { ...input, confirm_cost: needsConfirm ? confirmed : false, retry_of_job_id: retryOf?.id, schedule: draftToSchedule(draft) },
      {
        onSuccess: (job) => {
          toast.success('Job riset dimulai', { description: job.title });
          onCreated(job.id);
        },
        onError: (err) => {
          if (err instanceof ApiError && AGENT_ERROR_CODES.has(err.code)) {
            setStep(2);
            setBanner(`${err.message}. Pilihan agent berubah di MCP — periksa lagi lalu lanjutkan.`);
            return;
          }
          const jobId = err instanceof ApiError ? (err.details?.job_id as string | undefined) : undefined;
          if (jobId) {
            toast.error('Job tersimpan tetapi belum terkirim ke MCP', { description: 'Buka job untuk mencoba mengirim ulang.' });
            onCreated(jobId);
            return;
          }
          setBanner(errorMessage(err));
        },
      },
    );
  };

  const canSubmit = estimateReady && (!needsConfirm || confirmed) && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={retryOf ? 'Ulangi job riset' : 'Job riset baru'} className="max-w-4xl pb-0">
      <div>
        <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Langkah wizard">
          {WIZARD_STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'todo';
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => goTo(i as WizardStep)}
                  aria-current={state === 'current' ? 'step' : undefined}
                  className="group flex w-full flex-col gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-[#0E9384]"
                >
                  <span className={cn('h-1 rounded-full transition-colors', state === 'todo' ? 'bg-[#E3E7ED]' : 'bg-[#0E9384]')} />
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-[12px]',
                      state === 'current' ? 'font-semibold text-[#0F2340]' : 'text-ink-soft group-hover:text-ink',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                        state === 'done'
                          ? 'bg-[#0E9384] text-white'
                          : state === 'current'
                            ? 'bg-[#0F2340] text-white'
                            : 'bg-[#E3E7ED] text-ink-soft',
                      )}
                    >
                      {state === 'done' ? <Check size={10} strokeWidth={3} /> : i + 1}
                    </span>
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        {banner && (
          <p role="alert" className="mb-4 rounded-xl bg-[#FDECE7] px-4 py-2.5 text-[13px] text-[#9A3412]">
            {banner}
          </p>
        )}
      </div>

      <div className="min-h-[22rem] pb-5">
        {step === 0 && <WizardSourceStep draft={draft} errors={errors} workspaceId={workspaceId} onChange={update} />}
        {step === 1 && <WizardLimitsStep draft={draft} errors={errors} onChange={update} />}
        {step === 2 && <WizardAgentStep draft={draft} errors={errors} workspaceId={workspaceId} onChange={update} />}
        {step === 3 && (
          <WizardEstimateStep
            workspaceId={workspaceId}
            estimate={estimate.data}
            isFetching={estimate.isFetching || debouncedInput !== input}
            error={estimate.error}
            confirmed={confirmed}
            onConfirm={setConfirmed}
          />
        )}
      </div>

      <footer className="sticky bottom-0 -mx-5 flex items-center justify-between gap-2 border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : goTo((step - 1) as WizardStep))}>
          {step === 0 ? (
            'Batal'
          ) : (
            <>
              <ArrowLeft size={14} /> Kembali
            </>
          )}
        </Button>
        {step < 3 ? (
          <button type="button" className={primaryBtn} onClick={() => goTo((step + 1) as WizardStep)}>
            Lanjut <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" className={cn(primaryBtn, 'bg-[#0E9384] hover:bg-[#0B7A6E]')} disabled={!canSubmit} onClick={submit}>
            <Rocket size={15} /> {create.isPending ? 'Menjalankan…' : 'Jalankan riset'}
          </button>
        )}
      </footer>
    </Dialog>
  );
}
