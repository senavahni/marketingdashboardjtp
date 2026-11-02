import { ChevronDown, Download, FileSpreadsheet, FileText, Presentation, Sheet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ExportFormat } from '../../lib/web-report-export/file-name';
import type { WebReportSession } from '../../lib/web-report-types';
import { MenuItem, Popover } from '../ui/popover';
import { Spinner } from '../ui/misc';

const OPTIONS: { format: ExportFormat; label: string; hint: string; icon: typeof FileText }[] = [
  { format: 'pdf', label: 'PDF', hint: 'Laporan siap cetak (A4)', icon: FileText },
  { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Rumus ikut terhitung ulang', icon: FileSpreadsheet },
  { format: 'csv', label: 'CSV', hint: 'Angka mentah untuk diolah', icon: Sheet },
  { format: 'pptx', label: 'PowerPoint (.pptx)', hint: 'Deck 5 slide untuk manajemen', icon: Presentation },
];

type Props = { session: WebReportSession; workspaceName: string };

export function ExportMenu({ session, workspaceName }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setBusy(format);
    try {
      const { exportWebReport } = await import('../../lib/web-report-export');
      await exportWebReport(session, format, workspaceName);
      setOpen(false);
    } catch (err: unknown) {
      console.error('Ekspor laporan gagal', err);
      toast.error('Ekspor gagal, coba lagi');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-64"
      trigger={
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0E9384] px-3 text-sm font-medium text-white transition-colors hover:bg-[#0B7A6E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F2340]"
        >
          <Download size={15} /> Ekspor <ChevronDown size={14} />
        </button>
      }
    >
      {OPTIONS.map(({ format, label, hint, icon: Icon }) => (
        <MenuItem key={format} onSelect={() => busy === null && void handleExport(format)} className={busy !== null && busy !== format ? 'opacity-40' : undefined}>
          {busy === format ? <Spinner /> : <Icon size={15} className="text-[#0F2340]" />}
          <span className="flex flex-col">
            <span className="font-medium">{label}</span>
            <span className="text-[11px] text-ink-faint">{hint}</span>
          </span>
        </MenuItem>
      ))}
    </Popover>
  );
}
