import { Injectable } from '@nestjs/common';
import { hasRole } from '../../common/constants/domain';
import { ErrorCode } from '../../common/constants/error-codes';
import { Errors } from '../../common/exceptions/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { fromDateString, toDateString } from '../../utils/helpers/date.util';
import { decodeCursor, toPage } from '../../utils/helpers/pagination.util';
import { AccessService } from '../core/access.service';
import { FORMULA_VERSION, WebReportInput, WebReportResults, calculateWebReport } from './web-report.calculator';
import { assertFunnel, assertPeriod } from './web-report.rules';
import { CreateWebReportInput, ListWebReportsQuery, UpdateWebReportInput } from './web-reports.schemas';

const sessionInclude = {
  creator: { select: { id: true, display_name: true } },
  updater: { select: { id: true, display_name: true } },
} satisfies Prisma.web_report_sessionsInclude;
type SessionRow = Prisma.web_report_sessionsGetPayload<{ include: typeof sessionInclude }>;

/** Field sesi setelah digabung dengan nilai lama (untuk validasi & hitung ulang). */
interface SessionValues extends WebReportInput {
  title: string;
  period_type: CreateWebReportInput['period_type'];
  period_start: string;
  period_end: string;
  notes: string | null;
}

@Injectable()
export class WebReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(user: AuthUser, workspaceId: string, q: ListWebReportsQuery) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const offset = decodeCursor(q.cursor);
    const where: Prisma.web_report_sessionsWhereInput = { workspace_id: workspaceId, deleted_at: null };
    if (q.period_type) where.period_type = q.period_type;
    if (q.year) where.period_start = { gte: fromDateString(`${q.year}-01-01`), lte: fromDateString(`${q.year}-12-31`) };
    const rows = await this.prisma.web_report_sessions.findMany({
      where,
      include: sessionInclude,
      orderBy: [{ period_start: 'desc' }, { created_at: 'desc' }],
      skip: offset,
      take: q.limit + 1,
    });
    const page = toPage(rows, offset, q.limit);
    return { ...page, data: page.data.map((r) => this.toDto(r, false)) };
  }

  async create(user: AuthUser, workspaceId: string, input: CreateWebReportInput) {
    await this.access.assertWorkspace(user.id, workspaceId, 'member');
    const values: SessionValues = { ...input, notes: input.notes ?? null };
    const results = this.validateAndCalculate(values);
    const row = await this.prisma.web_report_sessions.create({
      data: { ...this.toColumns(values, results), workspace_id: workspaceId, created_by: user.id, updated_by: user.id },
      include: sessionInclude,
    });
    return this.toDto(row);
  }

  async get(user: AuthUser, id: string) {
    const row = await this.findActive(id);
    await this.access.assertWorkspace(user.id, row.workspace_id);
    return this.toDto(row);
  }

  async update(user: AuthUser, id: string, input: UpdateWebReportInput) {
    const row = await this.findActive(id);
    await this.assertCanModify(user, row);
    const { version, ...changes } = input;
    const values: SessionValues = { ...this.toValues(row), ...changes };
    const results = this.validateAndCalculate(values);
    const updated = await this.prisma.web_report_sessions.updateMany({
      where: { id, version, deleted_at: null },
      data: { ...this.toColumns(values, results), updated_by: user.id, version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw Errors.conflict(ErrorCode.VERSION_CONFLICT, 'Laporan sudah diubah orang lain — muat ulang', { current_version: row.version });
    }
    return this.toDto(await this.findActive(id));
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const row = await this.findActive(id);
    await this.assertCanModify(user, row);
    await this.prisma.web_report_sessions.update({ where: { id }, data: { deleted_at: new Date(), updated_by: user.id } });
  }

  async compare(user: AuthUser, workspaceId: string, ids: string[]) {
    await this.access.assertWorkspace(user.id, workspaceId);
    const uniqueIds = [...new Set(ids)];
    const rows = await this.prisma.web_report_sessions.findMany({
      where: { id: { in: uniqueIds }, workspace_id: workspaceId, deleted_at: null },
      include: sessionInclude,
      orderBy: [{ period_start: 'asc' }, { created_at: 'asc' }],
    });
    if (rows.length !== uniqueIds.length) throw Errors.notFound('Sebagian laporan tidak ditemukan');
    return { data: rows.map((r) => this.toDto(r)) };
  }

  private validateAndCalculate(values: SessionValues): WebReportResults {
    assertPeriod(values.period_type, values.period_start, values.period_end);
    assertFunnel(values);
    return calculateWebReport(values);
  }

  private async findActive(id: string): Promise<SessionRow> {
    const row = await this.prisma.web_report_sessions.findFirst({ where: { id, deleted_at: null }, include: sessionInclude });
    if (!row) throw Errors.notFound('Laporan tidak ditemukan');
    return row;
  }

  /** Ubah/hapus: Admin/Owner, atau Member pembuat sesi (M2_PRD §3). */
  private async assertCanModify(user: AuthUser, row: SessionRow): Promise<void> {
    const { role } = await this.access.assertWorkspace(user.id, row.workspace_id, 'member');
    if (!hasRole(role, 'admin') && row.created_by !== user.id) {
      throw Errors.forbidden('Hanya Admin/Owner atau pembuat laporan yang dapat mengubah/menghapus laporan ini');
    }
  }

  private toValues(row: SessionRow): SessionValues {
    return {
      title: row.title,
      period_type: row.period_type,
      period_start: toDateString(row.period_start) as string,
      period_end: toDateString(row.period_end) as string,
      visitors: row.visitors,
      leads: row.leads,
      sales_count: row.sales_count,
      revenue: row.revenue.toFixed(2),
      cost_maintenance: row.cost_maintenance.toFixed(2),
      cost_ads: row.cost_ads.toFixed(2),
      notes: row.notes,
    };
  }

  private toColumns(values: SessionValues, results: WebReportResults) {
    return {
      title: values.title,
      period_type: values.period_type,
      period_start: fromDateString(values.period_start),
      period_end: fromDateString(values.period_end),
      visitors: values.visitors,
      leads: values.leads,
      sales_count: values.sales_count,
      revenue: values.revenue,
      cost_maintenance: values.cost_maintenance,
      cost_ads: values.cost_ads,
      notes: values.notes,
      results: results as unknown as Prisma.InputJsonValue,
      formula_version: FORMULA_VERSION,
    };
  }

  toDto(row: SessionRow, withInsights = true) {
    const values = this.toValues(row);
    const stored = row.results as unknown as WebReportResults;
    const results = withInsights ? stored : { ...stored, insights: undefined };
    const actor = (u: { id: string; display_name: string } | null) => (u ? { type: 'user' as const, id: u.id, name: u.display_name } : null);
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      title: row.title,
      period_type: row.period_type,
      period_start: values.period_start,
      period_end: values.period_end,
      input: {
        visitors: values.visitors,
        leads: values.leads,
        sales_count: values.sales_count,
        revenue: values.revenue,
        cost_maintenance: values.cost_maintenance,
        cost_ads: values.cost_ads,
      },
      notes: row.notes,
      results,
      formula_version: row.formula_version,
      version: row.version,
      created_by: actor(row.creator),
      updated_by: actor(row.updater),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
